import { describe, expect, it } from "vitest"

import { ChatModelBaseAdapter } from "../adapters/chat.js"
import { gemma3ChatAdapter } from "../adapters/models/gemma-3-1b-it.js"
import { qwen3ChatAdapter } from "../adapters/models/qwen-3-0-6b.js"
import { translateGemmaAdapter } from "../adapters/models/translategemma-4.js"
import { TranslateModelBaseAdapter } from "../adapters/translate.js"
import type {
  TranslationOptions,
  TranslationRequest,
  TranslationResult,
} from "../translation-adapter.js"

const REQUEST: TranslationRequest = {
  text: "Hello **world**",
  source: { code: "en" },
  target: { code: "es" },
}
const PRESERVE_REQUEST: TranslationRequest = {
  text: "Hello Chime",
  source: { code: "en" },
  target: { code: "es" },
}

const OPTIONS: TranslationOptions = { max_new_tokens: 64 }
const BASE_CHAT_MODEL_OPTIONS = {
  max_new_tokens: 64,
  do_sample: false,
  return_full_text: false,
}
const QWEN3_CHAT_MODEL_OPTIONS = {
  ...BASE_CHAT_MODEL_OPTIONS,
  tokenizer_encode_kwargs: { enable_thinking: false },
}
const QWEN3_BASE_SYSTEM_PROMPT =
  "You are a translation engine. Translate from English (en) to Spanish (es). " +
  "Output only the translation. " +
  "Translate short UI labels, buttons, headings, and sentence fragments naturally; do not copy source text just because it is short. " +
  "Keep brand names, product names, code identifiers, URLs, numbers, and preserved terms unchanged; translate the surrounding prose. " +
  "Do not return the source unchanged when it contains translatable prose."
const QWEN3_MARKDOWN_INSTRUCTION =
  "Preserve Markdown formatting markers exactly, including headings, emphasis, code spans, links, and lists; translate only human-readable prose."
const GEMMA3_BASE_SYSTEM_PROMPT =
  "You are a translation engine. Translate from en to es. Output only the translation."
const GEMMA3_MARKDOWN_INSTRUCTION =
  "Preserve Markdown formatting and translate only human-readable prose."
const PRESERVE_TOKEN_PATTERN = /\u27EAbf-preserve:[^\u27EB]+\u27EB/gu
const CHAT_ADAPTER_FIXTURES = [
  [
    "qwen-3-0.6b-chat",
    qwen3ChatAdapter,
    QWEN3_BASE_SYSTEM_PROMPT,
    QWEN3_CHAT_MODEL_OPTIONS,
  ],
  [
    "gemma-3-1b-it-chat",
    gemma3ChatAdapter,
    GEMMA3_BASE_SYSTEM_PROMPT,
    BASE_CHAT_MODEL_OPTIONS,
  ],
] as const

type PreservationRoundTrip = {
  readonly inputText: string
  readonly extract: (token: string) => TranslationResult
}

const BUILT_IN_PRESERVATION_FIXTURES = [
  [
    "translategemma-4",
    (options: TranslationOptions): PreservationRoundTrip => {
      const invocation = translateGemmaAdapter.buildInvocation(PRESERVE_REQUEST, options)
      return {
        inputText: invocation.modelInput[0].content[0].text,
        extract: (token) =>
          translateGemmaAdapter.extractText(PRESERVE_REQUEST, options, [
            { generated_text: [{ role: "assistant", content: `Hola ${token}` }] },
          ]),
      }
    },
  ],
  [
    "qwen-3-0.6b",
    (options: TranslationOptions): PreservationRoundTrip => {
      const invocation = qwen3ChatAdapter.buildInvocation(PRESERVE_REQUEST, options)
      return {
        inputText: invocation.modelInput[1].content,
        extract: (token) =>
          qwen3ChatAdapter.extractText(PRESERVE_REQUEST, options, [
            { generated_text: `Hola ${token}` },
          ]),
      }
    },
  ],
  [
    "gemma-3-1b-it",
    (options: TranslationOptions): PreservationRoundTrip => {
      const invocation = gemma3ChatAdapter.buildInvocation(PRESERVE_REQUEST, options)
      return {
        inputText: invocation.modelInput[1].content,
        extract: (token) =>
          gemma3ChatAdapter.extractText(PRESERVE_REQUEST, options, [
            { generated_text: `Hola ${token}` },
          ]),
      }
    },
  ],
] satisfies ReadonlyArray<
  readonly [string, (options: TranslationOptions) => PreservationRoundTrip]
