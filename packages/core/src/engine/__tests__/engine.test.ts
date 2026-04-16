import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type {
  Message,
  PipelineOptions,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
} from "../pipeline-loader.js"

// ---------------------------------------------------------------------------
// Mock pipeline-loader (the single @huggingface/transformers chokepoint)
// ---------------------------------------------------------------------------

function createMockTextGenerationPipeline() {
  const generate = vi.fn<TextGenerationPipeline["_call"]>()
  const dispose = vi.fn(async () => {})
  type GenerateInput = Parameters<TextGenerationPipeline["_call"]>[0]
  type GenerateOptions = Parameters<TextGenerationPipeline["_call"]>[1]

  function mockGenerator(
    texts: GenerateInput,
    options?: GenerateOptions,
  ) {
    return generate(texts, options)
  }

  return {
    generate,
    dispose,
    generator: Object.assign(mockGenerator, {
      _call: generate,
      task: "text-generation",
      model: {} as TextGenerationPipeline["model"],
      tokenizer: {} as TextGenerationPipeline["tokenizer"],
      dispose,
    }) satisfies TextGenerationPipeline,
  }
}

function resolveMockPipeline(): Promise<TextGenerationPipeline> {
  return Promise.resolve(mockGenerator)
}

const { generate: mockGenerate, dispose: mockDispose, generator: mockGenerator } =
  createMockTextGenerationPipeline()

vi.mock("../pipeline-loader.js", () => ({
  loadPipeline: vi.fn(resolveMockPipeline),
}))

// Must import after mock setup
import { createEngine } from "../model.js"
import type { TranslatorStatus } from "../model.js"
import { loadPipeline } from "../pipeline-loader.js"
import {
  captureGlobalDescriptors,
  restoreGlobals,
  setGlobal,
} from "../../__tests__/globals.test-utils.js"

const mockLoadPipeline = vi.mocked(loadPipeline)
const originalGlobals = captureGlobalDescriptors()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusChange = { from: TranslatorStatus; to: TranslatorStatus; error?: unknown }

function statusChanges(engine: ReturnType<typeof createEngine>) {
  const changes: StatusChange[] = []
  engine.on("status-change", (e) => changes.push(e))
  return changes
}

type ProgressCallback = NonNullable<PipelineOptions["progress_callback"]>

function captureProgressCallback() {
  return () => mockLoadPipeline.mock.lastCall?.[1]?.progress_callback
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  mockLoadPipeline.mockReset()
  mockGenerate.mockReset()
  mockLoadPipeline.mockImplementation(resolveMockPipeline)
})

afterEach(() => {
  restoreGlobals(originalGlobals)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createEngine", () => {
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
    setGlobal("window", { innerWidth: 1280 })
    setGlobal("navigator", { maxTouchPoints: 0 })

    const engine = createEngine()
    await engine.load()

    expect(mockLoadPipeline).toHaveBeenCalledWith(
      "onnx-community/translategemma-text-4b-it-ONNX",
      expect.objectContaining({
        dtype: "q4",
        device: "wasm",
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

    expect(mockLoadPipeline).toHaveBeenCalledWith(
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
    expect(mockLoadPipeline).toHaveBeenCalledTimes(1)
  })

  it("transitions to error on failure and carries the error", async () => {
    const cause = new Error("network down")
    mockLoadPipeline.mockImplementation(() => Promise.reject(cause))

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
    mockLoadPipeline
      .mockImplementationOnce(() => Promise.reject(new Error("fail")))
      .mockImplementationOnce(resolveMockPipeline)

    const engine = createEngine()
    await expect(engine.load()).rejects.toThrow("fail")
    await engine.load()
    expect(engine.status).toBe("ready")
  })
})

describe("translate", () => {
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
  it("resets status to idle and disposes the loaded pipeline", async () => {
    const engine = createEngine()
    await engine.load()

    engine.dispose()

    expect(engine.status).toBe("idle")
    await Promise.resolve()
    expect(mockDispose).toHaveBeenCalledTimes(1)
  })

  it("requires re-loading after dispose", async () => {
    const engine = createEngine()
    await engine.load()
    engine.dispose()

    await expect(engine.translate("hello", "es")).rejects.toThrow(
      "Translation model not loaded",
    )
  })

  it("can load again after dispose", async () => {
    const engine = createEngine()

    await engine.load()
    engine.dispose()
    await engine.load()

    expect(engine.status).toBe("ready")
    expect(mockLoadPipeline).toHaveBeenCalledTimes(2)
  })

  it("ignores stale load completion after dispose and reload", async () => {
    const firstLoad = createDeferred<TextGenerationPipeline>()
    mockLoadPipeline
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(resolveMockPipeline)

    const engine = createEngine()
    const changes = statusChanges(engine)

    const loading = engine.load()
    engine.dispose()
    const reloading = engine.load()
    firstLoad.resolve(mockGenerator)

    await loading
    await reloading

    expect(engine.status).toBe("ready")
    expect(changes).toEqual([
      { from: "idle", to: "downloading" },
      { from: "downloading", to: "idle" },
      { from: "idle", to: "downloading" },
      { from: "downloading", to: "ready" },
    ])
  })
})

describe("event emitter", () => {
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
    const getProgressCallback = captureProgressCallback()
    const engine = createEngine()
    const progressEvents: Array<{ loaded: number; total: number }> = []
    engine.on("progress", (e) => progressEvents.push(e))

    await engine.load()

    getProgressCallback()?.({
      status: "progress",
      file: "model.bin",
      loaded: 500,
      total: 1000,
    })
    getProgressCallback()?.({
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

  it("prefers aggregate progress_total events over duplicate per-file progress", async () => {
    const getProgressCallback = captureProgressCallback()
    const engine = createEngine()
    const progressEvents: Array<{ loaded: number; total: number; name?: string }> = []
    engine.on("progress", (e) => progressEvents.push(e))

    await engine.load()

    getProgressCallback()?.({
      status: "progress_total",
      name: "model-id",
      progress: 50,
      loaded: 600,
      total: 1200,
      files: {
        "model.bin": { loaded: 500, total: 1000 },
        "tokenizer.json": { loaded: 100, total: 200 },
      },
    })
    getProgressCallback()?.({
      status: "progress",
      name: "model-id",
      file: "tokenizer.json",
      progress: 50,
      loaded: 100,
      total: 200,
    })

    expect(progressEvents).toEqual([
      {
        loaded: 600,
        total: 1200,
        name: "model-id",
      },
    ])
  })

  it("ignores non-progress status events", async () => {
    const getProgressCallback = captureProgressCallback()
    const engine = createEngine()
    const progressEvents: unknown[] = []
    engine.on("progress", (e) => progressEvents.push(e))

    await engine.load()

    getProgressCallback()?.({ status: "initiate", file: "model.bin", name: "m" })
    getProgressCallback()?.({ status: "done", file: "model.bin", name: "m" })

    expect(progressEvents).toHaveLength(0)
  })
})

describe("error propagation", () => {
  it("surfaces the exact error from a rejected pipeline import", async () => {
    const forced = new Error("forced failure for test")
    mockLoadPipeline.mockImplementation(() => Promise.reject(forced))

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

    expect(mockLoadPipeline).toHaveBeenCalledTimes(2)
  })
})
