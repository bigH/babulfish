import { describe, it, expect, afterEach } from "vitest"
import { getBrowserEnvironmentSnapshot, getTranslationCapabilities } from "../detect.js"
import {
  captureGlobalDescriptors,
  clearGlobal,
  restoreGlobals,
  setGlobal,
} from "../../__tests__/globals.test-utils.js"

const originalGlobals = captureGlobalDescriptors()

afterEach(() => {
  restoreGlobals(originalGlobals)
})

describe("device resolution", () => {
  it("keeps explicit webgpu preference in the capability snapshot", () => {
    expect(getTranslationCapabilities("webgpu").device).toBe("webgpu")
  })

  it("keeps explicit wasm preference in the capability snapshot", () => {
    expect(getTranslationCapabilities("wasm").device).toBe("wasm")
  })

  it("uses wasm in auto mode when WebGPU is unavailable", () => {
    setGlobal("navigator", {})
    expect(getTranslationCapabilities("auto").device).toBe("wasm")
  })

  it("uses webgpu in auto mode when WebGPU is available", () => {
    setGlobal("navigator", { gpu: {} })
    expect(getTranslationCapabilities("auto").device).toBe("webgpu")
  })
})

describe("getTranslationCapabilities", () => {
  it("captures approximate device memory and cross-origin isolation when available", () => {
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, deviceMemory: 16 })
    setGlobal("crossOriginIsolated", true)

    expect(getBrowserEnvironmentSnapshot()).toEqual({
      hasWebGPU: false,
      isMobile: false,
      approxDeviceMemoryGiB: 16,
      crossOriginIsolated: true,
    })
  })

  it("reports desktop WASM fallback when WebGPU is unavailable", () => {
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0 })

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "wasm",
      canTranslate: true,
    })
  })

  it("keeps mobile explicit without claiming the default UI path is unavailable", () => {
    setGlobal("window", { innerWidth: 400, ontouchstart: null })
    setGlobal("navigator", { maxTouchPoints: 1 })

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: true,
      device: "wasm",
      canTranslate: true,
    })
  })

  it("reports translation unavailable when WebGPU is forced but missing", () => {
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0 })

    expect(getTranslationCapabilities("webgpu")).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "webgpu",
      canTranslate: false,
    })
  })

  it("stays SSR-safe when window is unavailable", () => {
    clearGlobal("window")
    clearGlobal("navigator")

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "wasm",
      canTranslate: false,
    })
  })

  it("treats missing navigator as no optional browser capabilities", () => {
    setGlobal("window", { innerWidth: 400 })
    clearGlobal("navigator")

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "wasm",
      canTranslate: true,
    })
  })
})
