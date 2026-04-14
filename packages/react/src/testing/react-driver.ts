/** @experimental */

import { createElement } from "react"
import { render, act } from "@testing-library/react"
import { useSyncExternalStore } from "react"
import { TranslatorProvider } from "../provider.js"
import { useTranslatorContext } from "../context.js"
import { SSR_CORE } from "../ssr.js"
import type { BabulfishConfig, BabulfishCore, Snapshot } from "@babulfish/core"
import type { ConformanceDriver } from "@babulfish/core/testing"

type BridgeState = {
  core: BabulfishCore | null
  snapshot: Snapshot | null
  getSnapshot: (() => Snapshot) | null
}

type DriverRegistration = {
  readonly unmount: () => void
  readonly snapshotDescriptor: PropertyDescriptor
}

function captureSnapshotGetter(core: BabulfishCore): () => Snapshot {
  const getter = Object.getOwnPropertyDescriptor(core, "snapshot")?.get
  if (!getter) {
    throw new Error("React conformance driver requires core.snapshot to be a getter")
  }
  return () => getter.call(core)
}

function SnapshotBridge({ bridge }: { bridge: BridgeState }): null {
  const core = useTranslatorContext()

  bridge.getSnapshot ??= captureSnapshotGetter(core)

  const snapshot = useSyncExternalStore(
    core.subscribe,
    bridge.getSnapshot,
    bridge.getSnapshot,
  )

  bridge.core = core
  bridge.snapshot = snapshot

  return null
}

/** @experimental */
export function ReactConformanceDriver(): ConformanceDriver {
  const registry = new Map<BabulfishCore, DriverRegistration>()

  return {
    id: "react",
    supportsDOM: true,

    get root() {
      return document
    },

    async create(config?: BabulfishConfig) {
      if (typeof window === "undefined") return SSR_CORE

      const bridge: BridgeState = {
        core: null,
        snapshot: null,
        getSnapshot: null,
      }

      const mergedConfig: BabulfishConfig = {
        ...config,
        dom: { roots: ["#app"], root: document, ...config?.dom },
      }

      let unmount!: () => void
      await act(async () => {
        const result = render(
          createElement(TranslatorProvider, {
            config: mergedConfig,
            children: createElement(SnapshotBridge, { bridge }),
          }),
        )
        unmount = result.unmount
      })

      const core = bridge.core
      if (!core || !bridge.snapshot) {
        throw new Error("React conformance driver failed to capture the provider core snapshot")
      }

      const snapshotDescriptor = Object.getOwnPropertyDescriptor(core, "snapshot")
      if (!snapshotDescriptor?.get) {
        throw new Error("React conformance driver requires core.snapshot to be a getter")
      }

      Object.defineProperty(core, "snapshot", {
        get: () => bridge.snapshot,
        configurable: true,
        enumerable: true,
      })

      registry.set(core, { unmount, snapshotDescriptor })
      return core
    },

    async dispose(core: BabulfishCore) {
      const registration = registry.get(core)
      if (!registration) return
      await act(async () => {
        registration.unmount()
      })
      Object.defineProperty(core, "snapshot", registration.snapshotDescriptor)
      registry.delete(core)
    },
  }
}
