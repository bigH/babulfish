import { describe, expect, it } from "vitest"

import {
  gemma3ChatAdapter,
  qwen25ChatAdapter,
  qwen3ChatAdapter,
} from "../adapters/chat.js"
import { translateGemmaAdapter } from "../adapters/translategemma.js"
import type { TranslationOptions, TranslationRequest } from "../translation-adapter.js"

const REQUEST: TranslationRequest = {
  text: "Hello **world**",
  source: { code: "en" },
  target: { code: "es" },
}

const OPTIONS: TranslationOptions = { max_new_tokens: 64 }
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

  it("rejects unsupported content and prompt-preservation options before invocation", () => {
    const issues = translateGemmaAdapter.validateOptions({
      max_new_tokens: 64,
      content_type: "markdown",
      substrings_to_preserve: ["**world**"],
      preservation_approach: "prompting",
    })

    expect(issues.errors).toEqual([
      "TranslateGemma adapter supports only raw translation content.",
      "TranslateGemma adapter does not support prompt-based preservation.",
      "TranslateGemma adapter does not support substring preservation options.",
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

  it("rejects unsupported content and preservation options before invocation", () => {
    expect(
      qwen25ChatAdapter.validateOptions({
        max_new_tokens: 64,
        content_type: "html",
      }).errors,
    ).toEqual(["Chat adapter does not support HTML translation content."])

    expect(() =>
      gemma3ChatAdapter.buildInvocation(REQUEST, {
        max_new_tokens: 64,
        substrings_to_preserve: ["**world**"],
        preservation_approach: "placeholders",
      }),
    ).toThrow("Chat adapter requires prompt-based preservation for substrings.")
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
