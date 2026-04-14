import { describe, it, expect, vi, beforeEach } from "vitest"
import type {
  Message,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
} from "@huggingface/transformers"

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers
// ---------------------------------------------------------------------------

function createMockTextGenerationPipeline() {
  const generate = vi.fn<TextGenerationPipeline["_call"]>()
  type GenerateOptions = Parameters<TextGenerationPipeline["_call"]>[1]

  function mockGenerator(
    texts: string,
    options?: GenerateOptions,
  ): Promise<TextGenerationStringOutput>
  function mockGenerator(
    texts: Message[],
    options?: GenerateOptions,
  ): Promise<TextGenerationChatOutput>
  function mockGenerator(
    texts: string[],
    options?: GenerateOptions,
  ): Promise<TextGenerationStringOutput[]>
  function mockGenerator(
    texts: Message[][],
    options?: GenerateOptions,
  ): Promise<TextGenerationChatOutput[]>
  function mockGenerator(
    texts: string | string[] | Message[] | Message[][],
    options?: GenerateOptions,
  ) {
    return generate(texts, options)
  }

  return {
    generate,
    generator: Object.assign(mockGenerator, {
      _call: generate,
      task: "text-generation",
      model: {} as TextGenerationPipeline["model"],
      tokenizer: {} as TextGenerationPipeline["tokenizer"],
      dispose: vi.fn(async () => {}),
    }) satisfies TextGenerationPipeline,
  }
}

function resolveMockPipeline(): Promise<TextGenerationPipeline> {
  return Promise.resolve(mockGenerator)
}

const { generate: mockGenerate, generator: mockGenerator } =
  createMockTextGenerationPipeline()

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(resolveMockPipeline),
}))

// Must import after mock setup
import { createEngine } from "../model.js"
import type { TranslatorStatus } from "../model.js"
import { pipeline } from "@huggingface/transformers"

const mockPipeline = vi.mocked(pipeline)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusChange = { from: TranslatorStatus; to: TranslatorStatus; error?: unknown }

function statusChanges(engine: ReturnType<typeof createEngine>) {
  const changes: StatusChange[] = []
  engine.on("status-change", (e) => changes.push(e))
  return changes
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockReset()
    mockPipeline.mockImplementation(resolveMockPipeline)
  })

  it("returns idle status initially", () => {
    const engine = createEngine()
    expect(engine.status).toBe("idle")
  })

  it("has all expected methods", () => {
    const engine = createEngine()
    expect(typeof engine.load).toBe("function")
    expect(typeof engine.translate).toBe("function")
    expect(typeof engine.dispose).toBe("function")
    expect(typeof engine.on).toBe("function")
  })
})

describe("load", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockReset()
    mockPipeline.mockImplementation(resolveMockPipeline)
  })

  it("transitions idle -> downloading -> ready", async () => {
    const engine = createEngine()
    const changes = statusChanges(engine)

    await engine.load()

    expect(changes).toEqual([
      { from: "idle", to: "downloading" },
      { from: "downloading", to: "ready" },
    ])
    expect(engine.status).toBe("ready")
  })

  it("calls pipeline with correct defaults", async () => {
    const engine = createEngine()
    await engine.load()

    expect(mockPipeline).toHaveBeenCalledWith(
      "text-generation",
      "onnx-community/translategemma-text-4b-it-ONNX",
      expect.objectContaining({
        dtype: "q4",
        progress_callback: expect.any(Function),
      }),
    )
  })

  it("uses custom config when provided", async () => {
    const engine = createEngine({
      modelId: "my-model",
      dtype: "fp16",
      device: "wasm",
      maxNewTokens: 256,
    })
    await engine.load()

    expect(mockPipeline).toHaveBeenCalledWith(
      "text-generation",
      "my-model",
      expect.objectContaining({
        dtype: "fp16",
        device: "wasm",
      }),
    )
  })

  it("is idempotent — second call waits for first", async () => {
    const engine = createEngine()
    await Promise.all([engine.load(), engine.load()])
    expect(mockPipeline).toHaveBeenCalledTimes(1)
  })

  it("transitions to error on failure and carries the error", async () => {
    const cause = new Error("network down")
    mockPipeline.mockImplementation(() => Promise.reject(cause))

    const engine = createEngine()
    const changes = statusChanges(engine)

    await expect(engine.load()).rejects.toThrow("network down")

    expect(changes).toEqual([
      { from: "idle", to: "downloading" },
      { from: "downloading", to: "error", error: cause },
    ])
    expect(engine.status).toBe("error")
  })

  it("allows retry after failure", async () => {
    mockPipeline
      .mockImplementationOnce(() => Promise.reject(new Error("fail")))
      .mockImplementationOnce(resolveMockPipeline)

    const engine = createEngine()
    await expect(engine.load()).rejects.toThrow("fail")
    await engine.load()
    expect(engine.status).toBe("ready")
  })
})

