import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { TextGenerationPipeline } from "../pipeline-loader.js"
import { wrapGeneratorAsPipeline } from "../../testing/conformance-helpers.js"

// ---------------------------------------------------------------------------
// Mock pipeline-loader (the single @huggingface/transformers chokepoint)
// ---------------------------------------------------------------------------

const mockGenerate = vi.fn<TextGenerationPipeline["_call"]>()
const mockDispose = vi.fn(async () => {})
const mockGenerator = wrapGeneratorAsPipeline(mockGenerate, mockDispose)

function resolveMockPipeline(): Promise<TextGenerationPipeline> {
  return Promise.resolve(mockGenerator)
}

vi.mock("../pipeline-loader.js", () => ({
  loadPipeline: vi.fn(resolveMockPipeline),
}))

// Must import after mock setup
import { createEngine } from "../model.js"
import type { TranslatorStatus } from "../model.js"
import type { TranslationAdapter } from "../translation-adapter.js"
import { loadPipeline } from "../pipeline-loader.js"
import {
  captureGlobalDescriptors,
  restoreGlobals,
  setGlobal,
} from "../../__tests__/globals.test-utils.js"

const mockLoadPipeline = vi.mocked(loadPipeline)
const originalGlobals = captureGlobalDescriptors()
const PRESERVE_TOKEN_PATTERN = /__BF_PRESERVE_\d+_\d+__/gu

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusChange = { from: TranslatorStatus; to: TranslatorStatus; error?: unknown }

function statusChanges(engine: ReturnType<typeof createEngine>) {
  const changes: StatusChange[] = []
  engine.on("status-change", (e) => changes.push(e))
  return changes
}

