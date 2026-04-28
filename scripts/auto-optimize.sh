#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$REPO/scripts/auto-optimize-helper.mjs"
TMP_BASE="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
TMP_ROOT="$TMP_BASE/auto-optimize-$(date -u +"%Y%m%dT%H%M%SZ")-$$"
RUN_LOG_DIR="$REPO/.evals/auto-optimizer/runs/$(basename "$TMP_ROOT")"
FAILED_LEDGER="docs/optimization/failed-experiments.jsonl"
INNER_WORKTREES=()
CODEX_YOLO_ARGS=()
CURRENT_ITERATION_DIR=""

cleanup_inner_worktrees() {
  for worktree in "${INNER_WORKTREES[@]:-}"; do
    if [[ -d "$worktree" ]]; then
      remove_inner_worktree "$worktree"
    fi
  done
}

trap cleanup_inner_worktrees EXIT

usage() {
  cat <<'EOF'
Usage: ./scripts/auto-optimize.sh <model-name|all> --iterations <n> [--codex-model <model>] [--codex-effort <effort>]

Examples:
  ./scripts/auto-optimize.sh qwen-3-0.6b --iterations 25
  ./scripts/auto-optimize.sh all --iterations 25 --codex-model gpt-5.5 --codex-effort high
EOF
}

stop_for_driver() {
  printf >&2 'STOP: %s\nAsk the driver before continuing.\n' "$1"
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    stop_for_driver "Required command '$1' is not available."
  fi
}

ensure_failed_ledger_tracked() {
  if ! git ls-files --error-unmatch "$FAILED_LEDGER" >/dev/null 2>&1; then
    stop_for_driver "$FAILED_LEDGER must be tracked before running the optimizer."
  fi
}

configure_codex_yolo_args() {
  local help_text
  help_text="$(codex exec --help)"

  if grep -q -- "--yolo" <<< "$help_text"; then
    CODEX_YOLO_ARGS=(--yolo)
  elif grep -q -- "--dangerously-bypass-approvals-and-sandbox" <<< "$help_text"; then
    CODEX_YOLO_ARGS=(--dangerously-bypass-approvals-and-sandbox)
  else
    stop_for_driver "codex exec does not expose --yolo or its bypass-mode equivalent."
  fi
}

timestamp() {
  date -u +"%Y-%m-%dT%H-%M-%SZ"
}

positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

MODEL_ARG=""
ITERATIONS=""
CODEX_MODEL="gpt-5.5"
CODEX_EFFORT="high"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --iterations)
      [[ $# -ge 2 ]] || stop_for_driver "Missing value for --iterations."
      ITERATIONS="$2"
      shift 2
      ;;
    --iterations=*)
      ITERATIONS="${1#--iterations=}"
      shift
      ;;
    --codex-model)
      [[ $# -ge 2 ]] || stop_for_driver "Missing value for --codex-model."
      CODEX_MODEL="$2"
      shift 2
      ;;
    --codex-model=*)
      CODEX_MODEL="${1#--codex-model=}"
      shift
      ;;
    --codex-effort)
      [[ $# -ge 2 ]] || stop_for_driver "Missing value for --codex-effort."
      CODEX_EFFORT="$2"
      shift 2
      ;;
    --codex-effort=*)
      CODEX_EFFORT="${1#--codex-effort=}"
      shift
      ;;
    --max-attempts|--max-attempts=*)
      stop_for_driver "--max-attempts was removed. Use --iterations as the number of optimizer tries."
      ;;
    --*)
      stop_for_driver "Unknown option $1."
      ;;
    *)
      if [[ -n "$MODEL_ARG" ]]; then
        stop_for_driver "Only one model argument is allowed."
      fi
      MODEL_ARG="$1"
      shift
      ;;
  esac
done

[[ -n "$MODEL_ARG" ]] || { usage >&2; stop_for_driver "Missing <model-name|all>."; }
[[ -n "$ITERATIONS" ]] || stop_for_driver "Missing --iterations."
positive_integer "$ITERATIONS" || stop_for_driver "--iterations must be a positive integer."
[[ -n "$CODEX_MODEL" ]] || stop_for_driver "--codex-model must not be empty."
[[ -n "$CODEX_EFFORT" ]] || stop_for_driver "--codex-effort must not be empty."

cd "$REPO"
require_command node
require_command pnpm
require_command git
require_command codex
configure_codex_yolo_args
node "$HELPER" validate-options "$MODEL_ARG" "$ITERATIONS"
mkdir -p "$TMP_ROOT"
mkdir -p "$RUN_LOG_DIR"
printf 'optimizer tmpdir: %s\n' "$TMP_ROOT"
printf 'optimizer logs: %s\n' "$RUN_LOG_DIR"

ALL_MODELS=()
while IFS= read -r model; do
  ALL_MODELS+=("$model")
done < <(node "$HELPER" models all)

ensure_failed_ledger_tracked

if ! git diff --quiet -- . ":(exclude)$FAILED_LEDGER" ||
  ! git diff --cached --quiet; then
  stop_for_driver "Tracked working-copy changes exist before the optimizer starts."
fi

PREEXISTING_UNTRACKED="$(git ls-files --others --exclude-standard | grep -vxF "$FAILED_LEDGER" || true)"
if [[ -n "$PREEXISTING_UNTRACKED" ]]; then
  stop_for_driver "Untracked files exist before the optimizer starts: $PREEXISTING_UNTRACKED"
fi

run_to_log() {
  local log_file="$1"
  shift

  set +e
  "$@" > "$log_file" 2>&1
  local command_status=$?
  set -e
  return "$command_status"
}

