// TranslatorProvider — creates engine + DOM translator, stores them in context

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
import type { DevicePreference } from "../engine/detect.js"
import { TranslatorContext } from "./context.js"
import type { TranslatorContextValue, TranslatorLanguage } from "./context.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranslatorConfig = {
  readonly engine?: EngineConfig
  readonly dom?: Omit<DOMTranslatorConfig, "translate">
  readonly languages?: TranslatorLanguage[]
}

// Re-export TranslatorLanguage so consumers can import from provider
export type { TranslatorLanguage } from "./context.js"

// ---------------------------------------------------------------------------
// Default languages
// ---------------------------------------------------------------------------

export const DEFAULT_LANGUAGES: TranslatorLanguage[] = [
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
export { useTranslatorContext } from "./context.js"
export type { TranslatorContextValue } from "./context.js"

type DOMHooks = NonNullable<DOMTranslatorConfig["hooks"]>

function composeHook<TArgs extends unknown[]>(
  internal: ((...args: TArgs) => void) | undefined,
  external: ((...args: TArgs) => void) | undefined,
) {
  if (!internal) return external
  if (!external) return internal

  return (...args: TArgs) => {
    internal(...args)
    external(...args)
  }
}

function normalizeProgress(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.max(done / total, 0), 1)
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TranslatorProvider({
  config,
  children,
}: {
  config?: TranslatorConfig
  children: ReactNode
}) {
  const engineRef = useRef<Translator | null>(null)
  const [domTranslator, setDomTranslator] = useState<DOMTranslator | null>(null)
  const [translationProgress, setTranslationProgress] = useState<number | null>(
    null,
  )
  const translationRunIdRef = useRef(0)

  // Stable reference: only recreate engine if config identity changes
  if (!engineRef.current) {
    engineRef.current = createEngine(config?.engine)
  }
  const engine = engineRef.current

  const languages = config?.languages ?? DEFAULT_LANGUAGES
  const devicePreference: DevicePreference = config?.engine?.device ?? "auto"

  useEffect(() => {
    if (!config?.dom) return

    const userHooks = config.dom.hooks
    const internalHooks: DOMHooks = {
      onTranslateStart: () => {
        setTranslationProgress((current) => current ?? 0)
      },
      onTranslateEnd: () => {},
      onProgress: (done, total) => {
        setTranslationProgress(normalizeProgress(done, total))
      },
    }

    const baseTranslator = createDOMTranslator({
      ...config.dom,
      hooks: {
        ...userHooks,
        onTranslateStart: composeHook(
          internalHooks.onTranslateStart,
          userHooks?.onTranslateStart,
        ),
        onTranslateEnd: composeHook(
          internalHooks.onTranslateEnd,
          userHooks?.onTranslateEnd,
        ),
        onProgress: composeHook(
          internalHooks.onProgress,
          userHooks?.onProgress,
        ),
      },
      translate: (text, lang) => engine.translate(text, lang),
    })
    const wrappedTranslator: DOMTranslator = {
      async translate(targetLang) {
        const runId = ++translationRunIdRef.current
        setTranslationProgress(0)

        try {
          await baseTranslator.translate(targetLang)
        } finally {
          if (translationRunIdRef.current === runId) {
            setTranslationProgress(null)
          }
        }
      },
      restore() {
        translationRunIdRef.current++
        baseTranslator.restore()
        setTranslationProgress(null)
      },
      abort() {
        translationRunIdRef.current++
        baseTranslator.abort()
        setTranslationProgress(null)
      },
      get isTranslating() {
        return baseTranslator.isTranslating
      },
      get currentLang() {
        return baseTranslator.currentLang
      },
    }

    setTranslationProgress(null)
    setDomTranslator(wrappedTranslator)

    return () => {
      translationRunIdRef.current++
      baseTranslator.abort()
      setTranslationProgress(null)
    }
  }, [config?.dom, engine])

  // Dispose engine on unmount
  useEffect(() => {
    return () => {
      engine.dispose()
    }
  }, [engine])

  const value = useMemo<TranslatorContextValue>(
    () => ({
      engine,
      domTranslator,
      translationProgress,
      languages,
      devicePreference,
    }),
    [devicePreference, domTranslator, engine, languages, translationProgress],
  )

  return (
    <TranslatorContext.Provider value={value}>
      {children}
    </TranslatorContext.Provider>
  )
}
