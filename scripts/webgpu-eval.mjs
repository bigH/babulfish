#!/usr/bin/env node
import { spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const defaultOutputPath = path.join(repoRoot, ".scratchpad/webgpu-evals/results.json")
const evalModelIds = ["qwen-2.5-0.5b", "qwen-3-0.6b", "gemma-3-1b-it"]

function usage() {
  return [
    "Usage: pnpm eval:webgpu [-- --model <id|all|a,b>] [--headed] [--output <path>]",
    "",
    "Defaults:",
    "  --model qwen-2.5-0.5b",
    "  --output .scratchpad/webgpu-evals/results.json",
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

function parseArgs(argv) {
  const options = {
    modelArg: "qwen-2.5-0.5b",
    outputPath: defaultOutputPath,
    headed: false,
    port: null,
    loadTimeoutMs: 900_000,
    caseTimeoutMs: 180_000,
    browserTimeoutMs: 1_200_000,
    executablePath: null,
  }

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
    } else if (arg === "--output") {
      options.outputPath = path.resolve(repoRoot, nextValue())
    } else if (arg.startsWith("--output=")) {
      options.outputPath = path.resolve(repoRoot, arg.slice("--output=".length))
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
    } else {
      throw new Error(`Unknown argument ${arg}.\n\n${usage()}`)
    }
  }

  return {
    ...options,
    models: parseModels(options.modelArg),
  }
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
      outputPath: path.relative(repoRoot, options.outputPath),
      headed: options.headed,
      port,
      loadTimeoutMs: options.loadTimeoutMs,
      caseTimeoutMs: options.caseTimeoutMs,
      browserTimeoutMs: options.browserTimeoutMs,
      executablePath: options.executablePath,
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

function failedModelFromError(modelId, error) {
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

async function writeArtifact(outputPath, result) {
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`)
}

function summarizeResult(result, outputPath) {
  const relativeOutput = path.relative(repoRoot, outputPath)

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
  }

  for (const error of result.errors) {
    console.error(`[${error.class}] ${error.message}`)
  }

  const status = result.pass ? "PASS" : "FAIL"
  const modelCount = result.models.length
  console.log(`${status} WebGPU eval: ${modelCount} model(s). Artifact: ${relativeOutput}`)
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
        result.models.push(failedModelFromError(modelId, serializeError("environment", error)))
        break
      }
    }
  } catch (error) {
    result.errors.push(serializeError("environment", error))
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
      await writeArtifact(options.outputPath, result)
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

  summarizeResult(result, options.outputPath)
  process.exitCode = result.pass ? 0 : 1
}

await main()
