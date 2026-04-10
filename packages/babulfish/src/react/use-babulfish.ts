// useBabulfish — primary hook wiring engine events to React state

import { useCallback, useEffect, useState } from "react"
import { isWebGPUAvailable, isMobileDevice } from "../engine/detect.js"
import { useBabulfishContext } from "./context.js"
import type { BabulfishLanguage } from "./context.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BabulfishModelState =
  | { readonly status: "idle" }
  | { readonly status: "downloading"; readonly progress: number }
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly error: unknown }

export type BabulfishTranslationState =
  | { readonly status: "idle" }
  | { readonly status: "translating"; readonly progress: number }

export type UseBabulfishReturn = {
  readonly model: BabulfishModelState
  readonly translation: BabulfishTranslationState
  readonly currentLanguage: string | null
  readonly isSupported: boolean
  readonly isMobile: boolean
  readonly languages: BabulfishLanguage[]
  loadModel(): Promise<void>
  translateTo(code: string): Promise<void>
  restore(): void
  translate(text: string, lang: string): Promise<string>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBabulfish(): UseBabulfishReturn {
  const { engine, domTranslator, languages } = useBabulfishContext()

  const [model, setModel] = useState<BabulfishModelState>(() =>
    engine.status === "ready"
      ? { status: "ready" }
      : { status: "idle" },
  )
  const [translation, setTranslation] = useState<BabulfishTranslationState>({
    status: "idle",
  })
  const [currentLanguage, setCurrentLanguage] = useState<string | null>(
    domTranslator?.currentLang ?? null,
  )
  const [supported] = useState(() => isWebGPUAvailable())
  const [mobile] = useState(() => isMobileDevice())

  // Wire engine events -> model state
  useEffect(() => {
    const unsubStatus = engine.on("status-change", ({ to }) => {
      switch (to) {
        case "idle":
          setModel({ status: "idle" })
          break
        case "downloading":
          setModel({ status: "downloading", progress: 0 })
          break
        case "ready":
          setModel({ status: "ready" })
          break
        case "error":
          setModel({ status: "error", error: new Error("Model loading failed") })
          break
      }
    })

    const unsubProgress = engine.on("progress", ({ loaded, total }) => {
      const fraction = total > 0 ? loaded / total : 0
      setModel({ status: "downloading", progress: fraction })
    })

    return () => {
      unsubStatus()
      unsubProgress()
    }
  }, [engine])

  const loadModel = useCallback(async () => {
    await engine.load()
  }, [engine])

  const translateTo = useCallback(
    async (code: string) => {
      if (!domTranslator) return

      if (code === "restore") {
        domTranslator.restore()
        setCurrentLanguage(null)
        setTranslation({ status: "idle" })
        return
      }

      setTranslation({ status: "translating", progress: 0 })

      try {
        await domTranslator.translate(code)
        setCurrentLanguage(code)
      } finally {
        setTranslation({ status: "idle" })
      }
    },
    [domTranslator],
  )

  const restore = useCallback(() => {
    domTranslator?.restore()
    setCurrentLanguage(null)
    setTranslation({ status: "idle" })
  }, [domTranslator])

  const translate = useCallback(
    (text: string, lang: string) => engine.translate(text, lang),
    [engine],
  )

  return {
    model,
    translation,
    currentLanguage,
    isSupported: supported,
    isMobile: mobile,
    languages,
    loadModel,
    translateTo,
    restore,
    translate,
  }
}