run_eval_set() {
  local output_dir="$1"
  local log_prefix="$2"
  shift 2
  local models=("$@")
  mkdir -p "$output_dir"

  for model in "${models[@]}"; do
    printf 'running headed WebGPU eval for %s -> %s\n' "$model" "$output_dir"
    local eval_log="${log_prefix}-${model}.log"
    printf '    output: %s\n' "$eval_log"
    local eval_status
    if run_to_log "$eval_log" pnpm eval:webgpu -- --model "$model" --headed --output-dir "$output_dir"; then
      eval_status=0
    else
      eval_status=$?
    fi

    if ! node "$HELPER" validate-artifact "$model" "$output_dir"; then
      printf >&2 'WebGPU eval for %s exited %s and did not produce a valid schemaVersion 1 artifact. See %s\n' "$model" "$eval_status" "$eval_log"
      return 1
    fi
  done
}

create_baseline_snapshot() {
  local snapshot_file="$1"
  local log_prefix="$2"
  local output_dir
  output_dir="$REPO/.evals/web-gpu-$(timestamp)-auto-baseline-$$"

  printf 'creating fresh run baseline -> %s\n' "$output_dir"
  run_eval_set "$output_dir" "$log_prefix" "${ALL_MODELS[@]}" ||
    stop_for_driver "Fresh headed eval artifacts could not be validated."
  node "$HELPER" snapshot all "$output_dir" > "$snapshot_file" ||
    stop_for_driver "Fresh headed eval artifacts could not be validated."
}

run_codex_attempt() {
  local run_repo="$1"
  local prompt_file="$2"
  local stdout_log="$3"
  local stderr_log="$4"

  set +e
  codex exec -C "$run_repo" -m "$CODEX_MODEL" \
    -c "model_reasoning_effort=\"$CODEX_EFFORT\"" \
    "${CODEX_YOLO_ARGS[@]}" \
    --json - < "$prompt_file" > "$stdout_log" 2> "$stderr_log" &
  local codex_pid=$!

  wait "$codex_pid"
  local codex_status=$?
  set -e
  return "$codex_status"
}

reset_candidate_product_patch() {
  local patch_file="$1"

  [[ -s "$patch_file" ]] || return 0
  node "$HELPER" ensure-reset-scope ||
    stop_for_driver "Reset would discard changes outside optimizer-owned product/docs paths."

  git apply -R "$patch_file" ||
    stop_for_driver "Could not reverse rejected product patch $patch_file."
}

create_inner_worktree() {
  local base_sha="$1"
  local iteration="$2"
  local attempt_index="$3"
  local install_log="$4"
  INNER_REPO="$TMP_ROOT/worktree-${iteration}-${attempt_index}"

  git clone --quiet --no-hardlinks "$REPO" "$INNER_REPO"
  git -C "$INNER_REPO" checkout --quiet --detach "$base_sha"
  INNER_WORKTREES+=("$INNER_REPO")
  install_inner_dependencies "$INNER_REPO" "$install_log"
}

remove_inner_worktree() {
  local inner_repo="$1"
  archive_inner_eval_artifacts "$inner_repo" "$CURRENT_ITERATION_DIR"
  rm -rf "$inner_repo"
}

archive_inner_eval_artifacts() {
  local inner_repo="$1"
  local iteration_dir="$2"

  if [[ -z "$iteration_dir" || ! -d "$inner_repo/.evals" ]]; then
    return 0
  fi

  local destination="$iteration_dir/inner-eval-artifacts/.evals"
  rm -rf "$destination"
  mkdir -p "$(dirname "$destination")"
  cp -R "$inner_repo/.evals" "$destination"
}

install_inner_dependencies() {
  local inner_repo="$1"
  local install_log="$2"

  printf 'installing isolated dependencies -> %s\n' "$install_log"
  run_to_log "$install_log" env CI=true pnpm --dir "$inner_repo" install --frozen-lockfile --prefer-offline --ignore-scripts ||
    stop_for_driver "Inner dependency install failed. See $install_log"
}

ensure_inner_head_unchanged() {
  local inner_repo="$1"
  local base_sha="$2"
  local current_sha
  current_sha="$(git -C "$inner_repo" rev-parse HEAD)"

  if [[ "$current_sha" != "$base_sha" ]]; then
    git -C "$inner_repo" log --oneline "$base_sha..HEAD" > "$TMP_ROOT/inner-commits.log" || true
    remove_inner_worktree "$inner_repo"
    stop_for_driver "Inner Codex created commits. See $TMP_ROOT/inner-commits.log"
  fi
}

ensure_inner_attempt_scope() {
  local inner_repo="$1"
  local scope_error="$TMP_ROOT/inner-scope.err"

  if ! node "$HELPER" ensure-reset-scope "$inner_repo" 2> "$scope_error"; then
    git -C "$inner_repo" status --short > "$TMP_ROOT/inner-scope-status.log" || true
    remove_inner_worktree "$inner_repo"
    stop_for_driver "$(cat "$scope_error") See $TMP_ROOT/inner-scope-status.log"
  fi
}

write_changed_pathspec() {
  local kind="$1"
  local repo="$2"
  local pathspec_file="$3"

  node "$HELPER" changed-paths-nul "$kind" "$repo" > "$pathspec_file"
}

diff_for_pathspec() {
  local repo="$1"
  local base_sha="$2"
  local pathspec_file="$3"
  local diff_file="$4"
  local paths=()

  if [[ ! -s "$pathspec_file" ]]; then
    : > "$diff_file"
    return
  fi

  while IFS= read -r -d '' diff_path; do
    [[ -n "$diff_path" ]] && paths+=("$diff_path")
  done < "$pathspec_file"

  if [[ "${#paths[@]}" -eq 0 ]]; then
    : > "$diff_file"
  else
    git -C "$repo" diff --binary "$base_sha" -- "${paths[@]}" > "$diff_file" || true
  fi
}

