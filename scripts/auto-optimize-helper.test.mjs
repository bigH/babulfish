import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"

import {
  EXPECTED_CASE_COUNT,
  buildPromptEvidence,
  compareSnapshots,
  formatCompareReasons,
  formatScoreImprovement,
  isAllowedAttemptPath,
  parseRequestedModels,
  selectModelFromSnapshot,
  summarizeArtifactObject,
} from "./auto-optimize-helper.mjs"

const scoreBreakdown = (overrides = {}) => ({
  weightedCheckScore: 0.5,
  passedCaseRatio: 0.25,
  referenceSimilarity: 0.5,
  hardFailureCount: 0,
  failureReason: null,
  ...overrides,
})

const evalCase = (id, pass = true) => ({
  id,
  pass,
  checks: [
    { name: "non-empty-output", pass: true },
    { name: "no-explanation-wrapper", pass },
  ],
  scoreBreakdown: {
    checkScore: pass ? 1 : 0,
    referenceSimilarity: pass ? 1 : 0,
    hardFailure: !pass,
    hardFailureReason: pass ? null : "generation-error",
  },
  error: null,
})

const cases = Array.from({ length: EXPECTED_CASE_COUNT }, (_, index) =>
  evalCase(`case-${String(index + 1).padStart(2, "0")}`),
)

const casesWithFailedCase = (failedId) =>
  cases.map((testCase) => testCase.id === failedId ? evalCase(failedId, false) : testCase)

const artifact = (modelId, overrides = {}) => ({
  schemaVersion: 1,
  pass: false,
  ...Object.fromEntries(
    Object.entries(overrides).filter(([key]) => key !== "model"),
  ),
  model: {
    modelId,
    pass: false,
    score: 0.25,
    scoreBreakdown: scoreBreakdown(),
    cases,
    failuresByCategory: {},
    failuresByCheck: {},
    error: null,
    ...overrides.model,
  },
})

const snapshot = (models) => ({
  schemaVersion: 1,
  modelsRequested: Object.keys(models),
  models,
  artifactsDir: ".evals/web-gpu-test",
})

const modelSummary = (modelId, score, overrides = {}) => ({
  ...summarizeArtifactObject(
    artifact(modelId, {
      model: {
        score,
        scoreBreakdown: scoreBreakdown(overrides.scoreBreakdown),
        cases: overrides.cases ?? cases,
      },
    }),
    modelId,
  ),
  artifact: `.evals/web-gpu-test/${modelId}.json`,
  artifactHash: `${modelId}-hash`,
})

const writeExecutable = (filePath, contents) => {
  writeFileSync(filePath, contents)
  chmodSync(filePath, 0o755)
}

const onlyRunLogDir = (repo) => {
  const runsDir = path.join(repo, ".evals", "auto-optimizer", "runs")
  const entries = readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runsDir, entry.name))

  assert.equal(entries.length, 1)
  return entries[0]
}

const helperShim = `#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"

const allModels = ["qwen-2.5-0.5b", "qwen-3-0.6b", "gemma-3-1b-it", "translategemma-4"]
const command = process.argv[2]
const args = process.argv.slice(3)

if (process.env.MOCK_LOG) {
  fs.appendFileSync(process.env.MOCK_LOG, "helper " + command + " " + args.join(" ") + "\\n")
}

const requestedModels = (modelArg) => modelArg === "all" ? allModels : [modelArg]
const artifactName = (model) => model.replaceAll("/", "-") + ".json"

switch (command) {
  case "models":
    console.log(requestedModels(args[0]).join("\\n"))
    break
  case "validate-options":
    break
  case "validate-artifact": {
    const artifact = path.join(args[1], artifactName(args[0]))
    if (!fs.existsSync(artifact)) {
      console.error("missing artifact " + artifact)
      process.exit(1)
    }
    break
  }
  case "snapshot": {
    const [modelArg, outputDir] = args
    const models = Object.fromEntries(requestedModels(modelArg).map((model) => [
      model,
      {
        score: 0,
        pass: false,
        modelPass: false,
        passedCases: 0,
        totalCases: 38,
        hardFailureCount: 0,
        scoreBreakdown: {},
        failuresByCategory: {},
        failuresByCheck: {},
        error: null,
        checkOutcomes: [],
        artifact: ".evals/" + path.basename(outputDir) + "/" + artifactName(model),
        artifactHash: "hash-" + model,
      },
    ]))

    console.log(JSON.stringify({
      schemaVersion: 1,
      requestedModelArg: modelArg,
      artifactsDir: ".evals/" + path.basename(outputDir),
      modelsRequested: requestedModels(modelArg),
      models,
    }))
    break
  }
  case "select-model":
    console.log(args[0] === "all" ? allModels[0] : args[0])
    break
  case "prompt-summary":
    console.log("mock prompt summary")
    break
  case "prompt-evidence":
    console.log("mock prompt evidence")
    break
  case "ensure-reset-scope":
    break
  case "compare":
    console.log(JSON.stringify({
      status: "fail",
      reasons: ["mock no improvement"],
      selected: { oldScore: 0, newScore: 0, scoreDelta: 0 },
    }))
    break
  case "compare-status":
    console.log(JSON.parse(fs.readFileSync(args[0], "utf8")).status)
    break
  case "compare-reasons":
    console.log("mock no improvement")
    break
  case "commit-paths":
    process.stdout.write("docs/optimization/qwen-2.5-0.5b-log.md\\0")
    break
  case "compare-new-score":
    console.log("0")
    break
  case "compare-score-improvement":
    console.log("0 -> 0")
    break
  case "update-last-good":
    break
  default:
    console.error("unexpected helper command " + command)
    process.exit(1)
}
`

