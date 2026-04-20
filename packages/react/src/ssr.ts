import {
  IDLE_ENABLEMENT_STATE,
  type BabulfishCore,
  type Language,
  type Snapshot,
} from "@babulfish/core"

const noop = () => {}
const resolveVoid = (): Promise<void> => Promise.resolve()
const SSR_LANGUAGES = Object.freeze<Language[]>([])

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
  enablement: IDLE_ENABLEMENT_STATE,
})

export const SSR_CORE: BabulfishCore = {
  get snapshot() {
    return SSR_SNAPSHOT
  },
  subscribe: () => noop,
  loadModel: resolveVoid,
  translateTo: resolveVoid,
  translateText: () => Promise.resolve(""),
  restore: noop,
  abort: noop,
  dispose: resolveVoid,
  languages: SSR_LANGUAGES,
}
