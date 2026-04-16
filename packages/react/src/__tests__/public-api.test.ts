import { describe, expect, expectTypeOf, it } from "vitest"
import type { BabulfishConfig, Language } from "@babulfish/core"
import * as publicApi from "../index.js"
import type * as PublicApi from "../index.js"

const EXPECTED_RUNTIME_EXPORTS = [
  "DEFAULT_LANGUAGES",
  "TranslateButton",
  "TranslateDropdown",
  "TranslatorProvider",
  "useTranslateDOM",
  "useTranslator",
] as const satisfies readonly (keyof PublicApi)[]

type ExpectedStructuredTextConfig = {
  readonly selector: string
}

type ExpectedDOMOutputTransformContext = {
  readonly kind: "linked" | "richText" | "structuredText" | "text" | "attr"
  readonly targetLang: string
  readonly source: string
  readonly attribute?: string
}

type TranslatorDOMConfig = NonNullable<PublicApi.TranslatorConfig["dom"]>
type TranslatorOutputTransform = NonNullable<TranslatorDOMConfig["outputTransform"]>

describe("public React API contract", () => {
  it("exports exactly the documented React runtime names", () => {
    expect(Object.keys(publicApi).toSorted()).toEqual(EXPECTED_RUNTIME_EXPORTS)
    expect(publicApi.DEFAULT_LANGUAGES.length).toBeGreaterThan(0)
  })

  it("exports the documented React types", () => {
    expectTypeOf<PublicApi.TranslatorLanguage>().toEqualTypeOf<Language>()
    expectTypeOf<PublicApi.TranslatorConfig>().toEqualTypeOf<BabulfishConfig>()
    expectTypeOf<NonNullable<TranslatorDOMConfig["structuredText"]>>()
      .toEqualTypeOf<ExpectedStructuredTextConfig>()
    expectTypeOf<Parameters<TranslatorOutputTransform>[1]>()
      .toEqualTypeOf<ExpectedDOMOutputTransformContext>()

    expectTypeOf<PublicApi.TranslateButtonClassNames>().toMatchTypeOf<{
      readonly button?: string
      readonly tooltip?: string
      readonly dropdown?: string
      readonly progressRing?: string
    }>()

    expectTypeOf<PublicApi.TranslateButtonProps>().toMatchTypeOf<{
      readonly classNames?: PublicApi.TranslateButtonClassNames
    }>()

    expectTypeOf<PublicApi.TranslateDropdownProps>().toMatchTypeOf<{
      readonly value?: string | null
      readonly languages?: readonly PublicApi.TranslatorLanguage[]
    }>()

    expectTypeOf<PublicApi.ModelState>().toMatchTypeOf<
      | { readonly status: "idle" }
      | { readonly status: "downloading"; readonly progress: number }
      | { readonly status: "ready" }
      | { readonly status: "error"; readonly error: unknown }
    >()

    expectTypeOf<PublicApi.TranslationState>().toMatchTypeOf<
      | { readonly status: "idle" }
      | { readonly status: "translating"; readonly progress: number }
    >()

    expectTypeOf<ReturnType<typeof publicApi.useTranslator>>().toMatchTypeOf<{
      readonly model: PublicApi.ModelState
      readonly translation: PublicApi.TranslationState
      readonly currentLanguage: string | null
      readonly languages: readonly PublicApi.TranslatorLanguage[]
    }>()

    expectTypeOf<ReturnType<typeof publicApi.useTranslateDOM>>().toMatchTypeOf<{
      readonly progress: number | null
      translatePage(lang: string): Promise<void>
      restorePage(): void
    }>()
  })
})
