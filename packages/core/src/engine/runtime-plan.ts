import type { CapabilityObservation } from "../core/capabilities.js"
import {
  DEFAULT_DEVICE_PREFERENCE,
  DEFAULT_DTYPE,
  DEFAULT_MAX_NEW_TOKENS,
  DEFAULT_MODEL_ID,
  DEFAULT_SOURCE_LANGUAGE,
  type ModelDType,
} from "./config.js"
import type { DevicePreference, ResolvedDevice } from "./detect.js"

export type ModelProfile = {
  readonly id: string
  readonly version: string
  readonly modelId: string
  readonly dtype: ModelDType
  readonly estimatedWorkingSetGiB: number | null
  readonly note: string
}

export type ModelProfileInput = {
  readonly id?: string
  readonly version?: string
  readonly estimatedWorkingSetGiB: number | null
  readonly note?: string
}

export type EnablementConfig = {
  readonly policy?: "default"
  readonly modelProfile?: "auto" | ModelProfileInput
}

export type RuntimePreferenceConfig = {
  readonly modelId?: string
  readonly dtype?: ModelDType
  readonly device?: DevicePreference
  readonly maxNewTokens?: number
  readonly sourceLanguage?: string
  readonly enablement?: EnablementConfig
}

type NormalizedRuntimePreferenceConfig = {
  readonly modelId: string
  readonly dtype: ModelDType
  readonly device: DevicePreference
  readonly maxNewTokens: number
  readonly sourceLanguage: string
  readonly enablement: Required<EnablementConfig>
}

export type FitInference = {
  readonly outcome: "likely-fit" | "likely-no-fit" | "unknown"
  readonly basis: "system-memory-heuristic"
  readonly expectedModelMemoryGiB: number | null
  readonly approxDeviceMemoryGiB: number | null
  readonly note: string
}

export type EnablementVerdict =
  | {
      readonly outcome: "unknown"
      readonly resolvedDevice: null
      readonly reason: string
    }
  | {
      readonly outcome: "denied"
      readonly resolvedDevice: null
      readonly reason: string
    }
  | {
      readonly outcome: "gpu-preferred"
      readonly resolvedDevice: "webgpu"
      readonly reason: string
    }
  | {
      readonly outcome: "wasm-only"
      readonly resolvedDevice: "wasm"
      readonly reason: string
    }

export type EnablementState = {
  readonly status: "idle" | "assessing" | "ready" | "error"
  readonly modelProfile: ModelProfile | null
  readonly inference: FitInference | null
  readonly verdict: EnablementVerdict
}

export type ResolvedRuntimePlan = {
  readonly modelId: string
  readonly dtype: ModelDType
  readonly resolvedDevice: ResolvedDevice
  readonly sourceLanguage: string
  readonly maxNewTokens: number
}

export type EnablementAssessment = {
  readonly modelProfile: ModelProfile | null
  readonly inference: FitInference | null
  readonly verdict: EnablementVerdict
  readonly runtimePlan: ResolvedRuntimePlan | null
}

export type EnablementCompat = {
  readonly capabilitiesReady: boolean
  readonly canTranslate: boolean
  readonly device: ResolvedDevice | null
}

const BUILTIN_MODEL_PROFILES = Object.freeze([
  Object.freeze({
    id: "translategemma-text-4b-it-onnx-q4",
    version: "2026-04-16",
    modelId: DEFAULT_MODEL_ID,
    dtype: "q4",
    estimatedWorkingSetGiB: 6,
    note:
      "Approximate working-set estimate for the Session 1 system-memory heuristic. Not VRAM.",
  }),
  Object.freeze({
    id: "translategemma-text-4b-it-onnx-q8",
    version: "2026-04-16",
    modelId: DEFAULT_MODEL_ID,
    dtype: "q8",
    estimatedWorkingSetGiB: 10,
    note:
      "Approximate working-set estimate for the Session 1 system-memory heuristic. Not VRAM.",
  }),
  Object.freeze({
    id: "translategemma-text-4b-it-onnx-fp16",
    version: "2026-04-16",
    modelId: DEFAULT_MODEL_ID,
    dtype: "fp16",
    estimatedWorkingSetGiB: 18,
    note:
      "Approximate working-set estimate for the Session 1 system-memory heuristic. Not VRAM.",
  }),
  Object.freeze({
    id: "translategemma-text-4b-it-onnx-fp32",
    version: "2026-04-16",
    modelId: DEFAULT_MODEL_ID,
    dtype: "fp32",
    estimatedWorkingSetGiB: 34,
    note:
      "Approximate working-set estimate for the Session 1 system-memory heuristic. Not VRAM.",
  }),
] as const satisfies readonly ModelProfile[])

