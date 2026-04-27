#!/usr/bin/env node
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"

export const WEBGPU_EVAL_MODEL_IDS = Object.freeze([
  "qwen-2.5-0.5b",
  "qwen-3-0.6b",
  "gemma-3-1b-it",
  "translategemma-4",
])

export const EXPECTED_CASE_COUNT = 38

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(scriptPath), "..")
const docsOptimizationPrefix = "docs/optimization/"
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

export function createSnapshot(modelArg, outputDir, root = repoRoot) {
  const models = parseRequestedModels(modelArg)
  const { absoluteDir, relativeDir } = assertArtifactDir(outputDir, root)

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    requestedModelArg: modelArg,
    artifactsDir: relativeDir,
    modelsRequested: models,
    models: Object.fromEntries(
      models.map((modelId) => [modelId, modelSummaryFromFile(modelId, absoluteDir, root)]),
    ),
  }
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

  if (verifiedModel.score !== baselineModel.score) {
    reasons.push(
      `${modelId} score changed from ${baselineModel.score} to ${verifiedModel.score}.`,
    )
  }

  if (verifiedModel.pass !== baselineModel.pass || verifiedModel.modelPass !== baselineModel.modelPass) {
    reasons.push(`${modelId} pass outcome changed.`)
  }

  if (!isDeepStrictEqual(verifiedModel.checkOutcomes, baselineModel.checkOutcomes)) {
    reasons.push(`${modelId} case/check outcomes changed.`)
  }
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

  if (options.verifyArtifactHashes !== false) {
    for (const [modelId, model] of Object.entries(baselineModels)) {
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

  for (const modelId of Object.keys(baselineModels)) {
    if (modelId === selectedModel) continue
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

  if (normalized.startsWith(docsOptimizationPrefix) && normalized.endsWith(".md")) {
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

async function updateLastGoodScores(selectedModel, snapshotPath, commitSha, root = repoRoot) {
  const snapshot = readSnapshot(snapshotPath)
  const model = snapshot.models[selectedModel]
  if (!model) throw new Error(`Snapshot is missing ${selectedModel}.`)

  const scoresPath = path.join(root, ".evals", "auto-optimizer", "last-good-scores.json")
  await mkdir(path.dirname(scoresPath), { recursive: true })
  const existing = existsSync(scoresPath)
    ? readJson(scoresPath)
    : { schemaVersion: 1, models: {} }
  const updatedAt = new Date().toISOString()
  const next = {
    ...existing,
    schemaVersion: 1,
    updatedAt,
    source: "auto-optimizer",
    artifactsDir: snapshot.artifactsDir,
    models: {
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
    },
  }

  writeJsonAtomic(scoresPath, next)
}

function printPromptSummary(selectedModel, snapshot) {
  const model = snapshot.models[selectedModel]
  if (!model) throw new Error(`Snapshot is missing ${selectedModel}.`)

  console.log(`Requested models: ${snapshot.modelsRequested.join(", ")}`)
  console.log(`Baseline artifact dir: ${snapshot.artifactsDir}`)
  console.log(`Selected model: ${selectedModel}`)
  console.log(`Baseline score: ${model.score}`)
  console.log(`Baseline artifact: ${model.artifact}`)
  console.log(`Baseline scoreBreakdown: ${JSON.stringify(model.scoreBreakdown)}`)
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
  } else if (command === "compare") {
    console.log(
      JSON.stringify(compareSnapshots(argv[1], readSnapshot(argv[2]), readSnapshot(argv[3])), null, 2),
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
  } else if (command === "candidate-count") {
    console.log(attemptPaths(optionalRoot(argv[1])).length)
  } else if (command === "ensure-reset-scope") {
    ensureAttemptScope(optionalRoot(argv[1]))
  } else if (command === "commit-paths") {
    const paths = attemptPaths(optionalRoot(argv[1]))
    process.stdout.write(paths.join("\0"))
    if (paths.length > 0) process.stdout.write("\0")
  } else if (command === "update-last-good") {
    await updateLastGoodScores(argv[1], argv[2], argv[3])
  } else {
    fail(
      [
        "Usage: node scripts/auto-optimize-helper.mjs <command> ...",
        "Commands: models, validate-options, latest-snapshot, snapshot, validate-artifact,",
        "select-model, prompt-summary, prompt-evidence, compare, compare-status,",
        "compare-new-score, compare-score-improvement, compare-reasons, compare-artifact, candidate-count,",
        "ensure-reset-scope, commit-paths, update-last-good",
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