const pnpmShim = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")

const args = process.argv.slice(2)
if (process.env.MOCK_LOG) {
  fs.appendFileSync(process.env.MOCK_LOG, "pnpm " + args.join(" ") + "\\n")
}

if (args.includes("install")) {
  console.log("INSTALL_STDOUT")
  process.exit(0)
}

if (args[0] === "test") {
  console.log("TEST_STDOUT")
  console.error("TEST_STDERR")
  process.exit(0)
}

if (args.includes("eval:webgpu")) {
  const model = args[args.indexOf("--model") + 1]
  const outputDir = args[args.indexOf("--output-dir") + 1]
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(
    path.join(outputDir, model.replaceAll("/", "-") + ".json"),
    JSON.stringify({ schemaVersion: 1, model: { modelId: model } }) + "\\n",
  )
  console.log("EVAL_STDOUT " + model)
  console.error("EVAL_STDERR " + model)
  process.exit(7)
}

console.error("unexpected pnpm command " + args.join(" "))
process.exit(1)
`

const gitShim = `#!/usr/bin/env node
const fs = require("node:fs")

let args = process.argv.slice(2)
let cwd = process.cwd()
while (args[0] === "-C") {
  cwd = args[1]
  args = args.slice(2)
}

if (process.env.MOCK_LOG) {
  fs.appendFileSync(process.env.MOCK_LOG, "git " + args.join(" ") + " cwd=" + cwd + "\\n")
}

const command = args[0]

if (command === "clone") {
  fs.mkdirSync(args[args.length - 1], { recursive: true })
  process.exit(0)
}

if (command === "rev-parse") {
  console.log(args.includes("--short") ? "mock123" : "mockhead")
  process.exit(0)
}

if (command === "diff") {
  if (args.includes("--quiet")) process.exit(0)
  if (cwd.includes("worktree-") && args.includes(":(exclude)docs/optimization/**")) {
    process.stdout.write("mock product patch\\n")
  }
  process.exit(0)
}

if (command === "commit") {
  console.log("COMMIT_STDOUT")
  process.exit(0)
}

process.exit(0)
`

const codexShim = `#!/usr/bin/env node
const fs = require("node:fs")

const args = process.argv.slice(2)
if (args.includes("--help")) {
  console.log("codex exec help --yolo")
  process.exit(0)
}

if (process.env.MOCK_LOG) {
  fs.appendFileSync(process.env.MOCK_LOG, "codex " + args.join(" ") + "\\n")
}

