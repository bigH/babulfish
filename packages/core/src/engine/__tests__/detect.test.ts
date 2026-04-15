import { describe, it, expect, afterEach } from "vitest"
import {
  getTranslationCapabilities,
  isMobileDevice,
  isWebGPUAvailable,
  resolveDevice,
} from "../detect.js"

type GlobalKey = "window" | "navigator"

const originalGlobals: Record<GlobalKey, PropertyDescriptor | undefined> = {
  window: Object.getOwnPropertyDescriptor(globalThis, "window"),
  navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
}

function restoreGlobal(
  key: GlobalKey,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor)
    return
  }

  Reflect.deleteProperty(globalThis, key)
}

function setGlobal(key: GlobalKey, value: object): void {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
  })
}

function clearGlobal(key: GlobalKey): void {
  Reflect.deleteProperty(globalThis, key)
}

afterEach(() => {
  restoreGlobal("window", originalGlobals.window)
  restoreGlobal("navigator", originalGlobals.navigator)
})

describe("isWebGPUAvailable", () => {
  it("returns true when navigator.gpu exists", () => {
    setGlobal("navigator", { gpu: {} })
    expect(isWebGPUAvailable()).toBe(true)
  })

  it("returns false when navigator has no gpu", () => {
    setGlobal("navigator", {})
    expect(isWebGPUAvailable()).toBe(false)
  })
})

describe("isMobileDevice", () => {
  it("returns true for narrow touch screens", () => {
    setGlobal("window", {
      innerWidth: 400,
      ontouchstart: null,
    })
    setGlobal("navigator", { maxTouchPoints: 1 })
    expect(isMobileDevice()).toBe(true)
  })

  it("returns false for wide screens", () => {
    setGlobal("window", {
      innerWidth: 1024,
      ontouchstart: null,
    })
    setGlobal("navigator", { maxTouchPoints: 1 })
    expect(isMobileDevice()).toBe(false)
  })

  it("returns false when navigator is unavailable", () => {
    setGlobal("window", { innerWidth: 400 })
    clearGlobal("navigator")

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
    setGlobal("navigator", {})
    expect(resolveDevice("auto")).toBe("wasm")
  })

  it("returns 'webgpu' in auto mode when WebGPU available", () => {
    setGlobal("navigator", { gpu: {} })
    expect(resolveDevice("auto")).toBe("webgpu")
  })
})

describe("getTranslationCapabilities", () => {
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
