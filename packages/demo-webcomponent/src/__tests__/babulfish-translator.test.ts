import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type SnapshotListener = (s: Record<string, unknown>) => void

const { state, createMockCore } = vi.hoisted(() => {
  const state = { listener: null as SnapshotListener | null }

  const createMockCore = () => ({
    snapshot: {
      model: { status: "idle" as const },
      translation: { status: "idle" as const },
      currentLanguage: null,
      capabilities: {},
    },
    subscribe: vi.fn((l: SnapshotListener) => {
      state.listener = l
      return vi.fn()
    }),
    loadModel: vi.fn(() => Promise.resolve()),
    translateTo: vi.fn(() => Promise.resolve()),
    restore: vi.fn(),
    abort: vi.fn(),
    dispose: vi.fn(() => Promise.resolve()),
    languages: [
      { code: "es", label: "Spanish" },
      { code: "fr", label: "French" },
    ],
  })

  return { state, createMockCore }
})

let latestMock: ReturnType<typeof createMockCore>

vi.mock("@babulfish/core", () => ({
  createBabulfish: vi.fn(() => {
    latestMock = createMockCore()
    return latestMock
  }),
}))

import "../babulfish-translator.js"

describe("babulfish-translator", () => {
  let el: HTMLElement

  beforeEach(() => {
    state.listener = null
    el = document.createElement("babulfish-translator")
  })

  afterEach(() => {
    el.remove()
  })

  it("is registered as a custom element", () => {
    expect(customElements.get("babulfish-translator")).toBeDefined()
  })

  it("attaches an open shadow root on connect", () => {
    document.body.appendChild(el)
    expect(el.shadowRoot).not.toBeNull()
    expect(el.shadowRoot!.mode).toBe("open")
  })

  it("renders toolbar, content, and status into shadow DOM", () => {
    document.body.appendChild(el)
    const shadow = el.shadowRoot!
    expect(shadow.querySelector(".toolbar")).not.toBeNull()
    expect(shadow.querySelector(".content")).not.toBeNull()
    expect(shadow.querySelector(".status")).not.toBeNull()
  })

  it("populates language select from core.languages", () => {
    document.body.appendChild(el)
    const select = el.shadowRoot!.querySelector(".language") as HTMLSelectElement
    const options = Array.from(select.querySelectorAll("option"))
    expect(options).toHaveLength(3)
    expect(options[1]!.value).toBe("es")
    expect(options[1]!.textContent).toBe("Spanish")
    expect(options[2]!.value).toBe("fr")
    expect(options[2]!.textContent).toBe("French")
  })

  it("dispatches babulfish-status CustomEvent on snapshot changes", () => {
    const handler = vi.fn()
    el.addEventListener("babulfish-status", handler)
    document.body.appendChild(el)

    const readySnapshot = {
      model: { status: "ready" as const },
      translation: { status: "idle" as const },
      currentLanguage: null,
      capabilities: {},
    }
    state.listener?.(readySnapshot)

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0]![0] as CustomEvent
    expect(event.type).toBe("babulfish-status")
    expect(event.detail.model.status).toBe("ready")
    expect(event.bubbles).toBe(true)
    expect(event.composed).toBe(true)
  })

  it("calls dispose on disconnect", () => {
    document.body.appendChild(el)
    const mock = latestMock
    el.remove()
    expect(mock.dispose).toHaveBeenCalledTimes(1)
  })

  it("exposes a public restore() method that delegates to core", () => {
    document.body.appendChild(el)
    const mock = latestMock
    ;(el as unknown as { restore(): void }).restore()
    expect(mock.restore).toHaveBeenCalledTimes(1)
  })

  it("updates status text from snapshot", () => {
    document.body.appendChild(el)
    const statusEl = el.shadowRoot!.querySelector(".status-text") as HTMLElement
    expect(statusEl.textContent).toBe("Model: Not loaded")

    state.listener?.({
      model: { status: "downloading", progress: 0.42 },
      translation: { status: "idle" },
      currentLanguage: null,
      capabilities: {},
    })
    expect(statusEl.textContent).toBe("Model: Downloading (42%)")
  })

  it("disables controls appropriately based on model state", () => {
    document.body.appendChild(el)
    const shadow = el.shadowRoot!
    const select = shadow.querySelector(".language") as HTMLSelectElement
    const loadBtn = shadow.querySelector(".load-model") as HTMLButtonElement

    expect(select.disabled).toBe(true)
    expect(loadBtn.disabled).toBe(false)

    state.listener?.({
      model: { status: "ready" },
      translation: { status: "idle" },
      currentLanguage: null,
      capabilities: {},
    })
    expect(select.disabled).toBe(false)
    expect(loadBtn.disabled).toBe(true)
  })
})
