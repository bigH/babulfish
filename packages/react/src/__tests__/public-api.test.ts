import { describe, expect, expectTypeOf, it } from "vitest"
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

describe("public React API contract", () => {
  it("exports exactly the documented React runtime names", () => {
    expect(Object.keys(publicApi).toSorted()).toEqual(EXPECTED_RUNTIME_EXPORTS)
    expect(publicApi.DEFAULT_LANGUAGES.length).toBeGreaterThan(0)
  })

  it("exports the documented React types", () => {
    expectTypeOf<PublicApi.TranslatorLanguage>().toEqualTypeOf<{
      readonly label: string
      readonly code: string
    }>()

    expectTypeOf<PublicApi.TranslatorConfig>().toMatchTypeOf<{
      readonly languages?: readonly PublicApi.TranslatorLanguage[]
      readonly dom?: {
        readonly structuredText?: {
          readonly selector: string
        }
        readonly outputTransform?: (
          translated: string,
          context: {
            readonly kind: "linked" | "richText" | "structuredText" | "text" | "attr"
            readonly targetLang: string
            readonly source: string
            readonly attribute?: string
          },
        ) => string
      }
    }>()

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
