import {
  DEFAULT_DEVICE_PREFERENCE,
  DEFAULT_DTYPE,
  DEFAULT_MAX_NEW_TOKENS,
  DEFAULT_MODEL_ID,
  DEFAULT_SOURCE_LANGUAGE,
  DEFAULT_TRANSLATION_MODEL_ID,
  type ModelDType,
} from "./config.js"
import type { DevicePreference } from "./detect.js"
import {
  gemma3ChatAdapter,
  qwen25ChatAdapter,
  qwen3ChatAdapter,
} from "./adapters/chat.js"
import { translateGemmaAdapter } from "./adapters/translategemma.js"
import type {
  BuiltinTranslationModelId,
  ResolvedTranslationModel,
  ResolvedTranslationModelSpec,
  RuntimeModelRequest,
  TranslationModelSelection,
  TranslationModelSpec,
} from "./model-spec.js"
import type { ModelProfileInput, ProbeMode } from "./runtime-plan.js"
import type { TranslationAdapter } from "./translation-adapter.js"

type NormalizedTranslationModelSpec = {
  readonly id: string
  readonly label: string
  readonly modelId: string
  readonly adapter: TranslationAdapter
  readonly dtype: ModelDType
  readonly device: DevicePreference
  readonly maxNewTokens: number
  readonly sourceLanguage: string
  readonly subfolder: string | null
  readonly modelFileName: string | null
  readonly modelProfile: ModelProfileInput | null
  readonly probe: ProbeMode
}

type BuiltinTranslationModelSpec = NormalizedTranslationModelSpec & {
  readonly id: BuiltinTranslationModelId
}

export type TranslationModelResolveInput = {
  readonly model?: TranslationModelSelection
  readonly modelId?: string
  readonly dtype?: ModelDType
  readonly device?: DevicePreference
  readonly maxNewTokens?: number
  readonly sourceLanguage?: string
}

export type ResolvedTranslationModelConfig = ResolvedTranslationModelSpec & {
  readonly requestedModel: RuntimeModelRequest
  readonly resolvedModel: ResolvedTranslationModel
  readonly modelId: string
  readonly adapterId: string
  readonly warnings: readonly string[]
}

const UNKNOWN_WEBGPU_PROFILE_NOTE =
  "No maintained working-set estimate is shipped for this model yet. " +
  "Use the adapter smoke probe to verify WebGPU compatibility."

function unknownWebGPUModelProfile(id: BuiltinTranslationModelId): ModelProfileInput {
  return Object.freeze({
    id: `${id}-q4f16`,
    version: "2026-04-24",
    estimatedWorkingSetGiB: null,
    note: UNKNOWN_WEBGPU_PROFILE_NOTE,
  })
}

const BUILTIN_MODELS = Object.freeze({
  "translategemma-4": Object.freeze({
    id: "translategemma-4",
    label: "TranslateGemma 4B",
    modelId: DEFAULT_MODEL_ID,
    adapter: translateGemmaAdapter,
    dtype: DEFAULT_DTYPE,
    device: DEFAULT_DEVICE_PREFERENCE,
    maxNewTokens: DEFAULT_MAX_NEW_TOKENS,
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    subfolder: null,
    modelFileName: null,
    modelProfile: null,
    probe: "off",
  }),
  "qwen-2.5-0.5b": Object.freeze({
    id: "qwen-2.5-0.5b",
    label: "Qwen 2.5 0.5B Instruct",
    modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
    adapter: qwen25ChatAdapter,
    dtype: "q4f16",
    device: "webgpu",
    maxNewTokens: 256,
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    subfolder: "onnx",
    modelFileName: "model",
    modelProfile: unknownWebGPUModelProfile("qwen-2.5-0.5b"),
    probe: "if-needed",
  }),
  "qwen-3-0.6b": Object.freeze({
    id: "qwen-3-0.6b",
    label: "Qwen 3 0.6B",
    modelId: "onnx-community/Qwen3-0.6B-ONNX",
    adapter: qwen3ChatAdapter,
    dtype: "q4f16",
    device: "webgpu",
    maxNewTokens: 256,
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    subfolder: "onnx",
    modelFileName: "model",
    modelProfile: unknownWebGPUModelProfile("qwen-3-0.6b"),
    probe: "if-needed",
  }),
  "gemma-3-1b-it": Object.freeze({
    id: "gemma-3-1b-it",
    label: "Gemma 3 1B IT",
    modelId: "onnx-community/gemma-3-1b-it-ONNX",
    adapter: gemma3ChatAdapter,
    dtype: "q4f16",
    device: "webgpu",
    maxNewTokens: 256,
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    subfolder: "onnx",
    modelFileName: "model",
    modelProfile: unknownWebGPUModelProfile("gemma-3-1b-it"),
    probe: "if-needed",
  }),
} satisfies Record<BuiltinTranslationModelId, BuiltinTranslationModelSpec>)

