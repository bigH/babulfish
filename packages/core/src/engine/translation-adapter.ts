export type TranslationLanguage = {
  readonly code: string
  readonly label?: string
}

export type TranslationRequest = {
  readonly text: string
  readonly source: TranslationLanguage
  readonly target: TranslationLanguage
}

export type TranslationResult = { readonly text: string }

export type TranslationOptions = {
  readonly max_new_tokens: number
  readonly do_sample?: false
  readonly return_full_text?: false
  readonly content_type?: "raw" | "markdown" | "html"
  readonly substrings_to_preserve?: readonly string[]
  readonly preservation_approach?: "placeholders" | "prompting"
}

export type OptionIssues = {
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
}

export type TranslationAdapter<
  ModelInput = unknown,
  ModelOutput = unknown,
  ModelOptions extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly id: string
  readonly label: string
  validateOptions(options: TranslationOptions): OptionIssues
  buildInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): {
    readonly modelInput: ModelInput
    readonly modelOptions: ModelOptions
  }
  extractText(
    request: TranslationRequest,
    options: TranslationOptions,
    output: ModelOutput,
  ): TranslationResult
}
