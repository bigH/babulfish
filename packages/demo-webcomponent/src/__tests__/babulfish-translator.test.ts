import type { Snapshot } from "@babulfish/core"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

type SnapshotListener = (snapshot: Snapshot) => void
type SnapshotOverrides = {
  readonly model?: Snapshot["model"]
  readonly translation?: Snapshot["translation"]
  readonly currentLanguage?: Snapshot["currentLanguage"]
  readonly capabilities?: Snapshot["capabilities"]
  readonly enablement?: Snapshot["enablement"]
}

const DEFAULT_CAPABILITIES = {
  ready: false,
  hasWebGPU: false,
  isMobile: false,
  approxDeviceMemoryGiB: null,
  crossOriginIsolated: false,
} satisfies Snapshot["capabilities"]

const DEFAULT_ENABLEMENT = {
  status: "idle",
  modelProfile: null,
  inference: null,
  probe: { status: "not-run", kind: "adapter-smoke", cache: null, note: "" },
  verdict: {
    outcome: "unknown",
    resolvedDevice: null,
    reason: "Enablement has not been assessed yet.",
  },
} satisfies Snapshot["enablement"]

function createSnapshot(overrides: SnapshotOverrides = {}): Snapshot {
  return {
    model: overrides.model ?? { status: "idle" },
    translation: overrides.translation ?? { status: "idle" },
    currentLanguage: overrides.currentLanguage ?? null,
    capabilities: overrides.capabilities ?? DEFAULT_CAPABILITIES,
    enablement: overrides.enablement ?? DEFAULT_ENABLEMENT,
  }
}