export const UNKNOWN_ENABLEMENT_VERDICT: EnablementVerdict = Object.freeze({
  outcome: "unknown",
  resolvedDevice: null,
  reason: "Enablement has not been assessed yet.",
})

export const IDLE_ENABLEMENT_STATE: EnablementState = Object.freeze({
  status: "idle",
  modelProfile: null,
  inference: null,
  verdict: UNKNOWN_ENABLEMENT_VERDICT,
})

const assessmentCache = new Map<string, Promise<EnablementAssessment>>()

function createUnknownProfile(
  config: NormalizedRuntimePreferenceConfig,
  modelProfile: ModelProfileInput | "auto" | undefined,
): ModelProfile {
  return Object.freeze({
    id:
      modelProfile !== "auto" && modelProfile?.id
        ? modelProfile.id
        : `custom:${config.modelId}:${config.dtype}`,
    version:
      modelProfile !== "auto" && modelProfile?.version
        ? modelProfile.version
        : "user-config",
    modelId: config.modelId,
    dtype: config.dtype,
    estimatedWorkingSetGiB:
      modelProfile !== "auto" ? modelProfile?.estimatedWorkingSetGiB ?? null : null,
    note:
      modelProfile !== "auto" && modelProfile?.note
        ? modelProfile.note
        : "No shipped profile matched this model config, so Session 1 uses an unknown memory estimate.",
  })
}

function buildRuntimePlan(
  config: NormalizedRuntimePreferenceConfig,
  resolvedDevice: ResolvedDevice,
): ResolvedRuntimePlan {
  return Object.freeze({
    modelId: config.modelId,
    dtype: config.dtype,
    resolvedDevice,
    sourceLanguage: config.sourceLanguage,
    maxNewTokens: config.maxNewTokens,
  })
}

export function createIdleEnablementState(): EnablementState {
  return IDLE_ENABLEMENT_STATE
}

export function createRuntimePlanKey(plan: ResolvedRuntimePlan): string {
  return [
    plan.modelId,
    plan.dtype,
    plan.resolvedDevice,
    plan.sourceLanguage,
    String(plan.maxNewTokens),
  ].join("|")
}

export function createEnablementCompat(state: EnablementState): EnablementCompat {
  const capabilitiesReady = state.status === "ready" || state.status === "error"
  const canTranslate =
    state.verdict.outcome === "gpu-preferred" || state.verdict.outcome === "wasm-only"

  return Object.freeze({
    capabilitiesReady,
    canTranslate,
    device: state.verdict.resolvedDevice,
  })
}

export function resolveRuntimePreferences(
  config?: RuntimePreferenceConfig,
): NormalizedRuntimePreferenceConfig {
  return Object.freeze({
    modelId: config?.modelId ?? DEFAULT_MODEL_ID,
    dtype: config?.dtype ?? DEFAULT_DTYPE,
    device: config?.device ?? DEFAULT_DEVICE_PREFERENCE,
    maxNewTokens: config?.maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS,
    sourceLanguage: config?.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE,
    enablement: Object.freeze({
      policy: config?.enablement?.policy ?? "default",
      modelProfile: config?.enablement?.modelProfile ?? "auto",
    }),
  })
}

