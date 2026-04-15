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
  readonly hasWindow: boolean
  readonly hasWebGPU: boolean
  readonly isMobile: boolean
}

function getEnvironmentSnapshot(): EnvironmentSnapshot {
  if (typeof window === "undefined") {
    return {
      hasWindow: false,
      hasWebGPU: false,
      isMobile: false,
    }
  }

  const touchPoints =
    typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints
  const hasTouch = "ontouchstart" in window || touchPoints > 0

  return {
    hasWindow: true,
    hasWebGPU:
      typeof navigator !== "undefined" && "gpu" in navigator,
    isMobile:
      window.innerWidth < MOBILE_WIDTH_THRESHOLD && hasTouch,
  }
}

function resolveDeviceWithWebGPU(
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

export function resolveDevice(preference: DevicePreference): ResolvedDevice {
  return resolveDeviceWithWebGPU(
    preference,
    getEnvironmentSnapshot().hasWebGPU,
  )
}

export function getTranslationCapabilities(
  preference: DevicePreference = "auto",
): TranslationCapabilities {
  const environment = getEnvironmentSnapshot()
  const device = resolveDeviceWithWebGPU(
    preference,
    environment.hasWebGPU,
  )

  return {
    hasWebGPU: environment.hasWebGPU,
    isMobile: environment.isMobile,
    device,
    canTranslate:
      environment.hasWindow &&
      (device === "wasm" || environment.hasWebGPU),
  }
}
