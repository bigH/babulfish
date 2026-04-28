import type {
  BabulfishEngineConfig,
  BuiltinTranslationModelId,
  DevicePreference,
  ModelDType,
} from "../../core/src/index.js"

export type DemoModelSpecId = BuiltinTranslationModelId
export type DemoModelPresetId = DemoModelSpecId
export type DemoRuntimeDevice = DevicePreference
export type DemoRuntimeDType = ModelDType

export type DemoSelectedModel = {
  readonly id: DemoModelSpecId
  readonly label: string
  readonly resolvedModelId: string
  readonly adapterId: string
  readonly subfolder: string | null
  readonly modelFileName: string | null
  readonly modelId: string
}

export type DemoRuntimeSelection = {
  readonly device: DevicePreference
  readonly model: DemoSelectedModel
  readonly modelId: string
  readonly dtype: ModelDType
}

export type DemoRuntimeSelectionInput = {
  readonly device?: string | null
  readonly model?: string | null
  readonly modelId?: string | null
  readonly dtype?: string | null
  readonly autoload?: string | boolean | null
}

export type DemoRuntimeSelectionPatch = {
  readonly device?: string | null
  readonly model?: string | DemoSelectedModel | null
  readonly modelId?: string | null
  readonly dtype?: string | null
  readonly autoload?: boolean
}

export type DemoRuntimeSelectionRepair = {
  readonly code:
    | "ambiguous-model-id"
    | "invalid-device"
    | "invalid-dtype"
    | "legacy-model-id-ignored"
    | "unknown-model"
    | "unsupported-device"
    | "unsupported-dtype"
  readonly message: string
}

export type DemoModelSpec = {
  readonly id: DemoModelSpecId
  readonly label: string
  readonly resolvedModelId: string
  readonly modelId: string
  readonly adapterId: string
  readonly description: string
  readonly defaultDType: ModelDType
  readonly allowedDTypes: readonly ModelDType[]
  readonly defaultDevice: DevicePreference
  readonly allowedDevices: readonly DevicePreference[]
  readonly subfolder: string | null
  readonly modelFileName: string | null
  readonly note?: string
}

export type DemoModelPreset = DemoModelSpec

export type ResolvedDemoRuntimeSelection = {
  readonly model: DemoModelSpec
  readonly preset: DemoModelSpec
  readonly requested: {
    readonly device: string | null
    readonly model: string | null
    readonly modelId: string | null
    readonly dtype: string | null
    readonly autoload: boolean
  }
  readonly selection: DemoRuntimeSelection
  readonly autoload: boolean
  readonly repairs: readonly DemoRuntimeSelectionRepair[]
}

export type DemoRuntimeSelectionState = Pick<
  ResolvedDemoRuntimeSelection,
  "selection" | "autoload"
>

export const DEVICE_OPTIONS = [
  {
    value: "auto",
    label: "Auto",
    helpText: "Let babulfish resolve the runtime from the current browser and device.",
  },
  {
    value: "wasm",
    label: "WASM",
    helpText: "Force the CPU/WASM path.",
  },
  {
    value: "webgpu",
    label: "WebGPU",
    helpText: "Require WebGPU. babulfish will deny the load if it cannot use it.",
  },
] as const satisfies readonly {
  readonly value: DevicePreference
  readonly label: string
  readonly helpText: string
}[]

export const DTYPE_OPTIONS = [
  { value: "q4", label: "Q4" },
  { value: "q4f16", label: "Q4F16" },
  { value: "q8", label: "Q8" },
  { value: "fp16", label: "FP16" },
  { value: "fp32", label: "FP32" },
] as const satisfies readonly {
  readonly value: ModelDType
  readonly label: string
}[]

