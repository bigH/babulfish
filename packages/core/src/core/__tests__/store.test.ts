import { describe, expect, it, vi } from "vitest"

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
    expect(Object.isFrozen(store.get())).toBe(true)
  })

  it("does not notify listeners for no-op updates", () => {
    const store = createStore()
    const listener = vi.fn()

    store.subscribe(listener)
    store.set((snapshot) => snapshot)

    expect(listener).not.toHaveBeenCalled()
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