>

function expectSinglePreserveToken(text: string): string {
  const matches = [...text.matchAll(PRESERVE_TOKEN_PATTERN)]
  expect(matches).toHaveLength(1)
  return matches[0]![0]
}

type TestTranslateOptions = Record<string, unknown> & {
  readonly max_new_tokens: number
}

class InspectableTranslateAdapter extends TranslateModelBaseAdapter<
  string,
  string,
  TestTranslateOptions
> {
  constructor() {
    super({ id: "test-base", label: "Test base adapter" })
  }

  inspectPreservedSubstrings(options: TranslationOptions) {
    return this.preservedSubstrings(options)
  }

  inspectPreservationApproach(options: TranslationOptions) {
    return this.preservationApproach(options)
  }

  inspectUsesPromptPreservation(options: TranslationOptions) {
    return this.usesPromptPreservation(options)
  }

  inspectUsesPlaceholderPreservation(options: TranslationOptions) {
    return this.usesPlaceholderPreservation(options)
  }

  protected override buildModelInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ) {
    return {
      modelInput: request.text,
      modelOptions: { max_new_tokens: options.max_new_tokens },
    }
  }

  protected override extractModelText(
    _request: TranslationRequest,
    _options: TranslationOptions,
    output: string,
  ) {
    return output
  }
}

describe("TranslateModelBaseAdapter", () => {
  it("preserves the structural adapter shape and centralizes preservation defaults", () => {
    const adapter = new InspectableTranslateAdapter()

    expect(adapter).toMatchObject({
      id: "test-base",
      label: "Test base adapter",
      validateOptions: expect.any(Function),
      buildInvocation: expect.any(Function),
      extractText: expect.any(Function),
    })
    expect(adapter.buildInvocation(REQUEST, OPTIONS)).toEqual({
      modelInput: "Hello **world**",
      modelOptions: { max_new_tokens: 64 },
    })
    expect(adapter.extractText(REQUEST, OPTIONS, " hola ")).toEqual({ text: " hola " })
    expect(adapter.validateOptions(OPTIONS)).toEqual({ warnings: [], errors: [] })
  })

  it("filters preserved substrings and defaults to no preservation approach", () => {
    const adapter = new InspectableTranslateAdapter()

    expect(
      adapter.inspectPreservedSubstrings({
        max_new_tokens: 64,
        substrings_to_preserve: ["", "**world**", "babulfish", "**world**"],
      }),
    ).toEqual(["**world**", "babulfish"])
    expect(adapter.inspectPreservationApproach(OPTIONS)).toBe("none")
    expect(
      adapter.inspectUsesPromptPreservation({
        max_new_tokens: 64,
        substrings_to_preserve: ["**world**"],
      }),
    ).toBe(false)
    expect(
      adapter.inspectUsesPlaceholderPreservation({
        max_new_tokens: 64,
        substrings_to_preserve: ["**world**"],
        preservation_approach: "placeholders",
      }),
    ).toBe(true)
  })

  it("masks placeholder-preserved substrings around model invocation and extraction", () => {
    const adapter = new InspectableTranslateAdapter()
    const options = {
      max_new_tokens: 64,
      substrings_to_preserve: ["**world**"],
      preservation_approach: "placeholders",
    } satisfies TranslationOptions

    const invocation = adapter.buildInvocation(REQUEST, options)
    const token = expectSinglePreserveToken(invocation.modelInput)

    expect(invocation.modelInput).toBe(`Hello ${token}`)
    expect(adapter.extractText(REQUEST, options, `Hola ${token}`)).toEqual({
      text: "Hola **world**",
    })
  })
})

