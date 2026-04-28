#!/usr/bin/env node
import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const defaultOutputRoot = path.join(repoRoot, ".evals")
const defaultEvalName = "web-gpu"
const evalModelIds = [
  "qwen-3-0.6b",
  "gemma-3-1b-it",
  "translategemma-4",
]
const evalSplits = ["dev", "holdout", "holdout-clean", "calibration-public"]
const defaultLocalSplits = ["dev", "holdout"]
const evalContentTypes = ["text", "markdown", "dom"]
const evalLanguages = ["en", "es", "fr", "ar", "de", "ja", "hi"]
const evalSourceClasses = [
  "first_party_authored",
  "product_derived_rewrite",
  "synthetic_template",
  "public_benchmark",
  "public_web",
  "unknown",
]

function filenameTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replaceAll(".", "-")
}

function createDefaultOutputDir(date = new Date()) {
  return path.join(defaultOutputRoot, `${defaultEvalName}-${filenameTimestamp(date)}`)
}

function artifactNameForModel(modelId) {
  return `${modelId.replaceAll("/", "-")}.json`
}

function artifactPathForModel(outputDir, modelId) {
  return path.join(outputDir, artifactNameForModel(modelId))
}

function usage() {
  return [
    "Usage: pnpm eval:webgpu [-- --model <id|all|a,b>] [--headed] [--output-dir <path>] [filters]",
    "",
    "Defaults:",
    "  --model qwen-3-0.6b",
    "  --output-dir .evals/web-gpu-<timestamp>",
    "  --split dev,holdout",
    "  holdout-clean and calibration-public run only when explicitly selected",
    "",
    "Filters:",
    "  --split dev,holdout",
    "  --category markdown,dom-attrs",
    "  --content-type text,markdown,dom",
    "  --source-language en",
    "  --target-language es,fr",
    "  --language-pair en-es,en-fr",
    "  --source-class first_party_authored",
    "",
    "Holdout metadata:",
    "  --holdout-reason \"release gate\"",
    "  --references-exposed",
    "",
    `Valid models: ${evalModelIds.join(", ")}`,
    "",
    "If Chromium is missing, install it with:",
    "  pnpm exec playwright install chromium",
  ].join("\n")
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer, got ${value}.`)
  }
  return parsed
}

export function parseArgs(argv) {
  const options = {
    modelArg: "qwen-3-0.6b",
    outputDir: null,
    headed: false,
    port: null,
    loadTimeoutMs: 900_000,
    caseTimeoutMs: 180_000,
    browserTimeoutMs: 1_200_000,
    executablePath: null,
    holdoutReason: null,
    referencesExposed: false,
    filters: {},
  }
  let splitSpecified = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value) throw new Error(`Missing value for ${arg}.`)
      index += 1
      return value
    }

    if (arg === "--") {
      continue
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage())
      process.exit(0)
    } else if (arg === "--model") {
      options.modelArg = nextValue()
    } else if (arg.startsWith("--model=")) {
      options.modelArg = arg.slice("--model=".length)
    } else if (arg === "--output-dir" || arg === "--output") {
      options.outputDir = path.resolve(repoRoot, nextValue())
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = path.resolve(repoRoot, arg.slice("--output-dir=".length))
    } else if (arg.startsWith("--output=")) {
      options.outputDir = path.resolve(repoRoot, arg.slice("--output=".length))
    } else if (arg === "--headed") {
      options.headed = true
    } else if (arg === "--port") {
      options.port = parsePositiveInteger(nextValue(), "--port")
    } else if (arg.startsWith("--port=")) {
      options.port = parsePositiveInteger(arg.slice("--port=".length), "--port")
    } else if (arg === "--load-timeout-ms") {
      options.loadTimeoutMs = parsePositiveInteger(nextValue(), "--load-timeout-ms")
    } else if (arg.startsWith("--load-timeout-ms=")) {
      options.loadTimeoutMs = parsePositiveInteger(
        arg.slice("--load-timeout-ms=".length),
        "--load-timeout-ms",
      )
    } else if (arg === "--case-timeout-ms") {
      options.caseTimeoutMs = parsePositiveInteger(nextValue(), "--case-timeout-ms")
    } else if (arg.startsWith("--case-timeout-ms=")) {
      options.caseTimeoutMs = parsePositiveInteger(
        arg.slice("--case-timeout-ms=".length),
        "--case-timeout-ms",
      )
    } else if (arg === "--browser-timeout-ms") {
      options.browserTimeoutMs = parsePositiveInteger(nextValue(), "--browser-timeout-ms")
    } else if (arg.startsWith("--browser-timeout-ms=")) {
      options.browserTimeoutMs = parsePositiveInteger(
        arg.slice("--browser-timeout-ms=".length),
        "--browser-timeout-ms",
      )
    } else if (arg === "--executable-path") {
      options.executablePath = nextValue()
    } else if (arg.startsWith("--executable-path=")) {
      options.executablePath = arg.slice("--executable-path=".length)
    } else if (arg === "--holdout-reason") {
      options.holdoutReason = nextValue()
    } else if (arg.startsWith("--holdout-reason=")) {
      options.holdoutReason = arg.slice("--holdout-reason=".length)
    } else if (arg === "--references-exposed") {
      options.referencesExposed = true
    } else if (arg === "--split") {
      splitSpecified = true
      options.filters.split = parseEnumList(nextValue(), evalSplits, "--split")
    } else if (arg.startsWith("--split=")) {
      splitSpecified = true
      options.filters.split = parseEnumList(arg.slice("--split=".length), evalSplits, "--split")
    } else if (arg === "--category") {
      options.filters.category = parseStringList(nextValue(), "--category")
    } else if (arg.startsWith("--category=")) {
      options.filters.category = parseStringList(arg.slice("--category=".length), "--category")
    } else if (arg === "--content-type") {
      options.filters.contentType = parseEnumList(nextValue(), evalContentTypes, "--content-type")
    } else if (arg.startsWith("--content-type=")) {
      options.filters.contentType = parseEnumList(arg.slice("--content-type=".length), evalContentTypes, "--content-type")
    } else if (arg === "--source-language") {
      options.filters.sourceLanguage = parseEnumList(nextValue(), evalLanguages, "--source-language")
    } else if (arg.startsWith("--source-language=")) {
      options.filters.sourceLanguage = parseEnumList(arg.slice("--source-language=".length), evalLanguages, "--source-language")
    } else if (arg === "--target-language") {
      options.filters.targetLanguage = parseEnumList(nextValue(), evalLanguages, "--target-language")
    } else if (arg.startsWith("--target-language=")) {
      options.filters.targetLanguage = parseEnumList(arg.slice("--target-language=".length), evalLanguages, "--target-language")
    } else if (arg === "--language-pair") {
      options.filters.languagePair = parseLanguagePairs(nextValue())
    } else if (arg.startsWith("--language-pair=")) {
      options.filters.languagePair = parseLanguagePairs(arg.slice("--language-pair=".length))
    } else if (arg === "--source-class") {
      options.filters.sourceClass = parseEnumList(nextValue(), evalSourceClasses, "--source-class")
    } else if (arg.startsWith("--source-class=")) {
      options.filters.sourceClass = parseEnumList(arg.slice("--source-class=".length), evalSourceClasses, "--source-class")
    } else {
      throw new Error(`Unknown argument ${arg}.\n\n${usage()}`)
    }
  }

  if (!splitSpecified) {
    options.filters.split = defaultLocalSplits
  }

  if (
    options.filters.split.includes("holdout-clean") &&
    (!options.holdoutReason || options.holdoutReason.trim().length === 0)
  ) {
    throw new Error("--split holdout-clean requires --holdout-reason.")
  }

  return {
    ...options,
    outputDir: options.outputDir ?? createDefaultOutputDir(),
    models: parseModels(options.modelArg),
  }
}

function parseStringList(value, label) {
  const values = value.split(",").map((item) => item.trim()).filter(Boolean)
  if (values.length === 0) throw new Error(`${label} must include at least one value.`)
  return [...new Set(values)]
}

function parseEnumList(value, allowedValues, label) {
  const values = parseStringList(value, label)
  const unknown = values.filter((item) => !allowedValues.includes(item))
  if (unknown.length > 0) {
    throw new Error(`${label} has unknown value(s): ${unknown.join(", ")}. Valid values: ${allowedValues.join(", ")}.`)
  }
  return values
}

function parseLanguagePairs(value) {
  const pairs = parseStringList(value, "--language-pair")
  const invalid = pairs.filter((pair) => {
    const [source, target, extra] = pair.split("-")
    return !source || !target || extra !== undefined ||
      !evalLanguages.includes(source) ||
      !evalLanguages.includes(target)
  })
  if (invalid.length > 0) {
    throw new Error(`--language-pair has invalid value(s): ${invalid.join(", ")}. Expected values like en-es.`)
  }
  return pairs
}

function parseModels(modelArg) {
  const models = modelArg === "all"
    ? evalModelIds
    : modelArg.split(",").map((model) => model.trim()).filter(Boolean)

  if (models.length === 0) {
    throw new Error("At least one model is required.")
  }

  const unknown = models.filter((model) => !evalModelIds.includes(model))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown WebGPU eval model ${unknown.join(", ")}. Valid models: ${evalModelIds.join(", ")}.`,
    )
  }

  return [...new Set(models)]
}