function lastProgressCallback() {
  return mockLoadPipeline.mock.lastCall?.[1]?.progress_callback
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

function expectSinglePreserveToken(text: string): string {
  const matches = [...text.matchAll(PRESERVE_TOKEN_PATTERN)]
  expect(matches).toHaveLength(1)
  return matches[0]![0]
}

beforeEach(() => {
  mockLoadPipeline.mockReset()
  mockGenerate.mockReset()
  mockDispose.mockClear()
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

  it("forwards adapter file location and q4f16 dtype for chat built-ins", async () => {
    const engine = createEngine({ model: "qwen-3-0.6b" })
    await engine.load()

    expect(mockLoadPipeline).toHaveBeenCalledWith(
      "onnx-community/Qwen3-0.6B-ONNX",
      expect.objectContaining({
        dtype: "q4f16",
        device: "webgpu",
        subfolder: "onnx",
        model_file_name: "model",
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

  it("reuses the in-flight load when a downloading listener calls load()", async () => {
    const firstLoad = createDeferred<TextGenerationPipeline>()
    mockLoadPipeline.mockImplementationOnce(() => firstLoad.promise)

    const engine = createEngine()
    const reentrantLoads: Promise<void>[] = []
    engine.on("status-change", (event) => {
      if (event.to === "downloading") {
        reentrantLoads.push(engine.load())
      }
    })

    const loading = engine.load()
    firstLoad.resolve(mockGenerator)

    await loading
    await Promise.all(reentrantLoads)

    expect(mockLoadPipeline).toHaveBeenCalledTimes(1)
    expect(engine.status).toBe("ready")
  })

  it("stays idle when a downloading listener disposes the engine", async () => {
    const firstLoad = createDeferred<TextGenerationPipeline>()
    mockLoadPipeline.mockImplementationOnce(() => firstLoad.promise)

    const engine = createEngine()
    const changes = statusChanges(engine)
    engine.on("status-change", (event) => {
      if (event.to === "downloading") {
        engine.dispose()
      }
    })

    const loading = engine.load()
    firstLoad.resolve(mockGenerator)

    await loading
    await Promise.resolve()

    expect(engine.status).toBe("idle")
    expect(mockDispose).toHaveBeenCalledTimes(1)
    expect(changes).toEqual([
      { from: "idle", to: "downloading" },
      { from: "downloading", to: "idle" },
    ])
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

  it("sends deterministic chat prompts for chat adapters", async () => {
    mockGenerate.mockResolvedValue([{ generated_text: " hola " }])

    const engine = createEngine({ model: "qwen-3-0.6b" })
    await engine.load()
    const result = await engine.translate("hello", "es")

    expect(result).toBe("hola")
    expect(mockGenerate).toHaveBeenCalledWith(
      [
        {
          role: "system",
          content:
            "You are a translation engine. Translate from English (en) to Spanish (es). " +
            "Output only the translation. " +
            "Translate short UI labels, buttons, headings, and sentence fragments naturally; do not copy source text just because it is short. " +
            "Keep brand names, product names, code identifiers, URLs, numbers, and preserved terms unchanged; translate the surrounding prose. " +
            "Do not return the source unchanged when it contains translatable prose.",
        },
        {
          role: "user",
          content:
            "Translate this text to Spanish (es).\n" +
            "Return only the translated text.\n\n" +
            "Source:\n" +
            "hello",
        },
      ],
      {
        max_new_tokens: 256,
        do_sample: false,
        return_full_text: false,
        tokenizer_encode_kwargs: { enable_thinking: false },
      },
    )
  })

  it("extracts chat array output from the last assistant message", async () => {
    mockGenerate.mockResolvedValue([
      {
        generated_text: [
          { role: "assistant", content: " primero " },
          { role: "user", content: "ignored" },
          { role: "assistant", content: " segundo " },
        ],
      },
    ])

    const engine = createEngine({ model: "gemma-3-1b-it" })
    await engine.load()

    await expect(engine.translate("hello", "es")).resolves.toBe("segundo")
  })

  it("trims only the generic chat adapter output", async () => {
    mockGenerate.mockResolvedValueOnce([
      {
        generated_text: [{ role: "assistant", content: " hola " }],
      },
    ])

    const translateGemma = createEngine()
    await translateGemma.load()
    await expect(translateGemma.translate("hello", "es")).resolves.toBe(" hola ")

    mockGenerate.mockResolvedValueOnce([{ generated_text: " hola " }])

    const chat = createEngine({ model: "qwen-3-0.6b" })
    await chat.load()
    await expect(chat.translate("hello", "es")).resolves.toBe("hola")
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

  it("threads declarative preservation options through built-in adapters", async () => {
    mockGenerate.mockImplementation(async (input) => {
      const first = Array.isArray(input)
        ? input[0] as { readonly content?: readonly [{ readonly text?: unknown }] }
        : null
      const text = first?.content?.[0]?.text
      expect(typeof text).toBe("string")
      const token = expectSinglePreserveToken(text as string)
      expect(text).not.toContain("Chime")
      return [{ generated_text: [{ role: "assistant", content: `Hola ${token}` }] }]
    })

    const engine = createEngine({ sourceLanguage: "en" })
    await engine.load()

    await expect(
      engine.translate("hello Chime", "es", {
        substrings_to_preserve: ["Chime"],
      }),
    ).resolves.toBe("Hola Chime")
  })

  it("lets the default TranslateGemma adapter accept markdown intent as text", async () => {
    mockGenerate.mockImplementation(async (input) => {
      const first = Array.isArray(input)
        ? input[0] as { readonly content?: readonly [{ readonly text?: unknown }] }
        : null
      const text = first?.content?.[0]?.text
      expect(typeof text).toBe("string")
      const token = expectSinglePreserveToken(text as string)
      expect(text).toBe(`hello **${token}**`)
      return [{ generated_text: [{ role: "assistant", content: `hola **${token}**` }] }]
    })

    const engine = createEngine({ sourceLanguage: "en" })
    await engine.load()

    await expect(
      engine.translate("hello **Chime**", "es", {
        content_type: "markdown",
        substrings_to_preserve: ["Chime"],
      }),
    ).resolves.toBe("hola **Chime**")
  })

  it("throws on unexpected model output", async () => {
    mockGenerate.mockResolvedValue([{ generated_text: [] }])

    const engine = createEngine()
    await engine.load()
    await expect(engine.translate("hello", "es")).rejects.toThrow(
      "Unexpected model output format",
    )
  })

  it("uses custom adapter buildInvocation and extractText", async () => {
    const adapter: TranslationAdapter = {
      id: "custom-adapter",
      label: "Custom adapter",
      validateOptions: vi.fn(() => ({ warnings: [], errors: [] })),
      buildInvocation: vi.fn((request, options) => ({
        modelInput: `translate:${request.source.code}:${request.target.code}:${request.text}`,
        modelOptions: { ...options, custom: "custom-adapter" },
      })),
      extractText: vi.fn((_request, _options, output) => ({
        text: `done:${JSON.stringify(output)}`,
      })),
    }
    mockGenerate.mockResolvedValue([{ generated_text: "raw" }])

    const engine = createEngine({
      model: {
        id: "custom-model",
        label: "Custom model",
        modelId: "acme/custom",
        adapter,
        defaults: { maxNewTokens: 9 },
      },
      device: "wasm",
    })
    await engine.load()

    await expect(engine.translate("hello", "es")).resolves.toBe(
      "done:[{\"generated_text\":\"raw\"}]",
    )
    expect(adapter.buildInvocation).toHaveBeenCalledWith(
      {
        text: "hello",
        source: { code: "en" },
        target: { code: "es" },
      },
      { max_new_tokens: 9 },
    )
    expect(mockGenerate).toHaveBeenCalledWith(
      "translate:en:es:hello",
      { max_new_tokens: 9, custom: "custom-adapter" },
    )
    expect(adapter.extractText).toHaveBeenCalledWith(
      {
        text: "hello",
        source: { code: "en" },
        target: { code: "es" },
      },
      { max_new_tokens: 9 },
      [{ generated_text: "raw" }],
    )
  })

  it("propagates custom adapter extraction errors unchanged", async () => {
    const forced = new Error("adapter failed")
    const adapter: TranslationAdapter = {
      id: "custom-adapter",
      label: "Custom adapter",
      validateOptions: () => ({ warnings: [], errors: [] }),
      buildInvocation: () => ({ modelInput: "prompt", modelOptions: { max_new_tokens: 1 } }),
      extractText: () => {
        throw forced
      },
    }
    mockGenerate.mockResolvedValue([{ generated_text: "raw" }])

    const engine = createEngine({
      model: { id: "custom", label: "Custom model", modelId: "acme/custom", adapter },
    })
    await engine.load()

    await expect(engine.translate("hello", "es")).rejects.toBe(forced)
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
    const engine = createEngine()
    const progressEvents: Array<{ loaded: number; total: number }> = []
    engine.on("progress", (e) => progressEvents.push(e))

    await engine.load()

    lastProgressCallback()?.({
      status: "progress",
      name: "model-id",
      file: "model.bin",
      progress: 50,
      loaded: 500,
      total: 1000,
    })
    lastProgressCallback()?.({
      status: "progress",
      name: "model-id",
      file: "tokenizer.json",
      progress: 50,
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
    const engine = createEngine()
    const progressEvents: Array<{ loaded: number; total: number; name?: string }> = []
    engine.on("progress", (e) => progressEvents.push(e))

    await engine.load()

    lastProgressCallback()?.({
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
    lastProgressCallback()?.({
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
    const engine = createEngine()
    const progressEvents: unknown[] = []
    engine.on("progress", (e) => progressEvents.push(e))

    await engine.load()

    lastProgressCallback()?.({ status: "initiate", file: "model.bin", name: "m" })
    lastProgressCallback()?.({ status: "done", file: "model.bin", name: "m" })

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
