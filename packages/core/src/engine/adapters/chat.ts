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

function unexpectedModelOutput(): never {
  throw new Error("Unexpected model output format")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export class ChatModelBaseAdapter<
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

  protected buildSystemPrompt(
    request: TranslationRequest,
    options: TranslationOptions,
  ): string {
    return this.buildBaseTranslationPrompt(
      request.source.code,
      request.target.code,
      options,
    )
  }

  protected buildBaseTranslationPrompt(
    sourceLanguage: string,
    targetLanguage: string,
    options: TranslationOptions,
  ): string {
    const instructions = [
      `You are a translation engine. Translate from ${sourceLanguage} to ${targetLanguage}.`,
      "Output only the translation.",
    ]

    if (options.content_type === "markdown") {
      instructions.push("Preserve Markdown formatting and translate only human-readable prose.")
    }

    if (options.content_type === "structured") {
      instructions.push("Copy all structured tokens exactly and keep them in order.")
    }

    const preservedInstruction = this.preservedSubstringsPrompt(options)
    if (preservedInstruction !== null) {
      instructions.push(preservedInstruction)
    }

    const placeholderInstruction = this.placeholderPreservationPrompt(options)
    if (placeholderInstruction !== null) {
      instructions.push(placeholderInstruction)
    }

    return instructions.join(" ")
  }

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
      return generatedText.trim()
    }

    if (!Array.isArray(generatedText)) unexpectedModelOutput()

    for (let index = generatedText.length - 1; index >= 0; index -= 1) {
      const message = generatedText[index]
      if (
        isRecord(message) &&
        message.role === "assistant" &&
        typeof message.content === "string"
      ) {
        return message.content.trim()
      }
    }

    unexpectedModelOutput()
  }
}
