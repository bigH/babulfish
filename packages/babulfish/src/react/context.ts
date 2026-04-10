// Shared context — extracted so both provider and standalone components
// can reference the same context instance without circular imports.

import { createContext, useContext } from "react"
import type { Translator } from "../engine/index.js"
import type { DOMTranslator } from "../dom/index.js"

// ---------------------------------------------------------------------------
// Types (shared across react layer)
// ---------------------------------------------------------------------------

export type BabulfishLanguage = {
  readonly label: string
  readonly code: string
}

export type BabulfishContextValue = {
  readonly engine: Translator
  readonly domTranslator: DOMTranslator | null
  readonly languages: BabulfishLanguage[]
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const BabulfishContext =
  createContext<BabulfishContextValue | null>(null)

export function useBabulfishContext(): BabulfishContextValue {
  const ctx = useContext(BabulfishContext)
  if (!ctx) {
    throw new Error("useBabulfish must be used within <BabulfishProvider>")
  }
  return ctx
}