describe("translate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockReset()
    mockPipeline.mockImplementation(resolveMockPipeline)
  })

  it("throws if model not loaded", async () => {
    const engine = createEngine()
    await expect(engine.translate("hello", "es")).rejects.toThrow(
      "Translation model not loaded",
    )
  })

  it("calls generator with correct message format", async () => {
    mockGenerate.mockResolvedValue([
      {
        generated_text: [
          { role: "user", content: "..." },
          { role: "assistant", content: "hola" },
        ],
      },
    ])

    const engine = createEngine({ sourceLanguage: "en" })
    await engine.load()
    const result = await engine.translate("hello", "es")

    expect(result).toBe("hola")
    expect(mockGenerate).toHaveBeenCalledWith(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              source_lang_code: "en",
              target_lang_code: "es",
              text: "hello",
            },
          ],
        },
      ],
      { max_new_tokens: 512 },
    )
  })

  it("respects custom maxNewTokens", async () => {
    mockGenerate.mockResolvedValue([
      {
        generated_text: [{ role: "assistant", content: "hola" }],
      },
    ])

    const engine = createEngine({ maxNewTokens: 128 })
    await engine.load()
    await engine.translate("hello", "es")

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.anything(),
      { max_new_tokens: 128 },
    )
  })

  it("throws on unexpected model output", async () => {
    mockGenerate.mockResolvedValue([{ generated_text: [] }])

    const engine = createEngine()
    await engine.load()
    await expect(engine.translate("hello", "es")).rejects.toThrow(
      "Unexpected model output format",
    )
  })
})

describe("dispose", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockReset()
    mockPipeline.mockImplementation(resolveMockPipeline)
  })

  it("resets status to idle and removes listeners", async () => {
    const engine = createEngine()
    const changes = statusChanges(engine)
    await engine.load()

    changes.length = 0
    engine.dispose()

    // dispose fires status-change to idle, then clears listeners
    expect(engine.status).toBe("idle")
  })

  it("requires re-loading after dispose", async () => {
    const engine = createEngine()
    await engine.load()
    engine.dispose()

    await expect(engine.translate("hello", "es")).rejects.toThrow(
      "Translation model not loaded",
    )
  })
})

describe("event emitter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockReset()
    mockPipeline.mockImplementation(resolveMockPipeline)
  })

  it("on() returns unsubscribe function", async () => {
    const engine = createEngine()
    const changes: TranslatorStatus[] = []
    const unsub = engine.on("status-change", (e) => changes.push(e.to))

    await engine.load()
    unsub()
    engine.dispose()

    // Only the load transitions should be captured, not dispose
    expect(changes).toEqual(["downloading", "ready"])
  })

  it("emits progress events during download", async () => {
    let capturedCallback: ((event: unknown) => void) | undefined

    mockPipeline.mockImplementation((_task, _model, opts) => {
      capturedCallback = (opts as { progress_callback: (e: unknown) => void }).progress_callback
      return resolveMockPipeline()
    })

    const engine = createEngine()
    const progressEvents: Array<{ loaded: number; total: number }> = []
    engine.on("progress", (e) => progressEvents.push(e))

    await engine.load()

    // Simulate progress events
    capturedCallback?.({
      status: "progress",
      file: "model.bin",
      loaded: 500,
      total: 1000,
    })
    capturedCallback?.({
      status: "progress",
      file: "tokenizer.json",
      loaded: 100,
      total: 200,
    })

    expect(progressEvents).toHaveLength(2)
    expect(progressEvents[0]).toEqual({
      loaded: 500,
      total: 1000,
      name: "model.bin",
    })
    expect(progressEvents[1]).toEqual({
      loaded: 600,
      total: 1200,
      name: "tokenizer.json",
    })
  })

  it("ignores non-progress status events", async () => {
    let capturedCallback: ((event: unknown) => void) | undefined

    mockPipeline.mockImplementation((_task, _model, opts) => {
      capturedCallback = (opts as { progress_callback: (e: unknown) => void }).progress_callback
      return resolveMockPipeline()
    })

    const engine = createEngine()
    const progressEvents: unknown[] = []
    engine.on("progress", (e) => progressEvents.push(e))

    await engine.load()

    capturedCallback?.({ status: "initiate", file: "model.bin", name: "m" })
    capturedCallback?.({ status: "done", file: "model.bin", name: "m" })

    expect(progressEvents).toHaveLength(0)
  })
})

describe("error propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockReset()
    mockPipeline.mockImplementation(resolveMockPipeline)
  })

  it("surfaces the exact error from a rejected pipeline import", async () => {
    const forced = new Error("forced failure for test")
    mockPipeline.mockImplementation(() => Promise.reject(forced))

    const engine = createEngine()
    const received: unknown[] = []
    engine.on("status-change", (e) => {
      if (e.error !== undefined) received.push(e.error)
    })

    await expect(engine.load()).rejects.toThrow("forced failure for test")

    expect(received).toHaveLength(1)
    expect(received[0]).toBe(forced)
  })

  it("does not include error field on non-error transitions", async () => {
    const engine = createEngine()
    const changes = statusChanges(engine)

    await engine.load()

    for (const change of changes) {
      expect(change).not.toHaveProperty("error")
    }
  })
})

describe("multiple instances", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockReset()
    mockPipeline.mockImplementation(resolveMockPipeline)
  })

  it("instances are fully independent", async () => {
    const a = createEngine({ modelId: "model-a" })
    const b = createEngine({ modelId: "model-b" })

    await a.load()
    expect(a.status).toBe("ready")
    expect(b.status).toBe("idle")

    a.dispose()
    expect(a.status).toBe("idle")
    expect(b.status).toBe("idle")

    await b.load()
    expect(b.status).toBe("ready")
    expect(a.status).toBe("idle")

    expect(mockPipeline).toHaveBeenCalledTimes(2)
  })
})
