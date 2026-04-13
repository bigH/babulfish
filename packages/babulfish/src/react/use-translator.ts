// useTranslator — primary hook wiring engine events to React state

import { useCallback, useEffect, useState } from "react"
import {
  getTranslationCapabilities,
  type ResolvedDevice,
} from "../engine/detect.js"
import { useTranslatorContext } from "./context.js"
import type { TranslatorLanguage } from "./context.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelState =
  | { readonly status: "idle" }
  | { readonly status: "downloading"; readonly progress: number }
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly error: unknown }

export type TranslationState =
  | { readonly status: "idle" }
  | { readonly status: "translating"; readonly progress: number }

export type UseTranslatorReturn = {
  readonly model: ModelState
  readonly translation: TranslationState
  readonly currentLanguage: string | null
  readonly capabilitiesReady: boolean
  readonly isSupported: boolean
  readonly hasWebGPU: boolean
  readonly canTranslate: boolean
  readonly device: ResolvedDevice | null
  readonly isMobile: boolean
  readonly languages: TranslatorLanguage[]
  loadModel(): Promise<void>
  translateTo(code: string): Promise<void>
  restore(): void
  translate(text: string, lang: string): Promise<string>
}

type CapabilitySnapshot = {
  readonly ready: boolean
  readonly hasWebGPU: boolean
  readonly canTranslate: boolean
  readonly device: ResolvedDevice | null
  readonly isMobile: boolean
}

const NEUTRAL_CAPABILITIES: CapabilitySnapshot = {
  ready: false,
  hasWebGPU: false,
  canTranslate: false,
  device: null,
  isMobile: false,
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTranslator(): UseTranslatorReturn {
  const { engine, domTranslator, languages, devicePreference } =
    useTranslatorContext()

  const [model, setModel] = useState<ModelState>(() =>
    engine.status === "ready"
      ? { status: "ready" }
      : { status: "idle" },
  )
  const [translation, setTranslation] = useState<TranslationState>({
    status: "idle",
  })
  const [currentLanguage, setCurrentLanguage] = useState<string | null>(
    domTranslator?.currentLang ?? null,
  )
  const [capabilities, setCapabilities] = useState<CapabilitySnapshot>(
    NEUTRAL_CAPABILITIES,
  )

  useEffect(() => {
    setCapabilities({
      ready: true,
      ...getTranslationCapabilities(devicePreference),
    })
  }, [devicePreference])

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
    capabilitiesReady: capabilities.ready,
    isSupported: capabilities.hasWebGPU,
    hasWebGPU: capabilities.hasWebGPU,
    canTranslate: capabilities.canTranslate,
    device: capabilities.device,
    isMobile: capabilities.isMobile,
    languages,
    loadModel,
    translateTo,
    restore,
    translate,
  }
}