describe("built-in adapter preservation", () => {
  it.each(BUILT_IN_PRESERVATION_FIXTURES)(
    "restores placeholder-preserved strings through %s",
    (_id, createRoundTrip) => {
      const options = {
        max_new_tokens: 64,
        substrings_to_preserve: ["Chime"],
        preservation_approach: "placeholders",
      } satisfies TranslationOptions

      const roundTrip = createRoundTrip(options)
      const token = expectSinglePreserveToken(roundTrip.inputText)

      expect(roundTrip.inputText).toBe(`Hello ${token}`)
      expect(roundTrip.extract(token)).toEqual({ text: "Hola Chime" })
    },
  )
})

describe("translateGemmaAdapter", () => {
  it("exposes the public adapter object shape and builds structured user content", () => {
    expect(translateGemmaAdapter).toMatchObject({
      id: "translategemma",
      label: "TranslateGemma",
      validateOptions: expect.any(Function),
      buildInvocation: expect.any(Function),
      extractText: expect.any(Function),
    })

    expect(translateGemmaAdapter.buildInvocation(REQUEST, OPTIONS)).toEqual({
      modelInput: [
        {
          role: "user",
          content: [
            {
              type: "text",
              source_lang_code: "en",
              target_lang_code: "es",
              text: "Hello **world**",
            },
          ],
        },
      ],
      modelOptions: { max_new_tokens: 64 },
    })
  })

  it.each(["raw", "structured"] as const)(
    "keeps %s intent compatible with the structured TranslateGemma payload",
    (contentType) => {
      const options = {
        max_new_tokens: 64,
        content_type: contentType,
      } satisfies TranslationOptions

      expect(translateGemmaAdapter.validateOptions(options).errors).toEqual([])
      expect(translateGemmaAdapter.buildInvocation(REQUEST, options)).toEqual({
        modelInput: [
          {
            role: "user",
            content: [
              {
                type: "text",
                source_lang_code: "en",
                target_lang_code: "es",
                text: "Hello **world**",
              },
            ],
          },
        ],
        modelOptions: { max_new_tokens: 64 },
      })
    },
  )

  it("supports placeholder preservation without changing raw no-option behavior", () => {
    const options = {
      max_new_tokens: 64,
      substrings_to_preserve: ["**world**"],
    } satisfies TranslationOptions
    const invocation = translateGemmaAdapter.buildInvocation(REQUEST, options)
    const textContent = invocation.modelInput[0].content[0].text
    const token = expectSinglePreserveToken(textContent)

    expect(textContent).toBe(`Hello ${token}`)
    expect(
      translateGemmaAdapter.extractText(REQUEST, options, [
        { generated_text: [{ role: "assistant", content: `Hola ${token}` }] },
      ]),
    ).toEqual({ text: "Hola **world**" })
  })

  it("treats markdown intent as a text payload with placeholder preservation", () => {
    const options = {
      max_new_tokens: 64,
      content_type: "markdown",
      substrings_to_preserve: ["**world**"],
    } satisfies TranslationOptions
    const invocation = translateGemmaAdapter.buildInvocation(REQUEST, options)
    const textContent = invocation.modelInput[0].content[0].text
    const token = expectSinglePreserveToken(textContent)

    expect(textContent).toBe(`Hello ${token}`)
    expect(
      translateGemmaAdapter.extractText(REQUEST, options, [
        { generated_text: [{ role: "assistant", content: `Hola ${token}` }] },
      ]),
    ).toEqual({ text: "Hola **world**" })
  })

  it("rejects unsupported content and prompt-preservation options before invocation", () => {
    const issues = translateGemmaAdapter.validateOptions({
      max_new_tokens: 64,
      content_type: "html",
      substrings_to_preserve: ["**world**"],
      preservation_approach: "prompting",
    })

    expect(issues.errors).toEqual([
      "TranslateGemma adapter supports only raw, markdown, or structured translation content.",
      "TranslateGemma adapter does not support prompt-based preservation.",
    ])
    expect(() =>
      translateGemmaAdapter.buildInvocation(REQUEST, {
        max_new_tokens: 64,
        preservation_approach: "prompting",
      }),
    ).toThrow("TranslateGemma adapter does not support prompt-based preservation.")
  })

  it("extracts the final generated message without trimming", () => {
    expect(
      translateGemmaAdapter.extractText(REQUEST, OPTIONS, [
        {
          generated_text: [
            { role: "assistant", content: " primero " },
            { role: "user", content: " segundo " },
          ],
        },
      ]),
    ).toEqual({ text: " segundo " })
  })
})

