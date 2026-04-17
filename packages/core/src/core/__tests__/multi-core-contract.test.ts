import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
// ---------------------------------------------------------------------------

vi.mock("../../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { createBabulfish } from "../babulfish.js"
import {
  __resetEngineForTests,
  __resetEnablementAssessmentForTests,
  getEngineIdentity,
} from "../../engine/testing/index.js"
import { loadPipeline } from "../../engine/pipeline-loader.js"

const mockLoadPipeline = vi.mocked(loadPipeline)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockGenerator() {
  return vi.fn(async () => [
    {
      generated_text: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hola" },
      ],
    },
  ])
}

function createMockPipeline() {
  const generate = createMockGenerator()
  return Object.assign(generate, {
    _call: generate,
    task: "text-generation" as const,
    model: {} as unknown,
    tokenizer: {} as unknown,
    dispose: vi.fn(async () => {}),
  })
}

type LoadPipelineReturn = Awaited<ReturnType<typeof loadPipeline>>

function setupPipelineMock(): void {
  mockLoadPipeline.mockImplementation(
    async () => createMockPipeline() as unknown as LoadPipelineReturn,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
  __resetEnablementAssessmentForTests()
})

afterEach(() => {
  __resetEngineForTests()
  __resetEnablementAssessmentForTests()
})

describe("multi-core — different-key isolation", () => {
  it("two cores with different dtype get different engine identities", async () => {
    setupPipelineMock()
    const a = createBabulfish({ engine: { device: "wasm", dtype: "q4" } })
    const b = createBabulfish({ engine: { device: "wasm", dtype: "fp16" } })

    await Promise.all([a.loadModel(), b.loadModel()])

    expect(getEngineIdentity(a)).toBeDefined()
    expect(getEngineIdentity(b)).toBeDefined()
    expect(getEngineIdentity(a)).not.toBe(getEngineIdentity(b))
    expect(mockLoadPipeline).toHaveBeenCalledTimes(2)
  })

  it("two cores with different sourceLanguage get different engine identities", async () => {
    setupPipelineMock()
    const a = createBabulfish({ engine: { device: "wasm", sourceLanguage: "en" } })
    const b = createBabulfish({ engine: { device: "wasm", sourceLanguage: "fr" } })

    await Promise.all([a.loadModel(), b.loadModel()])

    expect(getEngineIdentity(a)).not.toBe(getEngineIdentity(b))
    expect(mockLoadPipeline).toHaveBeenCalledTimes(2)
  })

  it("two cores with different modelId get different engine identities", async () => {
    setupPipelineMock()
    const a = createBabulfish({ engine: { device: "wasm", modelId: "acme/a" } })
    const b = createBabulfish({ engine: { device: "wasm", modelId: "acme/b" } })

    await Promise.all([a.loadModel(), b.loadModel()])

    expect(getEngineIdentity(a)).not.toBe(getEngineIdentity(b))
    expect(mockLoadPipeline).toHaveBeenCalledTimes(2)
  })

  it("disposing one core does not leak enablement state or engine identity into the other", async () => {
    setupPipelineMock()
    const a = createBabulfish({ engine: { device: "wasm", dtype: "q4" } })
    const b = createBabulfish({ engine: { device: "wasm", dtype: "fp16" } })

    await a.loadModel()
    const aIdentity = getEngineIdentity(a)
    expect(a.snapshot.enablement.status).toBe("ready")
    // b is still idle — no cross-pollination from a's load.
    expect(b.snapshot.enablement.status).toBe("idle")
    expect(getEngineIdentity(b)).toBeUndefined()

    await a.dispose()

    await b.loadModel()

    expect(b.snapshot.enablement.status).toBe("ready")
    const bIdentity = getEngineIdentity(b)
    expect(bIdentity).toBeDefined()
    expect(bIdentity).not.toBe(aIdentity)
  })
})
