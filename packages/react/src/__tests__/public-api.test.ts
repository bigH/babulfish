import { describe, expect, expectTypeOf, it } from "vitest"
import type {
  BabulfishConfig,
  CapabilityObservation,
  EnablementState,
  Language,
  ModelState,
  ResolvedDevice,
  TranslationState,
} from "@babulfish/core"
import type { ReactNode } from "react"
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
    expectTypeOf<PublicApi.TranslatorLanguage>().toEqualTypeOf<Language>()
    expectTypeOf<PublicApi.TranslatorConfig>().toEqualTypeOf<BabulfishConfig>()

    expectTypeOf<PublicApi.TranslateButtonClassNames>().toMatchTypeOf<{
      readonly button?: string
      readonly tooltip?: string
      readonly dropdown?: string
      readonly dropdownItem?: string
      readonly progressRing?: string
    }>()

    expectTypeOf<PublicApi.TranslateButtonProps>().toMatchTypeOf<{
      readonly classNames?: PublicApi.TranslateButtonClassNames
      readonly icon?: ReactNode
      readonly progressRing?: {
        readonly downloadColor?: string
        readonly translateColor?: string
      }
    }>()

    expectTypeOf<PublicApi.TranslateDropdownProps>().toMatchTypeOf<{
      readonly onSelect: (code: string) => void
      readonly onRestore?: () => void
      readonly value?: string | null
      readonly disabled?: boolean
      readonly languages?: readonly PublicApi.TranslatorLanguage[]
    }>()

    expectTypeOf<PublicApi.ModelState>().toEqualTypeOf<ModelState>()

    expectTypeOf<PublicApi.TranslationState>().toEqualTypeOf<TranslationState>()

    expectTypeOf<ReturnType<typeof publicApi.useTranslator>>().toMatchTypeOf<{
      readonly model: PublicApi.ModelState
      readonly translation: PublicApi.TranslationState
      readonly currentLanguage: string | null
      readonly capabilities: CapabilityObservation
      readonly enablement: EnablementState
      readonly capabilitiesReady: boolean
      readonly isSupported: boolean
      readonly hasWebGPU: boolean
      readonly canTranslate: boolean
      readonly device: ResolvedDevice | null
      readonly isMobile: boolean
      readonly languages: readonly PublicApi.TranslatorLanguage[]
      loadModel(): Promise<void>
      translateTo(code: string): Promise<void>
      restore(): void
      translate(text: string, lang: string): Promise<string>
    }>()

    expectTypeOf<ReturnType<typeof publicApi.useTranslateDOM>>().toMatchTypeOf<{
      readonly progress: number | null
      translatePage(lang: string): Promise<void>
      restorePage(): void
    }>()
  })
})