function serializeError(errorClass, error) {
  if (error instanceof Error) {
    return {
      class: errorClass,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }

  return {
    class: errorClass,
    message: String(error),
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port)
        } else {
          reject(new Error("Could not allocate a local port."))
        }
      })
    })
  })
}

function createLogCollector() {
  const chunks = []
  return {
    push(chunk) {
      chunks.push(chunk)
      while (chunks.join("").length > 12_000) chunks.shift()
    },
    text() {
      return chunks.join("")
    },
  }
}

function startViteServer(port) {
  const logs = createLogCollector()
  const server = spawn(
    "pnpm",
    [
      "--filter",
      "@babulfish/demo-vanilla",
      "exec",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, BROWSER: "none" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  )

  server.stdout.on("data", (chunk) => logs.push(chunk.toString()))
  server.stderr.on("data", (chunk) => logs.push(chunk.toString()))

  return { server, logs }
}

async function waitForEvalPage(url, server, logs) {
  const deadline = Date.now() + 30_000
  let lastError = null

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite server exited before eval page was ready.\n${logs.text()}`)
    }

    try {
      const response = await fetch(url)
      if (response.ok) {
        const coop = response.headers.get("cross-origin-opener-policy")
        const coep = response.headers.get("cross-origin-embedder-policy")
        if (coop !== "same-origin" || coep !== "require-corp") {
          throw new Error(
            `Vite served eval page without COOP/COEP headers. Got COOP=${coop}, COEP=${coep}.`,
          )
        }
        return { coop, coep }
      }
      lastError = new Error(`Eval page returned HTTP ${response.status}.`)
    } catch (error) {
      lastError = error
    }

    await delay(250)
  }

  throw new Error(
    `Timed out waiting for ${url}. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }\n${logs.text()}`,
  )
}

async function loadPlaywright() {
  try {
    return await import("playwright")
  } catch (error) {
    throw new Error(
      `Playwright is not installed or cannot be imported: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

async function launchBrowser(options) {
  const { chromium } = await loadPlaywright()
  try {
    return await chromium.launch({
      headless: !options.headed,
      ...(options.executablePath ? { executablePath: options.executablePath } : {}),
      args: [
        "--enable-unsafe-webgpu",
        "--enable-features=WebGPUDeveloperFeatures",
        "--disable-gpu-sandbox",
      ],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      message.includes("Executable doesn't exist")
        ? `${message}\n\nInstall Chromium with: pnpm exec playwright install chromium`
        : message,
    )
  }
}

export function createRunMetadata(modelId, options) {
  return {
    runner: "webgpu-eval-cli",
    timestamp: new Date().toISOString(),
    modelId,
    filters: options.filters,
    reason: options.holdoutReason,
    referencesExposed: options.referencesExposed,
  }
}

async function runModelInPage(browser, url, modelId, options) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const consoleLines = []

  page.setDefaultTimeout(options.browserTimeoutMs)
  page.on("console", (message) => {
    consoleLines.push(`[${message.type()}] ${message.text()}`)
  })

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.waitForFunction(() => window.babulfishWebGpuEval)
    const result = await page.evaluate(
      (request) => window.babulfishWebGpuEval.runModelEval(request),
      {
        modelId,
        loadTimeoutMs: options.loadTimeoutMs,
        caseTimeoutMs: options.caseTimeoutMs,
        filters: options.filters,
        runMetadata: createRunMetadata(modelId, options),
      },
    )

    return {
      ...result,
      pageConsole: consoleLines,
    }
  } finally {
    await context.close()
  }
}

