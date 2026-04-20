import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

vi.mock("../../engine/probe.js", async () => {
  const actual = await vi.importActual<typeof import("../../engine/probe.js")>(
    "../../engine/probe.js",
  )
  return {
    ...actual,
    runAdapterSmokeProbe: vi.fn(actual.runAdapterSmokeProbe),
  }
})

import { createBabulfish } from "../babulfish.js"
import { loadPipeline } from "../../engine/pipeline-loader.js"
import { runAdapterSmokeProbe } from "../../engine/probe.js"
import {
  __resetEnablementAssessmentForTests,
  __resetEngineForTests,
  __resetProbeCacheForTests,
} from "../../engine/testing/index.js"
import { wrapGeneratorAsPipeline } from "../../testing/conformance-helpers.js"
import {
  captureGlobalDescriptors,
  restoreGlobals,
  setGlobal,
} from "../../__tests__/globals.test-utils.js"

const mockLoadPipeline = vi.mocked(loadPipeline)
const mockRunAdapterSmokeProbe = vi.mocked(runAdapterSmokeProbe)
const originalGlobals = captureGlobalDescriptors()

function createMockPipeline() {
  const generate = vi.fn(async () => [
    { generated_text: [{ role: "assistant", content: "hola" }] },
  ])
  return wrapGeneratorAsPipeline(generate as Parameters<typeof wrapGeneratorAsPipeline>[0])
}

function createMockGPU(options?: {
  adapterResult?: {
    features?: string[]
    requestDevice?: () => Promise<{ destroy: () => void }>
  } | null
}) {
  const destroy = vi.fn()
  const defaultAdapter = {
    features: new Set(options?.adapterResult?.features ?? []),
    requestDevice: options?.adapterResult?.requestDevice ?? vi.fn(async () => ({ destroy })),
  }

  return {
    requestAdapter: vi.fn(async () =>
      options?.adapterResult === null
        ? null
        : (options?.adapterResult ?? defaultAdapter),
    ),
    _destroy: destroy,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetEnablementAssessmentForTests()
  __resetEngineForTests()
  __resetProbeCacheForTests()
})

afterEach(() => {
  restoreGlobals(originalGlobals)
})

describe("enablement assessment", () => {
  it("starts idle and does not assess during construction", () => {
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: {}, deviceMemory: 16 })

    const core = createBabulfish()

    expect(core.snapshot.capabilities.ready).toBe(true)
    expect(core.snapshot.enablement.status).toBe("idle")
    expect(core.snapshot.enablement.verdict.outcome).toBe("unknown")
    expect(mockLoadPipeline).not.toHaveBeenCalled()
  })

  it("assesses lazily on loadModel() and passes the resolved device to loadPipeline", async () => {
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: {}, deviceMemory: 16 })
    mockLoadPipeline.mockResolvedValue(createMockPipeline())

    const core = createBabulfish()
    const capabilities = core.snapshot.capabilities

    await core.loadModel()

    expect(core.snapshot.capabilities).toBe(capabilities)
    expect(core.snapshot.enablement.status).toBe("ready")
    expect(core.snapshot.enablement.verdict.outcome).toBe("gpu-preferred")
    expect(mockLoadPipeline).toHaveBeenCalledWith(
      "onnx-community/translategemma-text-4b-it-ONNX",
      expect.objectContaining({
        dtype: "q4",
        device: "webgpu",
      }),
    )
  })

  it("denies forced WebGPU without loading the model runtime", async () => {
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0 })

    const core = createBabulfish({ engine: { device: "webgpu" } })

    await expect(core.loadModel()).rejects.toThrow(
      "WebGPU was explicitly requested, but this browser does not expose WebGPU.",
    )
    expect(core.snapshot.enablement.status).toBe("ready")
    expect(core.snapshot.enablement.verdict.outcome).toBe("denied")
    expect(mockLoadPipeline).not.toHaveBeenCalled()
  })
})

