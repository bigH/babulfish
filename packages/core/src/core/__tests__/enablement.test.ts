import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { createBabulfish } from "../babulfish.js"
import { loadPipeline } from "../../engine/pipeline-loader.js"
import {
  __resetEnablementAssessmentForTests,
  __resetEngineForTests,
} from "../../engine/testing/index.js"
import {
  captureGlobalDescriptors,
  restoreGlobals,
  setGlobal,
} from "../../__tests__/globals.test-utils.js"

const mockLoadPipeline = vi.mocked(loadPipeline)
const originalGlobals = captureGlobalDescriptors()

function createMockPipeline() {
  const generate = vi.fn(async () => [{ generated_text: [{ role: "assistant", content: "hola" }] }])
  return Object.assign(generate, {
    _call: generate,
    task: "text-generation" as const,
    model: {} as unknown,
    tokenizer: {} as unknown,
    dispose: vi.fn(async () => {}),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetEnablementAssessmentForTests()
  __resetEngineForTests()
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
