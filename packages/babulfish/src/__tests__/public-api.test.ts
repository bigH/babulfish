import { describe, expect, expectTypeOf, it } from "vitest"
import * as publicApi from "../index.js"

describe("public React API contract", () => {
  it("exports the documented React runtime names", () => {
    expect(publicApi.TranslatorProvider).toBeTypeOf("function")
    expect(publicApi.useTranslator).toBeTypeOf("function")
    expect(publicApi.useTranslateDOM).toBeTypeOf("function")
    expect(publicApi.TranslateButton).toBeTypeOf("function")
    expect(publicApi.TranslateDropdown).toBeTypeOf("function")
    expect(publicApi.DEFAULT_LANGUAGES.length).toBeGreaterThan(0)
  })

  it("does not export stale Babulfish runtime aliases", () => {
    expect("BabulfishProvider" in publicApi).toBe(false)
    expect("useBabulfish" in publicApi).toBe(false)
    expect("BabulfishLanguage" in publicApi).toBe(false)
  })

  it("exports the documented React types", () => {
    expectTypeOf<import("../index.js").TranslatorLanguage>().toEqualTypeOf<{
      readonly label: string
      readonly code: string
    }>()

    expectTypeOf<import("../index.js").TranslatorConfig>().toMatchTypeOf<{
      readonly languages?: import("../index.js").TranslatorLanguage[]
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
      readonly languages?: import("../index.js").TranslatorLanguage[]
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
