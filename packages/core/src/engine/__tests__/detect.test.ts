import { describe, it, expect, afterEach } from "vitest"
import {
  getTranslationCapabilities,
  isMobileDevice,
  isWebGPUAvailable,
  resolveDevice,
} from "../detect.js"

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")

function restoreGlobal(
  key: "window" | "navigator",
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) {
    Object.defineProperty(globalThis, key, descriptor)
    return
  }

  delete (globalThis as Record<string, unknown>)[key]
}

function mockWindow(value: object): void {
  Object.defineProperty(globalThis, "window", {
    value,
    configurable: true,
  })
}

function mockNavigator(value: object): void {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
  })
}

afterEach(() => {
  restoreGlobal("window", originalWindow)
  restoreGlobal("navigator", originalNavigator)
})

describe("isWebGPUAvailable", () => {
  it("returns true when navigator.gpu exists", () => {
    mockNavigator({ gpu: {} })
    expect(isWebGPUAvailable()).toBe(true)
  })

  it("returns false when navigator has no gpu", () => {
    mockNavigator({})
    expect(isWebGPUAvailable()).toBe(false)
  })
})

describe("isMobileDevice", () => {
  it("returns true for narrow touch screens", () => {
    mockWindow({
      innerWidth: 400,
      ontouchstart: null,
    })
    mockNavigator({ maxTouchPoints: 1 })
    expect(isMobileDevice()).toBe(true)
  })

  it("returns false for wide screens", () => {
    mockWindow({
      innerWidth: 1024,
      ontouchstart: null,
    })
    mockNavigator({ maxTouchPoints: 1 })
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
    mockNavigator({})
    expect(resolveDevice("auto")).toBe("wasm")
  })

  it("returns 'webgpu' in auto mode when WebGPU available", () => {
    mockNavigator({ gpu: {} })
    expect(resolveDevice("auto")).toBe("webgpu")
  })
})

describe("getTranslationCapabilities", () => {
  it("reports desktop WASM fallback when WebGPU is unavailable", () => {
    mockWindow({ innerWidth: 1280 })
    mockNavigator({ maxTouchPoints: 0 })

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "wasm",
      canTranslate: true,
    })
  })

  it("keeps mobile explicit without claiming the default UI path is unavailable", () => {
    mockWindow({ innerWidth: 400, ontouchstart: null })
    mockNavigator({ maxTouchPoints: 1 })

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: true,
      device: "wasm",
      canTranslate: true,
    })
  })

  it("reports translation unavailable when WebGPU is forced but missing", () => {
    mockWindow({ innerWidth: 1280 })
    mockNavigator({ maxTouchPoints: 0 })

    expect(getTranslationCapabilities("webgpu")).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "webgpu",
      canTranslate: false,
    })
  })

  it("stays SSR-safe when window is unavailable", () => {
    delete (globalThis as Record<string, unknown>).window
    delete (globalThis as Record<string, unknown>).navigator

    expect(getTranslationCapabilities()).toEqual({
      hasWebGPU: false,
      isMobile: false,
      device: "wasm",
      canTranslate: false,
    })
  })
})
