import { useTranslatorContext, useTranslatorSnapshot } from "./context.js"

export function useTranslator() {
  const core = useTranslatorContext()
  const snapshot = useTranslatorSnapshot(core)
  const capabilitiesReady =
    snapshot.enablement.status === "ready" || snapshot.enablement.status === "error"
  const canTranslate =
    snapshot.enablement.verdict.outcome === "gpu-preferred" ||
    snapshot.enablement.verdict.outcome === "wasm-only"

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
    device: snapshot.enablement.verdict.resolvedDevice,
    isMobile: snapshot.capabilities.isMobile,
    languages: core.languages,
    loadModel: core.loadModel,
    translateTo: core.translateTo,
    restore: core.restore,
    translate: core.translateText,
  }
}
