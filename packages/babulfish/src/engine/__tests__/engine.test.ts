import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers
// ---------------------------------------------------------------------------

const mockGenerator = vi.fn()

vi.mock("@huggingface/transformers", () => ({
  pipeline: vi.fn(() => Promise.resolve(mockGenerator)),
}))

// Must import after mock setup
import { createEngine } from "../model.js"
import type { TranslatorStatus } from "../model.js"
import { pipeline } from "@huggingface/transformers"

const mockPipeline = vi.mocked(pipeline)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusChanges(engine: ReturnType<typeof createEngine>) {
  const changes: Array<{ from: TranslatorStatus; to: TranslatorStatus }> = []
  engine.on("status-change", (e) => changes.push(e))
  return changes
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerator.mockReset()
    mockPipeline.mockImplementation(
      () => Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>,
    )
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
    mockGenerator.mockReset()
    mockPipeline.mockImplementation(
      () => Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>,
    )
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

  it("transitions to error on failure", async () => {
    mockPipeline.mockImplementation(
      () => Promise.reject(new Error("network down")) as ReturnType<typeof pipeline>,
    )

    const engine = createEngine()
    const changes = statusChanges(engine)

    await expect(engine.load()).rejects.toThrow("network down")

    expect(changes).toEqual([
      { from: "idle", to: "downloading" },
      { from: "downloading", to: "error" },
    ])
    expect(engine.status).toBe("error")
  })

  it("allows retry after failure", async () => {
    mockPipeline
      .mockImplementationOnce(
        () => Promise.reject(new Error("fail")) as ReturnType<typeof pipeline>,
      )
      .mockImplementationOnce(
        () => Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>,
      )

    const engine = createEngine()
    await expect(engine.load()).rejects.toThrow("fail")
    await engine.load()
    expect(engine.status).toBe("ready")
  })
})

describe("translate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerator.mockReset()
    mockPipeline.mockImplementation(
      () => Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>,
    )
  })

  it("throws if model not loaded", async () => {
    const engine = createEngine()
    await expect(engine.translate("hello", "es")).rejects.toThrow(
      "Translation model not loaded",
    )
  })

  it("calls generator with correct message format", async () => {
    mockGenerator.mockResolvedValue([
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
    expect(mockGenerator).toHaveBeenCalledWith(
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
    mockGenerator.mockResolvedValue([
      {
        generated_text: [{ role: "assistant", content: "hola" }],
      },
    ])

    const engine = createEngine({ maxNewTokens: 128 })
    await engine.load()
    await engine.translate("hello", "es")

    expect(mockGenerator).toHaveBeenCalledWith(
      expect.anything(),
      { max_new_tokens: 128 },
    )
  })

  it("throws on unexpected model output", async () => {
    mockGenerator.mockResolvedValue([{ generated_text: [] }])

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
    mockGenerator.mockReset()
    mockPipeline.mockImplementation(
      () => Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>,
    )
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
    mockGenerator.mockReset()
    mockPipeline.mockImplementation(
      () => Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>,
    )
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
      return Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>
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
      return Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>
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

describe("multiple instances", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerator.mockReset()
    mockPipeline.mockImplementation(
      () => Promise.resolve(mockGenerator) as ReturnType<typeof pipeline>,
    )
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