const DEMO_MODEL_SPEC_RECORD = Object.freeze({
  "translategemma-4": {
    id: "translategemma-4",
    label: "TranslateGemma 4B",
    resolvedModelId: "onnx-community/translategemma-text-4b-it-ONNX",
    modelId: "onnx-community/translategemma-text-4b-it-ONNX",
    adapterId: "translategemma",
    description: "The default first-party translation model.",
    defaultDType: "q4",
    allowedDTypes: ["q4", "q8", "fp16", "fp32"],
    defaultDevice: "auto",
    allowedDevices: ["auto", "wasm", "webgpu"],
    subfolder: null,
    modelFileName: null,
    note: "Default demo path. Auto can resolve to WebGPU or WASM.",
  },
  "qwen-3-0.6b": {
    id: "qwen-3-0.6b",
    label: "Qwen 3 0.6B",
    resolvedModelId: "onnx-community/Qwen3-0.6B-ONNX",
    modelId: "onnx-community/Qwen3-0.6B-ONNX",
    adapterId: "qwen-3-0.6b-chat",
    description: "Compact WebGPU translation model.",
    defaultDType: "q4f16",
    allowedDTypes: ["q4f16"],
    defaultDevice: "webgpu",
    allowedDevices: ["webgpu"],
    subfolder: "onnx",
    modelFileName: "model",
    note: "Verified for WebGPU + Q4F16.",
  },
  "gemma-3-1b-it": {
    id: "gemma-3-1b-it",
    label: "Gemma 3 1B IT",
    resolvedModelId: "onnx-community/gemma-3-1b-it-ONNX",
    modelId: "onnx-community/gemma-3-1b-it-ONNX",
    adapterId: "gemma-3-1b-it-chat",
    description: "Gemma WebGPU translation model.",
    defaultDType: "q4f16",
    allowedDTypes: ["q4f16"],
    defaultDevice: "webgpu",
    allowedDevices: ["webgpu"],
    subfolder: "onnx",
    modelFileName: "model",
    note: "Verified for WebGPU + Q4F16.",
  },
} satisfies Record<BuiltinTranslationModelId, DemoModelSpec>)

export const DEMO_MODEL_SPECS = Object.freeze(
  Object.values(DEMO_MODEL_SPEC_RECORD),
)

export const DEMO_MODEL_PRESETS = DEMO_MODEL_SPECS

const DEFAULT_MODEL_SPEC: DemoModelSpec = DEMO_MODEL_SPEC_RECORD["translategemma-4"]
const VALID_DEVICES = new Set<DevicePreference>(["auto", "wasm", "webgpu"])
const VALID_DTYPES = new Set<ModelDType>(["q4", "q4f16", "q8", "fp16", "fp32"])
const RUNTIME_PARAM_KEYS = ["device", "model", "modelId", "dtype", "autoload"] as const

