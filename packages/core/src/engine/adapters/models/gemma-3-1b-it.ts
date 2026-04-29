import type {
  TranslationAdapter,
  TranslationOptions,
  TranslationRequest,
  TranslationResult,
} from "../../translation-adapter.js"
import type { TranslationModelInvocation } from "../translate.js"
import {
  ChatModelBaseAdapter,
  type ChatInput,
  type ChatOptions,
} from "../chat.js"

const GEMMA_AUTO_PRESERVE_TERMS = Object.freeze([
  "Babulfish",
  "babulfish",
  "WebGPU",
  "WASM",
  "ONNX",
])

function collectMatches(text: string, pattern: RegExp): string[] {
  return Array.from(text.matchAll(pattern), (match) => match[0])
}

function collectGemmaAutoPreservedSubstrings(text: string): readonly string[] {
  const candidates = [
    ...collectMatches(text, /`[^`\n]+`/gu),
    ...collectMatches(text, /\bhttps?:\/\/[^\s<>)]+/giu),
    ...collectMatches(text, /@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*/giu),
    ...collectMatches(text, /\bv?\d+(?:\.\d+){1,}(?:[-+][\w.-]+)?\b/giu),
    ...collectMatches(text, /\b[$A-Z_a-z][$\w]*(?:\.[A-Z_a-z][$\w]*)+\b/gu),
    ...collectMatches(text, /\b[A-Z_a-z][$\w]*\(\)/gu),
    ...collectMatches(text, /\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[A-Z]+[a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z]{2,})\b/gu),
    ...GEMMA_AUTO_PRESERVE_TERMS.filter((term) => text.includes(term)),
  ]
  const seen = new Set<string>()
  const preserved: string[] = []

  for (const candidate of candidates) {
    if (candidate.length === 0 || seen.has(candidate)) continue
    seen.add(candidate)
    preserved.push(candidate)
  }

  return preserved
}

export class Gemma3ChatAdapter extends ChatModelBaseAdapter {
  constructor() {
    super({
      id: "gemma-3-1b-it-chat",
      label: "Gemma 3 1B IT chat translator",
    })
  }

  protected override defaultPreservationApproach(
    options: TranslationOptions,
  ): "placeholders" | "none" {
    return this.preservedSubstrings(options).length > 0 ? "placeholders" : "none"
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
  ): TranslationResult {
    return super.extractText(request, this.withAutoPreservation(request, options), output)
  }

  private withAutoPreservation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationOptions {
    if (options.preservation_approach === "prompting") return options

    const autoPreserved = collectGemmaAutoPreservedSubstrings(request.text)
    if (autoPreserved.length === 0) return options

    return {
      ...options,
      substrings_to_preserve: [
        ...(options.substrings_to_preserve ?? []),
        ...autoPreserved,
      ],
    }
  }

  protected override buildSystemPrompt(
    request: TranslationRequest,
    options: TranslationOptions,
  ): string {
    const instructions = [
      `You are a translation engine. Translate from ${request.source.code} to ${request.target.code}.`,
      "Output only the translation.",
    ]

    if (options.content_type === "markdown") {
      instructions.push("Preserve Markdown formatting and translate only human-readable prose.")
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

export const gemma3ChatAdapter: TranslationAdapter<
  ChatInput,
  unknown,
  ChatOptions
> = Object.freeze(new Gemma3ChatAdapter())
