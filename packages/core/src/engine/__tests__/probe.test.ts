import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { runAdapterSmokeProbe, PROBE_VERSION } from "../probe.js"
import {
  captureGlobalDescriptors,
  restoreGlobals,
  setGlobal,
  clearGlobal,
} from "../../__tests__/globals.test-utils.js"

function createMockGPU(options?: {
  adapter?: {
    features?: string[]
    requestDevice?: () => Promise<{ destroy: () => void }>
  } | null
}) {
  const destroy = vi.fn()
  const resolvedAdapter =
    options?.adapter === null
      ? null
      : options?.adapter
        ? {
            features: new Set(options.adapter.features ?? []),
            requestDevice: options.adapter.requestDevice ?? vi.fn(async () => ({ destroy })),
          }
        : {
            features: new Set<string>(),
            requestDevice: vi.fn(async () => ({ destroy })),
          }

  return {
    requestAdapter: vi.fn(async () => resolvedAdapter),
    _destroy: destroy,
    _adapter: resolvedAdapter,
  }
}

const originalGlobals = captureGlobalDescriptors()

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  restoreGlobals(originalGlobals)
})

describe("runAdapterSmokeProbe", () => {
  it("returns passed:false when navigator.gpu is absent", async () => {
    setGlobal("navigator", { maxTouchPoints: 0 })

    const result = await runAdapterSmokeProbe()

    expect(result.passed).toBe(false)
    expect(result.aborted).toBe(false)
    expect(result.note).toContain("not available")
  })

  it("returns passed:false when navigator is undefined", async () => {
    clearGlobal("navigator")

    const result = await runAdapterSmokeProbe()

    expect(result.passed).toBe(false)
    expect(result.aborted).toBe(false)
  })

  it("returns passed:true when adapter and device succeed", async () => {
    const mockGPU = createMockGPU()
    setGlobal("navigator", { gpu: mockGPU })

    const result = await runAdapterSmokeProbe()

    expect(result.passed).toBe(true)
    expect(result.aborted).toBe(false)
    expect(result.note).toContain("Adapter and device acquired")
  })

  it("records shader-f16 in features when adapter supports it", async () => {
    const mockGPU = createMockGPU({
      adapter: { features: ["shader-f16"] },
    })
    setGlobal("navigator", { gpu: mockGPU })

    const result = await runAdapterSmokeProbe()

    expect(result.features).toContain("shader-f16")
    expect(result.note).toContain("shader-f16 supported")
  })

  it("does not include shader-f16 when adapter lacks it", async () => {
    const mockGPU = createMockGPU({ adapter: { features: [] } })
    setGlobal("navigator", { gpu: mockGPU })

    const result = await runAdapterSmokeProbe()

    expect(result.features).not.toContain("shader-f16")
    expect(result.passed).toBe(true)
  })

  it("returns passed:false when requestAdapter returns null", async () => {
    const mockGPU = createMockGPU({ adapter: null })
    setGlobal("navigator", { gpu: mockGPU })

    const result = await runAdapterSmokeProbe()

    expect(result.passed).toBe(false)
    expect(result.note).toContain("No WebGPU adapter available")
  })

  it("returns passed:false when requestAdapter throws", async () => {
    const gpu = {
      requestAdapter: vi.fn(async () => { throw new Error("GPU fault") }),
    }
    setGlobal("navigator", { gpu })

    const result = await runAdapterSmokeProbe()

    expect(result.passed).toBe(false)
    expect(result.note).toContain("adapter request failed")
  })

  it("returns passed:false when requestDevice throws", async () => {
    const mockGPU = createMockGPU({
      adapter: {
        features: [],
        requestDevice: async () => { throw new Error("device error") },
      },
    })
    setGlobal("navigator", { gpu: mockGPU })

    const result = await runAdapterSmokeProbe()

    expect(result.passed).toBe(false)
    expect(result.note).toContain("device request failed")
  })

  it("returns aborted:true when signal is already aborted", async () => {
    const mockGPU = createMockGPU()
    setGlobal("navigator", { gpu: mockGPU })
    const controller = new AbortController()
    controller.abort()

    const result = await runAdapterSmokeProbe(controller.signal)

    expect(result.aborted).toBe(true)
    expect(result.passed).toBe(false)
  })

  it("returns aborted:true when signal aborts between requestAdapter and requestDevice", async () => {
    const controller = new AbortController()
    const destroy = vi.fn()
    const adapter = {
      features: new Set<string>(),
      requestDevice: vi.fn(async () => ({ destroy })),
    }
    const gpu = {
      requestAdapter: vi.fn(async () => {
        controller.abort()
        return adapter
      }),
    }
    setGlobal("navigator", { gpu })

    const result = await runAdapterSmokeProbe(controller.signal)

    expect(result.aborted).toBe(true)
    expect(result.passed).toBe(false)
  })

  it("calls device.destroy() on successful probe", async () => {
    const mockGPU = createMockGPU()
    setGlobal("navigator", { gpu: mockGPU })

    await runAdapterSmokeProbe()

    expect(mockGPU._destroy).toHaveBeenCalledTimes(1)
  })

  it("calls device.destroy() on abort after device acquired", async () => {
    const controller = new AbortController()
    const destroy = vi.fn()
    const adapter = {
      features: new Set<string>(),
      requestDevice: vi.fn(async () => {
        controller.abort()
        return { destroy }
      }),
    }
    const gpu = {
      requestAdapter: vi.fn(async () => adapter),
    }
    setGlobal("navigator", { gpu })

    const result = await runAdapterSmokeProbe(controller.signal)

    expect(result.aborted).toBe(true)
    expect(destroy).toHaveBeenCalledTimes(1)
  })
})

describe("PROBE_VERSION", () => {
  it("is '1'", () => {
    expect(PROBE_VERSION).toBe("1")
  })
})
