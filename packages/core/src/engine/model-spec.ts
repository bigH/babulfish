import type { ModelDType } from "./config.js"
import type { DevicePreference } from "./detect.js"
import type { ModelProfileInput, ProbeMode } from "./runtime-plan.js"
import type { TranslationAdapter } from "./translation-adapter.js"

export type BuiltinTranslationModelId =
  | "translategemma-4"
  | "qwen-3-0.6b"
  | "gemma-3-1b-it"

export type TranslationModelSelection = BuiltinTranslationModelId | TranslationModelSpec

export type TranslationModelSpec = {
  readonly id: string
  readonly label: string
  readonly modelId: string
  readonly adapter: TranslationAdapter
  readonly defaults?: {
    readonly dtype?: ModelDType
    readonly device?: "webgpu" | "wasm" | "auto"
    readonly maxNewTokens?: number
    readonly subfolder?: string
    readonly modelFileName?: string
  }
}

export type RuntimeModelRequest = {
  readonly kind: "default" | "legacy-model-id" | "builtin" | "custom"
  readonly id: string
  readonly modelIdOverride: string | null
}

export type ResolvedTranslationModel = {
  readonly id: string
  readonly label: string
  readonly modelId: string
  readonly adapterId: string
  readonly subfolder: string | null
  readonly modelFileName: string | null
  readonly warnings: readonly string[]
}

export type ResolvedTranslationModelSpec = ResolvedTranslationModel & {
  readonly adapter: TranslationAdapter
  readonly dtype: ModelDType
  readonly device: DevicePreference
  readonly maxNewTokens: number
  readonly sourceLanguage: string
  readonly modelProfile: ModelProfileInput | null
  readonly probe: ProbeMode
}
