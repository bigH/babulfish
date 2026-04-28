#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const WEBGPU_EVAL_MODEL_IDS = Object.freeze([
  "qwen-3-0.6b",
  "gemma-3-1b-it",
  "translategemma-4",
])

export const EXPECTED_CASE_COUNT = 38
const NON_SELECTED_SCORE_REGRESSION_TOLERANCE = 0.01

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(scriptPath), "..")
const docsOptimizationPrefix = "docs/optimization/"
export const FAILED_EXPERIMENTS_LEDGER = "docs/optimization/failed-experiments.jsonl"
const acceptedLogPattern = new RegExp(
  `^docs/optimization/(${WEBGPU_EVAL_MODEL_IDS.map((modelId) => modelId.replaceAll(".", "\\.")).join("|")})-log\\.jsonl$`,
)
const innerReportFieldNames = Object.freeze([
  "failure_modes",
  "hypotheses",
  "selected",
  "change",
  "eval",
  "result",
])
const productSourcePrefixes = Object.freeze([
  "packages/core/src/",
  "packages/react/src/",
  "packages/styles/src/",
  "packages/babulfish/src/",
  "packages/demo-shared/src/",
  "packages/demo-vanilla/src/",
  "packages/demo-webcomponent/src/",
  "packages/demo/app/",
])
const hardBlockedExactPaths = new Set([
  "scripts/webgpu-eval.mjs",
  "packages/demo-vanilla/src/webgpu-eval.ts",
  "packages/demo-vanilla/src/webgpu-eval-scorer.ts",
  "packages/demo-vanilla/webgpu-eval.html",
  "docs/webgpu-evals.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "eslint.config.js",
  "tsconfig.base.json",
  "packages/demo/next.config.ts",
  "scripts/consumer-smoke.mjs",
  "packages/demo/scripts/smoke.mjs",
  "scripts/auto-optimize.sh",
  "scripts/auto-optimize-helper.mjs",
  "scripts/auto-optimize-helper.test.mjs",
])
const hardBlockedPackageFiles = new Set([
  "package.json",
  "tsconfig.json",
  "vitest.config.ts",
  "vite.config.ts",
  "tsup.config.ts",
])
const modelAdapterPaths = Object.freeze({
  "qwen-3-0.6b": "packages/core/src/engine/adapters/models/qwen-3-0-6b.ts",
  "gemma-3-1b-it": "packages/core/src/engine/adapters/models/gemma-3-1b-it.ts",
  "translategemma-4": "packages/core/src/engine/adapters/models/translategemma-4.ts",
})

class NeedsFreshArtifactsError extends Error {
  constructor(message) {
    super(message)
    this.name = "NeedsFreshArtifactsError"
  }
}

function fail(message, exitCode = 1) {
  console.error(message)
  process.exit(exitCode)
}

function normalizeRelativePath(filePath, root = repoRoot) {
  return path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/")
}

