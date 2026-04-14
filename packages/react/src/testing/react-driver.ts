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
  getInternalSnapshot: (() => Snapshot) | null
}

function SnapshotBridge({ bridge }: { bridge: BridgeState }): null {
  const core = useTranslatorContext()

  if (!bridge.getInternalSnapshot) {
    const desc = Object.getOwnPropertyDescriptor(core, "snapshot")
    const getter = desc?.get
    bridge.getInternalSnapshot = getter
      ? () => getter.call(core)
      : () => core.snapshot
  }

  const snapshot = useSyncExternalStore(
    core.subscribe,
    bridge.getInternalSnapshot,
    bridge.getInternalSnapshot,
  )

  bridge.core = core
  bridge.snapshot = snapshot

  return null
}

/** @experimental */
export function ReactConformanceDriver(): ConformanceDriver {
  const registry = new Map<
    BabulfishCore,
    { bridge: BridgeState; unmount: () => void }
  >()

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
        getInternalSnapshot: null,
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

      const core = bridge.core!

      Object.defineProperty(core, "snapshot", {
        get: () => bridge.snapshot,
        configurable: true,
        enumerable: true,
      })

      registry.set(core, { bridge, unmount })
      return core
    },

    async dispose(core: BabulfishCore) {
      const entry = registry.get(core)
      if (!entry) return
      await core.dispose()
      await act(async () => {
        entry.unmount()
      })
      registry.delete(core)
    },
  }
}
