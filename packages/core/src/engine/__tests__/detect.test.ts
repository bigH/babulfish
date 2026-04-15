import { describe, it, expect, afterEach } from "vitest"
import {
  getTranslationCapabilities,
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