function normalizeAttemptPath(filePath) {
  return String(filePath).replaceAll("\\", "/").replace(/^\.\//, "")
}

function isPackageFile(filePath, fileName) {
  const parts = filePath.split("/")
  return parts.length === 3 && parts[0] === "packages" && parts[2] === fileName
}

function isPackageReadme(filePath) {
  return isPackageFile(filePath, "README.md")
}

function isDocsOptimizationPath(filePath) {
  const normalized = normalizeAttemptPath(filePath)
  return normalized === "docs/optimization" || normalized.startsWith(docsOptimizationPrefix)
}

function isTestPath(filePath) {
  const normalized = normalizeAttemptPath(filePath)
  const segments = normalized.split("/")
  const baseName = segments.at(-1) ?? ""

  return (
    segments.includes("__tests__") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(baseName) ||
    baseName === "test.ts" ||
    baseName === "test.tsx"
  )
}

function isPackageValidationFile(filePath) {
  const parts = filePath.split("/")
  return (
    parts.length === 3 &&
    parts[0] === "packages" &&
    hardBlockedPackageFiles.has(parts[2])
  )
}

export function isBlockedAttemptPath(filePath) {
  const normalized = normalizeAttemptPath(filePath)
  return (
    hardBlockedExactPaths.has(normalized) ||
    normalized === ".evals" ||
    normalized.startsWith(".evals/") ||
    normalized === ".github/workflows" ||
    normalized.startsWith(".github/workflows/") ||
    (normalized.startsWith("evals/translation/") && normalized.endsWith(".json")) ||
    isPackageValidationFile(normalized)
  )
}

function artifactNameForModel(modelId) {
  return `${modelId.replaceAll("/", "-")}.json`
}

function artifactPathForModel(outputDir, modelId) {
  return path.join(outputDir, artifactNameForModel(modelId))
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`)
  return value
}

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return value
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`)
  return value
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`)
  return value
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"))
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(tempPath, filePath)
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex")
}

function assertKnownModel(modelId) {
  if (!WEBGPU_EVAL_MODEL_IDS.includes(modelId)) {
    throw new Error(
      `Unknown WebGPU eval model ${modelId}. Valid models: ${WEBGPU_EVAL_MODEL_IDS.join(", ")}.`,
    )
  }
}

export function targetAdapterPath(modelId) {
  assertKnownModel(modelId)
  return modelAdapterPaths[modelId]
}

function modelForTargetAdapterPath(filePath) {
  const normalized = normalizeAttemptPath(filePath)
  return Object.entries(modelAdapterPaths).find(([, adapterPath]) => adapterPath === normalized)?.[0] ?? null
}

export function parseRequestedModels(modelArg) {
  if (modelArg === "all") return [...WEBGPU_EVAL_MODEL_IDS]
  if (!modelArg || modelArg.includes(",")) {
    throw new Error("<model-name> must be one concrete eval model id or all.")
  }
  assertKnownModel(modelArg)
  return [modelArg]
}

export function validatePositiveInteger(value, label) {
  if (!/^[1-9][0-9]*$/.test(String(value))) {
    throw new Error(`${label} must be a positive integer, got ${value}.`)
  }
  return Number(value)
}

function assertArtifactDir(outputDir, root = repoRoot) {
  const absoluteDir = path.resolve(root, outputDir)
  const relativeDir = normalizeRelativePath(absoluteDir, root)
  const baseName = path.basename(absoluteDir)

  if (!relativeDir.startsWith(".evals/") || !baseName.startsWith("web-gpu-")) {
    throw new Error(`Artifact dir must be .evals/web-gpu-*, got ${relativeDir}.`)
  }

  return { absoluteDir, relativeDir }
}

function normalizeCaseError(error) {
  if (!isRecord(error)) return null
  return {
    class: typeof error.class === "string" ? error.class : null,
    message: typeof error.message === "string" ? error.message : null,
  }
}

function caseCheckOutcomes(cases) {
  return cases
    .map((evalCase) => {
      const record = requireRecord(evalCase, "model.cases[]")
      const scoreBreakdown = isRecord(record.scoreBreakdown) ? record.scoreBreakdown : {}
      return {
        id: String(record.id),
        pass: record.pass === true,
        hardFailureReason:
          typeof scoreBreakdown.hardFailureReason === "string"
            ? scoreBreakdown.hardFailureReason
            : null,
        error: normalizeCaseError(record.error),
        checks: requireArray(record.checks ?? [], `case ${record.id}.checks`).map((check) => {
          const checkRecord = requireRecord(check, `case ${record.id}.checks[]`)
          return {
            name: String(checkRecord.name),
            pass: checkRecord.pass === true,
          }
        }),
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function summarizeArtifactObject(artifact, expectedModelId) {
  const artifactRecord = requireRecord(artifact, "artifact")
  if (artifactRecord.schemaVersion !== 1) {
    throw new Error(`${expectedModelId} artifact schemaVersion must be 1.`)
  }

  const model = requireRecord(artifactRecord.model, `${expectedModelId}.model`)
  if (model.modelId !== expectedModelId) {
    throw new Error(
      `${expectedModelId} artifact model.modelId must be ${expectedModelId}, got ${model.modelId}.`,
    )
  }

  const score = requireFiniteNumber(model.score, `${expectedModelId}.model.score`)
  const scoreBreakdown = requireRecord(
    model.scoreBreakdown,
    `${expectedModelId}.model.scoreBreakdown`,
  )
  const cases = requireArray(model.cases, `${expectedModelId}.model.cases`)
  const modelError = model.error ?? null
  const failureReason = scoreBreakdown.failureReason ?? null
  const hasModelFailure = modelError !== null || failureReason !== null

  if (cases.length === EXPECTED_CASE_COUNT) {
    // Normal completed run, even if individual cases failed.
  } else if (!(cases.length === 0 && score === 0 && hasModelFailure)) {
    throw new Error(
      `${expectedModelId} artifact must have ${EXPECTED_CASE_COUNT} cases, or a score 0 load/environment failure with 0 cases.`,
    )
  }

  const failuresByCategory = requireRecord(
    model.failuresByCategory ?? {},
    `${expectedModelId}.model.failuresByCategory`,
  )
  const failuresByCheck = requireRecord(
    model.failuresByCheck ?? {},
    `${expectedModelId}.model.failuresByCheck`,
  )

  return {
    score,
    pass: requireBoolean(artifactRecord.pass, `${expectedModelId}.pass`),
    modelPass: requireBoolean(model.pass, `${expectedModelId}.model.pass`),
    passedCases: cases.filter((evalCase) => isRecord(evalCase) && evalCase.pass === true).length,
    totalCases: cases.length,
    hardFailureCount: Number(scoreBreakdown.hardFailureCount ?? 0),
    scoreBreakdown,
    failuresByCategory,
    failuresByCheck,
    error: normalizeCaseError(modelError),
    checkOutcomes: caseCheckOutcomes(cases),
  }
}

function modelSummaryFromFile(modelId, outputDir, root = repoRoot) {
  const artifactPath = artifactPathForModel(outputDir, modelId)
  if (!existsSync(artifactPath)) {
    throw new Error(`Missing artifact ${normalizeRelativePath(artifactPath, root)}.`)
  }

  return {
    ...summarizeArtifactObject(readJson(artifactPath), modelId),
    artifact: normalizeRelativePath(artifactPath, root),
    artifactHash: sha256File(artifactPath),
  }
}

function artifactDirsByModel(models, modelIds) {
  return Object.fromEntries(
    modelIds.map((modelId) => {
      const model = requireRecord(models[modelId], `snapshot.models.${modelId}`)
      if (typeof model.artifact !== "string" || model.artifact.length === 0) {
        throw new Error(`snapshot.models.${modelId}.artifact must be a non-empty string.`)
      }

      return [modelId, path.posix.dirname(model.artifact)]
    }),
  )
}

function withArtifactMetadata(snapshot) {
  const snapshotRecord = requireRecord(snapshot, "snapshot")
  const models = requireRecord(snapshotRecord.models, "snapshot.models")
  const modelsRequested = requireArray(snapshotRecord.modelsRequested, "snapshot.modelsRequested")
  const artifactDirs = artifactDirsByModel(models, modelsRequested)
  const uniqueDirs = uniqueSorted(Object.values(artifactDirs))

  return {
    ...snapshotRecord,
    artifactsDir: uniqueDirs.length === 1 ? uniqueDirs[0] : null,
    artifactDirs,
    mixedArtifacts: uniqueDirs.length > 1,
  }
}

export function createSnapshot(modelArg, outputDir, root = repoRoot) {
  const models = parseRequestedModels(modelArg)
  const { absoluteDir, relativeDir } = assertArtifactDir(outputDir, root)

  return withArtifactMetadata({
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    requestedModelArg: modelArg,
    artifactsDir: relativeDir,
    modelsRequested: models,
    models: Object.fromEntries(
      models.map((modelId) => [modelId, modelSummaryFromFile(modelId, absoluteDir, root)]),
    ),
  })
}

function latestWebGpuDir(root = repoRoot) {
  const evalsDir = path.join(root, ".evals")
  if (!existsSync(evalsDir)) return null

  const dirs = readdirSync(evalsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("web-gpu-"))
    .map((entry) => path.join(evalsDir, entry.name))
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)))

  return dirs[0] ?? null
}

function latestSnapshot(modelArg, root = repoRoot) {
  const latestDir = latestWebGpuDir(root)
  if (latestDir === null) {
    throw new NeedsFreshArtifactsError("No .evals/web-gpu-* artifact dirs found.")
  }

  try {
    return createSnapshot(modelArg, latestDir, root)
  } catch (error) {
    throw new NeedsFreshArtifactsError(
      `Latest artifacts are missing or stale: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function readSnapshot(snapshotPath) {
  const snapshot = readJson(snapshotPath)
  requireRecord(snapshot, "snapshot")
  if (snapshot.schemaVersion !== 1) throw new Error("snapshot.schemaVersion must be 1.")
  requireRecord(snapshot.models, "snapshot.models")
  requireArray(snapshot.modelsRequested, "snapshot.modelsRequested")
  return snapshot
}

export function selectModelFromSnapshot(modelArg, snapshot) {
  const models = parseRequestedModels(modelArg)
  if (modelArg !== "all") {
    if (!snapshot.models[modelArg]) throw new Error(`Snapshot is missing ${modelArg}.`)
    return modelArg
  }

  return [...models].sort((left, right) => {
    const leftModel = snapshot.models[left]
    const rightModel = snapshot.models[right]
    if (!leftModel || !rightModel) throw new Error("Snapshot is missing requested models.")

    return (
      leftModel.score - rightModel.score ||
      rightModel.hardFailureCount - leftModel.hardFailureCount ||
      leftModel.passedCases - rightModel.passedCases ||
      left.localeCompare(right)
    )
  })[0]
}

function compareNonSelectedModel(modelId, baselineModel, verifiedModel, reasons, stops) {
  if (!verifiedModel) {
    stops.push(`Verification artifact is missing non-selected model ${modelId}.`)
    return
  }

  if (verifiedModel.score < baselineModel.score - NON_SELECTED_SCORE_REGRESSION_TOLERANCE) {
    reasons.push(
      `${modelId} score regressed from ${baselineModel.score} to ${verifiedModel.score} ` +
        `(tolerance ${NON_SELECTED_SCORE_REGRESSION_TOLERANCE}).`,
    )
  }

  if (baselineModel.pass === true && verifiedModel.pass !== true) {
    reasons.push(`${modelId} top-level pass outcome regressed.`)
  }

  if (baselineModel.modelPass === true && verifiedModel.modelPass !== true) {
    reasons.push(`${modelId} model pass outcome regressed.`)
  }

  if (verifiedModel.totalCases !== baselineModel.totalCases) {
    reasons.push(
      `${modelId} case count changed from ${baselineModel.totalCases} to ${verifiedModel.totalCases}.`,
    )
  }

  if (verifiedModel.hardFailureCount > baselineModel.hardFailureCount) {
    reasons.push(
      `${modelId} hard failures increased from ${baselineModel.hardFailureCount} ` +
        `to ${verifiedModel.hardFailureCount}.`,
    )
  }

  const newFailures = newlyFailedOutcomes(baselineModel.checkOutcomes, verifiedModel.checkOutcomes)
  if (newFailures.length > 0) {
    reasons.push(`${modelId} introduced failing checks: ${newFailures.slice(0, 5).join(", ")}.`)
  }
}

function failedOutcomeKeys(checkOutcomes) {
  const keys = new Set()

  for (const outcome of checkOutcomes) {
    if (outcome.pass !== true) keys.add(`${outcome.id}`)

    for (const check of outcome.checks) {
      if (check.pass !== true) keys.add(`${outcome.id}:${check.name}`)
    }
  }

  return keys
}

function newlyFailedOutcomes(baselineOutcomes, verifiedOutcomes) {
  const baselineFailures = failedOutcomeKeys(baselineOutcomes)
  return [...failedOutcomeKeys(verifiedOutcomes)]
    .filter((failure) => !baselineFailures.has(failure))
    .sort((left, right) => left.localeCompare(right))
}

export function compareSnapshots(selectedModel, baseline, verification, options = {}) {
  const reasons = []
  const stops = []
  const baselineModels = requireRecord(baseline.models, "baseline.models")
  const verifiedModels = requireRecord(verification.models, "verification.models")
  const baselineSelected = baselineModels[selectedModel]
  const verifiedSelected = verifiedModels[selectedModel]

  if (!baselineSelected) stops.push(`Baseline is missing selected model ${selectedModel}.`)
  if (!verifiedSelected) stops.push(`Verification is missing selected model ${selectedModel}.`)

  const shouldVerifyArtifactHashes =
    options.verifyArtifactHashes === true ||
    (options.verifyArtifactHashes !== false && options.compareOnlyVerifiedModels !== true)
  const evaluatedModelIds = Array.isArray(options.evaluatedModels)
    ? options.evaluatedModels.map(String)
    : null
  const artifactHashModelIds = evaluatedModelIds !== null
    ? options.verifyAllBaselineHashes === true
      ? Object.keys(baselineModels)
      : evaluatedModelIds
    : options.verifyAllBaselineHashes === true
    ? Object.keys(baselineModels)
    : Object.keys(verifiedModels)

  if (shouldVerifyArtifactHashes) {
    for (const modelId of artifactHashModelIds) {
      const model = baselineModels[modelId]
      if (!model) {
        stops.push(`Baseline is missing artifact hash source model ${modelId}.`)
        continue
      }
      if (!model.artifact || !model.artifactHash) {
        stops.push(`Baseline artifact hash is missing for ${modelId}.`)
        continue
      }
      const artifactPath = path.resolve(options.repoRoot ?? repoRoot, model.artifact)
      if (!existsSync(artifactPath)) {
        stops.push(`Baseline artifact disappeared for ${modelId}: ${model.artifact}.`)
        continue
      }
      const currentHash = sha256File(artifactPath)
      if (currentHash !== model.artifactHash) {
        stops.push(`Baseline artifact was modified for ${modelId}: ${model.artifact}.`)
      }
    }
  }

  if (baselineSelected && verifiedSelected && !(verifiedSelected.score > baselineSelected.score)) {
    reasons.push(
      `${selectedModel} score did not improve: ${baselineSelected.score} -> ${verifiedSelected.score}.`,
    )
  }

  const nonSelectedModels = evaluatedModelIds !== null
    ? evaluatedModelIds
    : options.compareOnlyVerifiedModels === true
    ? Object.keys(verifiedModels)
    : Object.keys(baselineModels)

  for (const modelId of nonSelectedModels) {
    if (modelId === selectedModel) continue
    if (!baselineModels[modelId]) {
      stops.push(`Baseline is missing non-selected model ${modelId}.`)
      continue
    }
    compareNonSelectedModel(modelId, baselineModels[modelId], verifiedModels[modelId], reasons, stops)
  }

  return {
    status: stops.length > 0 ? "stop" : reasons.length > 0 ? "fail" : "pass",
    reasons,
    stops,
    selected: verifiedSelected && baselineSelected
      ? {
          model: selectedModel,
          oldScore: baselineSelected.score,
          newScore: verifiedSelected.score,
          artifact: verifiedSelected.artifact,
          scoreBreakdown: verifiedSelected.scoreBreakdown,
        }
      : null,
  }
}

export function compareEvaluatedSnapshots(selectedModel, baseline, verification, options = {}) {
  return compareSnapshots(selectedModel, baseline, verification, {
    verifyArtifactHashes: false,
    ...options,
    compareOnlyVerifiedModels: true,
  })
}

function formatScore(score) {
  return Number(score).toFixed(6)
}

function truncateText(value, maxLength = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

function topEntries(record, limit = 8) {
  return Object.entries(record)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
    .slice(0, limit)
}

function failedChecks(evalCase) {
  return requireArray(evalCase.checks ?? [], `case ${evalCase.id}.checks`)
    .filter((check) => isRecord(check) && check.pass !== true)
    .map((check) => ({
      name: String(check.name),
      expected: truncateText(check.expected),
      actual: truncateText(check.actual),
    }))
}

function caseScore(evalCase) {
  return typeof evalCase.score === "number" && Number.isFinite(evalCase.score)
    ? evalCase.score
    : 0
}

function lowestScoringCases(cases, limit = 8) {
  return cases
    .map((evalCase) => requireRecord(evalCase, "model.cases[]"))
    .filter((evalCase) => evalCase.pass !== true)
    .sort((left, right) => caseScore(left) - caseScore(right) || String(left.id).localeCompare(String(right.id)))
    .slice(0, limit)
}

export function buildPromptEvidence(selectedModel, snapshot, root = repoRoot) {
  const model = snapshot.models[selectedModel]
  if (!model) throw new Error(`Snapshot is missing ${selectedModel}.`)

  const artifact = readJson(path.resolve(root, model.artifact))
  const artifactModel = requireRecord(artifact.model, `${selectedModel}.model`)
  const cases = requireArray(artifactModel.cases, `${selectedModel}.model.cases`)
  const lines = [
    "Failure evidence:",
    `- score: ${formatScore(model.score)}`,
    `- pass: ${model.pass}`,
    `- passed cases: ${model.passedCases}/${model.totalCases}`,
    `- score breakdown: ${JSON.stringify(model.scoreBreakdown)}`,
  ]

  const checkEntries = topEntries(model.failuresByCheck)
  lines.push(
    `- failures by check: ${
      checkEntries.length > 0
        ? checkEntries.map(([name, count]) => `${name}=${count}`).join(", ")
        : "none"
    }`,
  )

  const categoryEntries = topEntries(model.failuresByCategory)
  lines.push(
    `- failures by category: ${
      categoryEntries.length > 0
        ? categoryEntries.map(([name, count]) => `${name}=${count}`).join(", ")
        : "none"
    }`,
  )

  if (cases.length === 0) {
    lines.push(`- model-level failure: ${JSON.stringify(artifactModel.error ?? model.scoreBreakdown.failureReason)}`)
    return lines.join("\n")
  }

  lines.push("- lowest scoring failed cases:")
  for (const evalCase of lowestScoringCases(cases)) {
    const breakdown = isRecord(evalCase.scoreBreakdown) ? evalCase.scoreBreakdown : {}
    lines.push(
      `  - ${evalCase.id} score=${formatScore(caseScore(evalCase))} pass=${evalCase.pass === true} ` +
        `category=${evalCase.category} target=${evalCase.targetLanguage} content=${evalCase.contentType}`,
    )
    if (breakdown.hardFailureReason) {
      lines.push(`    hard failure: ${breakdown.hardFailureReason}`)
    }
    const checks = failedChecks(evalCase).slice(0, 4)
    if (checks.length > 0) {
      lines.push(`    failed checks: ${checks.map((check) => check.name).join(", ")}`)
      for (const check of checks.slice(0, 2)) {
        lines.push(`    ${check.name}: expected ${check.expected}; actual ${check.actual}`)
      }
    }
    lines.push(`    source: ${truncateText(evalCase.sourceText)}`)
    lines.push(`    output: ${truncateText(evalCase.rawOutput)}`)
  }

  return lines.join("\n")
}

export function formatScoreImprovement(selected) {
  if (!selected) throw new Error("Comparison has no selected model summary.")

  const delta = selected.newScore - selected.oldScore
  const sign = delta >= 0 ? "+" : ""
  return `${formatScore(selected.oldScore)} -> ${formatScore(selected.newScore)} (${sign}${formatScore(delta)})`
}

export function formatCompareReasons(comparison) {
  const reasons = [
    ...requireArray(comparison.reasons ?? [], "comparison.reasons"),
    ...requireArray(comparison.stops ?? [], "comparison.stops"),
  ]
  return reasons.length > 0 ? reasons.join("; ") : "no comparison failure reason"
}

function collapseReportText(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim()
  return text.length > 0 ? text : null
}

export function parseInnerReportLine(text) {
  const raw = collapseReportText(text)
  const parsed = Object.fromEntries(innerReportFieldNames.map((field) => [field, null]))
  if (raw === null) return { raw, ...parsed }

  const fieldPattern = new RegExp(
    `(^|[,;]\\s*|\\s+)(${innerReportFieldNames.join("|")})=`,
    "g",
  )
  const matches = [...raw.matchAll(fieldPattern)].map((match) => ({
    key: match[2],
    keyStart: match.index + match[1].length,
    valueStart: match.index + match[0].length,
  }))

  for (const [index, match] of matches.entries()) {
    const next = matches[index + 1]
    const valueEnd = next ? next.keyStart : raw.length
    const value = raw.slice(match.valueStart, valueEnd).replace(/[,;\s]+$/g, "").trim()
    parsed[match.key] = value.length > 0 ? value : null
  }

  return { raw, ...parsed }
}

function readOptionalText(filePath) {
  if (!filePath || filePath === "none" || filePath === "-") return null
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : null
}

function readOptionalJson(filePath) {
  const text = readOptionalText(filePath)
  return text === null ? null : JSON.parse(text)
}

export function productDiffHashFromPatchText(patchText) {
  if (patchText.length === 0) return null
  return createHash("sha256").update(patchText).digest("hex")
}

export function productDiffHashFromPatchFile(patchPath) {
  if (!patchPath || patchPath === "none" || patchPath === "-" || !existsSync(patchPath)) {
    return null
  }

  const patch = readFileSync(patchPath)
  if (patch.length === 0) return null
  return createHash("sha256").update(patch).digest("hex")
}

export function canonicalizeGitPatchText(patchText) {
  const diffHeaderPattern = /^diff --git .+$/gm
  const matches = [...patchText.matchAll(diffHeaderPattern)]

  if (matches.length === 0) return patchText

  const preamble = patchText.slice(0, matches[0].index)
  const chunks = matches.map((match, index) => {
    const start = match.index
    const end = matches[index + 1]?.index ?? patchText.length

    return {
      header: match[0],
      text: patchText.slice(start, end),
    }
  })

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

export function areGitPatchesEquivalent(leftPatchText, rightPatchText) {
  return canonicalizeGitPatchText(leftPatchText) === canonicalizeGitPatchText(rightPatchText)
}

export function areGitPatchFilesEquivalent(leftPatchPath, rightPatchPath) {
  return areGitPatchesEquivalent(
    readFileSync(leftPatchPath, "utf8"),
    readFileSync(rightPatchPath, "utf8"),
  )
}

function unquoteGitPath(filePath) {
  if (filePath.startsWith("\"") && filePath.endsWith("\"")) {
    try {
      return JSON.parse(filePath)
    } catch {
      return filePath.slice(1, -1)
    }
  }

  return filePath
}

export function changedFilesFromPatchText(patchText) {
  const files = new Set()
  const diffHeaderPattern = /^diff --git a\/(.+?) b\/(.+)$/gm
  let match

  while ((match = diffHeaderPattern.exec(patchText)) !== null) {
    for (const rawPath of [match[1], match[2]]) {
      const filePath = normalizeAttemptPath(unquoteGitPath(rawPath))
      if (filePath !== "/dev/null" && !filePath.startsWith(docsOptimizationPrefix)) {
        files.add(filePath)
      }
    }
  }

  return [...files].sort((left, right) => left.localeCompare(right))
}

export function changedFilesFromPatchFile(patchPath) {
  const patch = readOptionalText(patchPath)
  return patch === null ? [] : changedFilesFromPatchText(patch)
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

export function isCandidateCleanupPath(filePath) {
  const normalized = normalizeAttemptPath(filePath)
  return isDocsOptimizationPath(normalized) || !isAllowedAttemptPath(normalized)
}

export function isProductCandidatePath(filePath) {
  const normalized = normalizeAttemptPath(filePath)
  return (
    isAllowedAttemptPath(normalized) &&
    productSourcePrefixes.some((prefix) => normalized.startsWith(prefix)) &&
    !isTestPath(normalized)
  )
}

export function isDocsOrTestCandidatePath(filePath) {
  const normalized = normalizeAttemptPath(filePath)
  return (
    isAllowedAttemptPath(normalized) &&
    !isProductCandidatePath(normalized) &&
    !isDocsOptimizationPath(normalized)
  )
}

export function classifyCandidatePath(filePath, selectedModel = null) {
  const normalized = normalizeAttemptPath(filePath)

  if (isCandidateCleanupPath(normalized)) return "banned"
  if (selectedModel !== null && normalized === targetAdapterPath(selectedModel)) {
    return "target-adapter"
  }
  if (Object.values(modelAdapterPaths).includes(normalized)) return "model-adapter"
  if (isProductCandidatePath(normalized)) return "product"
  if (isDocsOrTestCandidatePath(normalized)) return "docs-test"
  return "ignored"
}

export const candidatePathKind = classifyCandidatePath
export const classifyAttemptPath = classifyCandidatePath

function changedAttemptPaths(root = repoRoot) {
  return uniqueSorted(statusPaths(root).map(normalizeAttemptPath))
}

export function changedPathsByKind(kind, root = repoRoot) {
  const paths = changedAttemptPaths(root)

  if (kind === "cleanup" || kind === "banned") {
    return paths.filter(isCandidateCleanupPath)
  }
  if (kind === "product") {
    return paths.filter(isProductCandidatePath)
  }
  if (kind === "docs-test") {
    return paths.filter(isDocsOrTestCandidatePath)
  }
  if (kind === "allowed") {
    return paths.filter((filePath) => !isCandidateCleanupPath(filePath))
  }

  throw new Error(`Unknown changed path kind ${kind}.`)
}

function modelAndPaths(first, second) {
  const ownValue = (value, names) => {
    if (!isRecord(value)) return undefined
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(value, name)) return value[name]
    }
    return undefined
  }
  const selectedFrom = (value) => {
    if (typeof value === "string") return value
    if (!isRecord(value)) return null
    return ownValue(value, ["selectedModel", "targetModel", "model"]) ?? null
  }
  const pathsFrom = (value) => {
    if (Array.isArray(value)) return value
    if (!isRecord(value)) return []
    const ownArray = (names) => {
      const found = ownValue(value, names)
      return Array.isArray(found) ? found : []
    }
    return [
      ...ownArray(["allProductPaths", "candidateProductPaths"]),
      ...ownArray(["productCodePaths"]),
      ...ownArray(["targetAdapterPaths", "targetAdapter"]),
      ...ownArray(["productPaths", "product"]),
      ...ownArray(["productTestPaths", "productTests", "testPaths"]),
      ...ownArray(["docsTestPaths", "docsTest"]),
      ...ownArray(["docsPaths", "documentationPaths"]),
      ...ownArray(["cleanupPaths", "bannedPaths", "banned"]),
    ]
  }

  if (Array.isArray(first)) {
    return {
      selectedModel: selectedFrom(second),
      changedPaths: first,
    }
  }

  if (isRecord(first)) {
    return {
      selectedModel: selectedFrom(second) ?? selectedFrom(first),
      changedPaths: pathsFrom(first),
    }
  }

  return {
    selectedModel: selectedFrom(first),
    changedPaths: pathsFrom(second),
  }
}

export function classifyChangedPaths(first, second = null) {
  const { selectedModel, changedPaths } = modelAndPaths(first, second)
  if (selectedModel !== null && selectedModel !== undefined) assertKnownModel(selectedModel)

  const normalizedPaths = uniqueSorted(changedPaths.map(normalizeAttemptPath))
  const cleanupPaths = normalizedPaths.filter(isCandidateCleanupPath)
  const resettableBannedPaths = cleanupPaths.filter((filePath) =>
    isDocsOptimizationPath(filePath) || filePath === ".evals" || filePath.startsWith(".evals/"),
  )
  const hardBannedPaths = cleanupPaths.filter((filePath) => !resettableBannedPaths.includes(filePath))
  const allProductPaths = normalizedPaths.filter(isProductCandidatePath)
  const productTestPaths = normalizedPaths.filter(
    (filePath) => isAllowedAttemptPath(filePath) && isTestPath(filePath),
  )
  const docsPaths = normalizedPaths.filter(
    (filePath) => isAllowedAttemptPath(filePath) && !isTestPath(filePath) && isPackageReadme(filePath),
  )
  const docsTestPaths = normalizedPaths.filter(isDocsOrTestCandidatePath)
  const adapterPaths = new Set(Object.values(modelAdapterPaths))
  const targetAdapter = selectedModel ? targetAdapterPath(selectedModel) : null
  const targetAdapterPaths = targetAdapter
    ? allProductPaths.filter((filePath) => filePath === targetAdapter)
    : allProductPaths.filter((filePath) => adapterPaths.has(filePath))
  const targetAdapterModels = uniqueSorted(
    targetAdapterPaths
      .map(modelForTargetAdapterPath)
      .filter((modelId) => modelId !== null),
  )
  const productPaths = allProductPaths
  const nonAdapterProductPaths = allProductPaths.filter((filePath) => !adapterPaths.has(filePath))
  const sharedProductPaths = targetAdapter
    ? allProductPaths.filter((filePath) => filePath !== targetAdapter)
    : nonAdapterProductPaths

  const result = {
    selectedModel,
    cleanupPaths,
    bannedPaths: hardBannedPaths,
    cleanup: cleanupPaths,
    banned: hardBannedPaths,
    resettableBannedPaths,
    resettableBanned: resettableBannedPaths,
    resettablePaths: resettableBannedPaths,
    hardBannedPaths,
    hardBanned: hardBannedPaths,
    resetPaths: cleanupPaths,
    cleanupResetPaths: cleanupPaths,
    invalidPaths: cleanupPaths,
    bannedFilePaths: cleanupPaths,
    allProductPaths,
    candidateProductPaths: allProductPaths,
    productPaths,
    product: productPaths,
    productCodePaths: productPaths,
    nonAdapterProductPaths,
    productTestPaths,
    productTests: productTestPaths,
    testPaths: productTestPaths,
    docsPaths,
    documentationPaths: docsPaths,
    docsTestPaths,
    docsTest: docsTestPaths,
    docsOrTestPaths: docsTestPaths,
    testOrDocsPaths: docsTestPaths,
    targetAdapterPaths,
    targetAdapterModels,
    targetModels: targetAdapterModels,
    targetAdapterModelIds: targetAdapterModels,
    targetAdapter: targetAdapterPaths,
    targetAdapters: targetAdapterPaths,
    targetModelAdapterPaths: targetAdapterPaths,
    adapterPaths: targetAdapterPaths,
    modelAdapterPaths: targetAdapterPaths,
    sharedProductPaths,
    sharedProduct: sharedProductPaths,
  }

  return result
}

export function selectEvalModelsForProductPatch(selectedModel, productPatchPath) {
  assertKnownModel(selectedModel)
  const changedFiles = changedFilesFromPatchFile(productPatchPath)
  return selectEvalModelsForChangedProductPaths(selectedModel, changedFiles)
}

export function selectEvalModelsForChangedProductPaths(selectedModel, changedFiles) {
  assertKnownModel(selectedModel)
  const normalizedFiles = uniqueSorted(changedFiles.map(normalizeAttemptPath))
  if (normalizedFiles.length === 0) return []

  const targetAdapter = modelAdapterPaths[selectedModel]
  return normalizedFiles.length === 1 && normalizedFiles[0] === targetAdapter
    ? [selectedModel]
    : [...WEBGPU_EVAL_MODEL_IDS]
}

export const evalScopeForChangedProductPaths = selectEvalModelsForChangedProductPaths

export function evalModelsForChangedPaths(first, second) {
  const directModelList = (value) => {
    if (Array.isArray(value) && value.every((entry) => WEBGPU_EVAL_MODEL_IDS.includes(entry))) {
      return uniqueSorted(value)
    }
    if (!isRecord(value)) return []
    const models = ["evalModels", "targetAdapterModels", "targetModels", "targetAdapterModelIds"]
      .find((name) => Object.prototype.hasOwnProperty.call(value, name))
    const modelValues = models ? value[models] : undefined
    return Array.isArray(modelValues) && modelValues.every((entry) => WEBGPU_EVAL_MODEL_IDS.includes(entry))
      ? uniqueSorted(modelValues)
      : []
  }
  const directModels = directModelList(first)
  if (directModels.length > 0) return directModels

  const { selectedModel, changedPaths } = modelAndPaths(first, second)
  const productPaths = uniqueSorted(changedPaths.map(normalizeAttemptPath)).filter(isProductCandidatePath)
  const inferredModels = uniqueSorted(
    productPaths
      .map(modelForTargetAdapterPath)
      .filter((modelId) => modelId !== null),
  )

  if (!selectedModel) {
    const indirectModels = directModelList(second)
    if (indirectModels.length > 0) return indirectModels
    return productPaths.length === 1 && inferredModels.length === 1
      ? inferredModels
      : productPaths.length > 0
        ? [...WEBGPU_EVAL_MODEL_IDS]
        : []
  }

  if (productPaths.length === 0) return [selectedModel]
  return selectEvalModelsForChangedProductPaths(selectedModel, productPaths)
}

export function mergeActiveBaselineSnapshot(selectedModel, baseline, verification) {
  const baselineRecord = requireRecord(baseline, "baseline")
  const verificationRecord = requireRecord(verification, "verification")
  const baselineModels = requireRecord(baselineRecord.models, "baseline.models")
  const verifiedModels = requireRecord(verificationRecord.models, "verification.models")
  const verifiedSelected = verifiedModels[selectedModel]

  if (!verifiedSelected) {
    throw new Error(`Verification is missing selected model ${selectedModel}.`)
  }

  const mergedModels = {
    ...baselineModels,
    ...verifiedModels,
  }

  return withArtifactMetadata({
    ...baselineRecord,
    createdAt: new Date().toISOString(),
    modelsRequested: WEBGPU_EVAL_MODEL_IDS.filter(
      (modelId) => mergedModels[modelId],
    ),
    models: mergedModels,
  })
}

export function snapshotArtifactDirs(snapshot) {
  const models = requireRecord(snapshot.models, "snapshot.models")
  return uniqueSorted(
    Object.values(models)
      .map((model) => requireRecord(model, "snapshot.models[]").artifact)
      .filter((artifact) => typeof artifact === "string" && artifact.length > 0)
      .map((artifact) => path.posix.dirname(artifact)),
  )
}

function failedExperimentsPath(root = repoRoot) {
  return path.join(root, FAILED_EXPERIMENTS_LEDGER)
}

function acceptedOptimizationLogPath(modelId, root = repoRoot) {
  assertKnownModel(modelId)
  return path.join(root, "docs", "optimization", `${modelId}-log.jsonl`)
}

export function readFailedExperiments(root = repoRoot) {
  const ledgerPath = failedExperimentsPath(root)
  if (!existsSync(ledgerPath)) return []

  return readFileSync(ledgerPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      const record = JSON.parse(line)
      requireRecord(record, `failed experiment line ${index + 1}`)
      if (record.schemaVersion !== 1) {
        throw new Error(`failed experiment line ${index + 1} schemaVersion must be 1.`)
      }
      return record
    })
}

export function recentFailedExperiments(modelId, limit = 6, root = repoRoot) {
  return readFailedExperiments(root)
    .filter((record) => record.model === modelId)
    .slice()
    .reverse()
    .slice(0, limit)
}

function scoreDelta(scores) {
  if (!isRecord(scores)) return null
  if (typeof scores.baseline !== "number" || typeof scores.candidate !== "number") return null
  const delta = scores.candidate - scores.baseline
  const sign = delta >= 0 ? "+" : ""
  return `${sign}${formatScore(delta)}`
}

export function formatFailedExperimentsPrompt(records, modelId) {
  const lines = [
    "Rejected approaches:",
    `Recent failed experiments for ${modelId}. Do not repeat the same product diff or substantially the same approach unless this attempt is materially different; if it is different, say why in selected=... or change=....`,
  ]

  if (records.length === 0) {
    lines.push(`- none recorded for ${modelId}`)
    return lines.join("\n")
  }

  for (const record of records) {
    const parsed = isRecord(record.parsed) ? record.parsed : {}
    const hash = typeof record.productDiffHash === "string"
      ? record.productDiffHash.slice(0, 12)
      : "none"
    const changedFiles = Array.isArray(record.changedFiles)
      ? record.changedFiles.slice(0, 4).join(", ")
      : ""
    const delta = scoreDelta(record.scores)
    const scoreText = delta === null ? "" : ` delta=${delta}`
    const selected = truncateText(parsed.selected ?? parsed.hypotheses ?? "no selected hypothesis", 120)
    const change = truncateText(parsed.change ?? record.innerReportRaw ?? "no change summary", 140)
    const reason = truncateText(record.rejectionReason ?? record.result ?? "no rejection reason", 140)
    lines.push(
      `- iteration ${record.iteration}: result=${truncateText(record.result, 80)}${scoreText} hash=${hash} files=${changedFiles || "none"}`,
    )
    lines.push(`  selected: ${selected}`)
    lines.push(`  change: ${change}`)
    lines.push(`  reason: ${reason}`)
  }

  return lines.join("\n")
}

export function duplicateFailedExperimentForHash(modelId, productDiffHash, root = repoRoot) {
  if (productDiffHash === null) return null

  return [...readFailedExperiments(root)]
    .reverse()
    .find((record) => record.model === modelId && record.productDiffHash === productDiffHash) ?? null
}

function logRef(value, root = repoRoot) {
  if (!value || value === "none" || value === "-") return null
  const text = String(value)
  const absolutePath = path.isAbsolute(text) ? text : path.resolve(root, text)
  if (!existsSync(absolutePath)) return null
  return path.isAbsolute(text) ? normalizeRelativePath(text, root) : text
}

function logRefs(value, root = repoRoot) {
  if (!value || value === "none" || value === "-") return []
  return String(value)
    .split(",")
    .map((ref) => logRef(ref.trim(), root))
    .filter((ref) => ref !== null)
}

function rejectionReasonFromResult(result) {
  const text = String(result ?? "").trim()
  const match = text.match(/^no improvement \((.*)\)$/)
  return match ? match[1] : text || "no improvement"
}

function selectedScoreFromSnapshot(snapshot, modelId) {
  if (!snapshot) return null
  const model = isRecord(snapshot.models) ? snapshot.models[modelId] : null
  return isRecord(model) && typeof model.score === "number" && Number.isFinite(model.score)
    ? model.score
    : null
}

function booleanInput(value) {
  return value === true || value === "true" || value === "yes" || value === "1"
}

function failedExperimentScores(modelId, baselineSnapshot, verifySnapshot, comparison, candidateEvaluated) {
  const selected = isRecord(comparison?.selected) ? comparison.selected : null
  const baseline = typeof selected?.oldScore === "number"
    ? selected.oldScore
    : selectedScoreFromSnapshot(baselineSnapshot, modelId)
  const verify = selectedScoreFromSnapshot(verifySnapshot, modelId)
  let candidate = null
  if (candidateEvaluated) {
    candidate = typeof selected?.newScore === "number" ? selected.newScore : verify
  }

  return {
    baseline,
    candidate,
    verify,
    delta: typeof baseline === "number" && typeof candidate === "number"
      ? candidate - baseline
      : null,
  }
}

export function buildFailedExperimentRecord(input, root = repoRoot) {
  const recordInput = requireRecord(input, "failed experiment input")
  const model = String(recordInput.model)
  const iteration = Number(recordInput.iteration)
  if (!Number.isInteger(iteration) || iteration < 1) {
    throw new Error("failed experiment iteration must be a positive integer.")
  }

  const report = parseInnerReportLine(readOptionalText(recordInput.reportFile))
  const baselineSnapshot = readOptionalJson(recordInput.baselineSnapshot)
  const verifySnapshot = readOptionalJson(recordInput.verifySnapshot)
  const comparison = readOptionalJson(recordInput.compareJson)
  const comparisonReason = comparison ? formatCompareReasons(comparison) : null
  const result = String(recordInput.result ?? "no improvement")
  const productDiffHash = productDiffHashFromPatchFile(recordInput.productPatch)
  const candidateEvaluated = booleanInput(recordInput.candidateEvaluated)
  const rejectionReason = candidateEvaluated && comparisonReason
    ? comparisonReason
    : rejectionReasonFromResult(result)

  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    model,
    iteration,
    result,
    rejectionReason,
    innerReportRaw: report.raw,
    parsed: Object.fromEntries(innerReportFieldNames.map((field) => [field, report[field]])),
    candidateEvaluated,
    scores: failedExperimentScores(
      model,
      baselineSnapshot,
      verifySnapshot,
      comparison,
      candidateEvaluated,
    ),
    changedFiles: changedFilesFromPatchFile(recordInput.productPatch),
    productDiffHash,
    logs: {
      codex_stdout: logRef(recordInput.codexStdout, root),
      codex_stderr: logRef(recordInput.codexStderr, root),
      test: logRef(recordInput.testLog, root),
      baseline_eval: logRefs(recordInput.baselineEvalRefs, root),
      verify_eval: logRefs(recordInput.verifyEvalRefs, root),
      run_summary: logRef(recordInput.runSummary, root),
      compare: logRef(recordInput.compareJson, root),
    },
  }
}

