import { describe, expect, it } from "vitest"

import { ChatModelBaseAdapter } from "../adapters/chat.js"
import { gemma3ChatAdapter } from "../adapters/models/gemma-3-1b-it.js"
import { qwen25ChatAdapter } from "../adapters/models/qwen-2-5-0-5b.js"
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
const PRESERVE_TOKEN_PATTERN = /\u27EAbf-preserve:[^\u27EB]+\u27EB/gu
const CHAT_ADAPTER_FIXTURES = [
  [
    "qwen-2.5-0.5b-chat",
    qwen25ChatAdapter,
    "You are a translation engine. Translate from en to es. Output only the translation.",
  ],
  [
    "qwen-3-0.6b-chat",
    qwen3ChatAdapter,
    "You are a translation engine. Translate from en to es. Output only the translation.",
  ],
  [
    "gemma-3-1b-it-chat",
    gemma3ChatAdapter,
    "You are a translation engine. Translate from en to es. Output only the translation.",
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
    "qwen-2.5-0.5b",
    (options: TranslationOptions): PreservationRoundTrip => {
      const invocation = qwen25ChatAdapter.buildInvocation(PRESERVE_REQUEST, options)
      return {
        inputText: invocation.modelInput[1].content,
        extract: (token) =>
          qwen25ChatAdapter.extractText(PRESERVE_REQUEST, options, [
            { generated_text: `Hola ${token}` },
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

  inspectPreservedSubstringsPrompt(options: TranslationOptions) {
    return this.preservedSubstringsPrompt(options)
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

  it("builds the shared exact-substring prompt instruction only for prompting", () => {
    const adapter = new InspectableTranslateAdapter()

    expect(
      adapter.inspectPreservedSubstringsPrompt({
        max_new_tokens: 64,
        substrings_to_preserve: ["**world**", "babulfish"],
        preservation_approach: "prompting",
      }),
    ).toBe("Preserve these exact substrings unchanged: [\"**world**\",\"babulfish\"].")
    expect(
      adapter.inspectPreservedSubstringsPrompt({
        max_new_tokens: 64,
        substrings_to_preserve: ["**world**"],
        preservation_approach: "placeholders",
      }),
    ).toBeNull()
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
      "qwen-2.5-0.5b-chat",
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
    "builds deterministic system/user string messages for %s",
    (_id, adapter, systemPrompt) => {
      expect(adapter.buildInvocation(REQUEST, OPTIONS)).toEqual({
        modelInput: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: "Hello **world**",
          },
        ],
        modelOptions: {
          max_new_tokens: 64,
          do_sample: false,
          return_full_text: false,
        },
      })
    },
  )

  it("adds markdown and exact substring preservation instructions when requested", () => {
    const invocation = qwen3ChatAdapter.buildInvocation(REQUEST, {
      max_new_tokens: 64,
      content_type: "markdown",
      substrings_to_preserve: ["**world**", "babulfish"],
      preservation_approach: "prompting",
    })

    expect(invocation.modelInput[0]?.content).toBe(
      "You are a translation engine. Translate from en to es. " +
        "Output only the translation. " +
        "Preserve Markdown formatting and translate only human-readable prose. " +
        "Preserve these exact substrings unchanged: [\"**world**\",\"babulfish\"].",
    )
  })

  it("defaults substring preservation to prompting for chat adapters", () => {
    const invocation = gemma3ChatAdapter.buildInvocation(REQUEST, {
      max_new_tokens: 64,
      substrings_to_preserve: ["**world**"],
    })

    expect(invocation.modelInput[0]?.content).toBe(
      "You are a translation engine. Translate from en to es. " +
        "Output only the translation. " +
        "Preserve these exact substrings unchanged: [\"**world**\"].",
    )
    expect(invocation.modelInput[1]?.content).toBe("Hello **world**")
  })

  it.each(CHAT_ADAPTER_FIXTURES)(
    "includes token-copy instruction when placeholders are active for %s",
    (_id, adapter) => {
      const options = {
        max_new_tokens: 64,
        substrings_to_preserve: ["**world**"],
        preservation_approach: "placeholders",
      } satisfies TranslationOptions
      const invocation = adapter.buildInvocation(REQUEST, options)
      const token = expectSinglePreserveToken(invocation.modelInput[1].content)

      expect(invocation.modelInput[0]?.content).toBe(
        "You are a translation engine. Translate from en to es. " +
          "Output only the translation. " +
          "Copy every preservation token exactly unchanged.",
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
      qwen25ChatAdapter.validateOptions({
        max_new_tokens: 64,
        content_type: "html",
      }).errors,
    ).toEqual(["Chat adapter does not support HTML translation content."])
  })

  it("extracts generated text strings and final assistant chat content", () => {
    expect(
      qwen25ChatAdapter.extractText(REQUEST, OPTIONS, [{ generated_text: " hola " }]),
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
})
