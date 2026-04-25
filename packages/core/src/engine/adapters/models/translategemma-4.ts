import type {
  TranslationAdapter,
  TranslationOptions,
  TranslationRequest,
} from "../../translation-adapter.js"
import {
  TranslateModelBaseAdapter,
  type TranslationModelInvocation,
} from "../translate.js"

export type TranslateGemmaInput = readonly [
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

export type TranslateGemmaOptions = Record<string, unknown> & {
  readonly max_new_tokens: number
}

function unexpectedModelOutput(): never {
  throw new Error("Unexpected model output format")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export class TranslateGemma4Adapter extends TranslateModelBaseAdapter<
  TranslateGemmaInput,
  unknown,
  TranslateGemmaOptions
> {
  constructor() {
    super({
      id: "translategemma",
      label: "TranslateGemma",
    })
  }

  protected override validateModelOptions(options: TranslationOptions) {
    const errors: string[] = []

    if (
      options.content_type !== undefined &&
      options.content_type !== "raw" &&
      options.content_type !== "markdown" &&
      options.content_type !== "structured"
    ) {
      errors.push(
        "TranslateGemma adapter supports only raw, markdown, or structured translation content.",
      )
    }

    if (options.preservation_approach === "prompting") {
      errors.push("TranslateGemma adapter does not support prompt-based preservation.")
    }

    return this.optionIssues(errors)
  }

  protected override defaultPreservationApproach(
    options: TranslationOptions,
  ): "placeholders" | "none" {
    return this.preservedSubstrings(options).length > 0 ? "placeholders" : "none"
  }

  protected override buildModelInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<TranslateGemmaInput, TranslateGemmaOptions> {
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
  }

  protected override extractModelText(
    _request: TranslationRequest,
    _options: TranslationOptions,
    output: unknown,
  ): string {
    if (!Array.isArray(output)) unexpectedModelOutput()

    const firstResult = output[0]
    if (!isRecord(firstResult) || !Array.isArray(firstResult.generated_text)) {
      unexpectedModelOutput()
    }

    const lastMessage = firstResult.generated_text.at(-1)
    if (isRecord(lastMessage) && typeof lastMessage.content === "string") {
      return lastMessage.content
    }

    unexpectedModelOutput()
  }
}

export const translateGemmaAdapter: TranslationAdapter<
  TranslateGemmaInput,
  unknown,
  TranslateGemmaOptions
> = Object.freeze(new TranslateGemma4Adapter())