export function resolveModelProfile(config?: RuntimePreferenceConfig): ModelProfile {
  const resolvedConfig = resolveRuntimePreferences(config)
  const requestedProfile = resolvedConfig.enablement.modelProfile

  if (requestedProfile !== "auto") {
    return createUnknownProfile(resolvedConfig, requestedProfile)
  }

  const builtin = BUILTIN_MODEL_PROFILES.find(
    (profile) =>
      profile.modelId === resolvedConfig.modelId && profile.dtype === resolvedConfig.dtype,
  )

  return builtin ?? createUnknownProfile(resolvedConfig, requestedProfile)
}

export function inferModelFit(
  observation: CapabilityObservation,
  modelProfile: ModelProfile,
): FitInference {
  if (modelProfile.estimatedWorkingSetGiB === null) {
    return Object.freeze({
      outcome: "unknown",
      basis: "system-memory-heuristic",
      expectedModelMemoryGiB: null,
      approxDeviceMemoryGiB: observation.approxDeviceMemoryGiB,
      note: "No maintained model-memory estimate is available for this profile.",
    })
  }

  if (observation.approxDeviceMemoryGiB === null) {
    return Object.freeze({
      outcome: "unknown",
      basis: "system-memory-heuristic",
      expectedModelMemoryGiB: modelProfile.estimatedWorkingSetGiB,
      approxDeviceMemoryGiB: null,
      note: "Approximate system memory is unavailable, so Session 1 cannot estimate WebGPU fit.",
    })
  }

  if (observation.isMobile) {
    const thresholdGiB = observation.approxDeviceMemoryGiB * 0.5
    const outcome =
      modelProfile.estimatedWorkingSetGiB < thresholdGiB ? "likely-fit" : "likely-no-fit"

    return Object.freeze({
      outcome,
      basis: "system-memory-heuristic",
      expectedModelMemoryGiB: modelProfile.estimatedWorkingSetGiB,
      approxDeviceMemoryGiB: observation.approxDeviceMemoryGiB,
      note:
        outcome === "likely-fit"
          ? "Approximate system memory keeps the model under the mobile 50% threshold."
          : "Approximate system memory suggests the model exceeds the mobile 50% threshold.",
    })
  }

  const headroomGiB = observation.approxDeviceMemoryGiB - modelProfile.estimatedWorkingSetGiB
  const outcome = headroomGiB >= 1 ? "likely-fit" : "likely-no-fit"

  return Object.freeze({
    outcome,
    basis: "system-memory-heuristic",
    expectedModelMemoryGiB: modelProfile.estimatedWorkingSetGiB,
    approxDeviceMemoryGiB: observation.approxDeviceMemoryGiB,
    note:
      outcome === "likely-fit"
        ? "Approximate system memory leaves at least 1 GiB of headroom on this computer."
        : "Approximate system memory leaves less than 1 GiB of headroom on this computer.",
  })
}

