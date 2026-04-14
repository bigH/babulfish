import { createContext, useContext } from "react"
import type { BabulfishCore, Language } from "@babulfish/core"

export type TranslatorLanguage = Language

export type TranslatorContextValue = BabulfishCore

export const TranslatorContext = createContext<BabulfishCore | null>(null)

export function useTranslatorContext(): BabulfishCore {
  const ctx = useContext(TranslatorContext)
  if (!ctx) {
    throw new Error("useTranslator must be used within <TranslatorProvider>")
  }
  return ctx
}
