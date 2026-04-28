import type { TranslationOptions, TranslationRequest } from "../translation-adapter.js"
import {
  TranslateModelBaseAdapter,
  type TranslationModelInvocation,
} from "./translate.js"

export type ChatMessage = {
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

export type ChatInput = readonly [ChatMessage, ChatMessage]

export type ChatOptions = Record<string, unknown> & {
  readonly max_new_tokens: number
  readonly do_sample: false
  readonly return_full_text: false
}

type ChatAdapterConfig = {
  readonly id: string
  readonly label: string
}

const TRANSLATION_WRAPPER_SCAN_LIMIT = 240

function unexpectedModelOutput(): never {
  throw new Error("Unexpected model output format")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function stripLeadingThinking(text: string): string {
  let strippedThinking = false
  let remaining = text

  while (true) {
    const stripped = remaining.replace(
      /^\s*<think\b[^>]*>[\s\S]*?<\/think>\s*/i,
      "",
    )

    if (stripped === remaining) break

    strippedThinking = true
    remaining = stripped
  }

  if (!strippedThinking) return text.trim()

  const trimmed = remaining.trim()
  return trimmed.length === 0 ? text.trim() : trimmed
}

function unwrapQuotedPayload(text: string): string {
  const trimmed = text.trim()
  const first = trimmed.at(0)
  if (first !== "\"" && first !== "'") return trimmed

  const unquoted = trimmed.slice(1)
  return unquoted.endsWith(first)
    ? unquoted.slice(0, -1).trim()
    : unquoted.trim()
}

function looksLikeTranslationWrapperPrefix(prefix: string): boolean {
  const trimmed = prefix.trim()
  return (
    trimmed.length === 0 ||
    /\b(?:translat(?:e|ed|ing|ion)|sentence|text|answer)\b/i.test(trimmed)
  )
}

function stripTranslationWrapper(text: string): string {
  const translatedCue =
    /(?:the\s+)?translated\s+(?:sentence|text|translation)\s+is:\s*/gi
  const translationCue = /translation:\s*/gi
  const cues = [translatedCue, translationCue]
  let payloadStart: number | null = null

  for (const cue of cues) {
    for (const match of text.matchAll(cue)) {
      if (
        match.index <= TRANSLATION_WRAPPER_SCAN_LIMIT &&
        looksLikeTranslationWrapperPrefix(text.slice(0, match.index))
      ) {
        payloadStart = match.index + match[0].length
      }
    }
  }

  if (payloadStart === null) return text.trim()

  const payload = unwrapQuotedPayload(text.slice(payloadStart))
  return payload.length === 0 ? text.trim() : payload
}

function normalizeChatText(text: string): string {
  return stripTranslationWrapper(stripLeadingThinking(text))
}

export abstract class ChatModelBaseAdapter<
  ModelOutput = unknown,
> extends TranslateModelBaseAdapter<ChatInput, ModelOutput, ChatOptions> {
  constructor(config: ChatAdapterConfig) {
    super(config)
  }

  protected override validateModelOptions(options: TranslationOptions) {
    const errors: string[] = []

    if (options.content_type === "html") {
      errors.push("Chat adapter does not support HTML translation content.")
    }

    return this.optionIssues(errors)
  }

  protected override defaultPreservationApproach(
    options: TranslationOptions,
  ): "prompting" | "none" {
    return this.preservedSubstrings(options).length > 0 ? "prompting" : "none"
  }

  protected override buildModelInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ChatInput, ChatOptions> {
    return {
      modelInput: [
        {
          role: "system",
          content: this.buildSystemPrompt(request, options),
        },
        {
          role: "user",
          content: request.text,
        },
      ],
      modelOptions: {
        max_new_tokens: options.max_new_tokens,
        do_sample: false,
        return_full_text: false,
      },
    }
  }

  protected abstract buildSystemPrompt(
    request: TranslationRequest,
    options: TranslationOptions,
  ): string

  protected override extractModelText(
    _request: TranslationRequest,
    _options: TranslationOptions,
    output: ModelOutput,
  ): string {
    if (!Array.isArray(output)) unexpectedModelOutput()

    const firstResult = output[0]
    if (!isRecord(firstResult)) unexpectedModelOutput()

    const generatedText = firstResult.generated_text
    if (typeof generatedText === "string") {
      return normalizeChatText(generatedText)
    }

    if (!Array.isArray(generatedText)) unexpectedModelOutput()

    for (let index = generatedText.length - 1; index >= 0; index -= 1) {
      const message = generatedText[index]
      if (
        isRecord(message) &&
        message.role === "assistant" &&
        typeof message.content === "string"
      ) {
        return normalizeChatText(message.content)
      }
    }

    unexpectedModelOutput()
  }
}
