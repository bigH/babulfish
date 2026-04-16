import type { BabulfishCore, Language, Snapshot } from "@babulfish/core"

const SSR_LANGUAGES = Object.freeze<Language[]>([])
const noop = () => {}
const resolveVoid = (): Promise<void> => Promise.resolve()
const resolveEmptyString = (): Promise<string> => Promise.resolve("")

const SSR_SNAPSHOT: Snapshot = Object.freeze({
  model: Object.freeze({ status: "idle" as const }),
  translation: Object.freeze({ status: "idle" as const }),
  currentLanguage: null,
  capabilities: Object.freeze({
    ready: false,
    hasWebGPU: false,
    isMobile: false,
    approxDeviceMemoryGiB: null,
    crossOriginIsolated: false,
  }),
  enablement: Object.freeze({
    status: "idle" as const,
    modelProfile: null,
    inference: null,
    verdict: Object.freeze({
      outcome: "unknown" as const,
      resolvedDevice: null,
      reason: "Enablement has not been assessed yet.",
    }),
  }),
})

export const SSR_CORE: BabulfishCore = {
  get snapshot() {
    return SSR_SNAPSHOT
  },
  subscribe: () => noop,
  loadModel: resolveVoid,
  translateTo: resolveVoid,
  translateText: resolveEmptyString,
  restore: noop,
  abort: noop,
  dispose: resolveVoid,
  languages: SSR_LANGUAGES,
}
