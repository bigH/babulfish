import { createEnablementCompat } from "@babulfish/core"
import { useTranslatorContext, useTranslatorSnapshot } from "./context.js"

export function useTranslator() {
  const core = useTranslatorContext()
  const snapshot = useTranslatorSnapshot(core)
  const { capabilitiesReady, canTranslate, device } = createEnablementCompat(
    snapshot.enablement,
  )

  return {
    model: snapshot.model,
    translation: snapshot.translation,
    currentLanguage: snapshot.currentLanguage,
    capabilities: snapshot.capabilities,
    enablement: snapshot.enablement,
    capabilitiesReady,
    isSupported: canTranslate,
    hasWebGPU: snapshot.capabilities.hasWebGPU,
    canTranslate,
    device,
    isMobile: snapshot.capabilities.isMobile,
    languages: core.languages,
    loadModel: core.loadModel,
    translateTo: core.translateTo,
    restore: core.restore,
    translate: core.translateText,
  }
}
