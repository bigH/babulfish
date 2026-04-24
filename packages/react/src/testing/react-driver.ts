/** @experimental */

import { createElement, useSyncExternalStore } from "react"
import { render, act } from "@testing-library/react"
import { TranslatorProvider } from "../provider.js"
import { useTranslatorContext } from "../context.js"
import { SSR_CORE } from "../ssr.js"
import type { BabulfishConfig, BabulfishCore, Snapshot } from "@babulfish/core"
import type { ConformanceDriver } from "@babulfish/core/testing"

type SnapshotDescriptor = PropertyDescriptor & { get: () => Snapshot }

type Capture = {
  core: BabulfishCore
  descriptor: SnapshotDescriptor
  getSnapshot: () => Snapshot
  snapshot: Snapshot
}

type BridgeSlot = { capture: Capture | null }

type DriverRegistration = {
  readonly unmount: () => void
  readonly restoreSnapshot: () => void
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

function captureCore(core: BabulfishCore): Capture {
  const rawDescriptor = Object.getOwnPropertyDescriptor(core, "snapshot")
  if (!rawDescriptor?.get) {
    throw new Error("React conformance driver requires core.snapshot to be a getter")
  }
  const descriptor = rawDescriptor as SnapshotDescriptor
  const getSnapshot = descriptor.get.bind(core)
  return { core, descriptor, getSnapshot, snapshot: getSnapshot() }
}

function SnapshotBridge({ slot }: { slot: BridgeSlot }): null {
  const core = useTranslatorContext()
  const capture = (slot.capture ??= captureCore(core))
  capture.snapshot = useSyncExternalStore(
    core.subscribe,
    capture.getSnapshot,
    capture.getSnapshot,
  )
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

      const slot: BridgeSlot = { capture: null }
      const mergedConfig: BabulfishConfig = {
        ...config,
        dom: createPinnedDomConfig(document, config?.dom),
      }

      const { unmount } = await act(async () =>
        render(
          createElement(TranslatorProvider, {
            config: mergedConfig,
            children: createElement(SnapshotBridge, { slot }),
          }),
        ),
      )

      if (!slot.capture) {
        throw new Error("React conformance driver failed to capture the provider core snapshot")
      }
      const capture = slot.capture
      const { core, descriptor } = capture

      const restoreSnapshot = () =>
        Object.defineProperty(core, "snapshot", descriptor)

      Object.defineProperty(core, "snapshot", {
        get: () => capture.snapshot,
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
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      registration.restoreSnapshot()
      registry.delete(core)
    },
  }
}