describe("probe integration", () => {
  it.each(["off", "manual"] as const)(
    "probe mode %s: inconclusive assessment stays needs-probe without running the probe",
    async (probe) => {
      const mockGPU = createMockGPU()
      setGlobal("window", { innerWidth: 1280 })
      setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })

      const core = createBabulfish({
        engine: { enablement: { probe } },
      })

      await expect(core.loadModel()).rejects.toThrow()
      expect(core.snapshot.enablement.status).toBe("ready")
      expect(core.snapshot.enablement.verdict.outcome).toBe("needs-probe")
      expect(core.snapshot.enablement.probe).toEqual({
        status: "not-run",
        kind: "adapter-smoke",
        cache: null,
        note: "",
      })
      expect(mockGPU.requestAdapter).not.toHaveBeenCalled()
    },
  )

  it("probe mode if-needed with successful probe: verdict becomes gpu-preferred", async () => {
    const mockGPU = createMockGPU()
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })
    mockLoadPipeline.mockResolvedValue(createMockPipeline())

    const core = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })

    await core.loadModel()

    expect(core.snapshot.enablement.verdict.outcome).toBe("gpu-preferred")
    expect(core.snapshot.enablement.verdict.resolvedDevice).toBe("webgpu")
    expect(mockLoadPipeline).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ device: "webgpu" }),
    )
  })

  it("probe mode if-needed with failed probe (auto device): verdict becomes wasm-only", async () => {
    const mockGPU = createMockGPU({ adapterResult: null })
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })
    mockLoadPipeline.mockResolvedValue(createMockPipeline())

    const core = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })

    await core.loadModel()

    expect(core.snapshot.enablement.verdict.outcome).toBe("wasm-only")
    expect(core.snapshot.enablement.verdict.resolvedDevice).toBe("wasm")
    expect(mockLoadPipeline).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ device: "wasm" }),
    )
  })

  it("probe mode if-needed with failed probe (explicit webgpu): verdict becomes denied, loadModel throws", async () => {
    const mockGPU = createMockGPU({ adapterResult: null })
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })

    const core = createBabulfish({
      engine: { device: "webgpu", enablement: { probe: "if-needed" } },
    })

    await expect(core.loadModel()).rejects.toThrow()
    expect(core.snapshot.enablement.verdict.outcome).toBe("denied")
    expect(mockLoadPipeline).not.toHaveBeenCalled()
  })

  it("probe mode if-needed with unexpected probe error publishes probe failure before the final error state", async () => {
    const mockGPU = createMockGPU()
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })
    mockRunAdapterSmokeProbe.mockRejectedValueOnce(new Error("Probe exploded"))

    const core = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })

    const observed = new Array<(typeof core.snapshot)["enablement"]>()
    core.subscribe((snapshot) => observed.push(snapshot.enablement))

    await expect(core.loadModel()).rejects.toThrow("Probe exploded")
    expect(core.snapshot.enablement.status).toBe("error")
    expect(core.snapshot.enablement.verdict.outcome).toBe("unknown")
    expect(core.snapshot.enablement.probe).toEqual({
      status: "not-run",
      kind: "adapter-smoke",
      cache: null,
      note: "",
    })
    expect(
      observed.some(
        (enablement) =>
          enablement.status === "error" &&
          enablement.verdict.outcome === "needs-probe" &&
          enablement.probe.status === "error" &&
          enablement.probe.cache === "miss" &&
          enablement.probe.note === "Probe exploded",
      ),
    ).toBe(true)
    expect(mockLoadPipeline).not.toHaveBeenCalled()
  })

  it("probe cache hit: second loadModel with same config skips probe execution", async () => {
    const mockGPU = createMockGPU()
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })
    mockLoadPipeline.mockResolvedValue(createMockPipeline())

    const core1 = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })
    await core1.loadModel()

    expect(mockGPU.requestAdapter).toHaveBeenCalledTimes(1)

    __resetEnablementAssessmentForTests()
    __resetEngineForTests()

    const core2 = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })
    await core2.loadModel()

    expect(mockGPU.requestAdapter).toHaveBeenCalledTimes(1)
    expect(core2.snapshot.enablement.probe.cache).toBe("hit")
  })

  it("probe state transitions: idle -> assessing -> probing -> ready", async () => {
    const mockGPU = createMockGPU()
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })
    mockLoadPipeline.mockResolvedValue(createMockPipeline())

    const core = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })

    const observed: string[] = []
    core.subscribe((s) => observed.push(s.enablement.status))

    expect(core.snapshot.enablement.status).toBe("idle")

    await core.loadModel()

    expect(observed).toContain("assessing")
    expect(observed).toContain("probing")
    expect(observed[observed.length - 1]).toBe("ready")
  })

  it("SSR initial state has probe not-run", () => {
    const core = createBabulfish()

    expect(core.snapshot.enablement.probe.status).toBe("not-run")
    expect(core.snapshot.enablement.probe.cache).toBeNull()
  })

  it("probe summary shows cache 'hit' on repeated call", async () => {
    const mockGPU = createMockGPU()
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })
    mockLoadPipeline.mockResolvedValue(createMockPipeline())

    const core1 = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })
    await core1.loadModel()

    expect(core1.snapshot.enablement.probe.cache).toBe("miss")

    __resetEnablementAssessmentForTests()
    __resetEngineForTests()

    const core2 = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })
    await core2.loadModel()

    expect(core2.snapshot.enablement.probe.cache).toBe("hit")
  })

  it("probe summary shows cache 'miss' on first call", async () => {
    const mockGPU = createMockGPU()
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0, gpu: mockGPU })
    mockLoadPipeline.mockResolvedValue(createMockPipeline())

    const core = createBabulfish({
      engine: { enablement: { probe: "if-needed" } },
    })
    await core.loadModel()

    expect(core.snapshot.enablement.probe.cache).toBe("miss")
  })
})
