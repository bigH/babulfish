import { createBabulfish } from "@babulfish/core"

import {
  getDemoModelSpecById,
  type DemoModelSpec,
} from "../../demo-shared/src/runtime-selection.js"
import {
  WEBGPU_EVAL_CORPUS,
  scoreWebGpuEvalGenerationFailure,
  scoreWebGpuEvalCase,
  scoreWebGpuEvalModel,
  scoreWebGpuEvalValidationFailure,
  type WebGpuEvalCaseScoreBreakdown,
  type WebGpuEvalCase,
  type WebGpuEvalCheck,
  type WebGpuEvalModelId,
  type WebGpuEvalModelScoreBreakdown,
} from "./webgpu-eval-scorer.js"

type WebGpuEvalDevice = {
  destroy?: () => void
}

type WebGpuEvalAdapter = {
  readonly features?: ReadonlySet<string>
  requestDevice(): Promise<WebGpuEvalDevice>
}

type WebGpuEvalGpu = {
  requestAdapter(): Promise<WebGpuEvalAdapter | null>
}

type EvalErrorClass = "environment" | "load" | "generation" | "validation"

type SerializedError = {
  readonly class: EvalErrorClass
  readonly message: string
  readonly stack?: string
}

type WebGpuEnvironment = {
  readonly userAgent: string
  readonly crossOriginIsolated: boolean
  readonly hasNavigatorGpu: boolean
  readonly adapterAvailable: boolean
  readonly deviceAvailable: boolean
  readonly adapterFeatures: readonly string[]
}

type WebGpuEvalRequest = {
  readonly modelId: WebGpuEvalModelId
  readonly loadTimeoutMs: number
  readonly caseTimeoutMs: number
}

type WebGpuEvalCaseResult = {
  readonly id: string
  readonly split: WebGpuEvalCase["split"]
  readonly category: string
  readonly sourceText: string
  readonly sourceLanguage: "en"
  readonly targetLanguage: WebGpuEvalCase["targetLanguage"]
  readonly contentType: WebGpuEvalCase["contentType"]
  readonly rawOutput: string
  readonly normalizedOutput: string
  readonly checks: readonly WebGpuEvalCheck[]
  readonly pass: boolean
  readonly score: number
  readonly scoreBreakdown: WebGpuEvalCaseScoreBreakdown
  readonly translateMs: number
  readonly error: SerializedError | null
}

export type WebGpuEvalModelResult = {
  readonly modelId: WebGpuEvalModelId
  readonly resolvedModelId: string
  readonly adapterId: string
  readonly dtype: string
  readonly device: "webgpu"
  readonly subfolder: string | null
  readonly modelFileName: string | null
  readonly label: string
  readonly loadMs: number | null
  readonly cases: readonly WebGpuEvalCaseResult[]
  readonly pass: boolean
  readonly score: number
  readonly scoreBreakdown: WebGpuEvalModelScoreBreakdown
  readonly failuresByCategory: Readonly<Record<string, number>>
  readonly failuresByCheck: Readonly<Record<string, number>>
  readonly error: SerializedError | null
  readonly environment: WebGpuEnvironment
}

type WebGpuEvalApi = {
  runModelEval(request: WebGpuEvalRequest): Promise<WebGpuEvalModelResult>
}

type WebGpuEvalDemoModelSpec = DemoModelSpec & { readonly id: WebGpuEvalModelId }

declare global {
  interface Window {
    babulfishWebGpuEval: WebGpuEvalApi
  }
}

function performanceMsSince(start: number): number {
  return Math.round(performance.now() - start)
}

function getGpu(): WebGpuEvalGpu | null {
  return (navigator as Navigator & { gpu?: WebGpuEvalGpu }).gpu ?? null
}

function serializeError(errorClass: EvalErrorClass, error: unknown): SerializedError {
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

function timeoutError(label: string, timeoutMs: number): DOMException {
  return new DOMException(`${label} exceeded ${timeoutMs}ms.`, "TimeoutError")
}

function withAbortableTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  label: string,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = timeoutError(label, timeoutMs)
      controller.abort(error)
      reject(error)
    }, timeoutMs)
  })

  return Promise.race([task(controller.signal), timeout]).finally(() => {
    if (timeoutId !== null) clearTimeout(timeoutId)
  })
}

