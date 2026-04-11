// Shared context — extracted so both provider and standalone components
// can reference the same context instance without circular imports.

import { createContext, useContext } from "react"
import type { Translator } from "../engine/index.js"
import type { DOMTranslator } from "../dom/index.js"

// ---------------------------------------------------------------------------
// Types (shared across react layer)
// ---------------------------------------------------------------------------

export type TranslatorLanguage = {
  readonly label: string
  readonly code: string
}

export type TranslatorContextValue = {
  readonly engine: Translator
  readonly domTranslator: DOMTranslator | null
  readonly languages: TranslatorLanguage[]
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const TranslatorContext =
  createContext<TranslatorContextValue | null>(null)

export function useTranslatorContext(): TranslatorContextValue {
  const ctx = useContext(TranslatorContext)
  if (!ctx) {
    throw new Error("useTranslator must be used within <TranslatorProvider>")
  }
  return ctx
}
