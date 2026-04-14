// Device and capability detection for translation engine

export type DevicePreference = "auto" | "webgpu" | "wasm"
export type ResolvedDevice = "webgpu" | "wasm"

export type TranslationCapabilities = {
  readonly hasWebGPU: boolean
  readonly isMobile: boolean
  readonly device: ResolvedDevice
  readonly canTranslate: boolean
}

const MOBILE_WIDTH_THRESHOLD = 768

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false
  const narrowScreen = window.innerWidth < MOBILE_WIDTH_THRESHOLD
  const hasTouch =
    "ontouchstart" in window || navigator.maxTouchPoints > 0
  return narrowScreen && hasTouch
}

export function resolveDevice(preference: DevicePreference): ResolvedDevice {
  switch (preference) {
    case "webgpu":
      return "webgpu"
    case "wasm":
      return "wasm"
    case "auto":
      return isWebGPUAvailable() ? "webgpu" : "wasm"
  }
}

export function getTranslationCapabilities(
  preference: DevicePreference = "auto",
): TranslationCapabilities {
  const hasWebGPU = isWebGPUAvailable()
  const hasBrowserWindow = typeof window !== "undefined"
  const isMobile = isMobileDevice()
  const device = resolveDevice(preference)

  return {
    hasWebGPU,
    isMobile,
    device,
    canTranslate:
      hasBrowserWindow && (device === "wasm" || hasWebGPU),
  }
}
