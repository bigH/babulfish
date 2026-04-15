import { createContext, useContext } from "react"
import type { BabulfishCore } from "@babulfish/core"

export const TranslatorContext = createContext<BabulfishCore | null>(null)

export function useTranslatorContext(): BabulfishCore {
  const ctx = useContext(TranslatorContext)
  if (!ctx) {
    throw new Error("useTranslator must be used within <TranslatorProvider>")
  }
  return ctx
}