async function inspectWebGpuEnvironment(): Promise<WebGpuEnvironment> {
  const gpu = getGpu()
  const base = getWebGpuEnvironmentBase(gpu)

  if (!window.crossOriginIsolated) {
    throw new Error(
      "The eval page is not cross-origin isolated. Start it through the Vite config with COOP/COEP headers.",
    )
  }

  if (!gpu) {
    throw new Error(
      "navigator.gpu is unavailable. Use a Chromium build with WebGPU enabled.",
    )
  }

  const adapter = await gpu.requestAdapter()
  if (!adapter) {
    throw new Error("navigator.gpu.requestAdapter() returned no adapter.")
  }

  const adapterFeatures = Array.from(adapter.features ?? [])
  let device: WebGpuEvalDevice
  try {
    device = await adapter.requestDevice()
  } catch (error) {
    throw new Error(
      `navigator.gpu.requestAdapter() succeeded, but requestDevice() failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  device.destroy?.()

  return {
    ...base,
    adapterAvailable: true,
    deviceAvailable: true,
    adapterFeatures,
  }
}

function getWebGpuEnvironmentBase(gpu: WebGpuEvalGpu | null = getGpu()): WebGpuEnvironment {
  return {
    userAgent: navigator.userAgent,
    crossOriginIsolated: window.crossOriginIsolated,
    hasNavigatorGpu: gpu !== null,
    adapterAvailable: false,
    deviceAvailable: false,
    adapterFeatures: [],
  } satisfies WebGpuEnvironment
}

function requireModelSpec(
  modelId: WebGpuEvalModelId,
): WebGpuEvalDemoModelSpec {
  const spec = getDemoModelSpecById(modelId)
  if (!spec) throw new Error(`Unknown WebGPU eval model: ${modelId}`)
  if (!spec.allowedDevices.includes("webgpu")) {
    throw new Error(`${spec.label} is not marked as WebGPU-capable in demo metadata.`)
  }
  return spec as WebGpuEvalDemoModelSpec
}

function requiresShaderF16(spec: WebGpuEvalDemoModelSpec): boolean {
  return spec.defaultDType === "q4f16" || spec.defaultDType === "fp16"
}

function assertEnvironmentSupportsModel(
  spec: WebGpuEvalDemoModelSpec,
  environment: WebGpuEnvironment,
): void {
  if (requiresShaderF16(spec) && !environment.adapterFeatures.includes("shader-f16")) {
    throw new Error(
      `${spec.label} uses ${spec.defaultDType}, but the WebGPU adapter does not advertise shader-f16. Use a Chromium/WebGPU device with shader-f16 support before running this eval.`,
    )
  }
}

function createGenerationFailedCase(
  evalCase: WebGpuEvalCase,
  translateMs: number,
  error: SerializedError,
): WebGpuEvalCaseResult {
  const scored = scoreWebGpuEvalGenerationFailure(error.message)

  return {
    id: evalCase.id,
    split: evalCase.split,
    category: evalCase.category,
    sourceText: evalCase.sourceText,
    sourceLanguage: evalCase.sourceLanguage,
    targetLanguage: evalCase.targetLanguage,
    contentType: evalCase.contentType,
    rawOutput: "",
    normalizedOutput: scored.normalizedOutput,
    checks: scored.checks,
    pass: scored.pass,
    score: scored.score,
    scoreBreakdown: scored.scoreBreakdown,
    translateMs,
    error,
  }
}

function createValidationFailedCase(
  evalCase: WebGpuEvalCase,
  rawOutput: string,
  translateMs: number,
  error: SerializedError,
): WebGpuEvalCaseResult {
  const scored = scoreWebGpuEvalValidationFailure(rawOutput, error.message)

  return {
    id: evalCase.id,
    split: evalCase.split,
    category: evalCase.category,
    sourceText: evalCase.sourceText,
    sourceLanguage: evalCase.sourceLanguage,
    targetLanguage: evalCase.targetLanguage,
    contentType: evalCase.contentType,
    rawOutput,
    normalizedOutput: scored.normalizedOutput,
    checks: scored.checks,
    pass: scored.pass,
    score: scored.score,
    scoreBreakdown: scored.scoreBreakdown,
    translateMs,
    error,
  }
}

async function translateDomEvalCase(
  core: ReturnType<typeof createBabulfish>,
  evalCase: WebGpuEvalCase,
  signal: AbortSignal,
): Promise<string> {
  const scope = document.createElement("div")
  const root = document.createElement("div")
  root.setAttribute("data-webgpu-eval-root", "")
  root.innerHTML = evalCase.sourceText
  scope.append(root)

  await core.translateTo(evalCase.targetLanguage, { root: scope, signal })
  return root.innerHTML
}

function translateEvalCase(
  core: ReturnType<typeof createBabulfish>,
  evalCase: WebGpuEvalCase,
  signal: AbortSignal,
): Promise<string> {
  if (evalCase.contentType === "dom") {
    return translateDomEvalCase(core, evalCase, signal)
  }

  return core.translateText(evalCase.sourceText, evalCase.targetLanguage, { signal })
}

async function runEvalCase(
  core: ReturnType<typeof createBabulfish>,
  evalCase: WebGpuEvalCase,
  timeoutMs: number,
): Promise<WebGpuEvalCaseResult> {
  const start = performance.now()
  let rawOutput: string

  try {
    rawOutput = await withAbortableTimeout(
      (signal) => translateEvalCase(core, evalCase, signal),
      `case ${evalCase.id}`,
      timeoutMs,
    )
  } catch (error) {
    return createGenerationFailedCase(
      evalCase,
      performanceMsSince(start),
      serializeError("generation", error),
    )
  }

  try {
    const scored = scoreWebGpuEvalCase(evalCase, rawOutput)

    return {
      id: evalCase.id,
      split: evalCase.split,
      category: evalCase.category,
      sourceText: evalCase.sourceText,
      sourceLanguage: evalCase.sourceLanguage,
      targetLanguage: evalCase.targetLanguage,
      contentType: evalCase.contentType,
      rawOutput,
      normalizedOutput: scored.normalizedOutput,
      checks: scored.checks,
      pass: scored.pass,
      score: scored.score,
      scoreBreakdown: scored.scoreBreakdown,
      translateMs: performanceMsSince(start),
      error: null,
    }
  } catch (error) {
    return createValidationFailedCase(
      evalCase,
      rawOutput,
      performanceMsSince(start),
      serializeError("validation", error),
    )
  }
}

function createLoadFailureResult(
  spec: WebGpuEvalDemoModelSpec,
  environment: WebGpuEnvironment,
  loadMs: number | null,
  error: SerializedError,
): WebGpuEvalModelResult {
  const scoreSummary = scoreWebGpuEvalModel([], `${error.class}: ${error.message}`)

  return {
    modelId: spec.id,
    resolvedModelId: spec.resolvedModelId,
    adapterId: spec.adapterId,
    dtype: spec.defaultDType,
    device: "webgpu",
    subfolder: spec.subfolder,
    modelFileName: spec.modelFileName,
    label: spec.label,
    loadMs,
    cases: [],
    pass: false,
    score: scoreSummary.score,
    scoreBreakdown: scoreSummary.scoreBreakdown,
    failuresByCategory: scoreSummary.failuresByCategory,
    failuresByCheck: scoreSummary.failuresByCheck,
    error,
    environment,
  }
}

async function runModelEval({
  modelId,
  loadTimeoutMs,
  caseTimeoutMs,
}: WebGpuEvalRequest): Promise<WebGpuEvalModelResult> {
  const spec = requireModelSpec(modelId)
  let environment = getWebGpuEnvironmentBase()
  try {
    environment = await inspectWebGpuEnvironment()
    assertEnvironmentSupportsModel(spec, environment)
  } catch (error) {
    return createLoadFailureResult(
      spec,
      environment,
      null,
      serializeError("environment", error),
    )
  }

  const core = createBabulfish({
    engine: {
      model: spec.id,
      device: "webgpu",
      dtype: spec.defaultDType,
    },
    dom: {
      roots: ["[data-webgpu-eval-root]"],
      preserve: {
        matchers: ["babulfish", "TranslateGemma", "WebGPU"],
      },
    },
  })
  const loadStart = performance.now()
  let loadMs: number | null = null

  try {
    await withAbortableTimeout(
      (signal) => core.loadModel({ signal }),
      `load ${spec.id}`,
      loadTimeoutMs,
    )
    loadMs = performanceMsSince(loadStart)

    const { verdict } = core.snapshot.enablement
    if (verdict.resolvedDevice !== "webgpu") {
      throw new Error(
        `Expected WebGPU runtime, got ${verdict.resolvedDevice ?? "none"}: ${verdict.reason}`,
      )
    }

    const cases: WebGpuEvalCaseResult[] = []
    for (const evalCase of WEBGPU_EVAL_CORPUS) {
      const result = await runEvalCase(core, evalCase, caseTimeoutMs)
      cases.push(result)
    }
    const scoreSummary = scoreWebGpuEvalModel(cases)

    return {
      modelId: spec.id,
      resolvedModelId: spec.resolvedModelId,
      adapterId: spec.adapterId,
      dtype: spec.defaultDType,
      device: "webgpu",
      subfolder: spec.subfolder,
      modelFileName: spec.modelFileName,
      label: spec.label,
      loadMs,
      cases,
      pass: cases.every((evalCase) => evalCase.pass),
      score: scoreSummary.score,
      scoreBreakdown: scoreSummary.scoreBreakdown,
      failuresByCategory: scoreSummary.failuresByCategory,
      failuresByCheck: scoreSummary.failuresByCheck,
      error: null,
      environment,
    }
  } catch (error) {
    return createLoadFailureResult(
      spec,
      environment,
      loadMs,
      serializeError("load", error),
    )
  } finally {
    await core.dispose()
  }
}

window.babulfishWebGpuEval = { runModelEval }