function normalizeRequestedValue(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeAutoload(value?: string | boolean | null): boolean {
  return typeof value === "boolean" ? value : normalizeRequestedValue(value) === "1"
}

function findDemoModelSpecById(id: string): DemoModelSpec | undefined {
  return DEMO_MODEL_SPECS.find((entry) => entry.id === id)
}

function findDemoModelSpecsByResolvedModelId(modelId: string): readonly DemoModelSpec[] {
  return DEMO_MODEL_SPECS.filter((entry) => entry.resolvedModelId === modelId)
}

function toSelectedModel(spec: DemoModelSpec): DemoSelectedModel {
  return {
    id: spec.id,
    label: spec.label,
    resolvedModelId: spec.resolvedModelId,
    adapterId: spec.adapterId,
    subfolder: spec.subfolder,
    modelFileName: spec.modelFileName,
    modelId: spec.resolvedModelId,
  }
}

function createSelection(
  spec: DemoModelSpec,
  device: DevicePreference,
  dtype: ModelDType,
): DemoRuntimeSelection {
  return {
    device,
    model: toSelectedModel(spec),
    modelId: spec.resolvedModelId,
    dtype,
  }
}

function resolveModelSpec(
  requestedModel: string | null,
  requestedModelId: string | null,
  repairs: DemoRuntimeSelectionRepair[],
): DemoModelSpec {
  if (requestedModel) {
    const model = findDemoModelSpecById(requestedModel)
    if (!model) {
      repairs.push({
        code: "unknown-model",
        message: `Model ${requestedModel} is not in the first-party demo catalog. Using ${DEFAULT_MODEL_SPEC.label}.`,
      })
      return DEFAULT_MODEL_SPEC
    }

    if (requestedModelId && requestedModelId !== model.resolvedModelId) {
      repairs.push({
        code: "legacy-model-id-ignored",
        message: `Canonical model ${model.id} overrides legacy modelId ${requestedModelId}.`,
      })
    }

    return model
  }

  if (!requestedModelId) {
    return DEFAULT_MODEL_SPEC
  }

  const matches = findDemoModelSpecsByResolvedModelId(requestedModelId)
  if (matches.length === 1) {
    return matches[0] ?? DEFAULT_MODEL_SPEC
  }

  repairs.push(
    matches.length > 1
      ? {
          code: "ambiguous-model-id",
          message: `Legacy modelId ${requestedModelId} matches multiple demo models. Using ${DEFAULT_MODEL_SPEC.label}.`,
        }
      : {
          code: "unknown-model",
          message: `Model ${requestedModelId} is not in the first-party demo catalog. Using ${DEFAULT_MODEL_SPEC.label}.`,
        },
  )
  return DEFAULT_MODEL_SPEC
}

function resolveDevice(
  requestedDevice: string | null,
  spec: DemoModelSpec,
  repairs: DemoRuntimeSelectionRepair[],
): DevicePreference {
  if (!requestedDevice) return spec.defaultDevice

  if (!VALID_DEVICES.has(requestedDevice as DevicePreference)) {
    repairs.push({
      code: "invalid-device",
      message: `Device ${requestedDevice} is not valid. Using ${getDeviceLabel(spec.defaultDevice)}.`,
    })
    return spec.defaultDevice
  }

  const device = requestedDevice as DevicePreference
  if (spec.allowedDevices.includes(device)) return device

  repairs.push({
    code: "unsupported-device",
    message: `${spec.label} is only verified for ${spec.allowedDevices.map(getDeviceLabel).join(" / ")}. Using ${getDeviceLabel(spec.defaultDevice)}.`,
  })
  return spec.defaultDevice
}

function resolveDType(
  requestedDType: string | null,
  spec: DemoModelSpec,
  repairs: DemoRuntimeSelectionRepair[],
): ModelDType {
  if (!requestedDType) return spec.defaultDType

  if (!VALID_DTYPES.has(requestedDType as ModelDType)) {
    repairs.push({
      code: "invalid-dtype",
      message: `Quantization ${requestedDType} is not valid. Using ${getDTypeLabel(spec.defaultDType)}.`,
    })
    return spec.defaultDType
  }

  const dtype = requestedDType as ModelDType
  if (spec.allowedDTypes.includes(dtype)) return dtype

  repairs.push({
    code: "unsupported-dtype",
    message: `${spec.label} is only verified for ${spec.allowedDTypes.map(getDTypeLabel).join(" / ")}. Using ${getDTypeLabel(spec.defaultDType)}.`,
  })
  return spec.defaultDType
}

function getModelPatchValue(
  model: DemoRuntimeSelectionPatch["model"],
): string | null | undefined {
  if (model === undefined) return undefined
  if (model === null) return null
  return typeof model === "string" ? model : model.id
}

export function getDefaultDemoRuntimeSelection(): DemoRuntimeSelection {
  return createSelection(
    DEFAULT_MODEL_SPEC,
    DEFAULT_MODEL_SPEC.defaultDevice,
    DEFAULT_MODEL_SPEC.defaultDType,
  )
}

export function getDemoModelSpecById(id: string): DemoModelSpec | undefined {
  return findDemoModelSpecById(id)
}

export function getDemoModelPresetById(id: DemoModelPresetId): DemoModelPreset {
  const preset = findDemoModelSpecById(id)
  if (!preset) {
    throw new Error(`Unknown demo runtime preset: ${id}`)
  }
  return preset
}

export function getDemoModelSpecByResolvedModelId(
  modelId: string,
): DemoModelSpec | undefined {
  const matches = findDemoModelSpecsByResolvedModelId(modelId)
  return matches.length === 1 ? matches[0] : undefined
}

export function getDemoModelPresetByModelId(modelId: string): DemoModelPreset | undefined {
  return getDemoModelSpecByResolvedModelId(modelId)
}

export function getDeviceLabel(device: DevicePreference): string {
  return DEVICE_OPTIONS.find((entry) => entry.value === device)?.label ?? device
}

export function getDTypeLabel(dtype: ModelDType): string {
  return DTYPE_OPTIONS.find((entry) => entry.value === dtype)?.label ?? dtype
}

export function createDemoRuntimeSelectionKey(selection: DemoRuntimeSelection): string {
  return [
    `model:${selection.model.id}`,
    `resolved:${selection.model.resolvedModelId}`,
    `adapter:${selection.model.adapterId}`,
    `dtype:${selection.dtype}`,
    `device:${selection.device}`,
  ].join("|")
}

export function toBabulfishEngineConfig(
  selection: DemoRuntimeSelection,
): BabulfishEngineConfig {
  return {
    model: selection.model.id,
    dtype: selection.dtype,
    device: selection.device,
  }
}

export function resolveDemoRuntimeSelection(
  input: DemoRuntimeSelectionInput,
): ResolvedDemoRuntimeSelection {
  const repairs: DemoRuntimeSelectionRepair[] = []
  const requested = {
    device: normalizeRequestedValue(input.device),
    model: normalizeRequestedValue(input.model),
    modelId: normalizeRequestedValue(input.modelId),
    dtype: normalizeRequestedValue(input.dtype),
    autoload: normalizeAutoload(input.autoload),
  }
  const model = resolveModelSpec(requested.model, requested.modelId, repairs)
  const device = resolveDevice(requested.device, model, repairs)
  const dtype = resolveDType(requested.dtype, model, repairs)

  return {
    model,
    preset: model,
    requested,
    selection: createSelection(model, device, dtype),
    autoload: requested.autoload,
    repairs,
  }
}

export function resolveDemoRuntimeSelectionFromSearchParams(
  searchParams: URLSearchParams,
): ResolvedDemoRuntimeSelection {
  return resolveDemoRuntimeSelection({
    device: searchParams.get("device"),
    model: searchParams.get("model"),
    modelId: searchParams.get("modelId"),
    dtype: searchParams.get("dtype"),
    autoload: searchParams.get("autoload"),
  })
}

export function createDemoRuntimeSearchParams(
  state: DemoRuntimeSelectionState,
): URLSearchParams {
  const params = new URLSearchParams()
  const selectedModel = getDemoModelSpecById(state.selection.model.id) ?? DEFAULT_MODEL_SPEC

  if (selectedModel.id !== DEFAULT_MODEL_SPEC.id) {
    params.set("model", selectedModel.id)
  }
  if (state.selection.device !== selectedModel.defaultDevice) {
    params.set("device", state.selection.device)
  }
  if (state.selection.dtype !== selectedModel.defaultDType) {
    params.set("dtype", state.selection.dtype)
  }
  if (state.autoload) {
    params.set("autoload", "1")
  }

  return params
}

export function mergeDemoRuntimeSearchParams(
  currentParams: URLSearchParams,
  state: DemoRuntimeSelectionState,
): URLSearchParams {
  const nextParams = new URLSearchParams(currentParams)
  for (const key of RUNTIME_PARAM_KEYS) {
    nextParams.delete(key)
  }

  const runtimeParams = createDemoRuntimeSearchParams(state)
  runtimeParams.forEach((value, key) => {
    nextParams.set(key, value)
  })

  return nextParams
}

export function mergeDemoRuntimeSelection(
  current: DemoRuntimeSelectionState,
  patch: DemoRuntimeSelectionPatch,
): ResolvedDemoRuntimeSelection {
  const autoload = patch.autoload ?? current.autoload
  const patchedModel = getModelPatchValue(patch.model)
  const model =
    patchedModel !== undefined
      ? patchedModel
      : patch.modelId === undefined
        ? current.selection.model.id
        : undefined

  return resolveDemoRuntimeSelection({
    device: patch.device ?? current.selection.device,
    model,
    modelId: patch.modelId,
    dtype: patch.dtype ?? current.selection.dtype,
    autoload,
  })
}
