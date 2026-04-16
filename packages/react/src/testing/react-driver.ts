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
  contract: SnapshotContract | null
}

type DriverRegistration = {
  readonly unmount: () => void
  readonly restoreSnapshot: () => void
}

type SnapshotContract = {
  descriptor: PropertyDescriptor & { get: () => Snapshot }
  getSnapshot: () => Snapshot
  snapshot: Snapshot | null
}

function createPinnedDomConfig(
  root: ParentNode | Document,
  dom?: BabulfishConfig["dom"],
): NonNullable<BabulfishConfig["dom"]> {
  const { root: _ignoredRoot, roots: _ignoredRoots, ...domConfig } = dom ?? {}
  return {
    ...domConfig,
    roots: ["#app"],
    root,
  }
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
    snapshot: null,
  }
}

function assertBridgeCaptured(
  bridge: BridgeState,
): asserts bridge is {
  core: BabulfishCore
  contract: SnapshotContract & { snapshot: Snapshot }
} {
  if (!bridge.core || !bridge.contract?.snapshot) {
    throw new Error("React conformance driver failed to capture the provider core snapshot")
  }
}

function SnapshotBridge({ bridge }: { bridge: BridgeState }): null {
  const core = useTranslatorContext()

  bridge.contract ??= captureSnapshotContract(core)
  const { getSnapshot } = bridge.contract

  const snapshot = useSyncExternalStore(core.subscribe, getSnapshot, getSnapshot)

  bridge.core = core
  bridge.contract.snapshot = snapshot

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
        contract: null,
      }
      const domRoot = document

      const mergedConfig: BabulfishConfig = {
        ...config,
        dom: createPinnedDomConfig(domRoot, config?.dom),
      }

      const { unmount } = await act(async () =>
        render(
          createElement(TranslatorProvider, {
            config: mergedConfig,
            children: createElement(SnapshotBridge, { bridge }),
          }),
        ),
      )

      assertBridgeCaptured(bridge)
      const { core, contract } = bridge

      const restoreSnapshot = () =>
        Object.defineProperty(core, "snapshot", contract.descriptor)

      Object.defineProperty(core, "snapshot", {
        get: () => contract.snapshot,
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
