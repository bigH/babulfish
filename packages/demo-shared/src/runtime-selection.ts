import type { DevicePreference, ModelDType } from "../../core/src/index.js"

export type DemoModelPresetId = "translategemma-4b" | "gemma-3-270m-wasm-canary"

export type DemoRuntimeSelection = {
  readonly device: DevicePreference
  readonly modelId: string
  readonly dtype: ModelDType
}

export type DemoRuntimeSelectionInput = {
  readonly device?: string | null
  readonly modelId?: string | null
  readonly dtype?: string | null
  readonly autoload?: string | null
}

export type DemoRuntimeSelectionRepair = {
  readonly code:
    | "invalid-device"
    | "invalid-dtype"
    | "unknown-model"
    | "unsupported-device"
    | "unsupported-dtype"
  readonly message: string
}

export type DemoModelPreset = {
  readonly id: DemoModelPresetId
  readonly label: string
  readonly modelId: string
  readonly description: string
  readonly defaultDType: ModelDType
  readonly allowedDTypes: readonly ModelDType[]
  readonly defaultDevice: DevicePreference
  readonly allowedDevices: readonly DevicePreference[]
  readonly note?: string
}

export type ResolvedDemoRuntimeSelection = {
  readonly preset: DemoModelPreset
  readonly requested: {
    readonly device: string | null
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
  { value: "q8", label: "Q8" },
  { value: "fp16", label: "FP16" },
  { value: "fp32", label: "FP32" },
] as const satisfies readonly {
  readonly value: ModelDType
  readonly label: string
}[]

export const DEMO_MODEL_PRESETS = [
  {
    id: "translategemma-4b",
    label: "TranslateGemma 4B",
    modelId: "onnx-community/translategemma-text-4b-it-ONNX",
    description: "The default first-party demo model.",
    defaultDType: "q4",
    allowedDTypes: ["q4", "q8", "fp16", "fp32"],
    defaultDevice: "auto",
    allowedDevices: ["auto", "wasm", "webgpu"],
    note: "Default demo path. Auto can resolve to WebGPU or WASM.",
  },
  {
    id: "gemma-3-270m-wasm-canary",
    label: "Gemma 3 270M canary",
    modelId: "onnx-community/gemma-3-270m-it-ONNX",
    description: "Small WASM canary for the Session 1 runtime path.",
    defaultDType: "fp32",
    allowedDTypes: ["fp32"],
    defaultDevice: "wasm",
    allowedDevices: ["wasm"],
    note: "Verified demo baseline: WASM + FP32 only.",
  },
] as const satisfies readonly DemoModelPreset[]

const DEFAULT_PRESET = DEMO_MODEL_PRESETS[0]
const VALID_DEVICES = new Set<DevicePreference>(["auto", "wasm", "webgpu"])
const VALID_DTYPES = new Set<ModelDType>(["q4", "q8", "fp16", "fp32"])
const RUNTIME_PARAM_KEYS = ["device", "modelId", "dtype", "autoload"] as const

function normalizeRequestedValue(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function getDefaultDemoRuntimeSelection(): DemoRuntimeSelection {
  return {
    device: DEFAULT_PRESET.defaultDevice,
    modelId: DEFAULT_PRESET.modelId,
    dtype: DEFAULT_PRESET.defaultDType,
  }
}

export function getDemoModelPresetById(id: DemoModelPresetId): DemoModelPreset {
  const preset = DEMO_MODEL_PRESETS.find((entry) => entry.id === id)
  if (!preset) {
    throw new Error(`Unknown demo runtime preset: ${id}`)
  }
  return preset
}

export function getDemoModelPresetByModelId(modelId: string): DemoModelPreset | undefined {
  return DEMO_MODEL_PRESETS.find((entry) => entry.modelId === modelId)
}

export function getDeviceLabel(device: DevicePreference): string {
  return DEVICE_OPTIONS.find((entry) => entry.value === device)?.label ?? device
}

export function getDTypeLabel(dtype: ModelDType): string {
  return DTYPE_OPTIONS.find((entry) => entry.value === dtype)?.label ?? dtype
}

export function createDemoRuntimeSelectionKey(selection: DemoRuntimeSelection): string {
  return [selection.modelId, selection.dtype, selection.device].join("|")
}

export function resolveDemoRuntimeSelection(
  input: DemoRuntimeSelectionInput,
): ResolvedDemoRuntimeSelection {
  const repairs: DemoRuntimeSelectionRepair[] = []
  const requested = {
    device: normalizeRequestedValue(input.device),
    modelId: normalizeRequestedValue(input.modelId),
    dtype: normalizeRequestedValue(input.dtype),
    autoload: input.autoload === "1",
  }
  const rawModelId = requested.modelId
  const preset = rawModelId
    ? getDemoModelPresetByModelId(rawModelId) ?? DEFAULT_PRESET
    : DEFAULT_PRESET

  if (rawModelId && preset.modelId !== rawModelId) {
    repairs.push({
      code: "unknown-model",
      message: `Model ${rawModelId} is not in the first-party demo catalog. Using ${DEFAULT_PRESET.label}.`,
    })
  }

  const rawDevice = requested.device
  let device: DevicePreference = preset.defaultDevice
  if (rawDevice) {
    if (VALID_DEVICES.has(rawDevice as DevicePreference)) {
      device = rawDevice as DevicePreference
    } else {
      repairs.push({
        code: "invalid-device",
        message: `Device ${rawDevice} is not valid. Using ${getDeviceLabel(preset.defaultDevice)}.`,
      })
    }
  }

  if (!preset.allowedDevices.includes(device)) {
    repairs.push({
      code: "unsupported-device",
      message: `${preset.label} is only verified for ${preset.allowedDevices.map(getDeviceLabel).join(" / ")}. Using ${getDeviceLabel(preset.defaultDevice)}.`,
    })
    device = preset.defaultDevice
  }

  const rawDType = requested.dtype
  let dtype: ModelDType = preset.defaultDType
  if (rawDType) {
    if (VALID_DTYPES.has(rawDType as ModelDType)) {
      dtype = rawDType as ModelDType
    } else {
      repairs.push({
        code: "invalid-dtype",
        message: `Quantization ${rawDType} is not valid. Using ${getDTypeLabel(preset.defaultDType)}.`,
      })
    }
  }

  if (!preset.allowedDTypes.includes(dtype)) {
    repairs.push({
      code: "unsupported-dtype",
      message: `${preset.label} is only verified for ${preset.allowedDTypes.map(getDTypeLabel).join(" / ")}. Using ${getDTypeLabel(preset.defaultDType)}.`,
    })
    dtype = preset.defaultDType
  }

  return {
    preset,
    requested,
    selection: {
      device,
      modelId: preset.modelId,
      dtype,
    },
    autoload: requested.autoload,
    repairs,
  }
}

export function resolveDemoRuntimeSelectionFromSearchParams(
  searchParams: URLSearchParams,
): ResolvedDemoRuntimeSelection {
  return resolveDemoRuntimeSelection({
    device: searchParams.get("device"),
    modelId: searchParams.get("modelId"),
    dtype: searchParams.get("dtype"),
    autoload: searchParams.get("autoload"),
  })
}

export function createDemoRuntimeSearchParams(
  state: DemoRuntimeSelectionState,
): URLSearchParams {
  const params = new URLSearchParams()
  const defaults = getDefaultDemoRuntimeSelection()

  if (state.selection.device !== defaults.device) {
    params.set("device", state.selection.device)
  }
  if (state.selection.modelId !== defaults.modelId) {
    params.set("modelId", state.selection.modelId)
  }
  if (state.selection.dtype !== defaults.dtype) {
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
  patch: Partial<DemoRuntimeSelection> & { readonly autoload?: boolean },
): ResolvedDemoRuntimeSelection {
  const autoload = patch.autoload ?? current.autoload

  return resolveDemoRuntimeSelection({
    device: patch.device ?? current.selection.device,
    modelId: patch.modelId ?? current.selection.modelId,
    dtype: patch.dtype ?? current.selection.dtype,
    autoload: autoload ? "1" : "0",
  })
}
