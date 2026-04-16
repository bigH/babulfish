import { getBrowserEnvironmentSnapshot } from "../engine/detect.js"

export type CapabilityObservation = Readonly<{
  readonly ready: boolean
  readonly hasWebGPU: boolean
  readonly isMobile: boolean
  readonly approxDeviceMemoryGiB: number | null
  readonly crossOriginIsolated: boolean
}>

export type Capabilities = CapabilityObservation

export const SSR_CAPABILITIES: CapabilityObservation = Object.freeze({
  ready: false,
  hasWebGPU: false,
  isMobile: false,
  approxDeviceMemoryGiB: null,
  crossOriginIsolated: false,
})

export function detectCapabilities(): Capabilities {
  if (typeof window === "undefined") return SSR_CAPABILITIES

  const environment = getBrowserEnvironmentSnapshot()
  if (!environment) {
    return SSR_CAPABILITIES
  }

  return Object.freeze({
    ready: true,
    hasWebGPU: environment.hasWebGPU,
    isMobile: environment.isMobile,
    approxDeviceMemoryGiB: environment.approxDeviceMemoryGiB,
    crossOriginIsolated: environment.crossOriginIsolated,
  })
}
