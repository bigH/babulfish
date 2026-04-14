import type { BabulfishCore, Language, Snapshot } from "@babulfish/core"

const SSR_LANGUAGES: ReadonlyArray<Language> = Object.freeze([])
const NOOP_UNSUBSCRIBE = () => {}
const NOOP = () => {}
const RESOLVE_VOID = async () => {}
const RESOLVE_EMPTY_STRING = async () => ""

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
  subscribe: () => NOOP_UNSUBSCRIBE,
  loadModel: RESOLVE_VOID,
  translateTo: RESOLVE_VOID,
  translateText: RESOLVE_EMPTY_STRING,
  restore: NOOP,
  abort: NOOP,
  dispose: RESOLVE_VOID,
  languages: SSR_LANGUAGES,
}
