import { afterEach, describe, expect, it } from "vitest"
import {
  detectCapabilities,
  SSR_CAPABILITIES,
} from "../capabilities.js"
import {
  captureGlobalDescriptors,
  clearGlobal,
  restoreGlobals,
  setGlobal,
} from "../../__tests__/globals.test-utils.js"

describe("detectCapabilities", () => {
  const originalGlobals = captureGlobalDescriptors()

  afterEach(() => {
    restoreGlobals(originalGlobals)
  })

  it("returns the shared SSR capabilities snapshot when window is unavailable", () => {
    clearGlobal("window")

    expect(detectCapabilities()).toBe(SSR_CAPABILITIES)
  })

  it("returns a frozen browser snapshot that mirrors engine detection", () => {
    setGlobal("window", { innerWidth: 400, ontouchstart: null })
    setGlobal("navigator", { maxTouchPoints: 1 })

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

  it("keeps browser detection ready when navigator is unavailable", () => {
    setGlobal("window", { innerWidth: 1280 })
    clearGlobal("navigator")

    const capabilities = detectCapabilities()

    expect(capabilities).toEqual({
      ready: true,
      hasWebGPU: false,
      canTranslate: true,
      device: "wasm",
      isMobile: false,
    })
    expect(capabilities).not.toBe(SSR_CAPABILITIES)
    expect(Object.isFrozen(capabilities)).toBe(true)
  })
})
