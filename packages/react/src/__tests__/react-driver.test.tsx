import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Snapshot } from "@babulfish/core"

let currentSnapshot: Snapshot
const listeners = new Set<() => void>()

const loadModel = vi.fn(async () => {})
const translateTo = vi.fn(async () => {})
const translateText = vi.fn(async () => "")
const restore = vi.fn(() => {})
const abort = vi.fn(() => {})
const dispose = vi.fn(async () => {})

const mockCore = {
  get snapshot() {
    return currentSnapshot
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  loadModel,
  translateTo,
  translateText,
  restore,
  abort,
  dispose,
  languages: [],
}

vi.mock("../provider.js", () => ({
  TranslatorProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("../context.js", () => ({
  useTranslatorContext: () => mockCore,
}))

import { ReactConformanceDriver } from "../testing/react-driver.js"

function createSnapshot(status: Snapshot["translation"]["status"]): Snapshot {
  return Object.freeze({
    model: Object.freeze({ status: "idle" as const }),
    translation:
      status === "idle"
        ? Object.freeze({ status: "idle" as const })
        : Object.freeze({ status: "translating" as const, progress: 0.5 }),
    currentLanguage: status === "idle" ? null : "es",
    capabilities: Object.freeze({
      ready: true,
      hasWebGPU: true,
      canTranslate: true,
      device: "webgpu" as const,
      isMobile: false,
    }),
  })
}

async function publishSnapshot(nextSnapshot: Snapshot): Promise<void> {
  await act(async () => {
    currentSnapshot = nextSnapshot
    for (const listener of listeners) listener()
  })
}

describe("ReactConformanceDriver", () => {
  beforeEach(() => {
    listeners.clear()
    currentSnapshot = createSnapshot("idle")
    vi.clearAllMocks()
    document.body.innerHTML = '<div id="app"></div>'
  })

  it("restores the provider core snapshot getter on dispose", async () => {
    const driver = ReactConformanceDriver()
    const originalSnapshot = currentSnapshot
    const originalDescriptor = Object.getOwnPropertyDescriptor(mockCore, "snapshot")
    let disposed = false

    const driverCore = await driver.create()

    try {
      expect(driverCore).toBe(mockCore)
      expect(driverCore.snapshot).toBe(originalSnapshot)
      expect(Object.getOwnPropertyDescriptor(driverCore, "snapshot")).not.toEqual(originalDescriptor)

      const updatedSnapshot = createSnapshot("translating")
      await publishSnapshot(updatedSnapshot)

      expect(driverCore.snapshot).toBe(updatedSnapshot)
      expect(mockCore.snapshot).toBe(updatedSnapshot)

      await driver.dispose(driverCore)
      disposed = true
      expect(Object.getOwnPropertyDescriptor(mockCore, "snapshot")).toEqual(originalDescriptor)
      expect(mockCore.snapshot).toBe(updatedSnapshot)
    } finally {
      if (!disposed) await driver.dispose(driverCore)
      listeners.clear()
    }
  })
})
