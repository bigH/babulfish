import type { Capabilities } from "./capabilities.js"

export type ModelState =
  | { readonly status: "idle" }
  | { readonly status: "downloading"; readonly progress: number }
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly error: unknown }

export type TranslationState =
  | { readonly status: "idle" }
  | { readonly status: "translating"; readonly progress: number }

export type Snapshot = {
  readonly model: ModelState
  readonly translation: TranslationState
  readonly currentLanguage: string | null
  readonly capabilities: Capabilities
}

const IDLE_MODEL: ModelState = Object.freeze({ status: "idle" as const })
const IDLE_TRANSLATION: TranslationState = Object.freeze({ status: "idle" as const })
const SSR_CAPABILITIES: Capabilities = Object.freeze({
  ready: false,
  hasWebGPU: false,
  canTranslate: false,
  device: null,
  isMobile: false,
})

function createInitialSnapshot(): Snapshot {
  return Object.freeze({
    model: IDLE_MODEL,
    translation: IDLE_TRANSLATION,
    currentLanguage: null,
    capabilities: SSR_CAPABILITIES,
  })
}

export type Store = {
  get(): Snapshot
  set(updater: (prev: Snapshot) => Snapshot): void
  subscribe(listener: (snapshot: Snapshot) => void): () => void
  dispose(): void
}

export function createStore(): Store {
  let current = createInitialSnapshot()
  const listeners = new Set<(snapshot: Snapshot) => void>()
  let disposed = false

  return {
    get() {
      return current
    },
    set(updater) {
      if (disposed) return
      const next = Object.freeze(updater(current))
      if (next === current) return
      current = next
      for (const listener of listeners) {
        listener(current)
      }
    },
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose() {
      disposed = true
      listeners.clear()
    },
  }
}