describe("chat adapters", () => {
  it("gives each built-in chat model its own adapter identity", () => {
    expect(CHAT_ADAPTER_FIXTURES.map(([id]) => id)).toEqual([
      "qwen-3-0.6b-chat",
      "gemma-3-1b-it-chat",
    ])
    for (const [id, adapter] of CHAT_ADAPTER_FIXTURES) {
      expect(adapter.id).toBe(id)
      expect(adapter).toBeInstanceOf(ChatModelBaseAdapter)
    }
    expect(new Set(CHAT_ADAPTER_FIXTURES.map(([, adapter]) => adapter)).size).toBe(
      CHAT_ADAPTER_FIXTURES.length,
    )
  })

  it.each(CHAT_ADAPTER_FIXTURES)(
    "builds deterministic chat messages for %s",
    (_id, adapter, systemPrompt, modelOptions) => {
      const invocation = adapter.buildInvocation(REQUEST, OPTIONS)
      const expectedMessages = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: "Hello **world**",
        },
      ]

      expect(invocation.modelInput).toEqual(expectedMessages)
      expect(invocation.modelOptions).toEqual(modelOptions)
    },
  )

  it("keeps built-in chat prompts model-specific", () => {
    const qwenPrompt = qwen3ChatAdapter.buildInvocation(REQUEST, OPTIONS).modelInput[0]
      ?.content
    const gemmaPrompt = gemma3ChatAdapter.buildInvocation(REQUEST, OPTIONS).modelInput[0]
      ?.content

    expect(qwenPrompt).toBe(QWEN3_BASE_SYSTEM_PROMPT)
    expect(gemmaPrompt).toBe(GEMMA3_BASE_SYSTEM_PROMPT)
    expect(qwenPrompt).not.toBe(gemmaPrompt)
  })

  it.each([
    ["en-US", "es-ES", "Translate from English (en-US) to Spanish (es-ES)."],
    ["en", "zh-CN", "Translate from English (en) to Chinese (zh-CN)."],
    ["en", "pt-BR", "Translate from English (en) to Portuguese (pt-BR)."],
  ] as const)(
    "spells Qwen3 regional language codes as names for %s to %s",
    (source, target, expectedFragment) => {
      const invocation = qwen3ChatAdapter.buildInvocation(
        {
          text: "Hello",
          source: { code: source },
          target: { code: target },
        },
        OPTIONS,
      )

      expect(invocation.modelInput[0]?.content).toContain(expectedFragment)
    },
  )

  it("disables Qwen3 thinking through chat-template kwargs", () => {
    expect(qwen3ChatAdapter.buildInvocation(REQUEST, OPTIONS)).toEqual({
      modelInput: [
        {
          role: "system",
          content: QWEN3_BASE_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: "Hello **world**",
        },
      ],
      modelOptions: QWEN3_CHAT_MODEL_OPTIONS,
    })
  })

  it("keeps Qwen3 tokenizer kwargs out of other chat adapters", () => {
    expect(gemma3ChatAdapter.buildInvocation(REQUEST, OPTIONS).modelOptions).toEqual(
      BASE_CHAT_MODEL_OPTIONS,
    )
  })

  it.each([
    [
      "qwen-3-0.6b-chat",
      qwen3ChatAdapter,
      QWEN3_BASE_SYSTEM_PROMPT,
      QWEN3_MARKDOWN_INSTRUCTION,
      QWEN3_CHAT_MODEL_OPTIONS,
    ],
    [
      "gemma-3-1b-it-chat",
      gemma3ChatAdapter,
      GEMMA3_BASE_SYSTEM_PROMPT,
      GEMMA3_MARKDOWN_INSTRUCTION,
      BASE_CHAT_MODEL_OPTIONS,
    ],
  ] as const)(
    "adds markdown and exact substring preservation instructions for %s",
    (_id, adapter, basePrompt, markdownInstruction, modelOptions) => {
      const invocation = adapter.buildInvocation(REQUEST, {
        max_new_tokens: 64,
        content_type: "markdown",
        substrings_to_preserve: ["**world**", "babulfish"],
        preservation_approach: "prompting",
      })

      expect(invocation.modelInput[0]?.content).toBe(
        `${basePrompt} ${markdownInstruction} ` +
          "Preserve these exact substrings unchanged: [\"**world**\",\"babulfish\"].",
      )
      expect(invocation.modelOptions).toEqual(modelOptions)
    },
  )

  it("defaults substring preservation to prompting for chat adapters", () => {
    const invocation = gemma3ChatAdapter.buildInvocation(REQUEST, {
      max_new_tokens: 64,
      substrings_to_preserve: ["**world**"],
    })

    expect(invocation.modelInput[0]?.content).toBe(
      `${GEMMA3_BASE_SYSTEM_PROMPT} ` +
        "Preserve these exact substrings unchanged: [\"**world**\"].",
    )
    expect(invocation.modelInput[1]?.content).toBe("Hello **world**")
  })

  it.each(CHAT_ADAPTER_FIXTURES)(
    "includes token-copy instruction when placeholders are active for %s",
    (_id, adapter, systemPrompt) => {
      const options = {
        max_new_tokens: 64,
        substrings_to_preserve: ["**world**"],
        preservation_approach: "placeholders",
      } satisfies TranslationOptions
      const invocation = adapter.buildInvocation(REQUEST, options)
      const token = expectSinglePreserveToken(invocation.modelInput[1].content)

      expect(invocation.modelInput[0]?.content).toBe(
        `${systemPrompt} Copy every preservation token exactly unchanged.`,
      )
      expect(invocation.modelInput[1]?.content).toBe(`Hello ${token}`)
      expect(
        adapter.extractText(REQUEST, options, [
          { generated_text: `Hola ${token}` },
        ]),
      ).toEqual({ text: "Hola **world**" })
    },
  )

  it("rejects unsupported content before invocation", () => {
    expect(
      gemma3ChatAdapter.validateOptions({
        max_new_tokens: 64,
        content_type: "html",
      }).errors,
    ).toEqual(["Chat adapter does not support HTML translation content."])
  })

  it("extracts generated text strings and final assistant chat content", () => {
    expect(
      gemma3ChatAdapter.extractText(REQUEST, OPTIONS, [{ generated_text: " hola " }]),
    ).toEqual({ text: "hola" })

    expect(
      qwen3ChatAdapter.extractText(REQUEST, OPTIONS, [
        {
          generated_text: [
            { role: "assistant", content: " primero " },
            { role: "user", content: "ignored" },
            { role: "assistant", content: " segundo " },
          ],
        },
      ]),
    ).toEqual({ text: "segundo" })
  })

  it("removes leading thinking blocks from chat output", () => {
    expect(
      qwen3ChatAdapter.extractText(REQUEST, OPTIONS, [
        {
          generated_text:
            "<think>\nI should translate this without showing work.\n</think>\n\nHola mundo",
        },
      ]),
    ).toEqual({ text: "Hola mundo" })

    expect(
      qwen3ChatAdapter.extractText(REQUEST, OPTIONS, [
        {
          generated_text:
            "<think>draft</think>\n<think>review</think>\n\nHola mundo",
        },
      ]),
    ).toEqual({ text: "Hola mundo" })
  })

  it("unwraps common translation preambles after chat thinking", () => {
    expect(
      qwen3ChatAdapter.extractText(REQUEST, OPTIONS, [
        {
          generated_text:
            "<think>draft</think>\n\n" +
            "Translating the sentence: \"Hello world.\" " +
            "The translated sentence is: \"Hola mundo.",
        },
      ]),
    ).toEqual({ text: "Hola mundo." })
  })

  it("keeps late translation labels that are part of translated text", () => {
    const translatedText = `${"texto ".repeat(50)}translation: etiqueta`

    expect(
      qwen3ChatAdapter.extractText(REQUEST, OPTIONS, [
        { generated_text: translatedText },
      ]),
    ).toEqual({ text: translatedText.trim() })
    expect(
      qwen3ChatAdapter.extractText(REQUEST, OPTIONS, [
        {
          generated_text: [
            { role: "assistant", content: "ignored" },
            { role: "assistant", content: translatedText },
          ],
        },
      ]),
    ).toEqual({ text: translatedText.trim() })
  })
})
