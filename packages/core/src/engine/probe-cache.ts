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

export function createProbeCacheKey(input: ProbeCacheKeyInput): string {
  const obs = input.observation
  return [
    input.modelProfileId,
    input.modelProfileVersion,
    input.modelId,
    input.dtype,
    input.device,
    input.policyVersion,
    input.probeVersion,
    obs.ready ? "ready" : "not-ready",
    obs.hasWebGPU ? "webgpu" : "no-webgpu",
    obs.isMobile ? "mobile" : "desktop",
    obs.approxDeviceMemoryGiB === null ? "memory:null" : `memory:${obs.approxDeviceMemoryGiB}`,
    obs.crossOriginIsolated ? "coi" : "no-coi",
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
