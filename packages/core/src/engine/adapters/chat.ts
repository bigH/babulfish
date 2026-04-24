import type {
  OptionIssues,
  TranslationRequest,
  TranslationAdapter,
  TranslationOptions,
} from "../translation-adapter.js"

type ChatMessage = {
  readonly role: "system" | "user" | "assistant"
  readonly content: string
}

type ChatInput = readonly [ChatMessage, ChatMessage]

type ChatOptions = Record<string, unknown> & {
  readonly max_new_tokens: number
  readonly do_sample: false
  readonly return_full_text: false
}

type SystemPromptBuilder = (
  request: TranslationRequest,
  options: TranslationOptions,
) => string

type ChatAdapterConfig = {
  readonly id: string
  readonly label: string
  readonly buildSystemPrompt: SystemPromptBuilder
}

function optionIssues(errors: readonly string[] = []): OptionIssues {
  return Object.freeze({ warnings: [], errors })
}

function throwOptionErrors(options: TranslationOptions): void {
  const { errors } = validateChatOptions(options)
  if (errors.length > 0) {
    throw new Error(errors.join(" "))
  }
}

function unexpectedModelOutput(): never {
  throw new Error("Unexpected model output format")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function preservedSubstrings(options: TranslationOptions): readonly string[] {
  return options.substrings_to_preserve?.filter((text) => text.length > 0) ?? []
}

function validateChatOptions(options: TranslationOptions): OptionIssues {
  const errors: string[] = []

  if (options.content_type === "html") {
    errors.push("Chat adapter does not support HTML translation content.")
  }

  if (
    preservedSubstrings(options).length > 0 &&
    options.preservation_approach !== "prompting"
  ) {
    errors.push("Chat adapter requires prompt-based preservation for substrings.")
  }

  return optionIssues(errors)
}

function baseTranslationPrompt(
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

  const substrings = preservedSubstrings(options)
  if (substrings.length > 0 && options.preservation_approach === "prompting") {
    instructions.push(`Preserve these exact substrings unchanged: ${JSON.stringify(substrings)}.`)
  }

  return instructions.join(" ")
}

function qwen25SystemPrompt(
  request: TranslationRequest,
  options: TranslationOptions,
): string {
  return baseTranslationPrompt(request.source.code, request.target.code, options)
}

function qwen3SystemPrompt(
  request: TranslationRequest,
  options: TranslationOptions,
): string {
  return baseTranslationPrompt(request.source.code, request.target.code, options)
}

function gemma3SystemPrompt(
  request: TranslationRequest,
  options: TranslationOptions,
): string {
  return baseTranslationPrompt(request.source.code, request.target.code, options)
}

function createChatAdapter({
  id,
  label,
  buildSystemPrompt,
}: ChatAdapterConfig): TranslationAdapter<ChatInput, unknown, ChatOptions> {
  return Object.freeze({
    id,
    label,

    validateOptions: validateChatOptions,

    buildInvocation(request, options) {
      throwOptionErrors(options)

      return {
        modelInput: [
          {
            role: "system",
            content: buildSystemPrompt(request, options),
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
    },

    extractText(_request, _options, output) {
      if (!Array.isArray(output)) unexpectedModelOutput()

      const firstResult = output[0]
      if (!isRecord(firstResult)) unexpectedModelOutput()

      const generatedText = firstResult.generated_text
      if (typeof generatedText === "string") {
        return { text: generatedText.trim() }
      }

      if (!Array.isArray(generatedText)) unexpectedModelOutput()

      for (let index = generatedText.length - 1; index >= 0; index -= 1) {
        const message = generatedText[index]
        if (
          isRecord(message) &&
          message.role === "assistant" &&
          typeof message.content === "string"
        ) {
          return { text: message.content.trim() }
        }
      }

      unexpectedModelOutput()
    },
  })
}

export const qwen25ChatAdapter = createChatAdapter({
  id: "qwen-2.5-0.5b-chat",
  label: "Qwen 2.5 0.5B chat translator",
  buildSystemPrompt: qwen25SystemPrompt,
})

export const qwen3ChatAdapter = createChatAdapter({
  id: "qwen-3-0.6b-chat",
  label: "Qwen 3 0.6B chat translator",
  buildSystemPrompt: qwen3SystemPrompt,
})

export const gemma3ChatAdapter = createChatAdapter({
  id: "gemma-3-1b-it-chat",
  label: "Gemma 3 1B IT chat translator",
  buildSystemPrompt: gemma3SystemPrompt,
})