export function appendFailedExperiment(record, root = repoRoot) {
  const checked = requireRecord(record, "failed experiment record")
  if (checked.schemaVersion !== 1) throw new Error("failed experiment schemaVersion must be 1.")

  const ledgerPath = failedExperimentsPath(root)
  mkdirSync(path.dirname(ledgerPath), { recursive: true })
  appendFileSync(ledgerPath, `${JSON.stringify(checked)}\n`)
}

export function buildAcceptedOptimizationRecord(input, root = repoRoot) {
  const recordInput = requireRecord(input, "accepted optimization input")
  const model = String(recordInput.model)
  assertKnownModel(model)
  const iteration = Number(recordInput.iteration)
  if (!Number.isInteger(iteration) || iteration < 1) {
    throw new Error("accepted optimization iteration must be a positive integer.")
  }

  const report = parseInnerReportLine(readOptionalText(recordInput.reportFile))
  const baselineSnapshot = readOptionalJson(recordInput.baselineSnapshot)
  const verifySnapshot = readOptionalJson(recordInput.verifySnapshot)
  const comparison = readOptionalJson(recordInput.compareJson)
  const result = String(recordInput.result ?? "accepted")

  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    model,
    iteration,
    result,
    innerReportRaw: report.raw,
    parsed: Object.fromEntries(innerReportFieldNames.map((field) => [field, report[field]])),
    scores: failedExperimentScores(model, baselineSnapshot, verifySnapshot, comparison, true),
    logs: {
      codex_stdout: logRef(recordInput.codexStdout, root),
      codex_stderr: logRef(recordInput.codexStderr, root),
      test: logRef(recordInput.testLog, root),
      baseline_eval: logRefs(recordInput.baselineEvalRefs, root),
      verify_eval: logRefs(recordInput.verifyEvalRefs, root),
      compare: logRef(recordInput.compareJson, root),
    },
  }
}

