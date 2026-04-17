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
  readonly observationFingerprint: string
}

const probeCache = new Map<string, ProbeOutcome>()

export function createObservationFingerprint(obs: CapabilityObservation): string {
  return [
    obs.ready ? "ready" : "not-ready",
    obs.hasWebGPU ? "webgpu" : "no-webgpu",
    obs.isMobile ? "mobile" : "desktop",
    obs.approxDeviceMemoryGiB === null ? "memory:null" : `memory:${obs.approxDeviceMemoryGiB}`,
    obs.crossOriginIsolated ? "coi" : "no-coi",
  ].join("|")
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
    input.observationFingerprint,
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
