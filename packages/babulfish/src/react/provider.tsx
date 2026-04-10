// BabulfishProvider — creates engine + DOM translator, stores them in context

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createEngine } from "../engine/index.js"
import { createDOMTranslator } from "../dom/index.js"
import type { EngineConfig, Translator } from "../engine/index.js"
import type { DOMTranslatorConfig, DOMTranslator } from "../dom/index.js"
import { BabulfishContext } from "./context.js"
import type { BabulfishContextValue, BabulfishLanguage } from "./context.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BabulfishConfig = {
  readonly engine?: EngineConfig
  readonly dom?: Omit<DOMTranslatorConfig, "translate">
  readonly languages?: BabulfishLanguage[]
}

// Re-export BabulfishLanguage so consumers can import from provider
export type { BabulfishLanguage } from "./context.js"

// ---------------------------------------------------------------------------
// Default languages
// ---------------------------------------------------------------------------

export const DEFAULT_LANGUAGES: BabulfishLanguage[] = [
  { label: "English (Original)", code: "restore" },
  { label: "Spanish", code: "es-ES" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Japanese", code: "ja" },
  { label: "Korean", code: "ko" },
  { label: "Chinese (Simplified)", code: "zh-CN" },
  { label: "Hindi", code: "hi" },
  { label: "Portuguese (Brazil)", code: "pt-BR" },
  { label: "Arabic", code: "ar" },
  { label: "Russian", code: "ru" },
  { label: "Italian", code: "it" },
  { label: "Thai", code: "th" },
  { label: "Vietnamese", code: "vi" },
]

// Re-export context utilities for consumers
export { useBabulfishContext } from "./context.js"
export type { BabulfishContextValue } from "./context.js"

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function BabulfishProvider({
  config,
  children,
}: {
  config?: BabulfishConfig
  children: ReactNode
}) {
  const engineRef = useRef<Translator | null>(null)
  const [domTranslator, setDomTranslator] = useState<DOMTranslator | null>(null)

  // Stable reference: only recreate engine if config identity changes
  if (!engineRef.current) {
    engineRef.current = createEngine(config?.engine)
  }
  const engine = engineRef.current

  const languages = config?.languages ?? DEFAULT_LANGUAGES

  useEffect(() => {
    if (!config?.dom) return

    const dt = createDOMTranslator({
      ...config.dom,
      translate: (text, lang) => engine.translate(text, lang),
    })
    setDomTranslator(dt)

    return () => {
      dt.abort()
    }
  }, [config?.dom, engine])

  // Dispose engine on unmount
  useEffect(() => {
    return () => {
      engine.dispose()
    }
  }, [engine])

  const value = useMemo<BabulfishContextValue>(
    () => ({ engine, domTranslator, languages }),
    [engine, domTranslator, languages],
  )

  return (
    <BabulfishContext.Provider value={value}>
      {children}
    </BabulfishContext.Provider>
  )
}
