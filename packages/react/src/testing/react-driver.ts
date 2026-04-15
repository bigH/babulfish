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
  snapshotDescriptor: PropertyDescriptor | null
}

type DriverRegistration = {
  readonly unmount: () => void
  readonly restoreSnapshot: () => void
}

type SnapshotContract = {
  descriptor: PropertyDescriptor & { get: () => Snapshot }
  getSnapshot: () => Snapshot
}

function captureSnapshotContract(core: BabulfishCore): SnapshotContract {
  const descriptor = Object.getOwnPropertyDescriptor(core, "snapshot")
  const unboundGetSnapshot = descriptor?.get
  if (!unboundGetSnapshot) {
    throw new Error("React conformance driver requires core.snapshot to be a getter")
  }
  const getSnapshot = unboundGetSnapshot.bind(core)
  return {
    descriptor,
    getSnapshot,
  }
}

function SnapshotBridge({ bridge }: { bridge: BridgeState }): null {
  const core = useTranslatorContext()

  if (!bridge.snapshotDescriptor || !bridge.getSnapshot) {
    const contract = captureSnapshotContract(core)
    bridge.snapshotDescriptor = contract.descriptor
    bridge.getSnapshot = contract.getSnapshot
  }
  const getSnapshot = bridge.getSnapshot

  if (!getSnapshot) {
    throw new Error("React conformance driver requires core.snapshot to be a getter")
  }

  const snapshot = useSyncExternalStore(core.subscribe, getSnapshot, getSnapshot)

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
        snapshotDescriptor: null,
      }

      const mergedConfig: BabulfishConfig = {
        ...config,
        dom: { roots: ["#app"], root: document, ...config?.dom },
      }

      const { unmount } = await act(async () =>
        render(
          createElement(TranslatorProvider, {
            config: mergedConfig,
            children: createElement(SnapshotBridge, { bridge }),
          }),
        ),
      )

      const core = bridge.core
      if (
        !core ||
        !bridge.snapshot ||
        !bridge.snapshotDescriptor ||
        !bridge.getSnapshot
      ) {
        throw new Error("React conformance driver failed to capture the provider core snapshot")
      }

      const { snapshotDescriptor } = bridge
      const restoreSnapshot = () =>
        Object.defineProperty(core, "snapshot", snapshotDescriptor)

      Object.defineProperty(core, "snapshot", {
        get: () => bridge.snapshot!,
        configurable: true,
        enumerable: true,
      })

      registry.set(core, { unmount, restoreSnapshot })
      return core
    },

    async dispose(core: BabulfishCore) {
      const registration = registry.get(core)
      if (!registration) return
      await act(async () => {
        registration.unmount()
      })
      registration.restoreSnapshot()
      registry.delete(core)
    },
  }
}
