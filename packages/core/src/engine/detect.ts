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

type EnvironmentSnapshot = {
  readonly hasWebGPU: boolean
  readonly isMobile: boolean
}

function getBrowserEnvironmentSnapshot(): EnvironmentSnapshot | null {
  if (typeof window === "undefined") {
    return null
  }

  const touchPoints =
    typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints
  const hasTouch = "ontouchstart" in window || touchPoints > 0

  return {
    hasWebGPU:
      typeof navigator !== "undefined" && "gpu" in navigator,
    isMobile:
      window.innerWidth < MOBILE_WIDTH_THRESHOLD && hasTouch,
  }
}

function resolveDevice(
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
      device: resolveDevice(preference, false),
      canTranslate: false,
    }
  }

  const device = resolveDevice(preference, environment.hasWebGPU)

  return {
    hasWebGPU: environment.hasWebGPU,
    isMobile: environment.isMobile,
    device,
    canTranslate: device === "wasm" || environment.hasWebGPU,
  }
}
