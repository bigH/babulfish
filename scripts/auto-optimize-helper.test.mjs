import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import * as autoOptimizeHelper from "./auto-optimize-helper.mjs"
import {
  EXPECTED_CASE_COUNT,
  appendAcceptedOptimizationLog,
  appendFailedExperiment,
  areGitPatchesEquivalent,
  buildAcceptedOptimizationRecord,
  buildPromptEvidence,
  buildFailedExperimentRecord,
  changedFilesFromPatchText,
  compareSnapshots,
  createSnapshot,
  duplicateFailedExperimentForHash,
  formatCompareReasons,
  formatFailedExperimentsPrompt,
  formatScoreImprovement,
  isAllowedAttemptPath,
  mergeActiveBaselineSnapshot,
  parseInnerReportLine,
  parseRequestedModels,
  productDiffHashFromPatchText,
  readFailedExperiments,
  recentFailedExperiments,
  selectModelFromSnapshot,
  summarizeArtifactObject,
  snapshotArtifactDirs,
  updateLastGoodScores,
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

const modelSummaryInDir = (modelId, score, artifactDir, overrides = {}) => ({
  ...modelSummary(modelId, score, overrides),
  artifact: `${artifactDir}/${modelId}.json`,
  artifactHash: `${modelId}-${artifactDir}-hash`,
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

const readFirstExisting = (paths) => {
  const filePath = paths.find((candidate) => existsSync(candidate))
  assert.ok(filePath, `Expected one of these files to exist:\n${paths.join("\n")}`)
  return readFileSync(filePath, "utf8")
}

const helperPath = fileURLToPath(new URL("./auto-optimize-helper.mjs", import.meta.url))

const requiredHelperFunction = (name) => {
  const helper = autoOptimizeHelper[name]
  assert.equal(typeof helper, "function", `${name} must be exported by auto-optimize-helper.mjs`)
  return helper
}

const sorted = (values) => [...values].sort((left, right) => left.localeCompare(right))

const assertSameMembers = (actual, expected, label) => {
  assert.deepEqual(sorted(actual), sorted(expected), label)
}

const helperShim = `#!/usr/bin/env node
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const allModels = ["qwen-3-0.6b", "gemma-3-1b-it", "translategemma-4"]
const command = process.argv[2]
const args = process.argv.slice(3)
const qwenIteration1Score = Number(process.env.MOCK_QWEN_ITERATION_1_SCORE ?? 0.66)
const qwenScoresByIteration = new Map([
  [0, 0],
  [1, qwenIteration1Score],
  [2, 0.53],
  [3, 0.67],
])
const gemmaScoresByIteration = new Map([
  [0, 0.8],
  [2, 0.82],
])

if (process.env.MOCK_LOG) {
  fs.appendFileSync(process.env.MOCK_LOG, "helper " + command + " " + args.join(" ") + "\\n")
}

const requestedModels = (modelArg) => modelArg === "all" ? allModels : [modelArg]
const artifactName = (model) => model.replaceAll("/", "-") + ".json"
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const formatScore = (score) => Number(score).toFixed(6)
const ledgerPath = path.join(process.cwd(), "docs", "optimization", "failed-experiments.jsonl")
const acceptedLogPath = (model) => path.join(process.cwd(), "docs", "optimization", model + "-log.jsonl")
const readLedger = () => {
  if (!fs.existsSync(ledgerPath)) return []
  return fs.readFileSync(ledgerPath, "utf8")
    .split(/\\r?\\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}
const patchHash = (patchPath) => {
  if (!patchPath || patchPath === "none" || !fs.existsSync(patchPath)) return null
  const patch = fs.readFileSync(patchPath)
  return patch.length === 0 ? null : crypto.createHash("sha256").update(patch).digest("hex")
}
const canonicalPatch = (patch) => {
  const matches = [...patch.matchAll(/^diff --git .+$/gm)]
  if (matches.length === 0) return patch

  const preamble = patch.slice(0, matches[0].index)
  const chunks = matches.map((match, index) => ({
    header: match[0],
    text: patch.slice(match.index, matches[index + 1]?.index ?? patch.length),
  }))

  return [
    preamble,
    ...chunks
      .sort(
        (left, right) =>
          left.header.localeCompare(right.header) || left.text.localeCompare(right.text),
      )
      .map((chunk) => chunk.text),
  ].join("")
}
const changedFiles = (patchPath) => {
  if (!patchPath || !fs.existsSync(patchPath) || fs.readFileSync(patchPath, "utf8").length === 0) return []
  return ["packages/core/src/engine/adapters/chat.ts"]
}
const verifyIteration = (outputDir) => {
  const match = path.basename(outputDir).match(/-auto-verify-.+-([0-9]+)-[0-9]+$/)
  return match ? Number(match[1]) : 0
}
const scoreFor = (model, outputDir) => {
  if (model === "qwen-3-0.6b") {
    return qwenScoresByIteration.get(verifyIteration(outputDir)) ?? 0.67
  }
  if (model === "gemma-3-1b-it") return gemmaScoresByIteration.get(verifyIteration(outputDir)) ?? 0.8
  return 0.9
}
const modelSummary = (model, outputDir) => {
  const score = scoreFor(model, outputDir)
  return {
    score,
    pass: score > 0.6,
    modelPass: score > 0.6,
    passedCases: Math.round(score * 38),
    totalCases: 38,
    hardFailureCount: 0,
    scoreBreakdown: { weightedCheckScore: score },
    failuresByCategory: {},
    failuresByCheck: {},
    error: null,
    checkOutcomes: [],
    artifact: ".evals/" + path.basename(outputDir) + "/" + artifactName(model),
    artifactHash: "hash-" + model + "-" + score,
  }
}
const selectModel = (modelArg, snapshot) => {
  if (modelArg !== "all") return modelArg
  return [...requestedModels(modelArg)].sort((left, right) => {
    const leftModel = snapshot.models[left]
    const rightModel = snapshot.models[right]
    return (
      leftModel.score - rightModel.score ||
      rightModel.hardFailureCount - leftModel.hardFailureCount ||
      leftModel.passedCases - rightModel.passedCases ||
      left.localeCompare(right)
    )
  })[0]
}
const compare = (selectedModel, baseline, verification) => {
  const oldScore = baseline.models[selectedModel].score
  const newScore = verification.models[selectedModel].score
  const improved = newScore > oldScore

  return {
    status: improved ? "pass" : "fail",
    reasons: improved
      ? []
      : [selectedModel + " score did not improve: " + oldScore + " -> " + newScore + "."],
    stops: [],
    selected: {
      model: selectedModel,
      oldScore,
      newScore,
      artifact: verification.models[selectedModel].artifact,
      scoreBreakdown: verification.models[selectedModel].scoreBreakdown,
    },
  }
}

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
      modelSummary(model, outputDir),
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
    console.log(selectModel(args[0], readJson(args[1])))
    break
  case "prompt-summary":
    console.log("Current accepted score: " + readJson(args[1]).models[args[0]].score)
    break
  case "prompt-evidence":
    console.log("Failure evidence:\\n- score: " + readJson(args[1]).models[args[0]].score)
    break
  case "failed-memory-prompt": {
    const records = readLedger().filter((record) => record.model === args[0]).reverse()
    console.log("Rejected approaches:")
    console.log("Recent failed experiments for " + args[0] + ". Do not repeat the same product diff or substantially the same approach unless this attempt is materially different.")
    if (records.length === 0) {
      console.log("- none recorded for " + args[0])
    } else {
      for (const record of records) {
        console.log("- iteration " + record.iteration + ": " + record.result)
      }
    }
    break
  }
  case "failed-memory-duplicate": {
    const hash = patchHash(args[1])
    const duplicate = readLedger().find((record) => record.model === args[0] && record.productDiffHash === hash)
    if (duplicate) console.log("duplicate failed product diff hash=" + hash.slice(0, 12))
    break
  }
  case "append-failed-experiment": {
    const [
      model,
      iteration,
      result,
      reportFile,
      productPatch,
      baselineSnapshot,
      verifySnapshot,
      compareJson,
    ] = args
    const baseline = fs.existsSync(baselineSnapshot) ? readJson(baselineSnapshot).models[model].score : null
    const verify = fs.existsSync(verifySnapshot) ? readJson(verifySnapshot).models[model].score : null
    const comparison = fs.existsSync(compareJson) ? readJson(compareJson) : null
    const candidate = comparison?.selected?.newScore ?? verify
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true })
    fs.appendFileSync(ledgerPath, JSON.stringify({
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      model,
      iteration: Number(iteration),
      result,
      rejectionReason: comparison ? comparison.reasons.join("; ") : result,
      innerReportRaw: fs.existsSync(reportFile) ? fs.readFileSync(reportFile, "utf8").trim() : null,
      parsed: {},
      scores: {
        baseline,
        candidate,
        verify,
        delta: typeof baseline === "number" && typeof candidate === "number" ? candidate - baseline : null,
      },
      changedFiles: changedFiles(productPatch),
      productDiffHash: patchHash(productPatch),
      logs: {},
    }) + "\\n")
    break
  }
  case "append-accepted-log": {
    const [
      model,
      iteration,
      result,
      reportFile,
      baselineSnapshot,
      verifySnapshot,
      compareJson,
      codexStdout,
      codexStderr,
      testLog,
      baselineEvalRefs,
      verifyEvalRefs,
    ] = args
    const comparison = readJson(compareJson)
    const logPath = acceptedLogPath(model)
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    fs.appendFileSync(logPath, JSON.stringify({
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      model,
      iteration: Number(iteration),
      result,
      innerReportRaw: fs.existsSync(reportFile) ? fs.readFileSync(reportFile, "utf8").trim() : null,
      parsed: {},
      scores: {
        baseline: comparison.selected.oldScore,
        candidate: comparison.selected.newScore,
        verify: readJson(verifySnapshot).models[model].score,
        delta: comparison.selected.newScore - comparison.selected.oldScore,
      },
      logs: {
        codex_stdout: codexStdout,
        codex_stderr: codexStderr,
        test: testLog,
        baseline_eval: baselineEvalRefs === "none" ? [] : baselineEvalRefs.split(","),
        verify_eval: verifyEvalRefs === "none" ? [] : verifyEvalRefs.split(","),
        baselineSnapshot,
      },
    }) + "\\n")
    break
  }
  case "ensure-reset-scope":
    break
  case "reset-banned-paths":
  case "cleanup-banned-paths":
  case "resettable-banned-paths":
  case "reset-banned-files":
    break
  case "target-adapter-path": {
    const adapterPaths = {
      "qwen-3-0.6b": "packages/core/src/engine/adapters/models/qwen-3-0-6b.ts",
      "gemma-3-1b-it": "packages/core/src/engine/adapters/models/gemma-3-1b-it.ts",
      "translategemma-4": "packages/core/src/engine/adapters/models/translategemma-4.ts",
    }
    console.log(adapterPaths[args[0]])
    break
  }
  case "eval-models-for-changed-paths":
  case "eval-models": {
    console.log(args[0])
    break
  }
  case "classify-changed-paths":
    console.log(JSON.stringify({
      productCodePaths: changedFiles(args[0] ?? "none"),
      productTestPaths: [],
      docsPaths: [],
      resettableBannedPaths: [],
      bannedPaths: [],
      targetAdapterModels: [],
    }))
    break
  case "changed-paths-nul": {
    const kind = args[0]
    if (kind === "product") {
      process.stdout.write("packages/core/src/engine/adapters/chat.ts\\0")
    } else if (kind === "docs-test") {
      process.stdout.write("")
    } else if (kind === "cleanup") {
      process.stdout.write("")
    } else {
      console.error("unexpected changed-paths-nul kind " + kind)
      process.exit(1)
    }
    break
  }
  case "changed-paths": {
    const kind = args[0]
    if (kind === "product") {
      console.log("packages/core/src/engine/adapters/chat.ts")
    } else if (kind === "docs-test" || kind === "cleanup") {
      process.stdout.write("")
    } else {
      console.error("unexpected changed-paths kind " + kind)
      process.exit(1)
    }
    break
  }
  case "snapshot-artifact-dirs": {
    const snapshot = readJson(args[0])
    const dirs = new Set(Object.values(snapshot.models).map((model) => path.dirname(model.artifact)))
    console.log([...dirs].sort().join("\\n"))
    break
  }
  case "compare":
    console.log(JSON.stringify(compare(args[0], readJson(args[1]), readJson(args[2]))))
    break
  case "compare-evaluated":
    console.log(JSON.stringify(compare(args[0], readJson(args[1]), readJson(args[2]))))
    break
  case "compare-status":
    console.log(readJson(args[0]).status)
    break
  case "compare-reasons":
    console.log(readJson(args[0]).reasons.join("; "))
    break
  case "commit-paths":
    process.stdout.write("packages/core/src/engine/adapters/chat.ts\\0docs/optimization/qwen-3-0.6b-log.jsonl\\0")
    break
  case "patches-equivalent":
    if (canonicalPatch(fs.readFileSync(args[0], "utf8")) !== canonicalPatch(fs.readFileSync(args[1], "utf8"))) {
      process.exit(1)
    }
    break
  case "compare-new-score":
    console.log(readJson(args[0]).selected.newScore)
    break
  case "compare-score-improvement": {
    const selected = readJson(args[0]).selected
    const delta = selected.newScore - selected.oldScore
    const sign = delta >= 0 ? "+" : ""
    console.log(
      formatScore(selected.oldScore) + " -> " + formatScore(selected.newScore) +
        " (" + sign + formatScore(delta) + ")",
    )
    break
  }
  case "compare-artifact":
    console.log(readJson(args[0]).selected.artifact)
    break
  case "candidate-count":
    console.log("1")
    break
  case "update-last-good":
    break
  case "merge-active-baseline": {
    const [model, baselinePath, verifyPath] = args
    const baseline = readJson(baselinePath)
    const verify = readJson(verifyPath)
    const models = { ...baseline.models, ...verify.models }
    const modelsRequested = allModels.filter((modelId) => models[modelId])
    const artifactDirs = Object.fromEntries(
      modelsRequested.map((modelId) => [modelId, path.dirname(models[modelId].artifact)]),
    )
    const dirs = [...new Set(Object.values(artifactDirs))].sort()
    console.log(JSON.stringify({
      ...baseline,
      artifactsDir: dirs.length === 1 ? dirs[0] : null,
      artifactDirs,
      mixedArtifacts: dirs.length > 1,
      modelsRequested,
      models,
    }))
    break
  }
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
const statePath = process.env.MOCK_GIT_STATE
const readState = () => {
  if (!statePath || !fs.existsSync(statePath)) return { dirty: false }
  return JSON.parse(fs.readFileSync(statePath, "utf8"))
}
const writeState = (state) => {
  if (statePath) fs.writeFileSync(statePath, JSON.stringify(state))
}
const isInnerWorktree = cwd.includes("worktree-")
const innerIteration = () => cwd.match(/worktree-([0-9]+)-/)?.[1] ?? "0"

if (command === "clone") {
  fs.mkdirSync(args[args.length - 1], { recursive: true })
  process.exit(0)
}

if (command === "rev-parse") {
  console.log(args.includes("--short") ? "mock123" : "mockhead")
  process.exit(0)
}

if (command === "diff") {
  if (args.includes("--quiet")) {
    process.exit(!isInnerWorktree && readState().dirty && !args.includes("--cached") ? 1 : 0)
  }
  if (args.includes("--cached")) process.exit(0)
  if (args.some((arg) => arg.startsWith("--pathspec-from-file="))) {
    if (isInnerWorktree) {
      process.stdout.write("mock product patch iteration-" + innerIteration() + "\\n")
    } else if (readState().dirty) {
      process.stdout.write(readState().patch ?? "mock product patch\\n")
    }
    process.exit(0)
  }
  if (args.includes("--")) {
    if (isInnerWorktree) {
      process.stdout.write("mock product patch iteration-" + innerIteration() + "\\n")
    } else if (readState().dirty) {
      process.stdout.write(readState().patch ?? "mock product patch\\n")
    }
    process.exit(0)
  }
  if (args.includes(":(exclude)docs/optimization/**")) {
    if (isInnerWorktree) {
      process.stdout.write("mock product patch iteration-" + innerIteration() + "\\n")
    } else if (readState().dirty) {
      process.stdout.write(readState().patch ?? "mock product patch\\n")
    }
  }
  process.exit(0)
}

if (command === "apply" && !isInnerWorktree) {
  if (args.includes("-R")) {
    writeState({ dirty: false, patch: null })
  } else {
    const patchPath = args[args.length - 1]
    writeState({
      dirty: true,
      patch: fs.existsSync(patchPath) ? fs.readFileSync(patchPath, "utf8") : "mock product patch\\n",
    })
  }
  process.exit(0)
}

if (command === "commit") {
  writeState({ dirty: false, patch: null })
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
      "qwen-3-0.6b",
      "gemma-3-1b-it",
      "translategemma-4",
    ])
    assert.deepEqual(parseRequestedModels("gemma-3-1b-it"), ["gemma-3-1b-it"])
    assert.throws(() => parseRequestedModels("qwen-3-0.6b,gemma-3-1b-it"), /concrete/)
    assert.throws(() => parseRequestedModels("unknown"), /Unknown WebGPU eval model/)
  })

  it("validates successful and load-failure artifact shapes", () => {
    const successful = summarizeArtifactObject(artifact("qwen-3-0.6b"), "qwen-3-0.6b")
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
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0),
      "translategemma-4": modelSummary("translategemma-4", 0.9),
    })
    assert.equal(selectModelFromSnapshot("all", ranked), "gemma-3-1b-it")
    assert.equal(selectModelFromSnapshot("gemma-3-1b-it", ranked), "gemma-3-1b-it")

    const tied = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0, {
        scoreBreakdown: { hardFailureCount: 10 },
      }),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0, {
        scoreBreakdown: { hardFailureCount: 38 },
      }),
      "translategemma-4": modelSummary("translategemma-4", 0.9),
    })
    assert.equal(selectModelFromSnapshot("all", tied), "gemma-3-1b-it")
  })

  it("selects all from the active accepted snapshot", () => {
    const runStart = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
      "translategemma-4": modelSummary("translategemma-4", 0.9),
    })
    const activeAccepted = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.66),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.5),
      "translategemma-4": modelSummary("translategemma-4", 0.9),
    })

    assert.equal(selectModelFromSnapshot("all", runStart), "qwen-3-0.6b")
    assert.equal(selectModelFromSnapshot("all", activeAccepted), "gemma-3-1b-it")
  })

  it("compares selected improvement while tolerating non-selected eval drift", () => {
    const baseline = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8, {
        cases: casesWithFailedCase("case-01"),
      }),
    })
    const improved = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.809),
    })
    assert.equal(
      compareSnapshots("qwen-3-0.6b", baseline, improved, { verifyArtifactHashes: false }).status,
      "pass",
    )

    const worseSelected = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
    })
    assert.equal(
      compareSnapshots("qwen-3-0.6b", baseline, worseSelected, { verifyArtifactHashes: false }).status,
      "fail",
    )

    const toleratedNeighborDrift = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.795, {
        cases: casesWithFailedCase("case-01"),
      }),
    })
    assert.equal(
      compareSnapshots("qwen-3-0.6b", baseline, toleratedNeighborDrift, {
        verifyArtifactHashes: false,
      }).status,
      "pass",
    )

    const regressedNeighborScore = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.789, {
        cases: casesWithFailedCase("case-01"),
      }),
    })
    const scoreRegression = compareSnapshots("qwen-3-0.6b", baseline, regressedNeighborScore, {
      verifyArtifactHashes: false,
    })
    assert.equal(scoreRegression.status, "fail")
    assert.match(scoreRegression.reasons.join("\n"), /gemma-3-1b-it score regressed/)

    const stableBaseline = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
    })
    const introducedFailureNeighbor = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.799, {
        cases: casesWithFailedCase("case-02"),
      }),
    })
    const newFailure = compareSnapshots("qwen-3-0.6b", stableBaseline, introducedFailureNeighbor, {
      verifyArtifactHashes: false,
    })
    assert.equal(newFailure.status, "fail")
    assert.match(newFailure.reasons.join("\n"), /gemma-3-1b-it introduced failing checks/)
    assert.match(newFailure.reasons.join("\n"), /case-02/)
  })

  it("rejects a selected candidate below the active accepted score", () => {
    const runStart = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0),
    })
    const activeAccepted = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.66834),
    })
    const regressedCandidate = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.532156),
    })

    assert.equal(
      compareSnapshots("qwen-3-0.6b", runStart, regressedCandidate, {
        verifyArtifactHashes: false,
      }).status,
      "pass",
      "documents the stale-baseline bug this harness must avoid",
    )

    const comparison = compareSnapshots("qwen-3-0.6b", activeAccepted, regressedCandidate, {
      verifyArtifactHashes: false,
    })

    assert.equal(comparison.status, "fail")
    assert.match(
      comparison.reasons.join("\n"),
      /qwen-3-0\.6b score did not improve: 0\.66834 -> 0\.532156\./,
    )
  })

  it("rejects non-selected pass and hard-failure regressions", () => {
    const baseline = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.2),
      "gemma-3-1b-it": {
        ...modelSummary("gemma-3-1b-it", 0.8),
        pass: true,
        modelPass: true,
      },
    })
    const regressed = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.3),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8, {
        scoreBreakdown: { hardFailureCount: 1 },
      }),
    })
    const comparison = compareSnapshots("qwen-3-0.6b", baseline, regressed, {
      verifyArtifactHashes: false,
    })

    assert.equal(comparison.status, "fail")
    assert.match(comparison.reasons.join("\n"), /top-level pass outcome regressed/)
    assert.match(comparison.reasons.join("\n"), /model pass outcome regressed/)
    assert.match(comparison.reasons.join("\n"), /hard failures increased/)
  })

  it("formats score improvements for terminal output", () => {
    const comparison = compareSnapshots(
      "qwen-3-0.6b",
      snapshot({
        "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.212894),
      }),
      snapshot({
        "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.250001),
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

  it("parses inner reports without splitting commas inside values", () => {
    const report = parseInnerReportLine(
      "failure_modes=wrapped answers, short output, hypotheses=strip wrappers, tighten prompt, selected=strip wrapper because it is cheap, change=added output cleanup, eval=0.66 -> 0.53, result=no improvement",
    )

    assert.equal(report.failure_modes, "wrapped answers, short output")
    assert.equal(report.hypotheses, "strip wrappers, tighten prompt")
    assert.equal(report.selected, "strip wrapper because it is cheap")
    assert.equal(report.change, "added output cleanup")
    assert.equal(report.eval, "0.66 -> 0.53")
    assert.equal(report.result, "no improvement")

    const partial = parseInnerReportLine("selected=one idea, result=tests failed")
    assert.equal(partial.failure_modes, null)
    assert.equal(partial.selected, "one idea")
    assert.equal(partial.result, "tests failed")
  })

  it("appends compact failed JSONL records with parsed report, scores, files, hash, and logs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimizer-failed-ledger-"))
    const runDir = path.join(root, ".evals", "auto-optimizer", "runs", "run-1")
    const patchPath = path.join(root, "candidate.patch")
    const reportPath = path.join(runDir, "iteration-2.report.txt")
    const baselinePath = path.join(root, "baseline.json")
    const verifyPath = path.join(root, "verify.json")
    const comparePath = path.join(root, "compare.json")
    const stdoutPath = path.join(runDir, "iteration-2.codex.stdout.jsonl")
    const stderrPath = path.join(runDir, "iteration-2.codex.stderr.log")
    const testPath = path.join(runDir, "iteration-2.test.log")
    const runSummaryPath = path.join(runDir, "iteration-2.summary.log")
    const baselineEvalPath = path.join(runDir, "baseline.eval-qwen-3-0.6b.log")
    const verifyEvalPath = path.join(runDir, "iteration-2.verify-eval-qwen-3-0.6b.log")

    mkdirSync(runDir, { recursive: true })
    writeFileSync(
      patchPath,
      [
        "diff --git a/packages/core/src/engine/adapters/chat.ts b/packages/core/src/engine/adapters/chat.ts",
        "--- a/packages/core/src/engine/adapters/chat.ts",
        "+++ b/packages/core/src/engine/adapters/chat.ts",
        "@@ -1 +1 @@",
        "-old",
        "+new",
        "diff --git a/docs/optimization/qwen-3-0.6b-log.jsonl b/docs/optimization/qwen-3-0.6b-log.jsonl",
        "--- a/docs/optimization/qwen-3-0.6b-log.jsonl",
        "+++ b/docs/optimization/qwen-3-0.6b-log.jsonl",
      ].join("\n"),
    )
    writeFileSync(
      reportPath,
      "failure_modes=wrapped answers, short outputs, hypotheses=strip wrapper, add examples, selected=strip wrapper, change=normalizer tweak, eval=0.66 -> 0.53, result=no improvement\n",
    )
    writeFileSync(
      baselinePath,
      `${JSON.stringify(snapshot({ "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.66) }))}\n`,
    )
    writeFileSync(
      verifyPath,
      `${JSON.stringify(snapshot({ "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.53) }))}\n`,
    )
    writeFileSync(
      comparePath,
      `${JSON.stringify({
        status: "fail",
        reasons: ["qwen-3-0.6b score did not improve: 0.66 -> 0.53."],
        stops: [],
        selected: {
          model: "qwen-3-0.6b",
          oldScore: 0.66,
          newScore: 0.53,
        },
      })}\n`,
    )
    for (const logPath of [
      stdoutPath,
      stderrPath,
      testPath,
      runSummaryPath,
      baselineEvalPath,
      verifyEvalPath,
    ]) {
      writeFileSync(logPath, "log\n")
    }

    const record = buildFailedExperimentRecord(
      {
        model: "qwen-3-0.6b",
        iteration: 2,
        result: "no improvement (qwen-3-0.6b score did not improve: 0.66 -> 0.53.)",
        reportFile: reportPath,
        productPatch: patchPath,
        baselineSnapshot: baselinePath,
        verifySnapshot: verifyPath,
        compareJson: comparePath,
        codexStdout: stdoutPath,
        codexStderr: stderrPath,
        testLog: testPath,
        baselineEvalRefs: path.relative(root, baselineEvalPath),
        verifyEvalRefs: path.relative(root, verifyEvalPath),
        runSummary: runSummaryPath,
        candidateEvaluated: true,
      },
      root,
    )
    appendFailedExperiment(record, root)

    const rawLedger = readFileSync(
      path.join(root, "docs", "optimization", "failed-experiments.jsonl"),
      "utf8",
    )
    assert.equal(rawLedger.trim().split("\n").length, 1)
    assert.doesNotMatch(rawLedger, /\n\{/)

    const [saved] = readFailedExperiments(root)
    assert.equal(saved.schemaVersion, 1)
    assert.equal(saved.model, "qwen-3-0.6b")
    assert.equal(saved.iteration, 2)
    assert.equal(saved.rejectionReason, "qwen-3-0.6b score did not improve: 0.66 -> 0.53.")
    assert.equal(saved.innerReportRaw.includes("failure_modes=wrapped answers"), true)
    assert.equal(saved.parsed.failure_modes, "wrapped answers, short outputs")
    assert.equal(saved.parsed.hypotheses, "strip wrapper, add examples")
    assert.equal(saved.candidateEvaluated, true)
    assert.equal(saved.scores.baseline, 0.66)
    assert.equal(saved.scores.candidate, 0.53)
    assert.equal(saved.scores.verify, 0.53)
    assert.equal(saved.scores.delta, -0.13)
    assert.deepEqual(saved.changedFiles, ["packages/core/src/engine/adapters/chat.ts"])
    assert.equal(saved.productDiffHash, productDiffHashFromPatchText(readFileSync(patchPath, "utf8")))
    assert.equal(saved.logs.codex_stdout, ".evals/auto-optimizer/runs/run-1/iteration-2.codex.stdout.jsonl")
    assert.deepEqual(saved.logs.baseline_eval, [
      ".evals/auto-optimizer/runs/run-1/baseline.eval-qwen-3-0.6b.log",
    ])

    const failedBeforeCandidateEval = buildFailedExperimentRecord(
      {
        model: "qwen-3-0.6b",
        iteration: 3,
        result: "no improvement (tests failed)",
        reportFile: reportPath,
        productPatch: patchPath,
        baselineSnapshot: baselinePath,
        verifySnapshot: verifyPath,
        compareJson: comparePath,
        candidateEvaluated: false,
      },
      root,
    )
    assert.equal(failedBeforeCandidateEval.rejectionReason, "tests failed")
    assert.equal(failedBeforeCandidateEval.scores.candidate, null)
    assert.equal(failedBeforeCandidateEval.scores.verify, 0.53)
  })

  it("formats prior failed experiments for the inner prompt", () => {
    const prompt = formatFailedExperimentsPrompt(
      [
        {
          schemaVersion: 1,
          model: "qwen-3-0.6b",
          iteration: 4,
          result: "no improvement (tests failed)",
          rejectionReason: "tests failed",
          parsed: {
            selected: "add wrapper stripping",
            change: "changed chat adapter output cleanup",
          },
          scores: { baseline: 0.66, candidate: 0.53 },
          changedFiles: ["packages/core/src/engine/adapters/chat.ts"],
          productDiffHash: "1234567890abcdef",
        },
      ],
      "qwen-3-0.6b",
    )

    assert.match(prompt, /Rejected approaches:/)
    assert.match(prompt, /Do not repeat/)
    assert.match(prompt, /materially different/)
    assert.match(prompt, /add wrapper stripping/)
    assert.match(prompt, /hash=1234567890ab/)
  })

  it("appends accepted optimization logs as JSONL", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimizer-accepted-log-"))
    const runDir = path.join(root, ".evals", "auto-optimizer", "runs", "run-1")
    const reportPath = path.join(runDir, "iteration-1.report.txt")
    const baselinePath = path.join(root, "baseline.json")
    const verifyPath = path.join(root, "verify.json")
    const comparePath = path.join(root, "compare.json")
    const stdoutPath = path.join(runDir, "iteration-1.codex.stdout.jsonl")
    const stderrPath = path.join(runDir, "iteration-1.codex.stderr.log")
    const testPath = path.join(runDir, "iteration-1.test.log")
    const baselineEvalPath = path.join(runDir, "baseline.eval-qwen-3-0.6b.log")
    const verifyEvalPath = path.join(runDir, "iteration-1.verify-eval-qwen-3-0.6b.log")

    mkdirSync(runDir, { recursive: true })
    writeFileSync(
      reportPath,
      "failure_modes=wrapper, hypotheses=strip wrapper, selected=strip wrapper, change=normalizer, eval=0 -> 0.66, result=improved\n",
    )
    writeFileSync(
      baselinePath,
      `${JSON.stringify(snapshot({ "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0) }))}\n`,
    )
    writeFileSync(
      verifyPath,
      `${JSON.stringify(snapshot({ "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.66) }))}\n`,
    )
    writeFileSync(
      comparePath,
      `${JSON.stringify({
        status: "pass",
        reasons: [],
        stops: [],
        selected: {
          model: "qwen-3-0.6b",
          oldScore: 0,
          newScore: 0.66,
        },
      })}\n`,
    )
    for (const logPath of [stdoutPath, stderrPath, testPath, baselineEvalPath, verifyEvalPath]) {
      writeFileSync(logPath, "log\n")
    }

    const record = buildAcceptedOptimizationRecord(
      {
        model: "qwen-3-0.6b",
        iteration: 1,
        result: "0.000000 -> 0.660000 (+0.660000)",
        reportFile: reportPath,
        baselineSnapshot: baselinePath,
        verifySnapshot: verifyPath,
        compareJson: comparePath,
        codexStdout: stdoutPath,
        codexStderr: stderrPath,
        testLog: testPath,
        baselineEvalRefs: path.relative(root, baselineEvalPath),
        verifyEvalRefs: path.relative(root, verifyEvalPath),
      },
      root,
    )
    appendAcceptedOptimizationLog(record, root)

    assert.equal(
      existsSync(path.join(root, "docs", "optimization", "qwen-3-0.6b-log.md")),
      false,
    )
    const logLines = readFileSync(
      path.join(root, "docs", "optimization", "qwen-3-0.6b-log.jsonl"),
      "utf8",
    ).trim().split("\n")
    assert.equal(logLines.length, 1)
    const saved = JSON.parse(logLines[0])
    assert.equal(saved.schemaVersion, 1)
    assert.equal(saved.model, "qwen-3-0.6b")
    assert.equal(saved.parsed.selected, "strip wrapper")
    assert.equal(saved.scores.baseline, 0)
    assert.equal(saved.scores.candidate, 0.66)
    assert.equal(saved.scores.delta, 0.66)
    assert.deepEqual(saved.logs.verify_eval, [
      ".evals/auto-optimizer/runs/run-1/iteration-1.verify-eval-qwen-3-0.6b.log",
    ])
  })

  it("detects duplicate failed product diff hashes for the same model only", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimizer-duplicate-hash-"))
    const hash = productDiffHashFromPatchText("mock product patch\n")
    appendFailedExperiment(
      {
        schemaVersion: 1,
        timestamp: "2026-04-28T00:00:00.000Z",
        model: "qwen-3-0.6b",
        iteration: 1,
        result: "no improvement (tests failed)",
        rejectionReason: "tests failed",
        innerReportRaw: null,
        parsed: {},
        scores: { baseline: 0.66, candidate: null, verify: null, delta: null },
        changedFiles: ["packages/core/src/engine/adapters/chat.ts"],
        productDiffHash: hash,
        logs: {},
      },
      root,
    )
    appendFailedExperiment(
      {
        schemaVersion: 1,
        timestamp: "2026-04-28T00:00:01.000Z",
        model: "gemma-3-1b-it",
        iteration: 2,
        result: "no improvement (tests failed)",
        rejectionReason: "tests failed",
        innerReportRaw: null,
        parsed: {},
        scores: { baseline: 0.5, candidate: null, verify: null, delta: null },
        changedFiles: ["packages/core/src/engine/adapters/chat.ts"],
        productDiffHash: hash,
        logs: {},
      },
      root,
    )

    assert.equal(duplicateFailedExperimentForHash("qwen-3-0.6b", hash, root)?.iteration, 1)
    assert.equal(duplicateFailedExperimentForHash("translategemma-4", hash, root), null)
    assert.equal(recentFailedExperiments("gemma-3-1b-it", 1, root)[0].iteration, 2)
  })

  it("hashes product patches and extracts changed product files", () => {
    const patch = [
      "diff --git a/packages/core/src/old.ts b/packages/core/src/new.ts",
      "similarity index 93%",
      "rename from packages/core/src/old.ts",
      "rename to packages/core/src/new.ts",
      "diff --git a/docs/optimization/qwen-3-0.6b-log.jsonl b/docs/optimization/qwen-3-0.6b-log.jsonl",
      "--- a/docs/optimization/qwen-3-0.6b-log.jsonl",
      "+++ b/docs/optimization/qwen-3-0.6b-log.jsonl",
    ].join("\n")

    assert.equal(productDiffHashFromPatchText(""), null)
    assert.match(productDiffHashFromPatchText(patch), /^[a-f0-9]{64}$/)
    assert.deepEqual(changedFilesFromPatchText(patch), [
      "packages/core/src/new.ts",
      "packages/core/src/old.ts",
    ])
  })

  it("compares git patches independent of file diff order", () => {
    const adapterPatch = [
      "diff --git a/packages/core/src/engine/adapters/models/qwen.ts b/packages/core/src/engine/adapters/models/qwen.ts",
      "index 1111111..2222222 100644",
      "--- a/packages/core/src/engine/adapters/models/qwen.ts",
      "+++ b/packages/core/src/engine/adapters/models/qwen.ts",
      "@@ -1 +1 @@",
      "-old prompt",
      "+new prompt",
      "",
    ].join("\n")
    const testPatch = [
      "diff --git a/packages/core/src/engine/__tests__/engine.test.ts b/packages/core/src/engine/__tests__/engine.test.ts",
      "index 3333333..4444444 100644",
      "--- a/packages/core/src/engine/__tests__/engine.test.ts",
      "+++ b/packages/core/src/engine/__tests__/engine.test.ts",
      "@@ -1 +1 @@",
      "-old test",
      "+new test",
      "",
    ].join("\n")

    assert.equal(areGitPatchesEquivalent(adapterPatch + testPatch, testPatch + adapterPatch), true)
    assert.equal(
      areGitPatchesEquivalent(
        adapterPatch + testPatch,
        testPatch + adapterPatch.replace("new prompt", "other prompt"),
      ),
      false,
    )
  })

  it("stops when an accepted baseline artifact hash changes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimizer-hash-test-"))
    const artifactDir = path.join(root, ".evals", "web-gpu-hash-test")
    const artifactFile = path.join(artifactDir, "qwen-3-0.6b.json")
    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(
      artifactFile,
      `${JSON.stringify(
        artifact("qwen-3-0.6b", {
          model: { score: 0.2 },
        }),
      )}\n`,
    )

    const baseline = createSnapshot("qwen-3-0.6b", artifactDir, root)
    const verification = {
      ...baseline,
      models: {
        "qwen-3-0.6b": {
          ...baseline.models["qwen-3-0.6b"],
          score: 0.3,
        },
      },
    }

    assert.equal(
      compareSnapshots("qwen-3-0.6b", baseline, verification, { repoRoot: root }).status,
      "pass",
    )

    writeFileSync(
      artifactFile,
      `${JSON.stringify(
        artifact("qwen-3-0.6b", {
          model: { score: 0.2, cases: casesWithFailedCase("case-01") },
        }),
      )}\n`,
    )

    const comparison = compareSnapshots("qwen-3-0.6b", baseline, verification, {
      repoRoot: root,
    })
    assert.equal(comparison.status, "stop")
    assert.match(comparison.stops.join("\n"), /Baseline artifact was modified/)
  })

  it("marks last-good scores as bookkeeping rather than acceptance policy", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimizer-last-good-test-"))
    const snapshotPath = path.join(root, "snapshot.json")
    writeFileSync(
      snapshotPath,
      `${JSON.stringify(
        snapshot({
          "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.66),
        }),
      )}\n`,
    )

    await updateLastGoodScores("qwen-3-0.6b", snapshotPath, "abc123", root)

    const lastGood = JSON.parse(
      readFileSync(path.join(root, ".evals", "auto-optimizer", "last-good-scores.json"), "utf8"),
    )
    assert.equal(lastGood.role, "bookkeeping-only")
    assert.equal(lastGood.acceptancePolicy, "active-baseline-snapshot")
    assert.equal(lastGood.models["qwen-3-0.6b"].score, 0.66)

    const gemmaSnapshotPath = path.join(root, "gemma-snapshot.json")
    writeFileSync(
      gemmaSnapshotPath,
      `${JSON.stringify({
        ...snapshot({
          "gemma-3-1b-it": modelSummaryInDir(
            "gemma-3-1b-it",
            0.8,
            ".evals/web-gpu-gemma-verify",
          ),
        }),
        artifactsDir: ".evals/web-gpu-gemma-verify",
      })}\n`,
    )

    await updateLastGoodScores("gemma-3-1b-it", gemmaSnapshotPath, "def456", root)

    const mixedLastGood = JSON.parse(
      readFileSync(path.join(root, ".evals", "auto-optimizer", "last-good-scores.json"), "utf8"),
    )
    assert.equal(mixedLastGood.artifactsDir, null)
    assert.equal(mixedLastGood.mixedArtifacts, true)
    assert.deepEqual(mixedLastGood.artifactDirs, {
      "qwen-3-0.6b": ".evals/web-gpu-test",
      "gemma-3-1b-it": ".evals/web-gpu-gemma-verify",
    })
  })

  it("builds a concise prompt evidence packet from a baseline artifact", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimizer-test-"))
    const artifactDir = path.join(root, ".evals", "web-gpu-test")
    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(
      path.join(artifactDir, "qwen-3-0.6b.json"),
      `${JSON.stringify(
        artifact("qwen-3-0.6b", {
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
      "qwen-3-0.6b",
      snapshot({
        "qwen-3-0.6b": {
          ...modelSummary("qwen-3-0.6b", 0.2),
          artifact: ".evals/web-gpu-test/qwen-3-0.6b.json",
        },
      }),
      root,
    )

    assert.match(prompt, /Failure evidence:/)
    assert.match(prompt, /failures by check:/)
    assert.match(prompt, /lowest scoring failed cases:/)
  })

  it("classifies target adapter paths separately from product, docs, and banned paths", () => {
    const targetAdapterPath = requiredHelperFunction("targetAdapterPath")
    const classifyChangedPaths = requiredHelperFunction("classifyChangedPaths")

    assert.equal(
      targetAdapterPath("qwen-3-0.6b"),
      "packages/core/src/engine/adapters/models/qwen-3-0-6b.ts",
    )
    assert.equal(
      targetAdapterPath("gemma-3-1b-it"),
      "packages/core/src/engine/adapters/models/gemma-3-1b-it.ts",
    )
    assert.equal(
      targetAdapterPath("translategemma-4"),
      "packages/core/src/engine/adapters/models/translategemma-4.ts",
    )

    const classification = classifyChangedPaths([
      "packages/core/src/engine/adapters/models/qwen-3-0-6b.ts",
      "packages/core/src/engine/adapters/chat.ts",
      "packages/core/src/engine/__tests__/translation-adapters.test.ts",
      "packages/core/README.md",
      "docs/optimization/qwen-3-0.6b-log.jsonl",
      ".evals/web-gpu-candidate/qwen-3-0.6b.json",
      "scripts/webgpu-eval.mjs",
      "package.json",
    ])

    assertSameMembers(classification.targetAdapterModels, ["qwen-3-0.6b"], "target adapter models")
    assertSameMembers(
      classification.productCodePaths,
      [
        "packages/core/src/engine/adapters/chat.ts",
        "packages/core/src/engine/adapters/models/qwen-3-0-6b.ts",
      ],
      "product code paths",
    )
    assertSameMembers(
      classification.productTestPaths,
      ["packages/core/src/engine/__tests__/translation-adapters.test.ts"],
      "product test paths",
    )
    assertSameMembers(classification.docsPaths, ["packages/core/README.md"], "docs paths")
    assertSameMembers(
      classification.resettableBannedPaths,
      [
        ".evals/web-gpu-candidate/qwen-3-0.6b.json",
        "docs/optimization/qwen-3-0.6b-log.jsonl",
      ],
      "resettable banned paths",
    )
    assertSameMembers(
      classification.bannedPaths,
      ["package.json", "scripts/webgpu-eval.mjs"],
      "hard banned paths",
    )
  })

  it("selects eval scope from product code paths, not docs or tests", () => {
    const targetAdapterPath = requiredHelperFunction("targetAdapterPath")
    const evalModelsForChangedPaths = requiredHelperFunction("evalModelsForChangedPaths")

    assert.deepEqual(
      evalModelsForChangedPaths("qwen-3-0.6b", [
        targetAdapterPath("qwen-3-0.6b"),
        "packages/core/src/engine/__tests__/translation-adapters.test.ts",
        "packages/core/README.md",
        "docs/optimization/qwen-3-0.6b-log.jsonl",
      ]),
      ["qwen-3-0.6b"],
    )

    assert.deepEqual(
      evalModelsForChangedPaths("qwen-3-0.6b", [
        "packages/core/src/engine/__tests__/translation-adapters.test.ts",
        "packages/react/README.md",
      ]),
      ["qwen-3-0.6b"],
    )

    assert.deepEqual(
      evalModelsForChangedPaths("qwen-3-0.6b", [
        "packages/core/src/engine/adapters/chat.ts",
      ]),
      ["qwen-3-0.6b", "gemma-3-1b-it", "translategemma-4"],
    )

    assert.deepEqual(
      evalModelsForChangedPaths("translategemma-4", [
        targetAdapterPath("translategemma-4"),
      ]),
      ["translategemma-4"],
    )
  })

  it("allows target-only verification to omit non-targets while all-model verification protects them", () => {
    const baseline = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.2),
      "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.8),
      "translategemma-4": modelSummary("translategemma-4", 0.9),
    })
    const targetOnly = snapshot({
      "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.3),
    })

    assert.equal(
      compareSnapshots("qwen-3-0.6b", baseline, targetOnly, {
        evaluatedModels: ["qwen-3-0.6b"],
        verifyArtifactHashes: false,
      }).status,
      "pass",
    )

    const missingProtected = compareSnapshots("qwen-3-0.6b", baseline, targetOnly, {
      evaluatedModels: ["qwen-3-0.6b", "gemma-3-1b-it", "translategemma-4"],
      verifyArtifactHashes: false,
    })
    assert.equal(missingProtected.status, "stop")
    assert.match(missingProtected.stops.join("\n"), /missing non-selected model gemma-3-1b-it/)

    const protectedRegression = compareSnapshots(
      "qwen-3-0.6b",
      baseline,
      snapshot({
        "qwen-3-0.6b": modelSummary("qwen-3-0.6b", 0.3),
        "gemma-3-1b-it": modelSummary("gemma-3-1b-it", 0.7),
        "translategemma-4": modelSummary("translategemma-4", 0.9),
      }),
      {
        evaluatedModels: ["qwen-3-0.6b", "gemma-3-1b-it", "translategemma-4"],
        verifyArtifactHashes: false,
      },
    )
    assert.equal(protectedRegression.status, "fail")
    assert.match(protectedRegression.reasons.join("\n"), /gemma-3-1b-it score regressed/)
  })

  it("keeps mixed active baseline artifact metadata coherent after target-only accepts", () => {
    const baselineDir = ".evals/web-gpu-baseline"
    const targetVerifyDir = ".evals/web-gpu-qwen-verify"
    const allVerifyDir = ".evals/web-gpu-all-verify"
    const baseline = {
      ...snapshot({
        "qwen-3-0.6b": modelSummaryInDir("qwen-3-0.6b", 0.2, baselineDir),
        "gemma-3-1b-it": modelSummaryInDir("gemma-3-1b-it", 0.8, baselineDir),
        "translategemma-4": modelSummaryInDir("translategemma-4", 0.9, baselineDir),
      }),
      artifactsDir: baselineDir,
    }
    const targetOnly = {
      ...snapshot({
        "qwen-3-0.6b": modelSummaryInDir("qwen-3-0.6b", 0.3, targetVerifyDir),
      }),
      artifactsDir: targetVerifyDir,
    }

    const mixed = mergeActiveBaselineSnapshot("qwen-3-0.6b", baseline, targetOnly)

    assert.equal(mixed.artifactsDir, null)
    assert.equal(mixed.mixedArtifacts, true)
    assert.deepEqual(mixed.artifactDirs, {
      "qwen-3-0.6b": targetVerifyDir,
      "gemma-3-1b-it": baselineDir,
      "translategemma-4": baselineDir,
    })
    assert.equal(mixed.models["qwen-3-0.6b"].artifact, `${targetVerifyDir}/qwen-3-0.6b.json`)
    assert.equal(mixed.models["gemma-3-1b-it"].artifact, `${baselineDir}/gemma-3-1b-it.json`)
    assert.deepEqual(snapshotArtifactDirs(mixed), [baselineDir, targetVerifyDir].sort())

    const allModelVerification = {
      ...snapshot({
        "qwen-3-0.6b": modelSummaryInDir("qwen-3-0.6b", 0.31, allVerifyDir),
        "gemma-3-1b-it": modelSummaryInDir("gemma-3-1b-it", 0.81, allVerifyDir),
        "translategemma-4": modelSummaryInDir("translategemma-4", 0.91, allVerifyDir),
      }),
      artifactsDir: allVerifyDir,
    }
    const unified = mergeActiveBaselineSnapshot("gemma-3-1b-it", mixed, allModelVerification)

    assert.equal(unified.artifactsDir, allVerifyDir)
    assert.equal(unified.mixedArtifacts, false)
    assert.deepEqual(unified.artifactDirs, {
      "qwen-3-0.6b": allVerifyDir,
      "gemma-3-1b-it": allVerifyDir,
      "translategemma-4": allVerifyDir,
    })
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
      "docs/optimization/failed-experiments.jsonl",
      "docs/optimization/qwen-3-0.6b-log.jsonl",
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
      "docs/optimization/qwen-3-0.6b-log.md",
      "docs/optimization/nested/qwen-3-0.6b-log.jsonl",
      "docs/optimization/not-a-model-log.jsonl",
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

  it("allows failed ledger state without staging it in accepted commit paths", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimizer-commit-paths-"))
    mkdirSync(path.join(root, "packages", "core", "src"), { recursive: true })
    mkdirSync(path.join(root, "docs", "optimization"), { recursive: true })
    writeFileSync(path.join(root, "packages", "core", "src", "change.ts"), "export {}\n")
    writeFileSync(path.join(root, "docs", "optimization", "qwen-3-0.6b-log.jsonl"), "{}\n")
    writeFileSync(path.join(root, "docs", "optimization", "failed-experiments.jsonl"), "{}\n")

    const init = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" })
    assert.equal(init.status, 0, init.stderr)

    const result = spawnSync(process.execPath, [helperPath, "commit-paths", root], {
      encoding: "utf8",
    })
    assert.equal(result.status, 0, result.stderr)

    const paths = result.stdout.split("\0").filter(Boolean).sort()
    assert.deepEqual(paths, [
      "docs/optimization/qwen-3-0.6b-log.jsonl",
      "packages/core/src/change.ts",
    ])
  })

  it("keeps auto optimizer inner dependencies isolated", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /install_inner_dependencies/)
    assert.match(script, /pnpm --dir "\$inner_repo" install --frozen-lockfile/)
    assert.doesNotMatch(script, /ln -s "\$source_dir"/)
    assert.doesNotMatch(script, /node_modules.*ln -s/s)
    assert.doesNotMatch(script, /\$REPO"\/packages\/\*\/node_modules/)
  })

  it("initializes the active baseline from a fresh run-start eval", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /ACTIVE_BASELINE_JSON="\$TMP_ROOT\/current-baseline\.json"/)
    assert.match(script, /create_baseline_snapshot "\$ACTIVE_BASELINE_JSON" "\$BASELINE_EVAL_LOG_PREFIX"/)
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
    assert.match(script, /See (?:\$eval_log|%s\\n' "\$model" "\$eval_status" "\$eval_log")/)
  })

  it("captures outer tests and evals quietly", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /run_to_log "\$TEST_LOG" pnpm test/)
    assert.match(script, /run_to_log "\$eval_log" pnpm eval:webgpu/)
    assert.doesNotMatch(script, /\btee\b/)
    assert.doesNotMatch(script, /run_with_log/)
  })

  it("allows candidate patch files to differ only by file diff order", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /node "\$HELPER" patches-equivalent "\$expected_patch" "\$current_patch"/)
    assert.doesNotMatch(script, /cmp -s "\$expected_patch" "\$current_patch"/)
  })

  it("runs selection, prompts, and comparison against the active baseline", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /SELECTED_MODEL="\$\(node "\$HELPER" select-model "\$MODEL_ARG" "\$ACTIVE_BASELINE_JSON"\)"/)
    assert.match(script, /write_inner_prompt .*"\$ACTIVE_BASELINE_JSON"/)
    assert.match(script, /node "\$HELPER" failed-memory-prompt "\$selected_model" 6/)
    assert.match(
      script,
      /VERIFY_EVAL_LOG_PREFIX="\$(?:RUN_LOG_DIR\/iteration-\$\{iteration\}\.|ITERATION_DIR\/)verify-eval"/,
    )
    assert.match(script, /cd "\$REPO"[\s\S]*run_eval_set "\$VERIFY_DIR" "\$VERIFY_EVAL_LOG_PREFIX"/)
    assert.match(script, /node "\$HELPER" compare(?:-evaluated)? "\$SELECTED_MODEL" "\$ACTIVE_BASELINE_JSON" "\$VERIFY_JSON"/)
    assert.match(
      script,
      /(?:cp "\$VERIFY_JSON" "\$ACTIVE_BASELINE_JSON"|merge-active-baseline "\$SELECTED_MODEL" "\$ACTIVE_BASELINE_JSON" "\$VERIFY_JSON")/,
    )
    assert.match(script, /update-last-good "\$SELECTED_MODEL" "\$ACTIVE_BASELINE_JSON" "\$COMMIT_SHA"/)
  })

  it("checks failed-memory duplicates before expensive verification work", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")
    const duplicateIndex = script.indexOf("failed-memory-duplicate")
    const testIndex = script.indexOf('run_to_log "$TEST_LOG" pnpm test')
    const verifyIndex = script.indexOf('run_eval_set "$VERIFY_DIR" "$VERIFY_EVAL_LOG_PREFIX"')

    assert.notEqual(duplicateIndex, -1)
    assert.ok(duplicateIndex < testIndex)
    assert.ok(duplicateIndex < verifyIndex)
    assert.match(script, /verification skipped:/)
    assert.match(script, /node "\$HELPER" append-failed-experiment/)
  })

  it("lets the tracked failed ledger survive between iterations without blocking imports", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /git ls-files --error-unmatch "\$FAILED_LEDGER"/)
    assert.match(script, /must be tracked before running the optimizer/)
    assert.match(script, /git ls-files --others --exclude-standard \| grep -vxF "\$FAILED_LEDGER"/)
    assert.match(script, /git -C "\$REPO" ls-files --others --exclude-standard \| grep -vxF "\$FAILED_LEDGER"/)
    assert.match(script, /git diff --quiet -- \. ":\(exclude\)\$FAILED_LEDGER"/)
    assert.match(script, /git -C "\$REPO" diff --quiet -- \. ":\(exclude\)\$FAILED_LEDGER"/)
    assert.match(script, /git diff --cached --quiet/)
    assert.match(script, /git -C "\$REPO" diff --cached --quiet/)
    assert.doesNotMatch(script, /diff --cached --quiet -- \. ":\(exclude\)\$FAILED_LEDGER"/)
  })

  it("keeps outer loop logs and optimization result authoritative", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /RUN_LOG_DIR="\$REPO\/\.evals\/auto-optimizer\/runs\//)
    assert.match(script, /optimizer tmpdir:/)
    assert.match(script, /optimizer logs:/)
    assert.match(script, /run_eval_set "\$VERIFY_DIR" "\$VERIFY_EVAL_LOG_PREFIX"/)
    assert.match(script, /append_accepted_log "\$SELECTED_MODEL" "\$iteration" "\$SCORE_LINE"/)
    assert.match(script, /append_run_note "\$SELECTED_MODEL" "\$iteration" "\$SCORE_LINE"/)
    assert.match(script, /baseline_eval:%s verify_eval:%s/)
    assert.doesNotMatch(script, /auto-optimize: \$\{SELECTED_MODEL\} no improvement/)
    assert.doesNotMatch(script, /Append exactly one line to docs\/optimization/)
  })

  it("stores candidate artifacts and logs under a per-iteration run directory", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")

    assert.match(script, /RUN_LOG_DIR="\$REPO\/\.evals\/auto-optimizer\/runs\//)
    assert.match(
      script,
      /(?:ITERATION|ATTEMPT)[A-Z_]*DIR="[^"]*\$RUN_LOG_DIR\/iteration-\$\{iteration\}[^"]*"/,
    )
    assert.match(script, /mkdir -p "\$(?:ITERATION|ATTEMPT)[A-Z_]*DIR"/)
    assert.match(script, /PROMPT_FILE="\$(?:ITERATION|ATTEMPT)[A-Z_]*DIR\/prompt\.md"/)
    assert.match(script, /STDOUT_LOG="\$(?:ITERATION|ATTEMPT)[A-Z_]*DIR\/codex\.stdout\.jsonl"/)
    assert.match(script, /STDERR_LOG="\$(?:ITERATION|ATTEMPT)[A-Z_]*DIR\/codex\.stderr\.log"/)
    assert.match(script, /TEST_LOG="\$(?:ITERATION|ATTEMPT)[A-Z_]*DIR\/test\.log"/)
    assert.match(script, /VERIFY_EVAL_LOG_PREFIX="\$(?:ITERATION|ATTEMPT)[A-Z_]*DIR\/verify-eval"/)
    assert.match(script, /CANDIDATE_PATCH="\$(?:ITERATION|ATTEMPT)[A-Z_]*DIR\/product\.(?:patch|diff)"/)
    assert.match(script, /DOCS(?:_TEST)?_PATCH="\$(?:ITERATION|ATTEMPT)[A-Z_]*DIR\/docs(?:-test)?\.(?:patch|diff)"/)
    assert.match(script, /archive_inner_eval_artifacts "\$inner_repo" "\$CURRENT_ITERATION_DIR"/)
    assert.match(script, /inner-eval-artifacts\/\.evals/)
    assert.doesNotMatch(script, /\$RUN_LOG_DIR\/iteration-\$\{iteration\}\.(?:codex|report|test|summary|verify-eval)/)
  })

  it("cleans resettable banned files before outer tests and verification evals", () => {
    const script = readFileSync(new URL("./auto-optimize.sh", import.meta.url), "utf8")
    const classifyCleanupIndex = script.indexOf('write_changed_pathspec cleanup "$inner_repo" "$cleanup_pathspec"')
    const cleanupIndex = script.indexOf('reset_inner_cleanup_paths "$inner_repo" "$base_sha" "$cleanup_pathspec"')
    const createPatchesIndex = script.indexOf("create_inner_patches \\")
    const testIndex = script.indexOf('run_to_log "$TEST_LOG" pnpm test')
    const verifyIndex = script.indexOf('run_eval_set "$VERIFY_DIR" "$VERIFY_EVAL_LOG_PREFIX"')

    assert.notEqual(classifyCleanupIndex, -1)
    assert.notEqual(cleanupIndex, -1)
    assert.notEqual(createPatchesIndex, -1)
    assert.notEqual(testIndex, -1)
    assert.notEqual(verifyIndex, -1)
    assert.ok(classifyCleanupIndex < cleanupIndex, "banned paths must be classified before cleanup")
    assert.ok(createPatchesIndex < testIndex, "inner cleanup must be part of patch creation before tests")
    assert.ok(cleanupIndex < testIndex, "banned-file cleanup must run before pnpm test")
    assert.ok(cleanupIndex < verifyIndex, "banned-file cleanup must run before verification eval")
    assert.match(script, /node "\$HELPER" changed-paths-nul "\$kind" "\$repo"/)
  })

  it("smoke-tests quiet outer eval and test logging with mocked commands", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimize-smoke-"))
    const repo = path.join(root, "repo")
    const bin = path.join(root, "bin")
    const tmp = path.join(root, "tmp")
    const scriptsDir = path.join(repo, "scripts")
    const commandLog = path.join(root, "commands.log")
    const gitState = path.join(root, "git-state.json")
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
      [optimizerScript, "qwen-3-0.6b", "--iterations", "1"],
      {
        cwd: repo,
        env: {
          ...process.env,
          MOCK_LOG: commandLog,
          MOCK_GIT_STATE: gitState,
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
    assert.match(result.stdout, /baseline\.eval-qwen-3-0\.6b\.log/)
    assert.match(result.stdout, /iteration-1(?:\.|\/)test\.log/)
    assert.match(result.stdout, /iteration-1(?:\.|\/)verify-eval-qwen-3-0\.6b\.log/)

    const runLogDir = onlyRunLogDir(repo)
    const baselineLog = readFileSync(
      path.join(runLogDir, "baseline.eval-qwen-3-0.6b.log"),
      "utf8",
    )
    const testLog = readFirstExisting([
      path.join(runLogDir, "iteration-1.test.log"),
      path.join(runLogDir, "iteration-1", "test.log"),
    ])
    const verifyLog = readFirstExisting([
      path.join(runLogDir, "iteration-1.verify-eval-qwen-3-0.6b.log"),
      path.join(runLogDir, "iteration-1", "verify-eval-qwen-3-0.6b.log"),
    ])

    assert.match(baselineLog, /EVAL_STDOUT qwen-3-0\.6b/)
    assert.match(baselineLog, /EVAL_STDERR qwen-3-0\.6b/)
    assert.match(testLog, /TEST_STDOUT/)
    assert.match(testLog, /TEST_STDERR/)
    assert.match(verifyLog, /EVAL_STDOUT qwen-3-0\.6b/)
    assert.match(verifyLog, /EVAL_STDERR qwen-3-0\.6b/)

    const [acceptedLog] = readFileSync(
      path.join(repo, "docs", "optimization", "qwen-3-0.6b-log.jsonl"),
      "utf8",
    ).trim().split("\n").map((line) => JSON.parse(line))
    assert.equal(acceptedLog.schemaVersion, 1)
    assert.equal(acceptedLog.model, "qwen-3-0.6b")
    assert.equal(acceptedLog.scores.baseline, 0)
    assert.equal(acceptedLog.scores.candidate, 0.66)
    assert.match(acceptedLog.logs.test, /iteration-1(?:\.|\/)test\.log/)
    assert.match(acceptedLog.logs.baseline_eval.join(","), /baseline\.eval-qwen-3-0\.6b\.log/)
    assert.match(acceptedLog.logs.verify_eval.join(","), /iteration-1(?:\.|\/)verify-eval-qwen-3-0\.6b\.log/)
    assert.equal(
      existsSync(path.join(repo, "docs", "optimization", "qwen-3-0.6b-log.md")),
      false,
    )
    assert.equal(
      existsSync(path.join(repo, "docs", "optimization", "failed-experiments.jsonl")),
      false,
    )

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

  it("keeps per-model baseline eval refs after a target-only accept", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimize-baseline-refs-"))
    const repo = path.join(root, "repo")
    const bin = path.join(root, "bin")
    const tmp = path.join(root, "tmp")
    const scriptsDir = path.join(repo, "scripts")
    const commandLog = path.join(root, "commands.log")
    const gitState = path.join(root, "git-state.json")
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
      [optimizerScript, "all", "--iterations", "2"],
      {
        cwd: repo,
        env: {
          ...process.env,
          MOCK_LOG: commandLog,
          MOCK_GIT_STATE: gitState,
          MOCK_QWEN_ITERATION_1_SCORE: "0.95",
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

    const gemmaLog = readFileSync(
      path.join(repo, "docs", "optimization", "gemma-3-1b-it-log.jsonl"),
      "utf8",
    ).trim().split("\n").map((line) => JSON.parse(line))
    assert.equal(gemmaLog.length, 1)
    assert.equal(gemmaLog[0].iteration, 2)

    const baselineRefs = gemmaLog[0].logs.baseline_eval.join(",")
    assert.match(baselineRefs, /baseline\.eval-gemma-3-1b-it\.log/)
    assert.match(baselineRefs, /iteration-1(?:\.|\/)verify-eval-qwen-3-0\.6b\.log/)
    assert.doesNotMatch(baselineRefs, /iteration-1(?:\.|\/)verify-eval-gemma-3-1b-it\.log/)
  })

  it("keeps the active baseline at the last accepted score across failed iterations", () => {
    const root = mkdtempSync(path.join(tmpdir(), "auto-optimize-active-baseline-"))
    const repo = path.join(root, "repo")
    const bin = path.join(root, "bin")
    const tmp = path.join(root, "tmp")
    const scriptsDir = path.join(repo, "scripts")
    const commandLog = path.join(root, "commands.log")
    const gitState = path.join(root, "git-state.json")
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
      [optimizerScript, "qwen-3-0.6b", "--iterations", "3"],
      {
        cwd: repo,
        env: {
          ...process.env,
          MOCK_LOG: commandLog,
          MOCK_GIT_STATE: gitState,
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
    assert.match(result.stdout, /0\.000000 -> 0\.660000 \(\+0\.660000\)/)
    assert.match(result.stdout, /no improvement .*0\.66 -> 0\.53/)
    assert.match(result.stdout, /0\.660000 -> 0\.670000 \(\+0\.010000\)/)

    const tmpRoot = result.stdout.match(/optimizer tmpdir: (.+)/)?.[1]?.trim()
    assert.ok(tmpRoot, result.stdout)
    const runLogDir = onlyRunLogDir(repo)
    const secondPrompt = readFirstExisting([
      path.join(tmpRoot, "iteration-2.prompt.md"),
      path.join(runLogDir, "iteration-2", "prompt.md"),
    ])
    const thirdPrompt = readFirstExisting([
      path.join(tmpRoot, "iteration-3.prompt.md"),
      path.join(runLogDir, "iteration-3", "prompt.md"),
    ])
    assert.match(secondPrompt, /Current accepted score: 0\.66/)
    assert.match(thirdPrompt, /Current accepted score: 0\.66/)
    assert.doesNotMatch(thirdPrompt, /Current accepted score: 0\.53/)
    assert.match(thirdPrompt, /Rejected approaches:/)
    assert.match(thirdPrompt, /iteration 2: no improvement .*0\.66 -> 0\.53/)

    const secondSummary = readFirstExisting([
      path.join(runLogDir, "iteration-2.summary.log"),
      path.join(runLogDir, "iteration-2", "summary.log"),
    ])
    assert.match(secondSummary, /no improvement/)
    assert.match(secondSummary, /0\.66 -> 0\.53/)

    const acceptedLog = readFileSync(
      path.join(repo, "docs", "optimization", "qwen-3-0.6b-log.jsonl"),
      "utf8",
    ).trim().split("\n").map((line) => JSON.parse(line))
    assert.equal(acceptedLog.length, 2)
    assert.deepEqual(acceptedLog.map((record) => record.iteration), [1, 3])
    assert.equal(
      acceptedLog.some((record) => record.scores.candidate === 0.53),
      false,
    )
    assert.equal(
      existsSync(path.join(repo, "docs", "optimization", "qwen-3-0.6b-log.md")),
      false,
    )

    const failedLedger = readFileSync(
      path.join(repo, "docs", "optimization", "failed-experiments.jsonl"),
      "utf8",
    ).trim().split("\n").map((line) => JSON.parse(line))
    assert.equal(failedLedger.length, 1)
    assert.equal(failedLedger[0].iteration, 2)
    assert.match(failedLedger[0].result, /no improvement .*0\.66 -> 0\.53/)
    assert.equal(failedLedger[0].scores.baseline, 0.66)
    assert.equal(failedLedger[0].scores.candidate, 0.53)

    const commands = readFileSync(commandLog, "utf8")
    assert.equal((commands.match(/git commit /g) ?? []).length, 2)
    assert.equal((commands.match(/helper update-last-good/g) ?? []).length, 2)
    assert.equal(commands.includes("run-start-baseline"), false)
    assert.match(commands, /helper compare qwen-3-0\.6b .*current-baseline\.json .*iteration-2(?:-|\/)verify\.json/)
    assert.match(commands, /helper compare qwen-3-0\.6b .*current-baseline\.json .*iteration-3(?:-|\/)verify\.json/)
  })
})
