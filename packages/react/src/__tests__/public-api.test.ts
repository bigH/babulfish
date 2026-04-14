import { describe, expect, expectTypeOf, it } from "vitest"
import * as publicApi from "../index.js"

const EXPECTED_RUNTIME_EXPORTS = [
  "DEFAULT_LANGUAGES",
  "TranslateButton",
  "TranslateDropdown",
  "TranslatorProvider",
  "useTranslateDOM",
  "useTranslator",
] as const satisfies readonly (keyof typeof publicApi)[]

describe("public React API contract", () => {
  it("exports exactly the documented React runtime names", () => {
    expect(Object.keys(publicApi).toSorted()).toEqual(EXPECTED_RUNTIME_EXPORTS)
    expect(publicApi.DEFAULT_LANGUAGES.length).toBeGreaterThan(0)
  })

  it("exports the documented React types", () => {
    expectTypeOf<import("../index.js").TranslatorLanguage>().toEqualTypeOf<{
      readonly label: string
      readonly code: string
    }>()

    expectTypeOf<import("../index.js").TranslatorConfig>().toMatchTypeOf<{
      readonly languages?: readonly import("../index.js").TranslatorLanguage[]
    }>()

    expectTypeOf<import("../index.js").TranslateButtonClassNames>().toMatchTypeOf<{
      readonly button?: string
      readonly tooltip?: string
      readonly dropdown?: string
      readonly progressRing?: string
    }>()

    expectTypeOf<import("../index.js").TranslateButtonProps>().toMatchTypeOf<{
      readonly classNames?: import("../index.js").TranslateButtonClassNames
    }>()

    expectTypeOf<import("../index.js").TranslateDropdownProps>().toMatchTypeOf<{
      readonly value?: string | null
      readonly languages?: readonly import("../index.js").TranslatorLanguage[]
    }>()

    expectTypeOf<import("../index.js").ModelState>().toMatchTypeOf<
      | { readonly status: "idle" }
      | { readonly status: "downloading"; readonly progress: number }
      | { readonly status: "ready" }
      | { readonly status: "error"; readonly error: unknown }
    >()

    expectTypeOf<import("../index.js").TranslationState>().toMatchTypeOf<
      | { readonly status: "idle" }
      | { readonly status: "translating"; readonly progress: number }
    >()
  })
})

// @ts-expect-error stale alias must not exist in the public barrel
void publicApi.BabulfishProvider

// @ts-expect-error stale alias must not exist in the public barrel
void publicApi.useBabulfish

// @ts-expect-error stale alias must not exist in the public barrel
void (null as import("../index.js").BabulfishLanguage | null)
