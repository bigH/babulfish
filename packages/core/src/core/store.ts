import type { Capabilities } from "./capabilities.js"
import { SSR_CAPABILITIES } from "./capabilities.js"
import { IDLE_ENABLEMENT_STATE, type EnablementState } from "../engine/runtime-plan.js"

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
  readonly enablement: EnablementState
}

function freezeValue<T extends object>(value: T): T {
  return Object.isFrozen(value) ? value : Object.freeze(value)
}

function normalizeSnapshot(snapshot: Snapshot, capabilities: Capabilities): Snapshot {
  if (snapshot.capabilities !== capabilities) {
    throw new Error("Store capabilities are immutable")
  }

  return Object.freeze({
    ...snapshot,
    model: freezeValue(snapshot.model),
    translation: freezeValue(snapshot.translation),
    capabilities,
    enablement: freezeValue(snapshot.enablement),
  })
}

function createInitialSnapshot(
  capabilities: Capabilities = SSR_CAPABILITIES,
): Snapshot {
  return normalizeSnapshot(
    {
      model: { status: "idle" as const },
      translation: { status: "idle" as const },
      currentLanguage: null,
      capabilities,
      enablement: IDLE_ENABLEMENT_STATE,
    },
    capabilities,
  )
}

export type Store = {
  get(): Snapshot
  set(updater: (prev: Snapshot) => Snapshot): void
  subscribe(listener: (snapshot: Snapshot) => void): () => void
  dispose(): void
}

export function createStore(initialCapabilities: Capabilities = SSR_CAPABILITIES): Store {
  const capabilities = freezeValue(initialCapabilities)
  let current = createInitialSnapshot(capabilities)
  const listeners = new Set<(snapshot: Snapshot) => void>()
  let disposed = false

  return {
    get() {
      return current
    },
    set(updater) {
      if (disposed) return
      const next = updater(current)
      if (next === current) return
      current = normalizeSnapshot(next, capabilities)
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