function createBaseResult(options, port) {
  return {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    durationMs: null,
    pass: false,
    command: {
      models: options.models,
      outputDir: path.relative(repoRoot, options.outputDir),
      headed: options.headed,
      port,
      loadTimeoutMs: options.loadTimeoutMs,
      caseTimeoutMs: options.caseTimeoutMs,
      browserTimeoutMs: options.browserTimeoutMs,
      executablePath: options.executablePath,
      filters: options.filters,
      holdoutReason: options.holdoutReason,
      referencesExposed: options.referencesExposed,
    },
    server: {
      url: `http://127.0.0.1:${port}/webgpu-eval.html`,
      coop: null,
      coep: null,
    },
    browser: {
      name: "chromium",
      version: null,
      headless: !options.headed,
      launchArgs: [
        "--enable-unsafe-webgpu",
        "--enable-features=WebGPUDeveloperFeatures",
        "--disable-gpu-sandbox",
      ],
    },
    models: [],
    errors: [],
  }
}

function failedModelFromError(modelId, error, options = null) {
  const cleanHeadlineScore = {
    score: 0,
    scoreBreakdown: {
      weightedCheckScore: 0,
      passedCaseRatio: 0,
      referenceSimilarity: 0,
      hardFailureCount: 0,
      failureReason: null,
    },
    failuresByCategory: {},
    failuresByCheck: {},
    pass: false,
    includedCases: 0,
    excludedCases: 0,
    excludedCaseIds: [],
  }

  return {
    modelId,
    resolvedModelId: "",
    adapterId: "",
    dtype: "",
    device: "webgpu",
    subfolder: null,
    modelFileName: null,
    label: modelId,
    loadMs: null,
    cases: [],
    pass: false,
    score: 0,
    scoreBreakdown: {
      weightedCheckScore: 0,
      passedCaseRatio: 0,
      referenceSimilarity: 0,
      hardFailureCount: 0,
      failureReason: `${error.class}: ${error.message}`,
    },
    failuresByCategory: {},
    failuresByCheck: {},
    cleanHeadlineScore,
    caseGroupSummaries: [],
    scoreGroupSummaries: [],
    runMetadata: options ? createRunMetadata(modelId, options) : null,
    error,
    environment: {
      userAgent: "",
      crossOriginIsolated: false,
      hasNavigatorGpu: false,
      adapterAvailable: false,
      deviceAvailable: false,
      adapterFeatures: [],
    },
    pageConsole: [],
  }
}

