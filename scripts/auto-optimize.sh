#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$REPO/scripts/auto-optimize-helper.mjs"
TMP_BASE="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
TMP_ROOT="$TMP_BASE/auto-optimize-$(date -u +"%Y%m%dT%H%M%SZ")-$$"
INNER_WORKTREES=()
CODEX_YOLO_ARGS=()

cleanup_inner_worktrees() {
  for worktree in "${INNER_WORKTREES[@]:-}"; do
    if [[ -d "$worktree" ]]; then
      rm -rf "$worktree"
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

REQUESTED_MODELS=()
while IFS= read -r model; do
  REQUESTED_MODELS+=("$model")
done < <(node "$HELPER" models "$MODEL_ARG")

if ! git diff --quiet || ! git diff --cached --quiet; then
  stop_for_driver "Tracked working-copy changes exist before the optimizer starts."
fi

PREEXISTING_UNTRACKED="$(git ls-files --others --exclude-standard || true)"
if [[ -n "$PREEXISTING_UNTRACKED" ]]; then
  stop_for_driver "Untracked files exist before the optimizer starts: $PREEXISTING_UNTRACKED"
fi

run_eval_set() {
  local output_dir="$1"
  mkdir -p "$output_dir"

  for model in "${REQUESTED_MODELS[@]}"; do
    printf 'running headed WebGPU eval for %s -> %s\n' "$model" "$output_dir"
    set +e
    pnpm eval:webgpu -- --model "$model" --headed --output-dir "$output_dir"
    local eval_status=$?
    set -e

    if ! node "$HELPER" validate-artifact "$model" "$output_dir"; then
      stop_for_driver "WebGPU eval for $model exited $eval_status and did not produce a valid schemaVersion 1 artifact."
    fi
  done
}

ensure_baseline_snapshot() {
  local snapshot_file="$1"
  local purpose="$2"
  local latest_error="$TMP_ROOT/latest-${purpose}.err"

  set +e
  node "$HELPER" latest-snapshot "$MODEL_ARG" > "$snapshot_file" 2> "$latest_error"
  local latest_status=$?
  set -e

  if [[ "$latest_status" -eq 0 ]]; then
    return
  fi

  if [[ "$latest_status" -ne 3 ]]; then
    stop_for_driver "$(cat "$latest_error")"
  fi

  printf 'latest artifacts are missing or stale: %s\n' "$(cat "$latest_error")"
  local output_dir
  output_dir="$REPO/.evals/web-gpu-$(timestamp)-auto-${purpose}-$$"
  run_eval_set "$output_dir"
  node "$HELPER" snapshot "$MODEL_ARG" "$output_dir" > "$snapshot_file" ||
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
  INNER_REPO="$TMP_ROOT/worktree-${iteration}-${attempt_index}"

  git clone --quiet --no-hardlinks "$REPO" "$INNER_REPO"
  git -C "$INNER_REPO" checkout --quiet --detach "$base_sha"
  INNER_WORKTREES+=("$INNER_REPO")
  link_dependency_dirs "$INNER_REPO"
}

remove_inner_worktree() {
  local inner_repo="$1"
  rm -rf "$inner_repo"
}

link_dependency_dirs() {
  local inner_repo="$1"

  for source_dir in "$REPO/node_modules" "$REPO"/packages/*/node_modules; do
    [[ -d "$source_dir" ]] || continue
    local relative_path="${source_dir#"$REPO"/}"
    local target_dir="$inner_repo/$relative_path"
    mkdir -p "$(dirname "$target_dir")"
    ln -s "$source_dir" "$target_dir"
  done
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

create_inner_patches() {
  local inner_repo="$1"
  local base_sha="$2"
  local product_patch="$3"
  local docs_patch="$4"

  git -C "$inner_repo" add -N -- . >/dev/null 2>&1 || true
  git -C "$inner_repo" diff --binary "$base_sha" -- . ':(exclude)docs/optimization/**' > "$product_patch"
  git -C "$inner_repo" diff --binary "$base_sha" -- docs/optimization/ > "$docs_patch"
}

import_inner_patches() {
  local base_sha="$1"
  local product_patch="$2"
  local docs_patch="$3"
  local import_product="$4"

  ensure_main_clean_before_import "$base_sha"
  if [[ "$import_product" == "yes" && -s "$product_patch" ]]; then
    git -C "$REPO" apply --check "$product_patch" ||
      stop_for_driver "Candidate product patch cannot be applied cleanly: $product_patch"
  fi
  if [[ -s "$docs_patch" ]]; then
    git -C "$REPO" apply --check "$docs_patch" ||
      stop_for_driver "Candidate docs patch cannot be applied cleanly: $docs_patch"
  fi
  if [[ "$import_product" == "yes" && -s "$product_patch" ]]; then
    git -C "$REPO" apply "$product_patch"
  fi
  if [[ -s "$docs_patch" ]]; then
    git -C "$REPO" apply "$docs_patch"
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

  if ! git -C "$REPO" diff --quiet || ! git -C "$REPO" diff --cached --quiet; then
    git -C "$REPO" status --short > "$TMP_ROOT/main-dirty-before-import.log" || true
    stop_for_driver "Main worktree changed before candidate import. See $TMP_ROOT/main-dirty-before-import.log"
  fi

  local untracked
  untracked="$(git -C "$REPO" ls-files --others --exclude-standard || true)"
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

  if ! cmp -s "$expected_patch" "$current_patch"; then
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
The outer harness will import product diffs plus docs/optimization notes back to the real repo.
The Codex CLI is running in yolo/bypass mode so you can run arbitrary commands; stay inside the guardrails below.

Goal: improve translation quality through one real babulfish product change for the selected WebGPU eval model.

Autonomous loop rules:
- This is iteration ${iteration}/${total_iterations}. Try exactly one idea, then stop.
- You may modify babulfish product code broadly when the change is a real product improvement.
- Allowed examples include packages/core/src/**, packages/react/src/**, packages/styles/src/**, packages/babulfish/src/**, packages/demo-shared/src/**, packages/demo-vanilla/src/** except WebGPU eval files, packages/demo-webcomponent/src/**, packages/demo/app/**, package README files, and product behavior tests.
- You may move responsibilities around, refactor, add prompt/input handling, add post-processing, improve model-specific logic, or change public package code when justified.
- Preserve existing capabilities unless an explicit, intentional behavior change is covered by tests.
- Tests may be added or updated for intentional product behavior. Do not weaken, delete, skip, or neuter tests.
- Append exactly one line to docs/optimization/${selected_model}-log.md for this iteration. Include failure_modes=..., hypotheses=..., selected=..., change=..., eval=..., result=....
- Write exactly one short terminal blurb to ${report_file}. One line only: change + reasoning.
- Do not ask the human whether to continue for worse score, crash, timeout, or no idea worked.
- If an assumption guardrail is false, print BLOCKED: <reason> and stop.

Hard no-touch files and directories:
- scripts/webgpu-eval.mjs
- packages/demo-vanilla/src/webgpu-eval.ts
- packages/demo-vanilla/src/webgpu-eval-scorer.ts
- packages/demo-vanilla/webgpu-eval.html
- evals/translation/**/*.json
- .evals/**
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

Baseline:
EOF
    node "$HELPER" prompt-summary "$selected_model" "$baseline_file"
    printf '\n'
    node "$HELPER" prompt-evidence "$selected_model" "$baseline_file"
    cat <<'EOF'

Required workflow:
1. Collect eval evidence from the baseline artifact above. Identify the concrete failure modes.
2. Generate at least three hypotheses for product changes that could improve those failure modes while preserving existing capabilities.
3. Select one hypothesis. Explain why it is the best bet and list the attack plan.
4. Make one focused product change. Prefer the smallest durable change that improves the product, but do not artificially confine yourself to adapter files.
5. Run the full babulfish test suite from the temporary repo root:
   pnpm test
   If any test fails, use the failure to revise the product change. If the failure cannot be fixed without violating the hard no-touch rules, restore your product edits, keep the docs/optimization log line, write the failure reason to the report file, and exit cleanly.
6. Run the target headed eval into a fresh .evals/web-gpu-* output dir:
   pnpm eval:webgpu -- --model <selected-model> --headed --output-dir <fresh-dir>
7. Compare the new artifact's model.score to the baseline above.
8. If improved: leave product changes in the working tree and summarize score/artifact.
9. If not improved: restore only product edits you made, keep the docs/optimization log line, and exit cleanly.

Model-specific constraints:
- Qwen and Gemma chat models currently inherit ChatModelBaseAdapter.buildSystemPrompt(). If a change should be model-specific, split or override cleanly instead of smuggling model conditionals into shared behavior.
- TranslateGemma uses structured input, not a normal chat system prompt. Do not force fake prompt changes; improve its real input/output surface or shared product logic when that is the right fix.
- Shared changes are allowed when they are real product improvements and existing capabilities remain preserved by tests and verification.

Do not:
- Edit hard no-touch paths listed above.
- Modify eval scoring, corpus, or live eval harness.
- Weaken tests or validation to make a candidate pass.
- Delete historical .evals.
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

print_patch_diff() {
  local patch_file="$1"
  local empty_message="$2"

  if [[ ! -s "$patch_file" ]]; then
    printf '    %s\n' "$empty_message"
    return
  fi

  if command -v delta >/dev/null 2>&1; then
    delta --paging=never --color-only < "$patch_file" | sed 's/^/    /'
  else
    sed 's/^/    /' "$patch_file"
  fi
}

print_docs_diff() {
  local commit_sha="$1"
  if [[ -z "$commit_sha" ]]; then
    printf '    (no docs diff)\n'
    return
  fi

  if command -v delta >/dev/null 2>&1; then
    git show --stat --patch "$commit_sha" -- docs/optimization/ | delta --paging=never --color-only | sed 's/^/    /'
  else
    git show --stat --patch "$commit_sha" -- docs/optimization/ | sed 's/^/    /'
  fi
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

docs_changed() {
  ! git diff --quiet -- docs/optimization/ ||
    [[ -n "$(git ls-files --others --exclude-standard docs/optimization/ 2>/dev/null || true)" ]]
}

ensure_docs_note() {
  local selected_model="$1"
  local iteration="$2"
  local score_line="$3"
  local report_file="$4"
  local stdout_log="$5"
  local stderr_log="$6"

  if docs_changed; then
    return
  fi

  mkdir -p "$REPO/docs/optimization"
  local report="no report"
  if [[ -s "$report_file" ]]; then
    report="$(tr '\n' ' ' < "$report_file" | sed 's/[[:space:]]\+/ /g; s/^ //; s/ $//')"
  fi

  printf '%s iteration=%s model=%s score="%s" result="%s" logs="stderr:%s stdout:%s"\n' \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "$iteration" \
    "$selected_model" \
    "$score_line" \
    "$report" \
    "$stderr_log" \
    "$stdout_log" >> "$REPO/docs/optimization/${selected_model}-log.md"
}

for ((iteration = 1; iteration <= ITERATIONS; iteration += 1)); do
  BASELINE_JSON="$TMP_ROOT/iteration-${iteration}-baseline.json"
  ensure_baseline_snapshot "$BASELINE_JSON" "baseline-${iteration}"

  SELECTED_MODEL="$(node "$HELPER" select-model "$MODEL_ARG" "$BASELINE_JSON")"
  ATTEMPT_BASE_SHA="$(git rev-parse HEAD)"

  printf '====================== iteration %s/%s ======================\n' "$iteration" "$ITERATIONS"
  printf -- "- selected '%s'\n" "$SELECTED_MODEL"

  COMMIT_SHA=""
  SCORE_LINE="no improvement"
  PROMPT_FILE="$TMP_ROOT/iteration-${iteration}.prompt.md"
  STDOUT_LOG="$TMP_ROOT/iteration-${iteration}.stdout.jsonl"
  STDERR_LOG="$TMP_ROOT/iteration-${iteration}.stderr.log"
  REPORT_FILE="$TMP_ROOT/iteration-${iteration}.report.txt"
  CANDIDATE_PATCH="$TMP_ROOT/iteration-${iteration}.product.patch"
  DOCS_PATCH="$TMP_ROOT/iteration-${iteration}.docs.patch"

  create_inner_worktree "$ATTEMPT_BASE_SHA" "$iteration" "1"
  write_inner_prompt "$PROMPT_FILE" "$INNER_REPO" "$SELECTED_MODEL" "$BASELINE_JSON" "$iteration" "$ITERATIONS" "$REPORT_FILE"
  printf -- "- codex running...\n"
  printf '    stderr: %s // stdout: %s\n' "$STDERR_LOG" "$STDOUT_LOG"

  set +e
  run_codex_attempt "$INNER_REPO" "$PROMPT_FILE" "$STDOUT_LOG" "$STDERR_LOG"
  CODEX_STATUS=$?
  set -e

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

  ensure_inner_attempt_scope "$INNER_REPO"
  create_inner_patches "$INNER_REPO" "$ATTEMPT_BASE_SHA" "$CANDIDATE_PATCH" "$DOCS_PATCH"
  remove_inner_worktree "$INNER_REPO"

  print_change_blurb "$REPORT_FILE" "$STDOUT_LOG"
  printf '\n'
  print_patch_diff "$CANDIDATE_PATCH" "(no product diff)"
  printf '\n'

  if [[ "$CODEX_STATUS" -ne 0 ]]; then
    SCORE_LINE="no improvement (codex exited ${CODEX_STATUS})"
    import_inner_patches "$ATTEMPT_BASE_SHA" "$CANDIDATE_PATCH" "$DOCS_PATCH" "no"
  elif [[ ! -s "$CANDIDATE_PATCH" ]]; then
    SCORE_LINE="no improvement (no product diff)"
    import_inner_patches "$ATTEMPT_BASE_SHA" "$CANDIDATE_PATCH" "$DOCS_PATCH" "no"
  else
    import_inner_patches "$ATTEMPT_BASE_SHA" "$CANDIDATE_PATCH" "$DOCS_PATCH" "yes"

    if ! pnpm test; then
      SCORE_LINE="no improvement (tests failed)"
      reset_candidate_product_patch "$CANDIDATE_PATCH"
      ensure_product_changes_reset
    else
      VERIFY_DIR="$REPO/.evals/web-gpu-$(timestamp)-auto-verify-${SELECTED_MODEL}-${iteration}-$$"
      run_eval_set "$VERIFY_DIR"
      VERIFY_JSON="$TMP_ROOT/iteration-${iteration}-verify.json"
      node "$HELPER" snapshot "$MODEL_ARG" "$VERIFY_DIR" > "$VERIFY_JSON" ||
        stop_for_driver "Verification artifacts could not be validated."

      COMPARE_JSON="$TMP_ROOT/iteration-${iteration}-compare.json"
      node "$HELPER" compare "$SELECTED_MODEL" "$BASELINE_JSON" "$VERIFY_JSON" > "$COMPARE_JSON"
      COMPARE_STATUS="$(node "$HELPER" compare-status "$COMPARE_JSON")"

      if [[ "$COMPARE_STATUS" == "stop" ]]; then
        reset_candidate_product_patch "$CANDIDATE_PATCH"
        ensure_product_changes_reset
        stop_for_driver "Verification could not prove the contract. See $COMPARE_JSON"
      fi

      if [[ "$COMPARE_STATUS" != "pass" ]]; then
        SCORE_LINE="no improvement ($(node "$HELPER" compare-reasons "$COMPARE_JSON"))"
        reset_candidate_product_patch "$CANDIDATE_PATCH"
        ensure_product_changes_reset
      else
        NEW_SCORE="$(node "$HELPER" compare-new-score "$COMPARE_JSON")"
        SCORE_LINE="$(node "$HELPER" compare-score-improvement "$COMPARE_JSON")"
      fi
    fi
  fi

  ensure_docs_note "$SELECTED_MODEL" "$iteration" "$SCORE_LINE" "$REPORT_FILE" "$STDOUT_LOG" "$STDERR_LOG"

  PATHSPEC_FILE="$TMP_ROOT/iteration-${iteration}-commit-paths.nul"
  if ! changed_paths_for_commit "$PATHSPEC_FILE"; then
    stop_for_driver "No optimizer-owned files changed after iteration ${iteration}."
  fi

  if [[ "$SCORE_LINE" == no\ improvement* ]]; then
    git add --pathspec-from-file="$PATHSPEC_FILE" --pathspec-file-nul
    git commit -m "auto-optimize: ${SELECTED_MODEL} no improvement"
    COMMIT_SHA="$(git rev-parse --short HEAD)"
  else
    ensure_main_candidate_unchanged "$ATTEMPT_BASE_SHA" "$CANDIDATE_PATCH"
    git add --pathspec-from-file="$PATHSPEC_FILE" --pathspec-file-nul
    git commit -m "auto-optimize: ${SELECTED_MODEL} ${NEW_SCORE}"
    COMMIT_SHA="$(git rev-parse --short HEAD)"
    node "$HELPER" update-last-good "$SELECTED_MODEL" "$VERIFY_JSON" "$COMMIT_SHA"
  fi

  printf -- "- score: %s\n" "$SCORE_LINE"
  if [[ -n "$COMMIT_SHA" ]]; then
    printf -- "- commit: %s\n" "$COMMIT_SHA"
  else
    printf -- "- commit: none\n"
  fi
  printf '\n'
  print_docs_diff "$COMMIT_SHA"
  printf '\n'
done
