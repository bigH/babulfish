import { createContext, useContext } from "react"
import type { BabulfishCore, Language } from "@babulfish/core"

export type TranslatorLanguage = Language

export const TranslatorContext = createContext<BabulfishCore | null>(null)

export function useOptionalTranslatorContext(): BabulfishCore | null {
  return useContext(TranslatorContext)
}

export function useTranslatorContext(): BabulfishCore {
  const ctx = useOptionalTranslatorContext()
  if (!ctx) {
    throw new Error("useTranslator must be used within <TranslatorProvider>")
  }
  return ctx
}