capture_inner_raw_diff() {
  local inner_repo="$1"
  local base_sha="$2"
  local raw_diff="$3"

  git -C "$inner_repo" add -N -- . >/dev/null 2>&1 || true
  git -C "$inner_repo" diff --binary "$base_sha" -- . > "$raw_diff" || true
}

reset_inner_cleanup_paths() {
  local inner_repo="$1"
  local base_sha="$2"
  local pathspec_file="$3"

  [[ -s "$pathspec_file" ]] || return 0

  while IFS= read -r -d '' cleanup_path; do
    [[ -n "$cleanup_path" ]] || continue

    if git -C "$inner_repo" ls-files --error-unmatch -- "$cleanup_path" >/dev/null 2>&1; then
      git -C "$inner_repo" restore --source="$base_sha" --staged --worktree -- "$cleanup_path" ||
        return 1
    else
      rm -rf -- "$inner_repo/$cleanup_path" || return 1
    fi
  done < "$pathspec_file"
}

create_import_patch() {
  local product_patch="$1"
  local docs_test_patch="$2"
  local import_patch="$3"

  : > "$import_patch"
  [[ -s "$product_patch" ]] && cat "$product_patch" >> "$import_patch"
  [[ -s "$docs_test_patch" ]] && cat "$docs_test_patch" >> "$import_patch"
  return 0
}

create_inner_patches() {
  local inner_repo="$1"
  local base_sha="$2"
  local raw_diff="$3"
  local banned_patch="$4"
  local product_patch="$5"
  local docs_test_patch="$6"
  local import_patch="$7"
  local cleanup_pathspec="$8"
  local product_pathspec="$9"
  local docs_test_pathspec="${10}"

  git -C "$inner_repo" add -N -- . >/dev/null 2>&1 || true
  git -C "$inner_repo" diff --binary "$base_sha" -- . > "$raw_diff" || true

  write_changed_pathspec cleanup "$inner_repo" "$cleanup_pathspec"
  diff_for_pathspec "$inner_repo" "$base_sha" "$cleanup_pathspec" "$banned_patch"
  reset_inner_cleanup_paths "$inner_repo" "$base_sha" "$cleanup_pathspec" ||
    stop_for_driver "Could not safely reset banned candidate paths. See $banned_patch"

  git -C "$inner_repo" add -N -- . >/dev/null 2>&1 || true
  write_changed_pathspec cleanup "$inner_repo" "$cleanup_pathspec.after"
  if [[ -s "$cleanup_pathspec.after" ]]; then
    node "$HELPER" changed-paths cleanup "$inner_repo" > "$cleanup_pathspec.after.txt" || true
    stop_for_driver "Banned candidate paths remain after cleanup. See $cleanup_pathspec.after.txt"
  fi

  ensure_inner_attempt_scope "$inner_repo"
  write_changed_pathspec product "$inner_repo" "$product_pathspec"
  write_changed_pathspec docs-test "$inner_repo" "$docs_test_pathspec"
  diff_for_pathspec "$inner_repo" "$base_sha" "$product_pathspec" "$product_patch"
  diff_for_pathspec "$inner_repo" "$base_sha" "$docs_test_pathspec" "$docs_test_patch"
  create_import_patch "$product_patch" "$docs_test_patch" "$import_patch"
}

import_inner_patches() {
  local base_sha="$1"
  local import_patch="$2"
  local import_product="$3"

  ensure_main_clean_before_import "$base_sha"
  if [[ "$import_product" == "yes" && -s "$import_patch" ]]; then
    git -C "$REPO" apply --check "$import_patch" ||
      stop_for_driver "Candidate patch cannot be applied cleanly: $import_patch"
  fi
  if [[ "$import_product" == "yes" && -s "$import_patch" ]]; then
    git -C "$REPO" apply "$import_patch"
  fi
  node "$HELPER" ensure-reset-scope ||
    stop_for_driver "Imported candidate has changes outside optimizer-owned product/docs paths."
}

ensure_product_changes_reset() {
  local cached_patch="$TMP_ROOT/main-product-after-reset-cached.patch"
  local current_patch="$TMP_ROOT/main-product-after-reset.patch"

  git -C "$REPO" diff --cached --binary -- . ':(exclude)docs/optimization/**' > "$cached_patch"
  if [[ -s "$cached_patch" ]]; then
    stop_for_driver "Staged product changes remain after candidate reset. See $cached_patch"
  fi

  git -C "$REPO" add -N -- . >/dev/null 2>&1 || true
  git -C "$REPO" diff --binary -- . ':(exclude)docs/optimization/**' > "$current_patch"

  if [[ -s "$current_patch" ]]; then
    stop_for_driver "Product changes remain after candidate reset. See $current_patch"
  fi
}

ensure_main_clean_before_import() {
  local base_sha="$1"

  if [[ "$(git -C "$REPO" rev-parse HEAD)" != "$base_sha" ]]; then
    stop_for_driver "Main worktree HEAD changed during an optimizer attempt."
  fi

  if ! git -C "$REPO" diff --quiet -- . ":(exclude)$FAILED_LEDGER" ||
    ! git -C "$REPO" diff --cached --quiet; then
    git -C "$REPO" status --short > "$TMP_ROOT/main-dirty-before-import.log" || true
    stop_for_driver "Main worktree changed before candidate import. See $TMP_ROOT/main-dirty-before-import.log"
  fi

  local untracked
  untracked="$(git -C "$REPO" ls-files --others --exclude-standard | grep -vxF "$FAILED_LEDGER" || true)"
  if [[ -n "$untracked" ]]; then
    printf '%s\n' "$untracked" > "$TMP_ROOT/main-untracked-before-import.log"
    stop_for_driver "Main worktree has untracked files before candidate import. See $TMP_ROOT/main-untracked-before-import.log"
  fi
}