const MODEL_DTYPES = new Set<ModelDType>(["q4", "q4f16", "q8", "fp16", "fp32"])
const DEVICE_PREFERENCES = new Set<DevicePreference>(["auto", "webgpu", "wasm"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function hasBuiltinModel(id: string): id is BuiltinTranslationModelId {
  return id in BUILTIN_MODELS
}

function isTranslationAdapter(value: unknown): value is TranslationAdapter {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.validateOptions === "function" &&
    typeof value.buildInvocation === "function" &&
    typeof value.extractText === "function"
  )
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid translation model spec: ${label} must be a non-empty string.`)
  }
}

function resolveDType(value: string | undefined, fallback: ModelDType): ModelDType {
  if (value === undefined) return fallback
  if (!MODEL_DTYPES.has(value as ModelDType)) {
    throw new Error(`Unknown model dtype: ${value}`)
  }
  return value as ModelDType
}

function resolveDevice(
  value: DevicePreference | undefined,
  fallback: DevicePreference,
): DevicePreference {
  if (value === undefined) return fallback
  if (!DEVICE_PREFERENCES.has(value)) {
    throw new Error(`Unknown device preference: ${String(value)}`)
  }
  return value
}

function normalizeCustomSpec(spec: TranslationModelSpec): NormalizedTranslationModelSpec {
  assertNonEmptyString(spec.id, "id")
  assertNonEmptyString(spec.label, "label")
  assertNonEmptyString(spec.modelId, "modelId")

  if (!isTranslationAdapter(spec.adapter)) {
    throw new Error("Invalid translation model spec: adapter must be a translation adapter object.")
  }

  return Object.freeze({
    id: spec.id,
    label: spec.label,
    modelId: spec.modelId,
    adapter: spec.adapter,
    dtype: resolveDType(spec.defaults?.dtype, DEFAULT_DTYPE),
    device: resolveDevice(spec.defaults?.device, DEFAULT_DEVICE_PREFERENCE),
    maxNewTokens: spec.defaults?.maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS,
    sourceLanguage: DEFAULT_SOURCE_LANGUAGE,
    subfolder: spec.defaults?.subfolder ?? null,
    modelFileName: spec.defaults?.modelFileName ?? null,
    modelProfile: null,
    probe: "off",
  })
}

function createModelIdOverrideWarning(modelId: string): string {
  return (
    `engine.modelId overrides the selected model repo with ${modelId}. ` +
    "Adapter defaults still come from engine.model."
  )
}

function selectModel(
  selection: TranslationModelSelection | undefined,
): {
  readonly spec: NormalizedTranslationModelSpec
  readonly requestedModel: RuntimeModelRequest
} {
  if (selection === undefined) {
    return {
      spec: BUILTIN_MODELS[DEFAULT_TRANSLATION_MODEL_ID],
      requestedModel: {
        kind: "default",
        id: DEFAULT_TRANSLATION_MODEL_ID,
        modelIdOverride: null,
      },
    }
  }

  if (typeof selection === "string") {
    if (!hasBuiltinModel(selection)) {
      throw new Error(`Unknown translation model: ${selection}`)
    }

    return {
      spec: BUILTIN_MODELS[selection],
      requestedModel: {
        kind: "builtin",
        id: selection,
        modelIdOverride: null,
      },
    }
  }

  if (!isRecord(selection)) {
    throw new Error("Invalid translation model spec.")
  }

  const spec = normalizeCustomSpec(selection)
  return {
    spec,
    requestedModel: {
      kind: "custom",
      id: spec.id,
      modelIdOverride: null,
    },
  }
}

export function resolveTranslationModelConfig(
  config?: TranslationModelResolveInput,
): ResolvedTranslationModelConfig {
  const { spec, requestedModel } = selectModel(config?.model)
  const modelId = config?.modelId ?? spec.modelId
  const hasModelIdOverride = config?.modelId !== undefined
  const request =
    config?.model === undefined && hasModelIdOverride
      ? {
          kind: "legacy-model-id" as const,
          id: DEFAULT_TRANSLATION_MODEL_ID,
          modelIdOverride: config.modelId,
        }
      : {
          ...requestedModel,
          modelIdOverride: config?.modelId ?? requestedModel.modelIdOverride,
        }

  const overrideWarnings =
    config?.model !== undefined && hasModelIdOverride
      ? [createModelIdOverrideWarning(config.modelId)]
      : []

  const dtype = resolveDType(config?.dtype, spec.dtype)
  const device = resolveDevice(config?.device, spec.device)
  const maxNewTokens = config?.maxNewTokens ?? spec.maxNewTokens
  const sourceLanguage = config?.sourceLanguage ?? spec.sourceLanguage
  const optionIssues = spec.adapter.validateOptions({ max_new_tokens: maxNewTokens })

  if (optionIssues.errors.length > 0) {
    throw new Error(optionIssues.errors.join(" "))
  }

  const warnings = Object.freeze([...overrideWarnings, ...optionIssues.warnings])
  const resolvedModel: ResolvedTranslationModel = Object.freeze({
    id: spec.id,
    label: spec.label,
    modelId,
    adapterId: spec.adapter.id,
    subfolder: spec.subfolder,
    modelFileName: spec.modelFileName,
    warnings,
  })

  return Object.freeze({
    ...resolvedModel,
    adapter: spec.adapter,
    dtype,
    device,
    maxNewTokens,
    sourceLanguage,
    modelProfile: spec.modelProfile,
    probe: spec.probe,
    requestedModel: Object.freeze(request),
    resolvedModel,
    modelId,
    adapterId: spec.adapter.id,
    warnings,
  })
}