fs.readFileSync(0, "utf8")
console.log(JSON.stringify({ type: "completed" }))
console.error("CODEX_STDERR")
`

describe("auto optimizer helper", () => {
  it("accepts one concrete model id or all", () => {
    assert.deepEqual(parseRequestedModels("all"), [
      "qwen-2.5-0.5b",
      "qwen-3-0.6b",
      "gemma-3-1b-it",
      "translategemma-4",
    ])
    assert.deepEqual(parseRequestedModels("gemma-3-1b-it"), ["gemma-3-1b-it"])
    assert.throws(() => parseRequestedModels("qwen-2.5-0.5b,gemma-3-1b-it"), /concrete/)
    assert.throws(() => parseRequestedModels("unknown"), /Unknown WebGPU eval model/)
  })

  it("validates successful and load-failure artifact shapes", () => {
    const successful = summarizeArtifactObject(artifact("qwen-2.5-0.5b"), "qwen-2.5-0.5b")
    assert.equal(successful.score, 0.25)
    assert.equal(successful.totalCases, EXPECTED_CASE_COUNT)

    const loadFailure = summarizeArtifactObject(
      artifact("qwen-3-0.6b", {
        model: {
          score: 0,
          scoreBreakdown: scoreBreakdown({
            weightedCheckScore: 0,
            passedCaseRatio: 0,
            referenceSimilarity: 0,
            failureReason: "load: forced failure",
          }),
          cases: [],
          error: { class: "load", message: "forced failure" },
        },
      }),
      "qwen-3-0.6b",
    )
    assert.equal(loadFailure.score, 0)
    assert.equal(loadFailure.totalCases, 0)
    assert.equal(loadFailure.error.class, "load")

    assert.throws(
      () => summarizeArtifactObject(artifact("gemma-3-1b-it", { schemaVersion: 2 }), "gemma-3-1b-it"),
      /schemaVersion must be 1/,
    )
    assert.throws(
      () =>
        summarizeArtifactObject(
          artifact("gemma-3-1b-it", { model: { cases: [evalCase("too-few")] } }),
          "gemma-3-1b-it",
        ),
      /38 cases/,
    )
  })

  it("selects the lowest scoring model with deterministic tie-breaks", () => {
    const ranked = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.2),
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
      "translategemma-4": modelSummary("translategemma-4", 0.9),
    })
    assert.equal(selectModelFromSnapshot("all", ranked), "qwen-3-0.6b")
    assert.equal(selectModelFromSnapshot("gemma-3-1b-it", ranked), "gemma-3-1b-it")

    const tied = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0, {
        scoreBreakdown: { hardFailureCount: 10 },
      }),
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0, {
        scoreBreakdown: { hardFailureCount: 38 },
      }),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
      "translategemma-4": modelSummary("translategemma-4", 0.9),
    })
    assert.equal(selectModelFromSnapshot("all", tied), "qwen-3-0.6b")
  })

  it("compares selected improvement while tolerating non-selected eval drift", () => {
    const baseline = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8, {
        cases: casesWithFailedCase("case-01"),
      }),
    })
    const improved = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.809),
    })
    assert.equal(
      compareSnapshots("qwen-2.5-0.5b", baseline, improved, { verifyArtifactHashes: false }).status,
      "pass",
    )

    const worseSelected = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
    })
    assert.equal(
      compareSnapshots("qwen-2.5-0.5b", baseline, worseSelected, { verifyArtifactHashes: false }).status,
      "fail",
    )

    const toleratedNeighborDrift = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.795, {
        cases: casesWithFailedCase("case-01"),
      }),
    })
    assert.equal(
      compareSnapshots("qwen-2.5-0.5b", baseline, toleratedNeighborDrift, {
        verifyArtifactHashes: false,
      }).status,
      "pass",
    )

    const regressedNeighborScore = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.789, {
        cases: casesWithFailedCase("case-01"),
      }),
    })
    const scoreRegression = compareSnapshots("qwen-2.5-0.5b", baseline, regressedNeighborScore, {
      verifyArtifactHashes: false,
    })
    assert.equal(scoreRegression.status, "fail")
    assert.match(scoreRegression.reasons.join("\n"), /gemma-3-1b-it score regressed/)

    const stableBaseline = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
    })
    const introducedFailureNeighbor = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.799, {
        cases: casesWithFailedCase("case-02"),
      }),
    })
    const newFailure = compareSnapshots("qwen-2.5-0.5b", stableBaseline, introducedFailureNeighbor, {
      verifyArtifactHashes: false,
    })
    assert.equal(newFailure.status, "fail")
    assert.match(newFailure.reasons.join("\n"), /gemma-3-1b-it introduced failing checks/)
    assert.match(newFailure.reasons.join("\n"), /case-02/)
  })

  it("rejects non-selected pass and hard-failure regressions", () => {
    const baseline = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.2),
      "gemma-3-1b-it": {
        ...modelSummary("gemma-3-1b-it", 0.8),
        pass: true,
        modelPass: true,
      },
    })
    const regressed = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8, {
        scoreBreakdown: { hardFailureCount: 1 },
      }),
    })
    const comparison = compareSnapshots("qwen-2.5-0.5b", baseline, regressed, {
      verifyArtifactHashes: false,
    })

    assert.equal(comparison.status, "fail")
    assert.match(comparison.reasons.join("\n"), /top-level pass outcome regressed/)
    assert.match(comparison.reasons.join("\n"), /model pass outcome regressed/)
    assert.match(comparison.reasons.join("\n"), /hard failures increased/)
  })

  it("formats score improvements for terminal output", () => {
    const comparison = compareSnapshots(
      "qwen-2.5-0.5b",
      snapshot({
        "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.212894),
      }),
      snapshot({
        "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.250001),
      }),
      { verifyArtifactHashes: false },
    )

    assert.equal(
      formatScoreImprovement(comparison.selected),
      "0.212894 -> 0.250001 (+0.037107)",
    )
  })

  it("formats comparison failure reasons for terminal output", () => {
    assert.equal(
      formatCompareReasons({
        reasons: ["selected score did not improve"],
        stops: ["baseline artifact changed"],
      }),
      "selected score did not improve; baseline artifact changed",
    )
  })

  it("builds a concise prompt evidence packet from a baseline artifact", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimizer-test-"))
    const artifactDir = path.join(root, ".evals", "web-gpu-test")
    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(
      path.join(artifactDir, "qwen-2.5-0.5b.json"),
      `${JSON.stringify(
        artifact("qwen-2.5-0.5b", {
          model: {
            score: 0.2,
            cases: [
              evalCase("plain-good", true),
              {
                ...evalCase("plain-bad", false),
                category: "plain",
                targetLanguage: "es",
                contentType: "text",
                sourceText: "Hello world",
                rawOutput: "Here is the translation: Hola mundo",
                score: 0,
              },
              ...cases.slice(2),
            ],
          },
        }),
      )}\n`,
    )

    const prompt = buildPromptEvidence(
      "qwen-2.5-0.5b",
      snapshot({
        "qwen-2.5-0.5b": {
          ...modelSummary("qwen-2.5-0.5b", 0.2),
          artifact: ".evals/web-gpu-test/qwen-2.5-0.5b.json",
        },
      }),
      root,
    )

    assert.match(prompt, /Failure evidence:/)
    assert.match(prompt, /failures by check:/)
    assert.match(prompt, /lowest scoring failed cases:/)
  })

  it("allows product source paths for optimizer attempts", () => {
    const paths = [
      "packages/core/src/engine/adapters/chat.ts",
      "packages/core/src/dom/translator.ts",
      "packages/react/src/provider.tsx",
      "packages/styles/src/babulfish.css",
      "packages/babulfish/src/index.ts",
      "packages/demo-shared/src/runtime-selection.ts",
      "packages/demo-vanilla/src/main.ts",
      "packages/demo-webcomponent/src/babulfish-translator.ts",
      "packages/demo/app/page.tsx",
      "packages/core/README.md",
      "packages/react/README.md",
      "docs/optimization/qwen-3-0.6b-log.md",
      "docs/optimization/nested/qwen-3-0.6b-log.md",
    ]

    for (const filePath of paths) {
      assert.equal(isAllowedAttemptPath(filePath), true, filePath)
    }
  })

  it("allows product test files for optimizer attempts", () => {
    const paths = [
      "packages/core/src/engine/__tests__/translation-adapters.test.ts",
      "packages/core/src/engine/adapters/chat.test.ts",
      "packages/react/src/__tests__/react.test.tsx",
      "packages/demo/app/page.test.tsx",
    ]

    for (const filePath of paths) {
      assert.equal(isAllowedAttemptPath(filePath), true, filePath)
    }
  })

  it("blocks WebGPU eval target files for optimizer attempts", () => {
    const paths = [
      "scripts/webgpu-eval.mjs",
      "packages/demo-vanilla/src/webgpu-eval.ts",
      "packages/demo-vanilla/src/webgpu-eval-scorer.ts",
      "packages/demo-vanilla/webgpu-eval.html",
      "evals/translation/plain-es.json",
      "evals/translation/nested/plain-es.json",
      "docs/webgpu-evals.md",
    ]

    for (const filePath of paths) {
      assert.equal(isAllowedAttemptPath(filePath), false, filePath)
    }
  })

  it("blocks validation machinery for optimizer attempts", () => {
    const paths = [
      ".github/workflows/ci.yml",
      "eslint.config.js",
      "tsconfig.base.json",
      "scripts/consumer-smoke.mjs",
      "packages/demo/scripts/smoke.mjs",
    ]

    for (const filePath of paths) {
      assert.equal(isAllowedAttemptPath(filePath), false, filePath)
    }
  })

  it("blocks eval artifacts for optimizer attempts", () => {
    const paths = [
      ".evals/web-gpu-2026-04-26T07-01-21Z-headed-sequential/qwen-3-0.6b.json",
      ".evals/auto-optimizer/last-good-scores.json",
    ]

    for (const filePath of paths) {
      assert.equal(isAllowedAttemptPath(filePath), false, filePath)
    }
  })

  it("blocks package manifests, config, and optimizer scripts", () => {
    const paths = [
      "package.json",
      "packages/core/package.json",
      "packages/react/package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "packages/core/tsconfig.json",
      "packages/core/vitest.config.ts",
      "packages/demo-vanilla/vite.config.ts",
      "packages/react/tsup.config.ts",
      "packages/demo/next.config.ts",
      "scripts/auto-optimize.sh",
      "scripts/auto-optimize-helper.mjs",
      "scripts/auto-optimize-helper.test.mjs",
    ]

    for (const filePath of paths) {
      assert.equal(isAllowedAttemptPath(filePath), false, filePath)
    }
  })

  it("blocks non-product near misses for optimizer attempts", () => {
    const paths = [
      "docs/optimization/qwen-3-0.6b-log.txt",
      "README.md",
      "packages/core/docs/guide.md",
      "packages/core/test/contract.test.ts",
      "scripts/validation.test.ts",
      "evals/harness.test.ts",
      "scripts/other-tool.mjs",
    ]

    for (const filePath of paths) {
      assert.equal(isAllowedAttemptPath(filePath), false, filePath)
    }
  })

  it("keeps auto optimizer inner dependencies isolated", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /install_inner_dependencies/)
    assert.match(script, /pnpm --dir "\$inner_repo" install --frozen-lockfile/)
    assert.doesNotMatch(script, /ln -s "\$source_dir"/)
    assert.doesNotMatch(script, /node_modules.*ln -s/s)
    assert.doesNotMatch(script, /\$REPO"\/packages\/\*\/node_modules/)
  })

  it("creates a fresh run-start baseline instead of reusing latest artifacts", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /BASELINE_JSON="\$TMP_ROOT\/run-start-baseline\.json"/)
    assert.match(script, /create_baseline_snapshot "\$BASELINE_JSON" "\$BASELINE_EVAL_LOG_PREFIX"/)
    assert.match(script, /output_dir="\$REPO\/\.evals\/web-gpu-\$\(timestamp\)-auto-baseline-\$\$"/)
    assert.match(script, /run_eval_set "\$output_dir" "\$log_prefix"/)
    assert.doesNotMatch(script, /latest-snapshot/)
    assert.doesNotMatch(script, /latest artifacts are missing or stale/)
  })

  it("lets logged evals exit nonzero when artifact validation passes", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /if run_to_log "\$eval_log" pnpm eval:webgpu/)
    assert.match(script, /eval_status=\$\?/)
    assert.match(script, /if ! node "\$HELPER" validate-artifact "\$model" "\$output_dir"; then/)
    assert.match(script, /See \$eval_log/)
  })

  it("captures outer tests and evals quietly", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /run_to_log "\$TEST_LOG" pnpm test/)
    assert.match(script, /run_to_log "\$eval_log" pnpm eval:webgpu/)
    assert.doesNotMatch(script, /\btee\b/)
    assert.doesNotMatch(script, /run_with_log/)
  })

  it("runs verification evals from the main working copy against the run-start baseline", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /VERIFY_EVAL_LOG_PREFIX="\$RUN_LOG_DIR\/iteration-\$\{iteration\}\.verify-eval"/)
    assert.match(script, /cd "\$REPO"\n  run_eval_set "\$VERIFY_DIR" "\$VERIFY_EVAL_LOG_PREFIX"/)
    assert.match(script, /node "\$HELPER" compare "\$SELECTED_MODEL" "\$BASELINE_JSON" "\$VERIFY_JSON"/)
    assert.match(script, /CANDIDATE_CAN_IMPROVE="yes"/)
  })

  it("keeps outer loop logs and optimization result authoritative", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /RUN_LOG_DIR="\$REPO\/\.evals\/auto-optimizer\/runs\//)
    assert.match(script, /optimizer tmpdir:/)
    assert.match(script, /optimizer logs:/)
    assert.match(script, /run_eval_set "\$VERIFY_DIR" "\$VERIFY_EVAL_LOG_PREFIX"/)
    assert.match(script, /ignoring inner docs patch; outer harness writes authoritative optimization log/)
    assert.match(script, /append_docs_note "\$SELECTED_MODEL" "\$iteration" "\$SCORE_LINE"/)
    assert.match(script, /baseline_eval:%s verify_eval:%s/)
    assert.doesNotMatch(script, /Append exactly one line to docs\/optimization/)
  })

  it("smoke-tests quiet outer eval and test logging with mocked commands", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimize-smoke-"))
    const repo = path.join(root, "repo")
    const bin = path.join(root, "bin")
    const tmp = path.join(root, "tmp")
    const scriptsDir = path.join(repo, "scripts")
    const commandLog = path.join(root, "commands.log")
    const optimizerScript = path.join(scriptsDir, "auto-optimize.sh")

    mkdirSync(scriptsDir, { recursive: true })
    mkdirSync(bin, { recursive: true })
    mkdirSync(tmp, { recursive: true })
    writeExecutable(
      optimizerScript,
      readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8"),
    )
    writeFileSync(path.join(scriptsDir, "auto-optimize-helper.mjs"), helperShim)
    writeExecutable(path.join(bin, "pnpm"), pnpmShim)
    writeExecutable(path.join(bin, "git"), gitShim)
    writeExecutable(path.join(bin, "codex"), codexShim)

    const result = spawnSync(
      "bash",
      [optimizerScript, "qwen-2.5-0.5b", "--iterations", "1"],
      {
        cwd: repo,
        env: {
          ...process.env,
          MOCK_LOG: commandLog,
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
          TMPDIR: tmp,
        },
        encoding: "utf8",
      },
    )

    assert.equal(
      result.status,
      0,
      `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    )
    assert.equal(result.stderr, "")
    assert.doesNotMatch(
      result.stdout,
      /EVAL_STDOUT|EVAL_STDERR|TEST_STDOUT|TEST_STDERR|CODEX_STDERR|COMMIT_STDOUT/,
    )
    assert.match(result.stdout, /optimizer tmpdir:/)
    assert.match(result.stdout, /optimizer logs:/)
    assert.match(result.stdout, /baseline\.eval-qwen-2\.5-0\.5b\.log/)
    assert.match(result.stdout, /iteration-1\.test\.log/)
    assert.match(result.stdout, /iteration-1\.verify-eval-qwen-2\.5-0\.5b\.log/)

    const runLogDir = onlyRunLogDir(repo)
    const baselineLog = readFileSync(
      path.join(runLogDir, "baseline.eval-qwen-2.5-0.5b.log"),
      "utf8",
    )
    const testLog = readFileSync(path.join(runLogDir, "iteration-1.test.log"), "utf8")
    const verifyLog = readFileSync(
      path.join(runLogDir, "iteration-1.verify-eval-qwen-2.5-0.5b.log"),
      "utf8",
    )

    assert.match(baselineLog, /EVAL_STDOUT qwen-2\.5-0\.5b/)
    assert.match(baselineLog, /EVAL_STDERR qwen-2\.5-0\.5b/)
    assert.match(testLog, /TEST_STDOUT/)
    assert.match(testLog, /TEST_STDERR/)
    assert.match(verifyLog, /EVAL_STDOUT qwen-2\.5-0\.5b/)
    assert.match(verifyLog, /EVAL_STDERR qwen-2\.5-0\.5b/)

    const docsLog = readFileSync(
      path.join(repo, "docs", "optimization", "qwen-2.5-0.5b-log.md"),
      "utf8",
    )
    assert.match(docsLog, /test:.*iteration-1\.test\.log/)
    assert.match(docsLog, /baseline_eval:.*baseline\.eval-qwen-2\.5-0\.5b\.log/)
    assert.match(docsLog, /verify_eval:.*iteration-1\.verify-eval-qwen-2\.5-0\.5b\.log/)

    const commands = readFileSync(commandLog, "utf8")
    const baselineIndex = commands.indexOf("auto-baseline")
    const codexIndex = commands.indexOf("codex exec -C")
    const testIndex = commands.indexOf("pnpm test")
    const verifyIndex = commands.indexOf("auto-verify")

    assert.equal(commands.includes("latest-snapshot"), false)
    assert.notEqual(baselineIndex, -1)
    assert.notEqual(codexIndex, -1)
    assert.notEqual(testIndex, -1)
    assert.notEqual(verifyIndex, -1)
    assert.ok(baselineIndex < codexIndex)
    assert.ok(codexIndex < testIndex)
    assert.ok(testIndex < verifyIndex)
  })
})