export function assessRuntimeEnablement(
  config: RuntimePreferenceConfig | undefined,
  observation: CapabilityObservation,
): EnablementAssessment {
  const resolvedConfig = resolveRuntimePreferences(config)
  const modelProfile = resolveModelProfile(resolvedConfig)
  const inference =
    resolvedConfig.device === "wasm" || !observation.hasWebGPU
      ? null
      : inferModelFit(observation, modelProfile)

  if (!observation.ready) {
    return Object.freeze({
      modelProfile,
      inference,
      verdict: {
        outcome: "unknown",
        resolvedDevice: null,
        reason: "Capability observations are not ready yet.",
      },
      runtimePlan: null,
    })
  }

  if (resolvedConfig.device === "wasm") {
    return Object.freeze({
      modelProfile,
      inference: null,
      verdict: {
        outcome: "wasm-only",
        resolvedDevice: "wasm",
        reason: "WASM was explicitly requested.",
      },
      runtimePlan: buildRuntimePlan(resolvedConfig, "wasm"),
    })
  }

  if (!observation.hasWebGPU) {
    if (resolvedConfig.device === "webgpu") {
      return Object.freeze({
        modelProfile,
        inference,
        verdict: {
          outcome: "denied",
          resolvedDevice: null,
          reason: "WebGPU was explicitly requested, but this browser does not expose WebGPU.",
        },
        runtimePlan: null,
      })
    }

    return Object.freeze({
      modelProfile,
      inference: null,
      verdict: {
        outcome: "wasm-only",
        resolvedDevice: "wasm",
        reason: "WebGPU is unavailable here, so babulfish will use WASM.",
      },
      runtimePlan: buildRuntimePlan(resolvedConfig, "wasm"),
    })
  }

  if (!inference || inference.outcome === "unknown") {
    if (resolvedConfig.device === "webgpu") {
      return Object.freeze({
        modelProfile,
        inference,
        verdict: {
          outcome: "denied",
          resolvedDevice: null,
          reason:
            "WebGPU was explicitly requested, but Session 1 cannot verify the heuristic fit for this device.",
        },
        runtimePlan: null,
      })
    }

    return Object.freeze({
      modelProfile,
      inference,
      verdict: {
        outcome: "wasm-only",
        resolvedDevice: "wasm",
        reason:
          "Approximate system memory is too weak for a confident WebGPU fit, so babulfish will use WASM.",
      },
      runtimePlan: buildRuntimePlan(resolvedConfig, "wasm"),
    })
  }

  if (inference.outcome === "likely-fit") {
    return Object.freeze({
      modelProfile,
      inference,
      verdict: {
        outcome: "gpu-preferred",
        resolvedDevice: "webgpu",
        reason: inference.note,
      },
      runtimePlan: buildRuntimePlan(resolvedConfig, "webgpu"),
    })
  }

  if (resolvedConfig.device === "webgpu") {
    return Object.freeze({
      modelProfile,
      inference,
      verdict: {
        outcome: "denied",
        resolvedDevice: null,
        reason:
          "WebGPU was explicitly requested, but the Session 1 memory heuristic says this model is unlikely to fit.",
      },
      runtimePlan: null,
    })
  }

  return Object.freeze({
    modelProfile,
    inference,
    verdict: {
      outcome: "wasm-only",
      resolvedDevice: "wasm",
      reason:
        "The Session 1 memory heuristic says WebGPU is unlikely to fit, so babulfish will use WASM.",
    },
    runtimePlan: buildRuntimePlan(resolvedConfig, "wasm"),
  })
}

export function createAssessmentCacheKey(
  config: RuntimePreferenceConfig | undefined,
  observation: CapabilityObservation,
): string {
  const resolvedConfig = resolveRuntimePreferences(config)
  const modelProfile = resolvedConfig.enablement.modelProfile
  const modelProfileKey =
    modelProfile === "auto"
      ? "auto"
      : [
          modelProfile.id ?? "",
          modelProfile.version ?? "",
          modelProfile.estimatedWorkingSetGiB === null
            ? "null"
            : String(modelProfile.estimatedWorkingSetGiB),
          modelProfile.note ?? "",
        ].join("|")

  return [
    resolvedConfig.modelId,
    resolvedConfig.dtype,
    resolvedConfig.device,
    resolvedConfig.sourceLanguage,
    String(resolvedConfig.maxNewTokens),
    resolvedConfig.enablement.policy,
    modelProfileKey,
    observation.ready ? "ready" : "not-ready",
    observation.hasWebGPU ? "webgpu" : "no-webgpu",
    observation.isMobile ? "mobile" : "desktop",
    observation.approxDeviceMemoryGiB === null
      ? "memory:null"
      : `memory:${observation.approxDeviceMemoryGiB}`,
    observation.crossOriginIsolated ? "coi" : "no-coi",
  ].join("|")
}

export async function getOrCreateEnablementAssessment(
  config: RuntimePreferenceConfig | undefined,
  observation: CapabilityObservation,
): Promise<EnablementAssessment> {
  const key = createAssessmentCacheKey(config, observation)
  const cached = assessmentCache.get(key)
  if (cached) {
    return cached
  }

  const nextAssessment = Promise.resolve(assessRuntimeEnablement(config, observation))
  assessmentCache.set(key, nextAssessment)
  return nextAssessment
}

export function __resetAssessmentCache(): void {
  assessmentCache.clear()
}
