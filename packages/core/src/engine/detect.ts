// Browser observation + low-level device resolution helpers.

export type DevicePreference = "auto" | "webgpu" | "wasm"
export type ResolvedDevice = "webgpu" | "wasm"

export type TranslationCapabilities = {
  readonly hasWebGPU: boolean
  readonly isMobile: boolean
  readonly device: ResolvedDevice
  readonly canTranslate: boolean
}

const MOBILE_WIDTH_THRESHOLD = 768

export type BrowserEnvironmentSnapshot = {
  readonly hasWebGPU: boolean
  readonly isMobile: boolean
  readonly approxDeviceMemoryGiB: number | null
  readonly crossOriginIsolated: boolean
}

function resolveApproxDeviceMemoryGiB(): number | null {
  if (typeof navigator === "undefined") {
    return null
  }

  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof deviceMemory === "number" && Number.isFinite(deviceMemory) && deviceMemory > 0
    ? deviceMemory
    : null
}

export function getBrowserEnvironmentSnapshot(): BrowserEnvironmentSnapshot | null {
  if (typeof window === "undefined") {
    return null
  }

  const touchPoints =
    typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints
  const hasTouch = "ontouchstart" in window || touchPoints > 0

  return {
    hasWebGPU: typeof navigator !== "undefined" && "gpu" in navigator,
    isMobile:
      window.innerWidth < MOBILE_WIDTH_THRESHOLD && hasTouch,
    approxDeviceMemoryGiB: resolveApproxDeviceMemoryGiB(),
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
  }
}

export function resolveDevicePreference(
  preference: DevicePreference,
  hasWebGPU: boolean,
): ResolvedDevice {
  switch (preference) {
    case "webgpu":
      return "webgpu"
    case "wasm":
      return "wasm"
    case "auto":
      return hasWebGPU ? "webgpu" : "wasm"
  }
}

export function getTranslationCapabilities(
  preference: DevicePreference = "auto",
): TranslationCapabilities {
  const environment = getBrowserEnvironmentSnapshot()
  if (!environment) {
    return {
      hasWebGPU: false,
      isMobile: false,
      device: resolveDevicePreference(preference, false),
      canTranslate: false,
    }
  }

  const device = resolveDevicePreference(preference, environment.hasWebGPU)

  return {
    hasWebGPU: environment.hasWebGPU,
    isMobile: environment.isMobile,
    device,
    canTranslate: device === "wasm" || environment.hasWebGPU,
  }
}
