import { afterEach, describe, expect, it } from "vitest"
import {
  detectCapabilities,
  SSR_CAPABILITIES,
} from "../capabilities.js"

describe("detectCapabilities", () => {
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

  it("returns the shared SSR capabilities snapshot when window is unavailable", () => {
    delete (globalThis as Record<string, unknown>).window

    expect(detectCapabilities()).toBe(SSR_CAPABILITIES)
  })

  it("returns a frozen browser snapshot that mirrors engine detection", () => {
    Object.defineProperty(globalThis, "window", {
      value: { innerWidth: 400, ontouchstart: null },
      configurable: true,
    })
    Object.defineProperty(globalThis, "navigator", {
      value: { maxTouchPoints: 1 },
      configurable: true,
    })

    const capabilities = detectCapabilities("webgpu")

    expect(capabilities).toEqual({
      ready: true,
      hasWebGPU: false,
      canTranslate: false,
      device: "webgpu",
      isMobile: true,
    })
    expect(Object.isFrozen(capabilities)).toBe(true)
  })
})
