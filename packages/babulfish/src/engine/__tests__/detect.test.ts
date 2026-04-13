import { describe, it, expect, afterEach } from "vitest"
import {
  getTranslationCapabilities,
  isMobileDevice,
  isWebGPUAvailable,
  resolveDevice,
} from "../detect.js"

describe("isWebGPUAvailable", () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    })
  })

  it("returns true when navigator.gpu exists", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { gpu: {} },
      configurable: true,
    })
    expect(isWebGPUAvailable()).toBe(true)
  })

  it("returns false when navigator has no gpu", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
    })
    expect(isWebGPUAvailable()).toBe(false)
  })
})

describe("isMobileDevice", () => {
  const originalWindow = globalThis.window
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    })
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    })
  })

  it("returns true for narrow touch screens", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        innerWidth: 400,
        ontouchstart: null,
      },
      configurable: true,
    })
    Object.defineProperty(globalThis, "navigator", {
      value: { maxTouchPoints: 1 },
      configurable: true,
    })
    expect(isMobileDevice()).toBe(true)
  })

  it("returns false for wide screens", () => {
    Object.defineProperty(globalThis, "window", {
      value: {
        innerWidth: 1024,
        ontouchstart: null,
      },
      configurable: true,
    })
    Object.defineProperty(globalThis, "navigator", {
      value: { maxTouchPoints: 1 },
      configurable: true,
    })
    expect(isMobileDevice()).toBe(false)
  })
})

describe("resolveDevice", () => {
  it("returns 'webgpu' when preference is 'webgpu'", () => {
    expect(resolveDevice("webgpu")).toBe("webgpu")
  })

  it("returns 'wasm' when preference is 'wasm'", () => {
    expect(resolveDevice("wasm")).toBe("wasm")
  })

  it("returns 'wasm' in auto mode when WebGPU unavailable", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: {},
      configurable: true,
    })
    expect(resolveDevice("auto")).toBe("wasm")
  })

  it("returns 'webgpu' in auto mode when WebGPU available", () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { gpu: {} },
      configurable: true,
    })
    expect(resolveDevice("auto")).toBe("webgpu")
  })
})

describe("getTranslationCapabilities", () => {
  const originalWindow = globalThis.window
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originalWindow,
      configurable: true,
    })
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    })
  })

  it("reports desktop WASM fallback when WebGPU is unavailable", () => {
    Object.defineProperty(globalThis, "window", {
      value: { innerWidth: 1280 },
      configurable: true,
    })
    Object.defineProperty(globalThis, "navigator", {
      value: { maxTouchPoints: 0 },
      configurable: true,
    })

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "wasm",
      canTranslate: true,
    })
  })

  it("keeps mobile explicit without claiming the default UI path is unavailable", () => {
    Object.defineProperty(globalThis, "window", {
      value: { innerWidth: 400, ontouchstart: null },
      configurable: true,
    })
    Object.defineProperty(globalThis, "navigator", {
      value: { maxTouchPoints: 1 },
      configurable: true,
    })

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: true,
      device: "wasm",
      canTranslate: true,
    })
  })

  it("reports translation unavailable when WebGPU is forced but missing", () => {
    Object.defineProperty(globalThis, "window", {
      value: { innerWidth: 1280 },
      configurable: true,
    })
    Object.defineProperty(globalThis, "navigator", {
      value: { maxTouchPoints: 0 },
      configurable: true,
    })

    expect(getTranslationCapabilities("webgpu")).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "webgpu",
      canTranslate: false,
    })
  })
})
