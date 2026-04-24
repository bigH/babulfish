import { once } from "node:events"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const nextBin = require.resolve("next/dist/bin/next")
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const demoDir = path.resolve(scriptDir, "..")
const host = "127.0.0.1"
const startupTimeoutMs = 30_000
const shutdownTimeoutMs = 5_000
const homepageMarkers = [
  "babulfish React Demo",
  "React provider integration, visible lifecycle, restore, and RTL.",
  "Provider",
  "Hooks",
  "Root behavior",
  "React Boundary Proof",
  "useTranslator()",
  "useTranslateDOM()",
  "Model Spec",
  "Resolved Model",
  "Adapter",
  "Requested Device",
  "Effective Device",
  "Requested Quantization",
  "Effective Quantization",
  "Capabilities",
  "Enablement",
  "Resolved Runtime",
  "Verdict",
  "Model",
  "Translation",
  "Hook Progress",
  "Language",
  "Translated Root Direction",
  "Load model",
  "Translate to Spanish",
  "Translate to Arabic (RTL)",
  "Restore original",
  "Translated Root",
  "Only this container is inside",
  "Try This",
  "Client-side translation, no server detour",
  "The stock React surface stays small",
]

const serverMode = process.argv.includes("--dev") ? "dev" : "start"

let logs = ""

function appendLog(chunk) {
  logs = `${logs}${chunk}`
  if (logs.length > 8_000) {
    logs = logs.slice(-8_000)
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function getFreePort() {
  const probe = createServer()
  probe.listen(0, host)
  await once(probe, "listening")

  const address = probe.address()
  if (!address || typeof address === "string") {
    probe.close()
    throw new Error("Failed to acquire an ephemeral port for the demo smoke test.")
  }

  probe.close()
  await once(probe, "close")
  return address.port
}

async function waitForServer(url, child) {
  const deadline = Date.now() + startupTimeoutMs
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Next demo server exited before becoming ready (${formatExit(child)}).${formatLogs()}`,
      )
    }

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      })

      if (response.ok) {
        return response
      }

      lastError = new Error(`Homepage returned ${response.status} ${response.statusText}.`)
    } catch (error) {
      lastError = error
    }

    await sleep(250)
  }

  const reason =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : ""
  throw new Error(`Timed out waiting for the demo homepage.${reason}${formatLogs()}`)
}

function formatLogs() {
  return logs ? `\nRecent server logs:\n${logs.trimEnd()}` : ""
}

function formatExit(child) {
  if (child.exitCode !== null) {
    return `code ${child.exitCode}`
  }

  if (child.signalCode) {
    return `signal ${child.signalCode}`
  }

  return "unknown exit"
}

async function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  await once(child, "exit")
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }

  child.kill("SIGTERM")

  const exited = await Promise.race([
    waitForExit(child).then(() => true),
    sleep(shutdownTimeoutMs).then(() => false),
  ])

  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL")
    await once(child, "exit")
  }
}

async function main() {
  const port = await getFreePort()
  const url = `http://${host}:${port}/`
  const child = spawn(
    process.execPath,
    [nextBin, serverMode, "--hostname", host, "--port", String(port)],
    {
      cwd: demoDir,
      env: {
        ...process.env,
        HOSTNAME: host,
        PORT: String(port),
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  )

  child.stdout?.setEncoding("utf8")
  child.stderr?.setEncoding("utf8")
  child.stdout?.on("data", appendLog)
  child.stderr?.on("data", appendLog)

  const handleSignal = async (signal) => {
    try {
      process.removeListener("SIGINT", handleSigint)
      process.removeListener("SIGTERM", handleSigterm)
      await stopServer(child)
    } finally {
      console.error(`Received ${signal}; stopped demo smoke server.`)
      process.exit(1)
    }
  }

  const handleSigint = () => {
    void handleSignal("SIGINT")
  }

  const handleSigterm = () => {
    void handleSignal("SIGTERM")
  }

  process.once("SIGINT", handleSigint)
  process.once("SIGTERM", handleSigterm)

  try {
    const response = await waitForServer(url, child)
    const html = await response.text()
    const missingMarkers = homepageMarkers.filter((marker) => !html.includes(marker))

    if (missingMarkers.length > 0) {
      throw new Error(
        `Demo homepage is missing expected markers: ${missingMarkers.join(", ")}.${formatLogs()}`,
      )
    }

    const canonicalUrl = `${url}?model=qwen-3-0.6b`
    const canonicalResponse = await fetch(canonicalUrl, {
      signal: AbortSignal.timeout(2_000),
    })
    const canonicalHtml = await canonicalResponse.text()
    const missingCanonicalMarkers = [
      "Qwen 3 0.6B (qwen-3-0.6b)",
      "onnx-community/Qwen3-0.6B-ONNX",
      "qwen-3-0.6b-chat",
      "WebGPU (webgpu)",
      "Q4F16 (q4f16)",
    ].filter((marker) => !canonicalHtml.includes(marker))

    if (missingCanonicalMarkers.length > 0) {
      throw new Error(
        `Demo canonical runtime deep link is missing expected markers: ${missingCanonicalMarkers.join(", ")}.${formatLogs()}`,
      )
    }

    const legacyUrl = `${url}?modelId=onnx-community%2FQwen2.5-0.5B-Instruct`
    const legacyResponse = await fetch(legacyUrl, {
      signal: AbortSignal.timeout(2_000),
    })
    const legacyHtml = await legacyResponse.text()
    const missingLegacyMarkers = [
      "Qwen 2.5 0.5B Instruct (qwen-2.5-0.5b)",
      "onnx-community/Qwen2.5-0.5B-Instruct",
      "qwen-2.5-0.5b-chat",
    ].filter((marker) => !legacyHtml.includes(marker))

    if (missingLegacyMarkers.length > 0) {
      throw new Error(
        `Demo legacy runtime deep link is missing expected markers: ${missingLegacyMarkers.join(", ")}.${formatLogs()}`,
      )
    }

    console.log(`Demo smoke passed for ${url} (${serverMode})`)
  } finally {
    process.removeListener("SIGINT", handleSigint)
    process.removeListener("SIGTERM", handleSigterm)
    await stopServer(child)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