export function appendAcceptedOptimizationLog(record, root = repoRoot) {
  const checked = requireRecord(record, "accepted optimization record")
  if (checked.schemaVersion !== 1) {
    throw new Error("accepted optimization schemaVersion must be 1.")
  }
  const model = String(checked.model)
  const logPath = acceptedOptimizationLogPath(model, root)
  mkdirSync(path.dirname(logPath), { recursive: true })
  appendFileSync(logPath, `${JSON.stringify(checked)}\n`)
}

function formatDuplicateFailedExperiment(record) {
  const hash = typeof record.productDiffHash === "string"
    ? record.productDiffHash.slice(0, 12)
    : "unknown"
  const changedFiles = Array.isArray(record.changedFiles)
    ? record.changedFiles.slice(0, 4).join(", ")
    : ""
  return [
    `duplicate failed product diff hash=${hash}`,
    `iteration=${record.iteration}`,
    `result=${truncateText(record.result, 120)}`,
    changedFiles ? `files=${changedFiles}` : null,
  ].filter(Boolean).join("; ")
}

function gitStatusRecords(root = repoRoot) {
  const output = execFileSync(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { cwd: root },
  ).toString("utf8")
  const entries = output.split("\0")
  const records = []

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]
    if (entry.length === 0) continue

    const status = entry.slice(0, 2)
    const filePath = entry.slice(3)
    if (status[0] === "R" || status[0] === "C") {
      const sourcePath = entries[index + 1]
      if (!sourcePath) throw new Error(`Malformed git status rename/copy entry for ${filePath}.`)
      records.push({ status, path: filePath, sourcePath })
      index += 1
    } else {
      records.push({ status, path: filePath })
    }
  }

  return records
}

