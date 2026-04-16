import { createContext, useContext, useSyncExternalStore } from "react"
import type { BabulfishCore, Language, Snapshot } from "@babulfish/core"
import { SSR_CORE } from "./ssr.js"

const MISSING_PROVIDER_ERROR =
  "Translator hooks must be used within <TranslatorProvider>"
const MISSING_DROPDOWN_LANGUAGES_ERROR =
  "TranslateDropdown requires either a languages prop or a <TranslatorProvider>"

export const TranslatorContext = createContext<BabulfishCore | null>(null)

export function useOptionalTranslatorContext(): BabulfishCore | null {
  return useContext(TranslatorContext)
}

export function useTranslatorContext(): BabulfishCore {
  const ctx = useOptionalTranslatorContext()
  if (!ctx) {
    throw new Error(MISSING_PROVIDER_ERROR)
  }
  return ctx
}

export function useResolvedLanguages(
  languages?: readonly Language[],
): readonly Language[] {
  const ctx = useOptionalTranslatorContext()
  const resolvedLanguages = languages ?? ctx?.languages

  if (!resolvedLanguages) {
    throw new Error(MISSING_DROPDOWN_LANGUAGES_ERROR)
  }

  return resolvedLanguages
}

export function useTranslatorSnapshot(core: BabulfishCore): Snapshot {
  return useSyncExternalStore(
    core.subscribe,
    () => core.snapshot,
    () => SSR_CORE.snapshot,
  )
}