ensure_main_candidate_unchanged() {
  local base_sha="$1"
  local expected_patch="$2"
  local current_patch="$TMP_ROOT/main-candidate-current.patch"

  if [[ "$(git -C "$REPO" rev-parse HEAD)" != "$base_sha" ]]; then
    stop_for_driver "Main worktree HEAD changed before commit."
  fi

  node "$HELPER" ensure-reset-scope ||
    stop_for_driver "Main worktree has changes outside optimizer-owned product/docs paths."

  git -C "$REPO" add -N -- . >/dev/null 2>&1 || true
  git -C "$REPO" diff --binary "$base_sha" -- . ':(exclude)docs/optimization/**' > "$current_patch"

  if ! node "$HELPER" patches-equivalent "$expected_patch" "$current_patch"; then
    stop_for_driver "Main product diff changed after candidate import. See $expected_patch and $current_patch"
  fi
}

write_inner_prompt() {
  local prompt_file="$1"
  local inner_repo="$2"
  local selected_model="$3"
  local baseline_file="$4"
  local iteration="$5"
  local total_iterations="$6"
  local report_file="$7"

  {
    cat <<EOF
You are the inner Codex optimizer for /Users/hiren/dev/babulfish.
You are running in an isolated temporary worktree at ${inner_repo}. Run commands there, not in /Users/hiren/dev/babulfish directly.
The outer harness will import product diffs back to the real repo and write the final docs/optimization note itself.
The Codex CLI is running in yolo/bypass mode so you can run arbitrary commands; stay inside the guardrails below.

Goal: improve translation quality through one real babulfish product change for the selected WebGPU eval model.

Autonomous loop rules:
- This is iteration ${iteration}/${total_iterations}. Try exactly one idea, then stop.
- You may modify babulfish product code broadly when the change is a real product improvement.
- Allowed examples include packages/core/src/**, packages/react/src/**, packages/styles/src/**, packages/babulfish/src/**, packages/demo-shared/src/**, packages/demo-vanilla/src/** except WebGPU eval files, packages/demo-webcomponent/src/**, packages/demo/app/**, package README files, and product behavior tests.
- You may move responsibilities around, refactor, add prompt/input handling, add post-processing, improve model-specific logic, or change public package code when justified.
- Preserve existing capabilities unless an explicit, intentional behavior change is covered by tests.
- Tests may be added or updated for intentional product behavior. Do not weaken, delete, skip, or neuter tests.
- Do not edit docs/optimization. The outer harness owns final optimization logging.
- Write exactly one short terminal blurb to ${report_file}. One line only. Include failure_modes=..., hypotheses=..., selected=..., change=..., eval=..., result=... using your best inner-run view.
- Do not ask the human whether to continue for worse score, crash, timeout, or no idea worked.
- If an assumption guardrail is false, print BLOCKED: <reason> and stop.

Hard no-touch files and directories:
- scripts/webgpu-eval.mjs
- packages/demo-vanilla/src/webgpu-eval.ts
- packages/demo-vanilla/src/webgpu-eval-scorer.ts
- packages/demo-vanilla/webgpu-eval.html
- evals/translation/**/*.json
- .evals/**
- docs/optimization/**
- docs/webgpu-evals.md
- package.json
- packages/*/package.json
- pnpm-lock.yaml
- pnpm-workspace.yaml
- .github/workflows/**
- eslint.config.js
- tsconfig.base.json
- packages/*/tsconfig.json
- packages/*/vitest.config.ts
- packages/*/vite.config.ts
- packages/*/tsup.config.ts
- packages/demo/next.config.ts
- scripts/consumer-smoke.mjs
- packages/demo/scripts/smoke.mjs
- scripts/auto-optimize.sh
- scripts/auto-optimize-helper.mjs
- scripts/auto-optimize-helper.test.mjs
Fresh eval artifacts may be generated only by the required eval command; never manually edit or commit .evals files.

Anti-cheat rules:
- Do not hardcode eval case IDs, source strings, expected outputs, reference translations, artifact paths, or model scores.
- Do not modify eval scoring, eval corpus, live eval harness, validation machinery, package scripts, package manifests, or lockfiles.
- Do not make changes whose only purpose is to satisfy the current eval artifact rather than improve product behavior.

Selected model: ${selected_model}
Harness iteration: ${iteration}/${total_iterations}

Current accepted baseline:
EOF
    node "$HELPER" prompt-summary "$selected_model" "$baseline_file"
    printf '\n'
    node "$HELPER" prompt-evidence "$selected_model" "$baseline_file"
    printf '\n\n'
    node "$HELPER" failed-memory-prompt "$selected_model" 6
    cat <<'EOF'

Required workflow:
1. Collect eval evidence from the current accepted baseline artifact above. Identify the concrete failure modes.
2. Generate at least three hypotheses for product changes that could improve those failure modes while preserving existing capabilities.
3. Select one hypothesis. Explain why it is the best bet and list the attack plan.
4. Make one focused product change. Prefer the smallest durable change that improves the product, but do not artificially confine yourself to adapter files.
5. Run the full babulfish test suite from the temporary repo root:
   pnpm test
   If any test fails, use the failure to revise the product change. If the failure cannot be fixed without violating the hard no-touch rules, leave attempted product/test edits in the temporary worktree, write the failure reason to the report file, and exit cleanly.
6. Run the target headed eval into a fresh .evals/web-gpu-* output dir:
   pnpm eval:webgpu -- --model <selected-model> --headed --output-dir <fresh-dir>
7. Compare the new artifact's model.score to the current accepted baseline above.
8. Leave attempted product/test edits in the temporary worktree whether the eval improves, fails, crashes, times out, or regresses.
9. Write the one-line report and exit cleanly. Do not revert or restore candidate product/test edits because tests failed or eval did not improve; the outer harness will import, evaluate, and clean rejected patches.

Model-specific constraints:
- Qwen and Gemma chat models currently inherit ChatModelBaseAdapter.buildSystemPrompt(). If a change should be model-specific, split or override cleanly instead of smuggling model conditionals into shared behavior.
- TranslateGemma uses structured input, not a normal chat system prompt. Do not force fake prompt changes; improve its real input/output surface or shared product logic when that is the right fix.
- Shared changes are allowed when they are real product improvements and existing capabilities remain preserved by tests and verification.

Do not:
- Edit hard no-touch paths listed above.
- Modify eval scoring, corpus, or live eval harness.
- Weaken tests or validation to make a candidate pass.
- Delete historical .evals.
- Edit docs/optimization.
- Commit. The outer harness owns verification and commits.
EOF
  } > "$prompt_file"
}

changed_paths_for_commit() {
  local pathspec_file="$1"
  node "$HELPER" commit-paths > "$pathspec_file" ||
    stop_for_driver "Changed files are outside optimizer-owned product/docs paths."
  [[ -s "$pathspec_file" ]]
}

print_change_blurb() {
  local report_file="$1"
  local stdout_log="$2"

  if [[ -s "$report_file" ]]; then
    printf -- "- %s\n" "$(tr '\n' ' ' < "$report_file" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')"
  else
    printf -- "- no change summary written; see %s\n" "$stdout_log"
  fi
}

relative_log_path() {
  local log_path="$1"
  if [[ "$log_path" == "$REPO"/* ]]; then
    printf '%s' "${log_path#"$REPO"/}"
  else
    printf '%s' "$log_path"
  fi
}

log_ref() {
  local log_path="$1"
  if [[ -e "$log_path" ]]; then
    relative_log_path "$log_path"
  else
    printf 'none'
  fi
}

copy_eval_logs() {
  local destination="$1"
  local log_prefix="$2"
  shift 2
  local models=("$@")

  mkdir -p "$destination"
  for model in "${models[@]}"; do
    local eval_log="${log_prefix}-${model}.log"
    if [[ -e "$eval_log" ]]; then
      cp "$eval_log" "$destination/"
    fi
  done
}

active_baseline_eval_prefix_path() {
  local model="$1"
  printf '%s/%s' "$ACTIVE_BASELINE_EVAL_PREFIX_DIR" "$model"
}

set_active_baseline_eval_log_prefixes() {
  local log_prefix="$1"
  shift
  local models=("$@")

  mkdir -p "$ACTIVE_BASELINE_EVAL_PREFIX_DIR"
  for model in "${models[@]}"; do
    printf '%s\n' "$log_prefix" > "$(active_baseline_eval_prefix_path "$model")"
  done
}

active_baseline_eval_log_prefix() {
  local model="$1"
  local prefix_file
  local log_prefix=""
  prefix_file="$(active_baseline_eval_prefix_path "$model")"

  if [[ -r "$prefix_file" ]]; then
    IFS= read -r log_prefix < "$prefix_file" || true
  fi

  printf '%s' "$log_prefix"
}

copy_active_baseline_eval_logs() {
  local destination="$1"
  shift
  local models=("$@")

  mkdir -p "$destination"
  for model in "${models[@]}"; do
    local log_prefix
    log_prefix="$(active_baseline_eval_log_prefix "$model")"
    [[ -n "$log_prefix" ]] || continue

    local eval_log="${log_prefix}-${model}.log"
    if [[ -e "$eval_log" ]]; then
      cp "$eval_log" "$destination/"
    fi
  done
}

copy_snapshot_artifacts() {
  local snapshot_file="$1"
  local destination="$2"

  mkdir -p "$destination"
  while IFS= read -r artifact_dir; do
    [[ -n "$artifact_dir" ]] || continue
    if [[ -d "$REPO/$artifact_dir" ]]; then
      cp -R "$REPO/$artifact_dir" "$destination/"
    fi
  done < <(node "$HELPER" snapshot-artifact-dirs "$snapshot_file")
}

one_line_file() {
  local file_path="$1"
  local fallback="$2"

  if [[ -s "$file_path" ]]; then
    tr '\n' ' ' < "$file_path" | sed "s/[[:space:]]\\+/ /g; s/^ //; s/ $//; s/\"/'/g"
  else
    printf '%s' "$fallback"
  fi
}

eval_log_refs() {
  local log_prefix="$1"
  shift
  local models=("$@")
  local refs=()

  if [[ -z "$log_prefix" ]]; then
    printf 'none'
    return
  fi

  for model in "${models[@]}"; do
    local eval_log="${log_prefix}-${model}.log"
    if [[ -e "$eval_log" ]]; then
      refs+=("$(relative_log_path "$eval_log")")
    fi
  done

  if [[ "${#refs[@]}" -eq 0 ]]; then
    printf 'none'
  else
    local IFS=','
    printf '%s' "${refs[*]}"
  fi
}

active_baseline_eval_refs() {
  local models=("$@")
  local refs=()

  for model in "${models[@]}"; do
    local log_prefix
    log_prefix="$(active_baseline_eval_log_prefix "$model")"
    [[ -n "$log_prefix" ]] || continue

    local eval_log="${log_prefix}-${model}.log"
    if [[ -e "$eval_log" ]]; then
      refs+=("$(relative_log_path "$eval_log")")
    fi
  done

  if [[ "${#refs[@]}" -eq 0 ]]; then
    printf 'none'
  else
    local IFS=','
    printf '%s' "${refs[*]}"
  fi
}

append_accepted_log() {
  local selected_model="$1"
  local iteration="$2"
  local score_line="$3"
  local report_file="$4"
  local stdout_log="$5"
  local stderr_log="$6"
  local test_log="$7"
  local baseline_eval_refs="$8"
  local verify_eval_refs="$9"
  local baseline_json="${10}"
  local verify_json="${11}"
  local compare_json="${12}"

  node "$HELPER" append-accepted-log \
    "$selected_model" \
    "$iteration" \
    "$score_line" \
    "$report_file" \
    "$baseline_json" \
    "$verify_json" \
    "$compare_json" \
    "$stdout_log" \
    "$stderr_log" \
    "$test_log" \
    "$baseline_eval_refs" \
    "$verify_eval_refs"
}

run_summary_path() {
  local iteration="$1"
  printf '%s/iteration-%s/summary.log' "$RUN_LOG_DIR" "$iteration"
}

append_run_note() {
  local selected_model="$1"
  local iteration="$2"
  local score_line="$3"
  local report_file="$4"
  local stdout_log="$5"
  local stderr_log="$6"
  local test_log="$7"
  local baseline_eval_refs="$8"
  local verify_eval_refs="$9"
  local run_note
  run_note="$(run_summary_path "$iteration")"
  local report
  report="$(one_line_file "$report_file" "no report")"

  printf '%s iteration=%s model=%s result="%s" summary="%s" logs="codex_stderr:%s codex_stdout:%s test:%s baseline_eval:%s verify_eval:%s"\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "$iteration" \
    "$selected_model" \
    "$score_line" \
    "$report" \
    "$(log_ref "$stderr_log")" \
    "$(log_ref "$stdout_log")" \
    "$(log_ref "$test_log")" \
    "$baseline_eval_refs" \
    "$verify_eval_refs" > "$run_note"
}

append_failed_experiment() {
  local selected_model="$1"
  local iteration="$2"
  local score_line="$3"
  local report_file="$4"
  local stdout_log="$5"
  local stderr_log="$6"
  local test_log="$7"
  local baseline_eval_refs="$8"
  local verify_eval_refs="$9"
  local candidate_patch="${10}"
  local baseline_json="${11}"
  local verify_json="${12}"
  local compare_json="${13}"
  local candidate_evaluated="${14}"
  local run_note
  run_note="$(run_summary_path "$iteration")"

  node "$HELPER" append-failed-experiment \
    "$selected_model" \
    "$iteration" \
    "$score_line" \
    "$report_file" \
    "$candidate_patch" \
    "$baseline_json" \
    "$verify_json" \
    "$compare_json" \
    "$stdout_log" \
    "$stderr_log" \
    "$test_log" \
    "$baseline_eval_refs" \
    "$verify_eval_refs" \
    "$run_note" \
    "$candidate_evaluated"
}

ACTIVE_BASELINE_JSON="$TMP_ROOT/current-baseline.json"
ACTIVE_BASELINE_EVAL_PREFIX_DIR="$TMP_ROOT/active-baseline-eval-prefixes"
mkdir -p "$RUN_LOG_DIR/baseline"
mkdir -p "$ACTIVE_BASELINE_EVAL_PREFIX_DIR"
BASELINE_EVAL_LOG_PREFIX="$RUN_LOG_DIR/baseline.eval"
create_baseline_snapshot "$ACTIVE_BASELINE_JSON" "$BASELINE_EVAL_LOG_PREFIX"
set_active_baseline_eval_log_prefixes "$BASELINE_EVAL_LOG_PREFIX" "${ALL_MODELS[@]}"

for ((iteration = 1; iteration <= ITERATIONS; iteration += 1)); do
  ITERATION_DIR="$RUN_LOG_DIR/iteration-${iteration}"
  CURRENT_ITERATION_DIR="$ITERATION_DIR"
  mkdir -p "$ITERATION_DIR"
  SELECTED_MODEL="$(node "$HELPER" select-model "$MODEL_ARG" "$ACTIVE_BASELINE_JSON")"
  ATTEMPT_BASE_SHA="$(git rev-parse HEAD)"
  cp "$ACTIVE_BASELINE_JSON" "$ITERATION_DIR/active-baseline.json"
  copy_snapshot_artifacts "$ACTIVE_BASELINE_JSON" "$ITERATION_DIR/eval-artifacts/baseline"
  copy_active_baseline_eval_logs "$ITERATION_DIR/eval-logs/baseline" "${ALL_MODELS[@]}"

  printf '====================== iteration %s/%s ======================\n' "$iteration" "$ITERATIONS"
  printf -- "- selected '%s'\n" "$SELECTED_MODEL"

  COMMIT_SHA=""
  SCORE_LINE="no improvement"
  PROMPT_FILE="$ITERATION_DIR/prompt.md"
  STDOUT_LOG="$ITERATION_DIR/codex.stdout.jsonl"
  STDERR_LOG="$ITERATION_DIR/codex.stderr.log"
  REPORT_FILE="$ITERATION_DIR/report.txt"
  TEST_LOG="$ITERATION_DIR/test.log"
  VERIFY_EVAL_LOG_PREFIX="$ITERATION_DIR/verify-eval"
  CANDIDATE_EVALUATED="no"
  SKIP_VERIFY="no"
  VERIFY_JSON="none"
  COMPARE_JSON="none"
  RAW_DIFF="$ITERATION_DIR/raw.diff"
  BANNED_PATCH="$ITERATION_DIR/banned.diff"
  CANDIDATE_PATCH="$ITERATION_DIR/product.diff"
  DOCS_TEST_PATCH="$ITERATION_DIR/docs-test.diff"
  IMPORT_PATCH="$ITERATION_DIR/import.diff"
  CLEANUP_PATHSPEC="$ITERATION_DIR/banned-paths.nul"
  PRODUCT_PATHSPEC="$ITERATION_DIR/product-paths.nul"
  DOCS_TEST_PATHSPEC="$ITERATION_DIR/docs-test-paths.nul"
  VERIFY_MODELS=()
  BASELINE_EVAL_REFS="$(active_baseline_eval_refs "${ALL_MODELS[@]}")"
  VERIFY_EVAL_REFS="none"

  create_inner_worktree "$ATTEMPT_BASE_SHA" "$iteration" "1" "$ITERATION_DIR/install.log"
  write_inner_prompt "$PROMPT_FILE" "$INNER_REPO" "$SELECTED_MODEL" "$ACTIVE_BASELINE_JSON" "$iteration" "$ITERATIONS" "$REPORT_FILE"
  printf -- "- codex running...\n"
  printf '    stderr: %s // stdout: %s\n' "$STDERR_LOG" "$STDOUT_LOG"

  set +e
  run_codex_attempt "$INNER_REPO" "$PROMPT_FILE" "$STDOUT_LOG" "$STDERR_LOG"
  CODEX_STATUS=$?
  set -e

  capture_inner_raw_diff "$INNER_REPO" "$ATTEMPT_BASE_SHA" "$RAW_DIFF"

  if grep -q 'BLOCKED:' "$STDOUT_LOG" "$STDERR_LOG" 2>/dev/null; then
    remove_inner_worktree "$INNER_REPO"
    stop_for_driver "Inner Codex reported BLOCKED. Logs: $STDOUT_LOG $STDERR_LOG"
  fi

  ensure_inner_head_unchanged "$INNER_REPO" "$ATTEMPT_BASE_SHA"

  if [[ "$CODEX_STATUS" -ne 0 ]] &&
    grep -Eiq 'unknown option|unexpected argument|invalid value|Usage: codex exec' "$STDERR_LOG" 2>/dev/null; then
    remove_inner_worktree "$INNER_REPO"
    stop_for_driver "codex exec rejected the required flags. See $STDERR_LOG"
  fi

  create_inner_patches \
    "$INNER_REPO" \
    "$ATTEMPT_BASE_SHA" \
    "$RAW_DIFF" \
    "$BANNED_PATCH" \
    "$CANDIDATE_PATCH" \
    "$DOCS_TEST_PATCH" \
    "$IMPORT_PATCH" \
    "$CLEANUP_PATHSPEC" \
    "$PRODUCT_PATHSPEC" \
    "$DOCS_TEST_PATHSPEC"
  remove_inner_worktree "$INNER_REPO"

  print_change_blurb "$REPORT_FILE" "$STDOUT_LOG"
  printf '\n'

  if [[ "$CODEX_STATUS" -ne 0 ]]; then
    SCORE_LINE="no improvement (codex exited ${CODEX_STATUS})"
    SKIP_VERIFY="yes"
    import_inner_patches "$ATTEMPT_BASE_SHA" "$IMPORT_PATCH" "no"
  elif [[ ! -s "$CANDIDATE_PATCH" ]]; then
    SCORE_LINE="no improvement (no product diff)"
    SKIP_VERIFY="yes"
    import_inner_patches "$ATTEMPT_BASE_SHA" "$IMPORT_PATCH" "no"
  else
    DUPLICATE_FAILED_DIFF="$(node "$HELPER" failed-memory-duplicate "$SELECTED_MODEL" "$CANDIDATE_PATCH")"
    if [[ -n "$DUPLICATE_FAILED_DIFF" ]]; then
      SCORE_LINE="no improvement (${DUPLICATE_FAILED_DIFF})"
      SKIP_VERIFY="yes"
      import_inner_patches "$ATTEMPT_BASE_SHA" "$IMPORT_PATCH" "no"
    else
      import_inner_patches "$ATTEMPT_BASE_SHA" "$IMPORT_PATCH" "yes"

      printf -- "- tests running...\n"
      printf '    output: %s\n' "$TEST_LOG"
      if ! run_to_log "$TEST_LOG" pnpm test; then
        SCORE_LINE="no improvement (tests failed)"
        SKIP_VERIFY="yes"
        reset_candidate_product_patch "$IMPORT_PATCH"
        ensure_product_changes_reset
      fi
    fi
  fi

  if [[ "$SKIP_VERIFY" == "yes" ]]; then
    printf -- "- verification skipped: %s\n" "$SCORE_LINE"
  else
    while IFS= read -r model; do
      VERIFY_MODELS+=("$model")
    done < <(node "$HELPER" eval-models "$SELECTED_MODEL" "$CANDIDATE_PATCH")
    if [[ "${#VERIFY_MODELS[@]}" -eq 0 ]]; then
      stop_for_driver "Candidate was marked verifiable without cleaned product paths."
    fi

    VERIFY_DIR="$REPO/.evals/web-gpu-$(timestamp)-auto-verify-${SELECTED_MODEL}-${iteration}-$$"
    cd "$REPO"
    VERIFY_EVAL_REFS="$(eval_log_refs "$VERIFY_EVAL_LOG_PREFIX" "${VERIFY_MODELS[@]}")"
    if ! run_eval_set "$VERIFY_DIR" "$VERIFY_EVAL_LOG_PREFIX" "${VERIFY_MODELS[@]}"; then
      VERIFY_EVAL_REFS="$(eval_log_refs "$VERIFY_EVAL_LOG_PREFIX" "${VERIFY_MODELS[@]}")"
      copy_eval_logs "$ITERATION_DIR/eval-logs/verify" "$VERIFY_EVAL_LOG_PREFIX" "${VERIFY_MODELS[@]}"
      mkdir -p "$ITERATION_DIR/eval-artifacts/verify"
      [[ -d "$VERIFY_DIR" ]] && cp -R "$VERIFY_DIR" "$ITERATION_DIR/eval-artifacts/verify/"
      SCORE_LINE="no improvement (artifact validation failed)"
      reset_candidate_product_patch "$IMPORT_PATCH"
      ensure_product_changes_reset
    else
      VERIFY_EVAL_REFS="$(eval_log_refs "$VERIFY_EVAL_LOG_PREFIX" "${VERIFY_MODELS[@]}")"
      VERIFY_JSON="$ITERATION_DIR/verify.json"
      if [[ "${#VERIFY_MODELS[@]}" -eq 1 ]]; then
        node "$HELPER" snapshot "${VERIFY_MODELS[0]}" "$VERIFY_DIR" > "$VERIFY_JSON" ||
          stop_for_driver "Verification artifacts could not be snapshotted after validation."
      else
        node "$HELPER" snapshot all "$VERIFY_DIR" > "$VERIFY_JSON" ||
          stop_for_driver "Verification artifacts could not be snapshotted after validation."
      fi
      copy_snapshot_artifacts "$VERIFY_JSON" "$ITERATION_DIR/eval-artifacts/verify"
      copy_eval_logs "$ITERATION_DIR/eval-logs/verify" "$VERIFY_EVAL_LOG_PREFIX" "${VERIFY_MODELS[@]}"

      COMPARE_JSON="$ITERATION_DIR/compare.json"
      node "$HELPER" compare "$SELECTED_MODEL" "$ACTIVE_BASELINE_JSON" "$VERIFY_JSON" > "$COMPARE_JSON"
      COMPARE_STATUS="$(node "$HELPER" compare-status "$COMPARE_JSON")"

      if [[ "$COMPARE_STATUS" == "stop" ]]; then
        reset_candidate_product_patch "$IMPORT_PATCH"
        ensure_product_changes_reset
        stop_for_driver "Verification could not prove the contract. See $COMPARE_JSON"
      fi

      CANDIDATE_EVALUATED="yes"
      if [[ "$COMPARE_STATUS" != "pass" ]]; then
        SCORE_LINE="no improvement ($(node "$HELPER" compare-reasons "$COMPARE_JSON"))"
        reset_candidate_product_patch "$IMPORT_PATCH"
        ensure_product_changes_reset
      else
        NEW_SCORE="$(node "$HELPER" compare-new-score "$COMPARE_JSON")"
        SCORE_LINE="$(node "$HELPER" compare-score-improvement "$COMPARE_JSON")"
      fi
    fi
  fi

  append_run_note "$SELECTED_MODEL" "$iteration" "$SCORE_LINE" "$REPORT_FILE" "$STDOUT_LOG" "$STDERR_LOG" "$TEST_LOG" "$BASELINE_EVAL_REFS" "$VERIFY_EVAL_REFS"

  if [[ "$SCORE_LINE" == no\ improvement* ]]; then
    append_failed_experiment "$SELECTED_MODEL" "$iteration" "$SCORE_LINE" "$REPORT_FILE" "$STDOUT_LOG" "$STDERR_LOG" "$TEST_LOG" "$BASELINE_EVAL_REFS" "$VERIFY_EVAL_REFS" "$CANDIDATE_PATCH" "$ACTIVE_BASELINE_JSON" "$VERIFY_JSON" "$COMPARE_JSON" "$CANDIDATE_EVALUATED"
    COMMIT_SHA=""
  else
    append_accepted_log "$SELECTED_MODEL" "$iteration" "$SCORE_LINE" "$REPORT_FILE" "$STDOUT_LOG" "$STDERR_LOG" "$TEST_LOG" "$BASELINE_EVAL_REFS" "$VERIFY_EVAL_REFS" "$ACTIVE_BASELINE_JSON" "$VERIFY_JSON" "$COMPARE_JSON"
    PATHSPEC_FILE="$ITERATION_DIR/commit-paths.nul"
    if ! changed_paths_for_commit "$PATHSPEC_FILE"; then
      stop_for_driver "No optimizer-owned files changed after iteration ${iteration}."
    fi
    ensure_main_candidate_unchanged "$ATTEMPT_BASE_SHA" "$IMPORT_PATCH"
    git add --pathspec-from-file="$PATHSPEC_FILE" --pathspec-file-nul
    git commit -m "auto-optimize: ${SELECTED_MODEL} ${NEW_SCORE}" >/dev/null
    COMMIT_SHA="$(git rev-parse --short HEAD)"
    node "$HELPER" merge-active-baseline "$SELECTED_MODEL" "$ACTIVE_BASELINE_JSON" "$VERIFY_JSON" > "$ITERATION_DIR/accepted-baseline.json"
    cp "$ITERATION_DIR/accepted-baseline.json" "$ACTIVE_BASELINE_JSON"
    set_active_baseline_eval_log_prefixes "$VERIFY_EVAL_LOG_PREFIX" "${VERIFY_MODELS[@]}"
    node "$HELPER" update-last-good "$SELECTED_MODEL" "$ACTIVE_BASELINE_JSON" "$COMMIT_SHA"
  fi

  printf -- "- score: %s\n" "$SCORE_LINE"
  if [[ -n "$COMMIT_SHA" ]]; then
    printf -- "- commit: %s\n" "$COMMIT_SHA"
  else
    printf -- "- commit: none\n"
  fi
  printf '\n'
done