function createModelArtifact(result, model) {
  return {
    schemaVersion: result.schemaVersion,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    pass: model.pass && result.errors.length === 0,
    command: result.command,
    server: result.server,
    browser: result.browser,
    errors: result.errors,
    model,
  }
}

async function writeArtifacts(outputDir, result) {
  await mkdir(outputDir, { recursive: true })

  const artifactPaths = []
  for (const model of result.models) {
    const outputPath = artifactPathForModel(outputDir, model.modelId)
    await writeFile(
      outputPath,
      `${JSON.stringify(createModelArtifact(result, model), null, 2)}\n`,
    )
    artifactPaths.push(outputPath)
  }

  if (artifactPaths.length === 0) {
    const outputPath = path.join(outputDir, "run-error.json")
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)
    artifactPaths.push(outputPath)
  }

  return artifactPaths
}

export function formatResultSummary(result, artifactPaths) {
  const relativeArtifacts = artifactPaths.map((artifactPath) =>
    path.relative(repoRoot, artifactPath),
  )
  const status = result.pass ? "PASS" : "FAIL"
  const modelCount = result.models.length
  const scores = result.models
    .map((model) => {
      const raw = Number(model.score ?? 0).toFixed(3)
      const clean = Number(model.cleanHeadlineScore?.score ?? 0).toFixed(3)
      return `${model.modelId}=raw:${raw}/clean:${clean}`
    })
    .join(", ")

  return `${status} WebGPU eval: ${modelCount} model(s). Scores: ${scores}. Artifacts: ${relativeArtifacts.join(", ")}`
}

