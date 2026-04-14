import type { BabulfishCore, Snapshot } from "@babulfish/core"

export const SSR_SNAPSHOT: Snapshot = Object.freeze({
  model: Object.freeze({ status: "idle" as const }),
  translation: Object.freeze({ status: "idle" as const }),
  currentLanguage: null,
  capabilities: Object.freeze({
    ready: false,
    hasWebGPU: false,
    canTranslate: false,
    device: null,
    isMobile: false,
  }),
})

export const SSR_CORE: BabulfishCore = {
  get snapshot() {
    return SSR_SNAPSHOT
  },
  subscribe: () => () => {},
  loadModel: async () => {},
  translateTo: async () => {},
  translateText: async () => "",
  restore: () => {},
  abort: () => {},
  dispose: async () => {},
  languages: [],
}
