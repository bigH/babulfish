import type { CapabilityObservation } from "../core/capabilities.js"

export type ProbeOutcome = {
  readonly passed: boolean
  readonly features: readonly string[]
  readonly note: string
}

export type ProbeCacheKeyInput = {
  readonly modelProfileId: string
  readonly modelProfileVersion: string
  readonly modelId: string
  readonly dtype: string
  readonly device: string
  readonly policyVersion: string
  readonly probeVersion: string
  readonly observation: CapabilityObservation
}

const probeCache = new Map<string, ProbeOutcome>()

function serializeObservationForProbeCache(
  observation: CapabilityObservation,
): readonly string[] {
  return [
    observation.ready ? "ready" : "not-ready",
    observation.hasWebGPU ? "webgpu" : "no-webgpu",
    observation.isMobile ? "mobile" : "desktop",
    observation.approxDeviceMemoryGiB === null
      ? "memory:null"
      : `memory:${observation.approxDeviceMemoryGiB}`,
    observation.crossOriginIsolated ? "coi" : "no-coi",
  ]
}

export function createProbeCacheKey(input: ProbeCacheKeyInput): string {
  return [
    input.modelProfileId,
    input.modelProfileVersion,
    input.modelId,
    input.dtype,
    input.device,
    input.policyVersion,
    input.probeVersion,
    ...serializeObservationForProbeCache(input.observation),
  ].join("|")
}

export function getProbeCacheEntry(key: string): ProbeOutcome | undefined {
  return probeCache.get(key)
}

export function setProbeCacheEntry(key: string, outcome: ProbeOutcome): void {
  probeCache.set(key, outcome)
}

export function __resetProbeCacheForTests(): void {
  probeCache.clear()
}
