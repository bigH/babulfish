import type { DevicePreference, ResolvedDevice } from "./detect.js"

export type ModelDType = "q4" | "q8" | "fp16" | "fp32"

export const DEFAULT_MODEL_ID = "onnx-community/translategemma-text-4b-it-ONNX"
export const DEFAULT_DTYPE: ModelDType = "q4"
export const DEFAULT_DEVICE_PREFERENCE: DevicePreference = "auto"
export const DEFAULT_RESOLVED_DEVICE: ResolvedDevice = "wasm"
export const DEFAULT_MAX_NEW_TOKENS = 512
export const DEFAULT_SOURCE_LANGUAGE = "en"
