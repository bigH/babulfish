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
import type { TranslationAdapter } from "../../engine/translation-adapter.js"

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

function testAdapter(id: string): TranslationAdapter {
  return {
    id,
    label: `${id} adapter`,
    validateOptions: () => ({ warnings: [], errors: [] }),
    buildInvocation: () => ({ modelInput: "prompt", modelOptions: { max_new_tokens: 1 } }),
    extractText: () => ({ text: "translated" }),
  }
}

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
  const translateGemmaAdapter = testAdapter("translategemma")
  const chatAdapter = testAdapter("chat")

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

  it("same repo with different adapters gets different engine identities", async () => {
    setupPipelineMock()
    const a = createBabulfish({ engine: { device: "wasm", modelId: "acme/shared" } })
    const b = createBabulfish({
      engine: {
        device: "wasm",
        model: {
          id: "shared-chat",
          label: "Shared chat",
          modelId: "acme/shared",
          adapter: chatAdapter,
        },
      },
    })

    await Promise.all([a.loadModel(), b.loadModel()])

    expect(getEngineIdentity(a)).not.toBe(getEngineIdentity(b))
    expect(mockLoadPipeline).toHaveBeenCalledTimes(2)
  })

  it("same repo and adapter with different file locations gets different identities", async () => {
    setupPipelineMock()
    const a = createBabulfish({
      engine: {
        device: "wasm",
        model: {
          id: "shared-a",
          label: "Shared A",
          modelId: "acme/shared",
          adapter: translateGemmaAdapter,
          defaults: { subfolder: "onnx" },
        },
      },
    })
    const b = createBabulfish({
      engine: {
        device: "wasm",
        model: {
          id: "shared-b",
          label: "Shared B",
          modelId: "acme/shared",
          adapter: translateGemmaAdapter,
          defaults: { modelFileName: "model" },
        },
      },
    })

    await Promise.all([a.loadModel(), b.loadModel()])

    expect(getEngineIdentity(a)).not.toBe(getEngineIdentity(b))
    expect(mockLoadPipeline).toHaveBeenCalledTimes(2)
  })

  it("equivalent legacy and custom resolved configs share across cores", async () => {
    setupPipelineMock()
    const legacy = createBabulfish({ engine: { device: "wasm", modelId: "acme/shared" } })
    const custom = createBabulfish({
      engine: {
        device: "wasm",
        model: {
          id: "different-request-id",
          label: "Different request",
          modelId: "acme/shared",
          adapter: translateGemmaAdapter,
        },
      },
    })

    await Promise.all([legacy.loadModel(), custom.loadModel()])

    expect(getEngineIdentity(legacy)).toBe(getEngineIdentity(custom))
    expect(mockLoadPipeline).toHaveBeenCalledTimes(1)
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
