import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
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

  it("compares selected improvement while requiring non-selected outcomes to stay fixed", () => {
    const baseline = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
    })
    const improved = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
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

    const changedNeighbor = snapshot({
      "qwen-2.5-0.5b": modelSummary("qwen-2.5-0.5b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.81),
    })
    const comparison = compareSnapshots("qwen-2.5-0.5b", baseline, changedNeighbor, {
      verifyArtifactHashes: false,
    })
    assert.equal(comparison.status, "fail")
    assert.match(comparison.reasons.join("\n"), /gemma-3-1b-it score changed/)
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

  it("allows only production adapter source paths for optimizer attempts", () => {
    assert.equal(isAllowedAttemptPath("packages/core/src/engine/adapters/chat.ts"), true)
    assert.equal(
      isAllowedAttemptPath("packages/core/src/engine/adapters/models/qwen-3-0-6b.ts"),
      true,
    )
    assert.equal(
      isAllowedAttemptPath("packages/core/src/engine/__tests__/translation-adapters.test.ts"),
      false,
    )
    assert.equal(
      isAllowedAttemptPath("packages/core/src/engine/adapters/chat.test.ts"),
      false,
    )
    assert.equal(
      isAllowedAttemptPath("packages/core/src/engine/adapters/__tests__/chat.ts"),
      false,
    )
    assert.equal(isAllowedAttemptPath("package.json"), false)
    assert.equal(isAllowedAttemptPath("docs/optimization/qwen-3-0.6b-log.md"), true)
    assert.equal(isAllowedAttemptPath("docs/optimization/nested/qwen-3-0.6b-log.md"), true)
  })
})
