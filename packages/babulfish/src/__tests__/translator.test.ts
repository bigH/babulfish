import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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

import { createTranslator } from "../translator.js"
import { pipeline } from "@huggingface/transformers"

const mockPipeline = vi.mocked(pipeline)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setUpMain(
  children: Array<{ tag: string; text: string }>,
): HTMLElement {
  const main = document.createElement("main")
  for (const { tag, text } of children) {
    const el = document.createElement(tag)
    el.textContent = text
    main.appendChild(el)
  }
  document.body.appendChild(main)
  return main
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createTranslator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockReset()
    mockPipeline.mockImplementation(resolveMockPipeline)
  })

  afterEach(() => {
    document.body.textContent = ""
  })

  it("returns engine and dom objects", () => {
    const { engine, dom } = createTranslator({
      dom: { roots: ["main"] },
    })

    expect(typeof engine.load).toBe("function")
    expect(typeof engine.translate).toBe("function")
    expect(typeof engine.dispose).toBe("function")
    expect(typeof dom.translate).toBe("function")
    expect(typeof dom.restore).toBe("function")
    expect(typeof dom.abort).toBe("function")
  })

  it("passes engine config through to createEngine", async () => {
    const { engine } = createTranslator({
      engine: { modelId: "custom-model", dtype: "fp16", device: "wasm" },
      dom: { roots: ["main"] },
    })

    await engine.load()

    expect(mockPipeline).toHaveBeenCalledWith(
      "text-generation",
      "custom-model",
      expect.objectContaining({ dtype: "fp16", device: "wasm" }),
    )
  })

  it("uses default engine config when omitted", async () => {
    const { engine } = createTranslator({
      dom: { roots: ["main"] },
    })

    await engine.load()

    expect(mockPipeline).toHaveBeenCalledWith(
      "text-generation",
      "onnx-community/translategemma-text-4b-it-ONNX",
      expect.objectContaining({ dtype: "q4" }),
    )
  })

  it("wires engine.translate into DOM translator", async () => {
    mockGenerate.mockResolvedValue([
      { generated_text: [{ role: "assistant", content: "hola mundo" }] },
    ])

    setUpMain([{ tag: "p", text: "hello world" }])

    const { engine, dom } = createTranslator({
      dom: { roots: ["main"] },
    })

    await engine.load()
    await dom.translate("es")

    expect(mockGenerate).toHaveBeenCalled()
    expect(document.querySelector("p")?.textContent).toBe("hola mundo")
  })
})