export function isAllowedAttemptPath(filePath) {
  const normalized = normalizeAttemptPath(filePath)
  if (isBlockedAttemptPath(normalized)) return false

  if (normalized === FAILED_EXPERIMENTS_LEDGER) {
    return true
  }

  if (acceptedLogPattern.test(normalized)) {
    return true
  }

  return (
    productSourcePrefixes.some((prefix) => normalized.startsWith(prefix)) ||
    isPackageReadme(normalized)
  )
}

function statusPaths(root = repoRoot) {
  return gitStatusRecords(root).flatMap((record) =>
    record.sourcePath ? [record.path, record.sourcePath] : [record.path],
  )
}

function ensureAttemptScope(root = repoRoot) {
  const invalid = statusPaths(root).filter((filePath) => !isAllowedAttemptPath(filePath))
  if (invalid.length > 0) {
    throw new Error(
      `Working tree has changes outside optimizer-owned product/docs paths: ${invalid.join(", ")}.`,
    )
  }
}

function attemptPaths(root = repoRoot) {
  ensureAttemptScope(root)
  return statusPaths(root).filter(isAllowedAttemptPath)
}

function committableAttemptPaths(root = repoRoot) {
  return attemptPaths(root).filter((filePath) => normalizeAttemptPath(filePath) !== FAILED_EXPERIMENTS_LEDGER)
}

