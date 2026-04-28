import type {
  OptionIssues,
  TranslationAdapter,
  TranslationOptions,
  TranslationRequest,
  TranslationResult,
} from "../translation-adapter.js"
import {
  maskPreservedSubstrings,
  normalizedPreservedSubstrings,
  restorePreservedSubstrings,
} from "./preservation.js"

export type TranslationModelInvocation<
  ModelInput,
  ModelOptions extends Record<string, unknown>,
> = {
  readonly modelInput: ModelInput
  readonly modelOptions: ModelOptions
}

type AdapterIdentity = {
  readonly id: string
  readonly label: string
}

type PreservationApproach =
  | NonNullable<TranslationOptions["preservation_approach"]>
  | "none"

const EMPTY_ISSUES: OptionIssues = Object.freeze({
  warnings: Object.freeze([]),
  errors: Object.freeze([]),
})

function freezeIssues(
  warnings: readonly string[],
  errors: readonly string[],
): OptionIssues {
  if (warnings.length === 0 && errors.length === 0) return EMPTY_ISSUES

  return Object.freeze({
    warnings: Object.freeze([...warnings]),
    errors: Object.freeze([...errors]),
  })
}

function mergeIssues(issues: readonly OptionIssues[]): OptionIssues {
  const warnings = issues.flatMap((issue) => issue.warnings)
  const errors = issues.flatMap((issue) => issue.errors)

  return freezeIssues(warnings, errors)
}

export abstract class TranslateModelBaseAdapter<
  ModelInput,
  ModelOutput = unknown,
  ModelOptions extends Record<string, unknown> = Record<string, unknown>,
> implements TranslationAdapter<ModelInput, ModelOutput, ModelOptions> {
  readonly id: string
  readonly label: string

  protected constructor({ id, label }: AdapterIdentity) {
    this.id = id
    this.label = label
  }

  validateOptions(options: TranslationOptions): OptionIssues {
    return mergeIssues([
      this.validateBaseOptions(options),
      this.validateModelOptions(options),
    ])
  }

  buildInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ModelInput, ModelOptions> {
    this.throwOptionErrors(options)
    return this.buildModelInvocation(this.prepareRequest(request, options), options)
  }

  extractText(
    request: TranslationRequest,
    options: TranslationOptions,
    output: ModelOutput,
  ): TranslationResult {
    const text = this.extractModelText(request, options, output)
    return { text: this.restorePreservedText(request, options, text) }
  }

  protected validateBaseOptions(_options: TranslationOptions): OptionIssues {
    return EMPTY_ISSUES
  }

  protected validateModelOptions(_options: TranslationOptions): OptionIssues {
    return EMPTY_ISSUES
  }

  protected optionIssues(errors: readonly string[] = []): OptionIssues {
    return freezeIssues([], errors)
  }

  protected throwOptionErrors(options: TranslationOptions): void {
    const { errors } = this.validateOptions(options)
    if (errors.length > 0) {
      throw new Error(errors.join(" "))
    }
  }

  protected preservedSubstrings(options: TranslationOptions): readonly string[] {
    return normalizedPreservedSubstrings(options.substrings_to_preserve)
  }

  protected defaultPreservationApproach(_options: TranslationOptions): PreservationApproach {
    return "none"
  }

  protected preservationApproach(options: TranslationOptions): PreservationApproach {
    return options.preservation_approach ?? this.defaultPreservationApproach(options)
  }

  protected usesPromptPreservation(options: TranslationOptions): boolean {
    return (
      this.preservedSubstrings(options).length > 0 &&
      this.preservationApproach(options) === "prompting"
    )
  }

  protected usesPlaceholderPreservation(options: TranslationOptions): boolean {
    return (
      this.preservedSubstrings(options).length > 0 &&
      this.preservationApproach(options) === "placeholders"
    )
  }

  private prepareRequest(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationRequest {
    if (!this.usesPlaceholderPreservation(options)) return request

    const { masked } = maskPreservedSubstrings(
      request.text,
      this.preservedSubstrings(options),
    )
    return masked === request.text ? request : { ...request, text: masked }
  }

  private restorePreservedText(
    request: TranslationRequest,
    options: TranslationOptions,
    text: string,
  ): string {
    if (!this.usesPlaceholderPreservation(options)) return text

    const { slots } = maskPreservedSubstrings(
      request.text,
      this.preservedSubstrings(options),
    )
    return restorePreservedSubstrings(text, slots)
  }

  protected abstract buildModelInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ModelInput, ModelOptions>

  protected abstract extractModelText(
    request: TranslationRequest,
    options: TranslationOptions,
    output: ModelOutput,
  ): string
}
