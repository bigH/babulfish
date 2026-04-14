import type { DevicePreference } from "../engine/detect.js"
import { getTranslationCapabilities } from "../engine/detect.js"

export type Capabilities = {
  readonly ready: boolean
  readonly hasWebGPU: boolean
  readonly canTranslate: boolean
  readonly device: "webgpu" | "wasm" | null
  readonly isMobile: boolean
}

export const SSR_CAPABILITIES: Capabilities = Object.freeze({
  ready: false,
  hasWebGPU: false,
  canTranslate: false,
  device: null,
  isMobile: false,
})

export function detectCapabilities(
  devicePreference?: DevicePreference,
): Capabilities {
  if (typeof window === "undefined") return SSR_CAPABILITIES

  const detected = getTranslationCapabilities(devicePreference)
  return Object.freeze({
    ready: true,
    hasWebGPU: detected.hasWebGPU,
    canTranslate: detected.canTranslate,
    device: detected.device,
    isMobile: detected.isMobile,
  })
}
