import { useTranslatorContext, useTranslatorSnapshot } from "./context.js"

export function useTranslator() {
  const core = useTranslatorContext()
  const snapshot = useTranslatorSnapshot(core)

  return {
    model: snapshot.model,
    translation: snapshot.translation,
    currentLanguage: snapshot.currentLanguage,
    capabilitiesReady: snapshot.capabilities.ready,
    isSupported: snapshot.capabilities.canTranslate,
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
