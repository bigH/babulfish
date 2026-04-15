import { useSyncExternalStore } from "react"
import { useTranslatorContext } from "./context.js"
import type { ModelState, TranslationState } from "@babulfish/core"
import { SSR_SNAPSHOT } from "./ssr.js"

export type { ModelState, TranslationState }

export function useTranslator() {
  const core = useTranslatorContext()
  const snapshot = useSyncExternalStore(
    core.subscribe,
    () => core.snapshot,
    () => SSR_SNAPSHOT,
  )

  return {
    model: snapshot.model,
    translation: snapshot.translation,
    currentLanguage: snapshot.currentLanguage,
    capabilitiesReady: snapshot.capabilities.ready,
    isSupported: snapshot.capabilities.hasWebGPU,
    hasWebGPU: snapshot.capabilities.hasWebGPU,
    canTranslate: snapshot.capabilities.canTranslate,
    device: snapshot.capabilities.device,
    isMobile: snapshot.capabilities.isMobile,
    languages: core.languages,
    loadModel: core.loadModel,
    translateTo: core.translateTo,
    restore: core.restore,
    translate: core.translateText,
  }
}
