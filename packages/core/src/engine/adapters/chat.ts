import type {
  OptionIssues,
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

function optionIssues(errors: readonly string[] = []): OptionIssues {
  return Object.freeze({ warnings: [], errors })
}

function throwOptionErrors(options: TranslationOptions): void {
  const { errors } = chatAdapter.validateOptions(options)
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

function systemPrompt(
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

export const chatAdapter: TranslationAdapter<ChatInput, unknown, ChatOptions> = Object.freeze({
  id: "chat",
  label: "Generic chat translator",

  validateOptions(options) {
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
  },

  buildInvocation(request, options) {
    throwOptionErrors(options)

    return {
      modelInput: [
        {
          role: "system",
          content: systemPrompt(request.source.code, request.target.code, options),
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