export async function updateLastGoodScores(selectedModel, snapshotPath, commitSha, root = repoRoot) {
  const snapshot = readSnapshot(snapshotPath)
  const model = snapshot.models[selectedModel]
  if (!model) throw new Error(`Snapshot is missing ${selectedModel}.`)

  const scoresPath = path.join(root, ".evals", "auto-optimizer", "last-good-scores.json")
  await mkdir(path.dirname(scoresPath), { recursive: true })
  const existing = existsSync(scoresPath)
    ? readJson(scoresPath)
    : { schemaVersion: 1, models: {} }
  const updatedAt = new Date().toISOString()
  const nextModels = {
    ...(isRecord(existing.models) ? existing.models : {}),
    [selectedModel]: {
      score: model.score,
      pass: model.pass,
      passedCases: model.passedCases,
      totalCases: model.totalCases,
      hardFailureCount: model.hardFailureCount,
      artifact: model.artifact,
      commitSha,
      timestamp: updatedAt,
      scoreBreakdown: model.scoreBreakdown,
    },
  }
  const storedModelIds = WEBGPU_EVAL_MODEL_IDS.filter((modelId) => nextModels[modelId])
  const artifactDirs = artifactDirsByModel(nextModels, storedModelIds)
  const uniqueDirs = uniqueSorted(Object.values(artifactDirs))
  const next = {
    ...existing,
    schemaVersion: 1,
    updatedAt,
    source: "auto-optimizer",
    role: "bookkeeping-only",
    acceptancePolicy: "active-baseline-snapshot",
    artifactsDir: uniqueDirs.length === 1 ? uniqueDirs[0] : null,
    artifactDirs,
    mixedArtifacts: uniqueDirs.length > 1,
    models: nextModels,
  }

  writeJsonAtomic(scoresPath, next)
}

