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

const QWEN_AUTO_PRESERVE_TERMS = Object.freeze([
  "Babulfish",
  "babulfish",
  "TranslateGemma",
  "WebGPU",
  "WASM",
  "ONNX",
])
const QWEN_AUTO_PRESERVE_LIMIT = 12

function collectMatches(text: string, pattern: RegExp): string[] {
  return Array.from(text.matchAll(pattern), (match) => match[0])
}

function isIdentifierBoundary(char: string | undefined): boolean {
  return char === undefined || !/[A-Za-z0-9_@./-]/u.test(char)
}

function includesStandaloneTerm(text: string, term: string): boolean {
  let start = text.indexOf(term)
  while (start !== -1) {
    const end = start + term.length
    if (isIdentifierBoundary(text[start - 1]) && isIdentifierBoundary(text[end])) {
      return true
    }
    start = text.indexOf(term, end)
  }
  return false
}

function collectQwenAutoPreservedSubstrings(text: string): readonly string[] {
  const candidates = [
    ...collectMatches(text, /`[^`\n]+`/gu),
    ...collectMatches(text, /\bhttps?:\/\/[^\s<>)]+/giu),
    ...collectMatches(text, /@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*/giu),
    ...collectMatches(text, /\b[A-Z]{2,}-\d+\b/gu),
    ...collectMatches(text, /\bv?\d+(?:\.\d+){1,}(?:[-+][\w.-]+)?\b/giu),
    ...collectMatches(text, /\b[$A-Z_a-z][$\w]*(?:\.[A-Z_a-z][$\w]*)+\b/gu),
    ...collectMatches(text, /\b[A-Z_a-z][$\w]*\(\)/gu),
    ...collectMatches(text, /\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[A-Z]+[a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z]{2,})(?!-\d)\b/gu),
    ...QWEN_AUTO_PRESERVE_TERMS.filter((term) =>
      includesStandaloneTerm(text, term),
    ),
  ]
  const seen = new Set<string>()
  const preserved: string[] = []

  for (const candidate of candidates) {
    if (candidate.length === 0 || seen.has(candidate)) continue
    seen.add(candidate)
    preserved.push(candidate)
    if (preserved.length >= QWEN_AUTO_PRESERVE_LIMIT) break
  }

  return preserved
}

function formatLanguageName(code: string): string {
  const normalizedCode = code.toLowerCase()
  const baseCode = normalizedCode.split(/[-_]/)[0] ?? normalizedCode
  const name = LANGUAGE_NAMES[normalizedCode] ?? LANGUAGE_NAMES[baseCode]
  return name === undefined ? code : `${name} (${code})`
}

function formatSourceBlock(request: TranslationRequest): string {
  return `Source:\n${request.text}`
}

export class Qwen3ChatAdapter extends ChatModelBaseAdapter {
  constructor() {
    super({
      id: "qwen-3-0.6b-chat",
      label: "Qwen 3 0.6B chat translator",
    })
  }

  override buildInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ChatInput, ChatOptions> {
    return super.buildInvocation(request, this.withAutoPreservation(request, options))
  }

  override extractText(
    request: TranslationRequest,
    options: TranslationOptions,
    output: unknown,
  ) {
    return super.extractText(request, this.withAutoPreservation(request, options), output)
  }

  protected override buildModelInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ChatInput, ChatOptions> {
    const invocation = super.buildModelInvocation(request, options)

    return {
      ...invocation,
      modelInput: [
        invocation.modelInput[0],
        {
          role: "user",
          content: this.buildUserPrompt(request, options),
        },
      ],
      modelOptions: {
        ...invocation.modelOptions,
        tokenizer_encode_kwargs: { enable_thinking: false },
      },
    }
  }

  private withAutoPreservation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationOptions {
    if (options.preservation_approach === "placeholders") return options

    const autoPreserved = collectQwenAutoPreservedSubstrings(request.text)
    if (autoPreserved.length === 0) return options

    return {
      ...options,
      preservation_approach: "prompting",
      substrings_to_preserve: [
        ...(options.substrings_to_preserve ?? []),
        ...autoPreserved,
      ],
    }
  }

  private buildUserPrompt(
    request: TranslationRequest,
    options: TranslationOptions,
  ): string {
    const target = formatLanguageName(request.target.code)

    if (options.content_type === "markdown") {
      return [
        `Translate this Markdown to ${target}.`,
        "Keep Markdown syntax, code spans, links, and preserved terms exactly.",
        "Return only the translated Markdown.",
        "",
        formatSourceBlock(request),
      ].join("\n")
    }

    if (options.content_type === "structured") {
      return [
        `Translate this structured text to ${target}.`,
        "Copy structured tokens exactly and keep them in order.",
        "Return only the translated text.",
        "",
        formatSourceBlock(request),
      ].join("\n")
    }

    return [
      `Translate this text to ${target}.`,
      "Return only the translated text.",
      "",
      formatSourceBlock(request),
    ].join("\n")
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
