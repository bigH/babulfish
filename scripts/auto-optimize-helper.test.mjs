import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
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
    assert.doesNotMatch(script, /\$REPO"\/packages\/\*\/node_modules/)
  })

  it("keeps outer loop logs and optimization result authoritative", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /RUN_LOG_DIR="\$REPO\/\.evals\/auto-optimizer\/runs\//)
    assert.match(script, /run_with_log "\$TEST_LOG" pnpm test/)
    assert.match(script, /if run_with_log "\$eval_log" pnpm eval:webgpu/)
    assert.match(script, /eval_status=\$\?/)
    assert.match(script, /run_eval_set "\$VERIFY_DIR" "\$VERIFY_EVAL_LOG_PREFIX"/)
    assert.match(script, /ignoring inner docs patch; outer harness writes authoritative optimization log/)
    assert.match(script, /append_docs_note "\$SELECTED_MODEL" "\$iteration" "\$SCORE_LINE"/)
    assert.doesNotMatch(script, /Append exactly one line to docs\/optimization/)
  })
})
