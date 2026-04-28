import type {
  TranslationAdapter,
  TranslationOptions,
  TranslationRequest,
} from "../../translation-adapter.js"
import type { TranslationModelInvocation } from "../translate.js"
import {
  ChatModelBaseAdapter,
  type ChatInput,
  type ChatOptions,
} from "../chat.js"

const LANGUAGE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  ru: "Russian",
  th: "Thai",
  vi: "Vietnamese",
  zh: "Chinese",
})

function formatLanguageName(code: string): string {
  const normalizedCode = code.toLowerCase()
  const baseCode = normalizedCode.split(/[-_]/)[0] ?? normalizedCode
  const name = LANGUAGE_NAMES[normalizedCode] ?? LANGUAGE_NAMES[baseCode]
  return name === undefined ? code : `${name} (${code})`
}

export class Qwen3ChatAdapter extends ChatModelBaseAdapter {
  constructor() {
    super({
      id: "qwen-3-0.6b-chat",
      label: "Qwen 3 0.6B chat translator",
    })
  }

  protected override buildModelInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ChatInput, ChatOptions> {
    const invocation = super.buildModelInvocation(request, options)

    return {
      ...invocation,
      modelOptions: {
        ...invocation.modelOptions,
        tokenizer_encode_kwargs: { enable_thinking: false },
      },
    }
  }

  protected override buildSystemPrompt(
    request: TranslationRequest,
    options: TranslationOptions,
  ): string {
    const instructions = [
      `You are a translation engine. Translate from ${formatLanguageName(request.source.code)} to ${formatLanguageName(request.target.code)}.`,
      "Output only the translation.",
      "Translate short UI labels, buttons, headings, and sentence fragments naturally; do not copy source text just because it is short.",
      "Keep brand names, product names, code identifiers, URLs, numbers, and preserved terms unchanged; translate the surrounding prose.",
      "Do not return the source unchanged when it contains translatable prose.",
    ]

    if (options.content_type === "markdown") {
      instructions.push(
        "Preserve Markdown formatting markers exactly, including headings, emphasis, code spans, links, and lists; translate only human-readable prose.",
      )
    }

    if (options.content_type === "structured") {
      instructions.push("Copy all structured tokens exactly and keep them in order.")
    }

    if (this.usesPromptPreservation(options)) {
      instructions.push(
        `Preserve these exact substrings unchanged: ${JSON.stringify(this.preservedSubstrings(options))}.`,
      )
    }

    if (this.usesPlaceholderPreservation(options)) {
      instructions.push("Copy every preservation token exactly unchanged.")
    }

    return instructions.join(" ")
  }
}

export const qwen3ChatAdapter: TranslationAdapter<
  ChatInput,
  unknown,
  ChatOptions
> = Object.freeze(new Qwen3ChatAdapter())