function printPromptSummary(selectedModel, snapshot) {
  const model = snapshot.models[selectedModel]
  if (!model) throw new Error(`Snapshot is missing ${selectedModel}.`)

  console.log(`Requested models: ${snapshot.modelsRequested.join(", ")}`)
  if (snapshot.artifactsDir) {
    console.log(`Current accepted artifact dir: ${snapshot.artifactsDir}`)
  } else {
    console.log(`Current accepted artifact dirs: ${snapshotArtifactDirs(snapshot).join(", ")}`)
  }
  console.log(`Selected model: ${selectedModel}`)
  console.log(`Current accepted score: ${model.score}`)
  console.log(`Current accepted artifact: ${model.artifact}`)
  console.log(`Current accepted scoreBreakdown: ${JSON.stringify(model.scoreBreakdown)}`)
}

function optionalRoot(rootArg) {
  return rootArg ? path.resolve(rootArg) : repoRoot
}

async function main(argv) {
  const command = argv[0]

  if (command === "models") {
    console.log(parseRequestedModels(argv[1]).join("\n"))
  } else if (command === "validate-options") {
    parseRequestedModels(argv[1])
    validatePositiveInteger(argv[2], "--iterations")
  } else if (command === "latest-snapshot") {
    try {
      console.log(JSON.stringify(latestSnapshot(argv[1]), null, 2))
    } catch (error) {
      if (error instanceof NeedsFreshArtifactsError) fail(error.message, 3)
      throw error
    }
  } else if (command === "snapshot") {
    console.log(JSON.stringify(createSnapshot(argv[1], argv[2]), null, 2))
  } else if (command === "validate-artifact") {
    modelSummaryFromFile(argv[1], path.resolve(repoRoot, argv[2]))
  } else if (command === "select-model") {
    console.log(selectModelFromSnapshot(argv[1], readSnapshot(argv[2])))
  } else if (command === "prompt-summary") {
    printPromptSummary(argv[1], readSnapshot(argv[2]))
  } else if (command === "prompt-evidence") {
    console.log(buildPromptEvidence(argv[1], readSnapshot(argv[2])))
  } else if (command === "failed-memory-prompt") {
    const limit = argv[2] ? validatePositiveInteger(argv[2], "limit") : 6
    console.log(formatFailedExperimentsPrompt(recentFailedExperiments(argv[1], limit), argv[1]))
  } else if (command === "failed-memory-duplicate") {
    const productDiffHash = productDiffHashFromPatchFile(argv[2])
    const duplicate = duplicateFailedExperimentForHash(argv[1], productDiffHash)
    if (duplicate) console.log(formatDuplicateFailedExperiment(duplicate))
  } else if (command === "append-failed-experiment") {
    const [
      model,
      iteration,
      result,
      reportFile,
      productPatch,
      baselineSnapshot,
      verifySnapshot,
      compareJson,
      codexStdout,
      codexStderr,
      testLog,
      baselineEvalRefs,
      verifyEvalRefs,
      runSummary,
      candidateEvaluated,
    ] = argv.slice(1)
    appendFailedExperiment(
      buildFailedExperimentRecord({
        model,
        iteration,
        result,
        reportFile,
        productPatch,
        baselineSnapshot,
        verifySnapshot,
        compareJson,
        codexStdout,
        codexStderr,
        testLog,
        baselineEvalRefs,
        verifyEvalRefs,
        runSummary,
        candidateEvaluated,
      }),
    )
  } else if (command === "append-accepted-log") {
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
    ] = argv.slice(1)
    appendAcceptedOptimizationLog(
      buildAcceptedOptimizationRecord({
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
      }),
    )
  } else if (command === "compare") {
    console.log(
      JSON.stringify(
        compareEvaluatedSnapshots(argv[1], readSnapshot(argv[2]), readSnapshot(argv[3]), {
          verifyArtifactHashes: true,
          verifyAllBaselineHashes: true,
        }),
        null,
        2,
      ),
    )
  } else if (command === "compare-evaluated") {
    console.log(
      JSON.stringify(
        compareEvaluatedSnapshots(argv[1], readSnapshot(argv[2]), readSnapshot(argv[3]), {
          verifyArtifactHashes: true,
          verifyAllBaselineHashes: true,
        }),
        null,
        2,
      ),
    )
  } else if (command === "compare-status") {
    console.log(readJson(argv[1]).status)
  } else if (command === "compare-new-score") {
    const selected = readJson(argv[1]).selected
    if (!selected) throw new Error("Comparison has no selected model summary.")
    console.log(selected.newScore)
  } else if (command === "compare-score-improvement") {
    console.log(formatScoreImprovement(readJson(argv[1]).selected))
  } else if (command === "compare-reasons") {
    console.log(formatCompareReasons(readJson(argv[1])))
  } else if (command === "compare-artifact") {
    const selected = readJson(argv[1]).selected
    if (!selected) throw new Error("Comparison has no selected model summary.")
    console.log(selected.artifact)
  } else if (command === "changed-paths") {
    console.log(changedPathsByKind(argv[1], optionalRoot(argv[2])).join("\n"))
  } else if (command === "changed-paths-nul") {
    const paths = changedPathsByKind(argv[1], optionalRoot(argv[2]))
    process.stdout.write(paths.join("\0"))
    if (paths.length > 0) process.stdout.write("\0")
  } else if (command === "eval-models") {
    const models = selectEvalModelsForProductPatch(argv[1], argv[2])
    if (models.length > 0) console.log(models.join("\n"))
  } else if (command === "merge-active-baseline") {
    console.log(
      JSON.stringify(
        mergeActiveBaselineSnapshot(argv[1], readSnapshot(argv[2]), readSnapshot(argv[3])),
        null,
        2,
      ),
    )
  } else if (command === "snapshot-artifact-dirs") {
    console.log(snapshotArtifactDirs(readSnapshot(argv[1])).join("\n"))
  } else if (command === "candidate-count") {
    console.log(attemptPaths(optionalRoot(argv[1])).length)
  } else if (command === "ensure-reset-scope") {
    ensureAttemptScope(optionalRoot(argv[1]))
  } else if (command === "commit-paths") {
    const paths = committableAttemptPaths(optionalRoot(argv[1]))
    process.stdout.write(paths.join("\0"))
    if (paths.length > 0) process.stdout.write("\0")
  } else if (command === "patches-equivalent") {
    if (!areGitPatchFilesEquivalent(argv[1], argv[2])) process.exit(1)
  } else if (command === "update-last-good") {
    await updateLastGoodScores(argv[1], argv[2], argv[3])
  } else {
    fail(
      [
        "Usage: node scripts/auto-optimize-helper.mjs <command> ...",
        "Commands: models, validate-options, latest-snapshot, snapshot, validate-artifact,",
        "select-model, prompt-summary, prompt-evidence, compare, compare-status,",
        "compare-evaluated, compare-new-score, compare-score-improvement, compare-reasons,",
        "compare-artifact, changed-paths, changed-paths-nul, eval-models, merge-active-baseline,",
        "snapshot-artifact-dirs, candidate-count,",
        "failed-memory-prompt, failed-memory-duplicate, append-failed-experiment, append-accepted-log,",
        "ensure-reset-scope, commit-paths, patches-equivalent, update-last-good",
      ].join("\n"),
    )
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
