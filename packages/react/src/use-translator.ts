import { useSyncExternalStore } from "react"
import { useTranslatorContext } from "./context.js"
import type { TranslatorLanguage } from "./context.js"
import type { ModelState, TranslationState, Capabilities } from "@babulfish/core"
import { SSR_SNAPSHOT } from "./ssr.js"

export type { ModelState, TranslationState }

export type UseTranslatorReturn = {
  readonly model: ModelState
  readonly translation: TranslationState
  readonly currentLanguage: string | null
  readonly capabilitiesReady: boolean
  readonly isSupported: boolean
  readonly hasWebGPU: boolean
  readonly canTranslate: boolean
  readonly device: Capabilities["device"]
  readonly isMobile: boolean
  readonly languages: ReadonlyArray<TranslatorLanguage>
  loadModel(): Promise<void>
  translateTo(code: string): Promise<void>
  restore(): void
  translate(text: string, lang: string): Promise<string>
}

export function useTranslator(): UseTranslatorReturn {
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
