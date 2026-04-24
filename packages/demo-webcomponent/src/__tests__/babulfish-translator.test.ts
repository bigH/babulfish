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

const {
  state,
  createMockCore,
  mockCreateBabulfish,
  fireSnapshotAll,
} = vi.hoisted(() => {
  const createMockCore = () => ({
    snapshot: createSnapshot(),
    subscribe: vi.fn((l: SnapshotListener) => {
      state.listeners.push(l)
      state.listener = l
      return vi.fn(() => {
        const i = state.listeners.indexOf(l)
        if (i >= 0) state.listeners.splice(i, 1)
      })
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

  type MockCore = ReturnType<typeof createMockCore>

  const state = {
    listener: null as SnapshotListener | null,
    listeners: [] as SnapshotListener[],
    latestMock: null as MockCore | null,
    mocks: [] as MockCore[],
  }

  const mockCreateBabulfish = vi.fn(() => {
    const mock = createMockCore()
    state.mocks.push(mock)
    state.latestMock = mock
    return mock
  })

  const fireSnapshotAll = (snapshot: Snapshot) => {
    for (const l of state.listeners) l(snapshot)
  }

  return {
    state,
    createMockCore,
    mockCreateBabulfish,
    fireSnapshotAll,
  }
})

vi.mock("@babulfish/core", () => ({
  createBabulfish: mockCreateBabulfish,
}))

import "../babulfish-translator.js"

describe("babulfish-translator", () => {
  let el: HTMLElement

  beforeEach(() => {
    state.listener = null
    state.listeners.length = 0
    state.latestMock = null
    state.mocks.length = 0
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
      "Model: Not loaded | requested model translategemma-4 (default) | spec translategemma-4 | resolved model onnx-community/translategemma-text-4b-it-ONNX | adapter translategemma | dtype q4 | requested device auto (default) | effective device auto | resolved device none",
    )

    state.listener?.(createSnapshot({
      model: { status: "downloading", progress: 0.42 },
      translation: { status: "idle" },
    }))
    expect(statusEl.textContent).toBe(
      "Model: Downloading (42%) | requested model translategemma-4 (default) | spec translategemma-4 | resolved model onnx-community/translategemma-text-4b-it-ONNX | adapter translategemma | dtype q4 | requested device auto (default) | effective device auto | resolved device none",
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
    el.setAttribute("model", "translategemma-4")
    el.setAttribute("dtype", "q8")

    connect()

    expect(mockCreateBabulfish).toHaveBeenCalledWith({
      engine: {
        device: "wasm",
        model: "translategemma-4",
        dtype: "q8",
      },
      dom: expect.any(Object),
    })
  })

  it("maps legacy model-id attrs through the shared resolver", () => {
    el.setAttribute("model-id", "onnx-community/Qwen2.5-0.5B-Instruct")

    connect()

    expect(mockCreateBabulfish).toHaveBeenCalledWith({
      engine: {
        device: "webgpu",
        model: "qwen-2.5-0.5b",
        dtype: "q4f16",
      },
      dom: expect.any(Object),
    })
  })

  it("lets canonical model attrs override legacy model-id attrs", () => {
    el.setAttribute("model", "qwen-3-0.6b")
    el.setAttribute("model-id", "onnx-community/Qwen2.5-0.5B-Instruct")

    connect()

    expect(mockCreateBabulfish).toHaveBeenCalledWith({
      engine: {
        device: "webgpu",
        model: "qwen-3-0.6b",
        dtype: "q4f16",
      },
      dom: expect.any(Object),
    })
  })

  it("does not recreate the core when runtime attrs resolve to the same key", () => {
    connect()
    const firstMock = state.latestMock!
    el.setAttribute("target-lang", "es")

    el.setAttribute("model", "translategemma-4")

    expect(mockCreateBabulfish).toHaveBeenCalledTimes(1)
    expect(firstMock.dispose).not.toHaveBeenCalled()
    expect(el.getAttribute("target-lang")).toBe("es")
  })

  it("recreates the core and clears target-lang when runtime attrs change the effective key", () => {
    connect()
    const firstMock = state.latestMock!
    el.setAttribute("target-lang", "es")

    el.setAttribute("model", "qwen-3-0.6b")
    const secondCall = mockCreateBabulfish.mock.calls[1] as [unknown] | undefined

    expect(mockCreateBabulfish).toHaveBeenCalledTimes(2)
    expect(firstMock.restore).toHaveBeenCalledTimes(1)
    expect(firstMock.dispose).toHaveBeenCalledTimes(1)
    expect(el.hasAttribute("target-lang")).toBe(false)
    expect(secondCall?.[0]).toMatchObject({
      engine: {
        device: "webgpu",
        model: "qwen-3-0.6b",
        dtype: "q4f16",
      },
    })
  })

  it("two elements dispatch identical babulfish-status events from a shared snapshot", () => {
    const els: HTMLElement[] = []
    try {
      const elA = document.createElement("babulfish-translator")
      const elB = document.createElement("babulfish-translator")
      els.push(elA, elB)

      const handlerA = vi.fn()
      const handlerB = vi.fn()
      elA.addEventListener("babulfish-status", handlerA)
      elB.addEventListener("babulfish-status", handlerB)

      document.body.appendChild(elA)
      document.body.appendChild(elB)

      const snapshot = createSnapshot({
        enablement: {
          ...DEFAULT_ENABLEMENT,
          probe: { status: "passed", kind: "adapter-smoke", cache: "hit", note: "" },
          verdict: {
            outcome: "gpu-preferred",
            resolvedDevice: "webgpu",
            reason: "GPU probe passed.",
          },
        },
      })
      fireSnapshotAll(snapshot)

      expect(handlerA).toHaveBeenCalledTimes(1)
      expect(handlerB).toHaveBeenCalledTimes(1)

      const eventA = handlerA.mock.calls[0]![0] as CustomEvent<Snapshot>
      const eventB = handlerB.mock.calls[0]![0] as CustomEvent<Snapshot>

      expect(eventA.detail).toBe(snapshot)
      expect(eventB.detail).toBe(snapshot)
      expect(eventA.detail.enablement.verdict.outcome).toBe("gpu-preferred")
      expect(eventB.detail.enablement.verdict.outcome).toBe(
        eventA.detail.enablement.verdict.outcome,
      )
      expect(eventA.detail.enablement.probe.status).toBe("passed")
      expect(eventB.detail.enablement.probe.status).toBe(
        eventA.detail.enablement.probe.status,
      )

      expect(state.mocks).toHaveLength(2)
    } finally {
      els.forEach((el) => el.remove())
    }
  })
})
