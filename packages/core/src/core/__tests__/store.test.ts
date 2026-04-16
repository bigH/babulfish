import { describe, expect, it, vi } from "vitest"

import { SSR_CAPABILITIES } from "../capabilities.js"
import { createStore } from "../store.js"

describe("createStore", () => {
  it("starts with a frozen idle snapshot", () => {
    const store = createStore()

    expect(store.get()).toEqual({
      model: { status: "idle" },
      translation: { status: "idle" },
      currentLanguage: null,
      capabilities: store.get().capabilities,
    })
    expect(store.get().capabilities).toBe(SSR_CAPABILITIES)
    expect(Object.isFrozen(store.get())).toBe(true)
  })

  it("starts with provided capabilities and freezes them", () => {
    const capabilities = {
      ready: true,
      hasWebGPU: false,
      canTranslate: true,
      device: "wasm",
      isMobile: false,
    } as const

    const store = createStore(capabilities)

    expect(store.get().capabilities).toBe(capabilities)
    expect(Object.isFrozen(store.get().capabilities)).toBe(true)
  })

  it("does not notify listeners for no-op updates", () => {
    const store = createStore()
    const listener = vi.fn()

    store.subscribe(listener)
    store.set((snapshot) => snapshot)

    expect(listener).not.toHaveBeenCalled()
  })

  it("does not re-freeze snapshots on no-op updates", () => {
    const store = createStore()
    const freeze = vi.spyOn(Object, "freeze")

    store.set((snapshot) => snapshot)

    expect(freeze).not.toHaveBeenCalled()
    expect(store.get()).toBe(store.get())

    freeze.mockRestore()
  })

  it("freezes snapshot slices for updated state", () => {
    const store = createStore()
    const capabilities = store.get().capabilities

    store.set((snapshot) => ({
      ...snapshot,
      translation: { status: "translating", progress: 0.5 },
      currentLanguage: "es",
    }))

    const snapshot = store.get()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.model)).toBe(true)
    expect(Object.isFrozen(snapshot.translation)).toBe(true)
    expect(Object.isFrozen(snapshot.capabilities)).toBe(true)
    expect(snapshot.capabilities).toBe(capabilities)
  })

  it("rejects capability replacement after initialization", () => {
    const store = createStore()
    const replacementCapabilities = {
      ready: true,
      hasWebGPU: false,
      canTranslate: true,
      device: "wasm",
      isMobile: false,
    } as const

    expect(() =>
      store.set((snapshot) => ({
        ...snapshot,
        capabilities: replacementCapabilities,
      })),
    ).toThrow("Store capabilities are immutable")
  })

  it("becomes inert after dispose", () => {
    const store = createStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const before = store.get()

    store.dispose()
    store.set(() => ({
      ...before,
      currentLanguage: "es",
    }))

    const unsubscribeAfterDispose = store.subscribe(listener)
    unsubscribe()
    unsubscribeAfterDispose()

    expect(store.get()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })
})
