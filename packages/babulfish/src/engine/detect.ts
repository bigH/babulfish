// Device and capability detection for translation engine

type DevicePreference = "auto" | "webgpu" | "wasm"
type ResolvedDevice = "webgpu" | "wasm"

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