const { state, createMockCore, mockCreateBabulfish } = vi.hoisted(() => {
  const state = {
    listener: null as SnapshotListener | null,
    latestMock: null as any,
  }

  const createMockCore = () => ({
    snapshot: createSnapshot(),
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

  const mockCreateBabulfish = vi.fn(() => {
    const mock = createMockCore()
    state.latestMock = mock
    return mock
  })

  return { state, createMockCore, mockCreateBabulfish }
})

vi.mock("@babulfish/core", () => ({
  createBabulfish: mockCreateBabulfish,
}))

import "../babulfish-translator.js"

describe("babulfish-translator", () => {
  let el: HTMLElement

  beforeEach(() => {
    state.listener = null
    mockCreateBabulfish.mockClear()
    el = document.createElement("babulfish-translator")
  })

  afterEach(() => {
    el.remove()
  })

  function connect(): ShadowRoot {
    document.body.appendChild(el)
    return el.shadowRoot!
  }

  it("is registered as a custom element", () => {
    expect(customElements.get("babulfish-translator")).toBeDefined()
  })

  it("attaches an open shadow root on connect", () => {
    const shadow = connect()
    expect(shadow).not.toBeNull()
    expect(shadow.mode).toBe("open")
  })

  it("renders toolbar, content, and status into shadow DOM", () => {
    const shadow = connect()
    expect(shadow.querySelector(".toolbar")).not.toBeNull()
    expect(shadow.querySelector(".content")).not.toBeNull()
    expect(shadow.querySelector(".status")).not.toBeNull()
  })

  it("populates language select from core.languages", () => {
    const shadow = connect()
    const select = shadow.querySelector(".language") as HTMLSelectElement
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
    connect()

    const readySnapshot = createSnapshot({ model: { status: "ready" } })
    state.listener?.(readySnapshot)

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0]![0] as CustomEvent
    expect(event.type).toBe("babulfish-status")
    expect(event.detail).toBe(readySnapshot)
    expect(event.bubbles).toBe(true)
    expect(event.composed).toBe(true)
  })

  it("calls dispose on disconnect", () => {
    connect()
    const mock = state.latestMock!
    el.remove()
    expect(mock.dispose).toHaveBeenCalledTimes(1)
  })

  it("exposes a public restore() method that delegates to core", () => {
    const shadow = connect()
    const mock = state.latestMock!
    el.setAttribute("target-lang", "es")
    ;(shadow.querySelector(".language") as HTMLSelectElement).value = "es"
    ;(el as unknown as { restore(): void }).restore()
    expect(mock.restore).toHaveBeenCalledTimes(1)
    expect(el.hasAttribute("target-lang")).toBe(false)
    expect((shadow.querySelector(".language") as HTMLSelectElement).value).toBe("")
  })

  it("updates status text from snapshot", () => {
    const shadow = connect()
    const statusEl = shadow.querySelector(".status-text") as HTMLElement
    expect(statusEl.textContent).toBe(
      "Model: Not loaded | requested auto/q4 | resolved none",
    )

    state.listener?.(createSnapshot({
      model: { status: "downloading", progress: 0.42 },
      translation: { status: "idle" },
    }))
    expect(statusEl.textContent).toBe(
      "Model: Downloading (42%) | requested auto/q4 | resolved none",
    )
  })

  it("omits the probe suffix from status text when probe has not run", () => {
    const shadow = connect()
    const statusEl = shadow.querySelector(".status-text") as HTMLElement
    expect(statusEl.textContent).not.toContain("| probe:")
  })

  it("appends probe status to status text when a probe has run", () => {
    const shadow = connect()
    const statusEl = shadow.querySelector(".status-text") as HTMLElement

    state.listener?.(createSnapshot({
      enablement: {
        ...DEFAULT_ENABLEMENT,
        probe: { status: "passed", kind: "adapter-smoke", cache: "hit", note: "" },
      },
    }))

    expect(statusEl.textContent).toContain("| probe: passed")
  })

  it("disables controls appropriately based on model state", () => {
    const shadow = connect()
    const select = shadow.querySelector(".language") as HTMLSelectElement
    const loadBtn = shadow.querySelector(".load-model") as HTMLButtonElement

    expect(select.disabled).toBe(true)
    expect(loadBtn.disabled).toBe(false)

    state.listener?.(createSnapshot({
      model: { status: "ready" },
      translation: { status: "idle" },
    }))
    expect(select.disabled).toBe(false)
    expect(loadBtn.disabled).toBe(true)
  })

  it("syncs the language select with currentLanguage from snapshots", () => {
    const shadow = connect()
    const select = shadow.querySelector(".language") as HTMLSelectElement

    state.listener?.(createSnapshot({
      model: { status: "ready" },
      currentLanguage: "fr",
    }))

    expect(select.value).toBe("fr")
  })

  it("does not translate from target-lang before the model is ready", () => {
    connect()
    const mock = state.latestMock!

    el.setAttribute("target-lang", "es")

    expect(mock.translateTo).not.toHaveBeenCalled()
  })

  it("translates from target-lang once the model is ready", () => {
    connect()
    const mock = state.latestMock!
    mock.snapshot = createSnapshot({ model: { status: "ready" } })

    el.setAttribute("target-lang", "fr")

    expect(mock.translateTo).toHaveBeenCalledWith("fr")
  })

  it("passes runtime attrs into createBabulfish()", () => {
    el.setAttribute("device", "wasm")
    el.setAttribute("model-id", "onnx-community/gemma-3-270m-it-ONNX")
    el.setAttribute("dtype", "fp32")

    connect()

    expect(mockCreateBabulfish).toHaveBeenCalledWith({
      engine: {
        device: "wasm",
        modelId: "onnx-community/gemma-3-270m-it-ONNX",
        dtype: "fp32",
      },
      dom: expect.any(Object),
    })
  })

  it("recreates the core when runtime attrs change", () => {
    connect()
    const firstMock = state.latestMock!

    el.setAttribute("model-id", "onnx-community/gemma-3-270m-it-ONNX")
    const secondCall = mockCreateBabulfish.mock.calls[1] as [unknown] | undefined

    expect(mockCreateBabulfish).toHaveBeenCalledTimes(2)
    expect(firstMock.restore).toHaveBeenCalledTimes(1)
    expect(firstMock.dispose).toHaveBeenCalledTimes(1)
    expect(secondCall?.[0]).toMatchObject({
      engine: {
        device: "wasm",
        modelId: "onnx-community/gemma-3-270m-it-ONNX",
        dtype: "fp32",
      },
    })
  })
})