function summarizeResult(result, artifactPaths) {
  for (const model of result.models) {
    if (model.error) {
      console.error(
        `[${model.modelId}] ${model.error.class}: ${model.error.message}`,
      )
      continue
    }

    for (const evalCase of model.cases) {
      if (evalCase.pass) continue
      const failedChecks = evalCase.checks.filter((check) => !check.pass)
      console.error(
        `[${model.modelId}/${evalCase.id}] failed: ${
          failedChecks.map((check) => check.name).join(", ")
        }`,
      )
      for (const check of failedChecks) {
        console.error(`  - ${check.name}: expected ${check.expected}; actual ${check.actual}`)
      }
    }

    const failedGroups = model.caseGroupSummaries.filter((group) => group.failed > 0)
    for (const group of failedGroups) {
      console.error(
        `[${model.modelId}/${group.split}/${group.contentType}/${group.category}/${group.languagePair}/${group.sourceClass}] ` +
          `${group.failed}/${group.total} failed; checks: ${Object.entries(group.failuresByCheck)
            .map(([name, count]) => `${name}=${count}`)
            .join(", ") || "none"}`,
      )
    }
  }

  for (const error of result.errors) {
    console.error(`[${error.class}] ${error.message}`)
  }

  console.log(formatResultSummary(result, artifactPaths))
}

async function stopServer(server) {
  if (server.exitCode !== null) return
  signalServer(server, "SIGTERM")
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    delay(3_000),
  ])
  if (server.exitCode === null) signalServer(server, "SIGKILL")
}

function signalServer(server, signal) {
  if (server.pid) {
    try {
      process.kill(-server.pid, signal)
      return
    } catch {
      // Fall back to the direct child if process-group signaling is unavailable.
    }
  }

  server.kill(signal)
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  const port = options.port ?? await findAvailablePort()
  const startedAtMs = Date.now()
  const result = createBaseResult(options, port)
  const { server, logs } = startViteServer(port)
  let browser = null

  try {
    const headers = await waitForEvalPage(result.server.url, server, logs)
    result.server.coop = headers.coop
    result.server.coep = headers.coep

    browser = await launchBrowser(options)
    result.browser.version = browser.version()

    for (const modelId of options.models) {
      try {
        const modelResult = await runModelInPage(browser, result.server.url, modelId, options)
        result.models.push(modelResult)
        if (modelResult.error?.class === "environment") break
      } catch (error) {
        result.models.push(failedModelFromError(modelId, serializeError("environment", error), options))
        break
      }
    }
  } catch (error) {
    const serializedError = serializeError("environment", error)
    result.errors.push(serializedError)
    if (result.models.length === 0 && options.models[0]) {
      result.models.push(failedModelFromError(options.models[0], serializedError, options))
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
    await stopServer(server)

    result.finishedAt = new Date().toISOString()
    result.durationMs = Date.now() - startedAtMs
    result.pass =
      result.errors.length === 0 &&
      result.models.length === options.models.length &&
      result.models.every((model) => model.pass)

    try {
      result.artifactPaths = await writeArtifacts(options.outputDir, result)
    } catch (error) {
      console.error(
        `Failed to write eval artifact: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      process.exitCode = 1
      return
    }
  }

  summarizeResult(result, result.artifactPaths)
  process.exitCode = result.pass ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
