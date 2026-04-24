import type {
  OptionIssues,
  TranslationAdapter,
  TranslationOptions,
} from "../translation-adapter.js"

type TranslateGemmaInput = readonly [
  {
    readonly role: "user"
    readonly content: readonly [
      {
        readonly type: "text"
        readonly source_lang_code: string
        readonly target_lang_code: string
        readonly text: string
      },
    ]
  },
]

type TranslateGemmaOptions = Record<string, unknown> & {
  readonly max_new_tokens: number
}

function optionIssues(errors: readonly string[] = []): OptionIssues {
  return Object.freeze({ warnings: [], errors })
}

function throwOptionErrors(options: TranslationOptions): void {
  const { errors } = translateGemmaAdapter.validateOptions(options)
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

export const translateGemmaAdapter: TranslationAdapter<
  TranslateGemmaInput,
  unknown,
  TranslateGemmaOptions
> = Object.freeze({
  id: "translategemma",
  label: "TranslateGemma",

  validateOptions(options) {
    const errors: string[] = []

    if (options.content_type !== undefined && options.content_type !== "raw") {
      errors.push("TranslateGemma adapter supports only raw translation content.")
    }

    if (options.preservation_approach === "prompting") {
      errors.push("TranslateGemma adapter does not support prompt-based preservation.")
    }

    if (preservedSubstrings(options).length > 0) {
      errors.push("TranslateGemma adapter does not support substring preservation options.")
    }

    return optionIssues(errors)
  },

  buildInvocation(request, options) {
    throwOptionErrors(options)

    return {
      modelInput: [
        {
          role: "user",
          content: [
            {
              type: "text",
              source_lang_code: request.source.code,
              target_lang_code: request.target.code,
              text: request.text,
            },
          ],
        },
      ],
      modelOptions: { max_new_tokens: options.max_new_tokens },
    }
  },

  extractText(_request, _options, output) {
    if (!Array.isArray(output)) unexpectedModelOutput()

    const firstResult = output[0]
    if (!isRecord(firstResult) || !Array.isArray(firstResult.generated_text)) {
      unexpectedModelOutput()
    }

    const lastMessage = firstResult.generated_text.at(-1)
    if (isRecord(lastMessage) && typeof lastMessage.content === "string") {
      return { text: lastMessage.content }
    }

    unexpectedModelOutput()
  },
})
