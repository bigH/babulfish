import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
// ---------------------------------------------------------------------------

vi.mock("../../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { createBabulfish } from "../babulfish.js"
import type { Snapshot } from "../store.js"
import { DEFAULT_LANGUAGES, type Language } from "../languages.js"
import { __resetEngineForTests, getEngineIdentity } from "../../engine/testing/index.js"
import { loadPipeline } from "../../engine/pipeline-loader.js"
import { wrapGeneratorAsPipeline } from "../../testing/conformance-helpers.js"
import {
  captureGlobalDescriptors,
  restoreGlobals,
  setGlobal,
} from "../../__tests__/globals.test-utils.js"

const mockLoadPipeline = vi.mocked(loadPipeline)
const APP_FIXTURE = '<div id="app"><p>Hello</p></div>'
const originalGlobals = captureGlobalDescriptors()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockResult(
  source = "hello",
  translated = "hola",
): Array<{ role: string; content: string }> {
  return [
    { role: "user", content: source },
    { role: "assistant", content: translated },
  ]
}

function createMockGenerator() {
  return vi.fn(async () => [{ generated_text: createMockResult() }])
}

function setupPipelineMock(generate = createMockGenerator()) {
  const pipeline = wrapGeneratorAsPipeline(
    generate as Parameters<typeof wrapGeneratorAsPipeline>[0],
  )
  mockLoadPipeline.mockResolvedValue(pipeline)
  return { generate, pipeline }
}

function setupFailingPipelineMock(error: string): void {
  const generate = vi.fn(async () => {
    throw new Error(error)
  })
  setupPipelineMock(generate)
}

function snapshots(core: ReturnType<typeof createBabulfish>) {
  const collected: Snapshot[] = []
  core.subscribe((s) => collected.push(s))
  return collected
}

function createAppRoot() {
  const root = document.createElement("div")
  root.innerHTML = APP_FIXTURE
  return root
}

async function expectAbortListenerReleased(
  signal: AbortSignal,
  operation: () => Promise<unknown>,
): Promise<void> {
  const addEventListener = vi.spyOn(signal, "addEventListener")
  const removeEventListener = vi.spyOn(signal, "removeEventListener")

  await operation()

  expect(addEventListener).toHaveBeenCalledWith("abort", expect.any(Function), { once: true })
  expect(removeEventListener).toHaveBeenCalledWith(
    "abort",
    addEventListener.mock.calls[0]?.[1] as EventListener,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
})

afterEach(() => {
  restoreGlobals(originalGlobals)
})

// ---- 4.1 Engine singleton + multi-instance --------------------------------

describe("4.1 — engine singleton + multi-instance", () => {
  it("engine identity helper ignores non-core objects", () => {
    expect(getEngineIdentity({})).toBeUndefined()
  })

  it("two createBabulfish calls stay unbound to a runtime before loadModel()", () => {
    const a = createBabulfish()
    const b = createBabulfish()

    expect(getEngineIdentity(a)).toBeUndefined()
    expect(getEngineIdentity(b)).toBeUndefined()
  })

  it("two same-key cores share the same runtime after loadModel()", async () => {
    setupPipelineMock()
    const a = createBabulfish()
    const b = createBabulfish()

    await Promise.all([a.loadModel(), b.loadModel()])

    expect(getEngineIdentity(a)).toBe(getEngineIdentity(b))
    expect(getEngineIdentity(a)).toBeDefined()
  })

  it("two same-key non-default cores still share one runtime", async () => {
    setupPipelineMock()
    const config = {
      engine: {
        device: "wasm" as const,
        modelId: "onnx-community/gemma-3-270m-it-ONNX",
        dtype: "fp32" as const,
      },
    }
    const a = createBabulfish(config)
    const b = createBabulfish(config)

    await Promise.all([a.loadModel(), b.loadModel()])

    expect(getEngineIdentity(a)).toBe(getEngineIdentity(b))
    expect(mockLoadPipeline).toHaveBeenCalledTimes(1)
  })

  it("reset helper clears the shared engine identity", async () => {
    setupPipelineMock()
    const first = createBabulfish()
    await first.loadModel()
    const firstIdentity = getEngineIdentity(first)

    __resetEngineForTests()

    const second = createBabulfish()
    await second.loadModel()

    expect(firstIdentity).toBeDefined()
    expect(getEngineIdentity(second)).toBeDefined()
    expect(getEngineIdentity(second)).not.toBe(firstIdentity)
  })

  it("concurrent loadModel from two cores triggers exactly one loadPipeline call", async () => {
    setupPipelineMock()
    const a = createBabulfish()
    const b = createBabulfish()

    await Promise.all([a.loadModel(), b.loadModel()])
    expect(mockLoadPipeline).toHaveBeenCalledTimes(1)
  })

  it("dispose on core A does not disrupt core B", async () => {
    const { generate } = setupPipelineMock()
    const a = createBabulfish()
    const b = createBabulfish()

    await Promise.all([a.loadModel(), b.loadModel()])

    const snapsB = snapshots(b)
    await a.dispose()

    generate.mockResolvedValueOnce([{ generated_text: createMockResult("test", "prueba") }])
    const result = await b.translateText("test", "es")
    expect(result).toBe("prueba")

    expect(b.snapshot.model.status).toBe("ready")
    expect(snapsB.every((s) => s.model.status === "ready")).toBe(true)
  })

  it("late same-key cores sync to ready when they attach to an already-loaded runtime", async () => {
    setupPipelineMock()
    const first = createBabulfish()
    await first.loadModel()

    const second = createBabulfish()
    await second.loadModel()

    expect(getEngineIdentity(second)).toBe(getEngineIdentity(first))
    expect(second.snapshot.model.status).toBe("ready")
  })
})

// ---- 4.2 Snapshot — monolithic + structural sharing -----------------------

describe("4.2 — snapshot monolithic + structural sharing", () => {
  it("initial snapshot is Object.isFrozen", () => {
    const core = createBabulfish()
    expect(Object.isFrozen(core.snapshot)).toBe(true)
  })

  it("initial snapshot reflects detected capabilities", () => {
    setGlobal("window", { innerWidth: 400, ontouchstart: null })
    setGlobal("navigator", { maxTouchPoints: 1, deviceMemory: 8 })

    const core = createBabulfish({ engine: { device: "webgpu" } })

    expect(core.snapshot.capabilities).toEqual({
      ready: true,
      hasWebGPU: false,
      isMobile: true,
      approxDeviceMemoryGiB: 8,
      crossOriginIsolated: false,
    })
    expect(core.snapshot.enablement.status).toBe("idle")
    expect(core.snapshot.enablement.verdict.outcome).toBe("unknown")
  })

  it("snapshot after loadModel is frozen", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    await core.loadModel()
    expect(Object.isFrozen(core.snapshot)).toBe(true)
  })

  it("model status change preserves capabilities reference", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    const before = core.snapshot.capabilities
    await core.loadModel()
    expect(core.snapshot.capabilities).toBe(before)
  })

  it("no spurious notifications from no-op restore", () => {
    const core = createBabulfish()
    const snaps = snapshots(core)

    core.restore()
    core.restore()
    core.restore()

    expect(snaps).toHaveLength(0)
  })

  it("subscribe returns unsubscribe thunk", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    const collected: Snapshot[] = []
    const unsub = core.subscribe((s) => collected.push(s))
    await core.loadModel()
    const countBefore = collected.length
    unsub()
    core.restore()
    expect(collected.length).toBe(countBefore)
  })
})

// ---- 4.3 Cancellation — AbortSignal + imperative shortcut ----------------

describe("4.3 — cancellation", () => {
  it('translateTo("restore") throws with specified error message', async () => {
    const core = createBabulfish()
    await expect(core.translateTo("restore")).rejects.toThrow(
      "Unknown language code: restore. Use core.restore() to restore the original DOM.",
    )
  })

  it("abort() resets translation status to idle", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    await core.loadModel()

    core.abort()
    expect(core.snapshot.translation.status).toBe("idle")
  })

  it("abort() preserves the last requested language", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    await core.loadModel()
    await core.translateTo("es")

    core.abort()

    expect(core.snapshot.translation.status).toBe("idle")
    expect(core.snapshot.currentLanguage).toBe("es")
  })

  it("restore() clears the last requested language", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    await core.loadModel()
    await core.translateTo("es")

    core.restore()

    expect(core.snapshot.translation.status).toBe("idle")
    expect(core.snapshot.currentLanguage).toBeNull()
  })

  it("abort() is silent when translation is already idle", () => {
    const core = createBabulfish()
    const snaps = snapshots(core)

    core.abort()
    core.abort()

    expect(snaps).toHaveLength(0)
  })

  it("dispose rejects further method calls", async () => {
    const core = createBabulfish()
    await core.dispose()
    await expect(core.loadModel()).rejects.toThrow("Core is disposed")
    await expect(core.translateText("hi", "es")).rejects.toThrow("Core is disposed")
    await expect(core.translateTo("es")).rejects.toThrow("Core is disposed")
  })

  it("loadModel rejects when signal is pre-aborted", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    const controller = new AbortController()
    controller.abort()
    await expect(core.loadModel({ signal: controller.signal })).rejects.toThrow()
  })

  it("translateText rejects when signal is pre-aborted", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    const controller = new AbortController()
    await core.loadModel()
    controller.abort()

    await expect(core.translateText("hello", "es", { signal: controller.signal }))
      .rejects.toBeInstanceOf(DOMException)
  })

  it("translateText removes external abort listener after success", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    const controller = new AbortController()

    await core.loadModel()
    await expectAbortListenerReleased(
      controller.signal,
      () => core.translateText("hello", "es", { signal: controller.signal }),
    )
  })

  it("loadModel removes external abort listener after success", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    const controller = new AbortController()

    await expectAbortListenerReleased(
      controller.signal,
      () => core.loadModel({ signal: controller.signal }),
    )
  })

  it("translateTo failure resets translation status to idle", async () => {
    setupFailingPipelineMock("translation failed")

    const root = createAppRoot()

    const core = createBabulfish({
      dom: {
        root,
        roots: ["#app"],
      },
    })
    await core.loadModel()

    await expect(core.translateTo("es")).rejects.toThrow("translation failed")
    expect(core.snapshot.translation.status).toBe("idle")
  })

  it("translateTo removes external abort listener after success", async () => {
    setupPipelineMock()

    const root = createAppRoot()

    const core = createBabulfish({
      dom: {
        root,
        roots: ["#app"],
      },
    })
    const controller = new AbortController()

    await core.loadModel()
    await expectAbortListenerReleased(
      controller.signal,
      () => core.translateTo("es", { signal: controller.signal }),
    )
  })
})

// ---- 4.4 Root lifetime — set-once default + per-call override ------------

describe("4.4 — root lifetime", () => {
  it("translateText is root-free (works without dom config)", async () => {
    const { generate } = setupPipelineMock()
    generate.mockResolvedValueOnce([{ generated_text: createMockResult("hello", "hola") }])
    const core = createBabulfish()
    await core.loadModel()
    const result = await core.translateText("hello", "es")
    expect(result).toBe("hola")
  })

  it("translateText ignores dom.outputTransform and returns raw engine output", async () => {
    const { generate } = setupPipelineMock()
    generate.mockResolvedValueOnce([{ generated_text: createMockResult("hello", "hola") }])

    const root = createAppRoot()
    const outputTransform = vi.fn((translated: string) => translated.toUpperCase())

    const core = createBabulfish({
      dom: {
        root,
        roots: ["#app"],
        outputTransform,
      },
    })

    await core.loadModel()
    const result = await core.translateText("hello", "es")

    expect(result).toBe("hola")
    expect(outputTransform).not.toHaveBeenCalled()
    expect(root.querySelector("p")?.textContent).toBe("Hello")
  })

  it("restore and translateTo work without dom config", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    await core.loadModel()
    core.restore()
    await core.translateTo("es")
    expect(core.snapshot.translation.status).toBe("idle")
  })
})

// ---- 4.5 translateText snapshot purity -----------------------------------

describe("4.5 — translateText snapshot purity", () => {
  it("translateText does not mutate snapshot.translation or currentLanguage", async () => {
    const { generate } = setupPipelineMock()
    generate.mockResolvedValueOnce([{ generated_text: createMockResult("hello", "hola") }])

    const core = createBabulfish()
    await core.loadModel()

    const snapsBeforeCall = core.snapshot
    const translationBefore = snapsBeforeCall.translation
    const langBefore = snapsBeforeCall.currentLanguage
    const collected: Snapshot[] = []
    core.subscribe((s) => collected.push(s))

    const result = await core.translateText("hello", "es")

    expect(result).toBe("hola")
    expect(core.snapshot.translation).toBe(translationBefore)
    expect(core.snapshot.currentLanguage).toBe(langBefore)
    expect(collected).toHaveLength(0)
  })
})

// ---- DEFAULT_LANGUAGES ---------------------------------------------------

describe("DEFAULT_LANGUAGES", () => {
  it('does not contain { code: "restore" }', () => {
    expect(DEFAULT_LANGUAGES.find((l) => l.code === "restore")).toBeUndefined()
  })

  it("has at least one language", () => {
    expect(DEFAULT_LANGUAGES.length).toBeGreaterThan(0)
  })

  it("is deeply frozen", () => {
    expect(Object.isFrozen(DEFAULT_LANGUAGES)).toBe(true)
    expect(DEFAULT_LANGUAGES.every(Object.isFrozen)).toBe(true)

    expect(() => {
      ;(DEFAULT_LANGUAGES as Language[]).push({ label: "Dutch", code: "nl" })
    }).toThrow(TypeError)

    expect(() => {
      ;(DEFAULT_LANGUAGES[0] as { label: string }).label = "Castilian"
    }).toThrow(TypeError)
  })
})

describe("custom language lists", () => {
  it("clones and freezes configured languages", () => {
    const configured = [{ label: "Dutch", code: "nl" }]

    const core = createBabulfish({ languages: configured })

    expect(core.languages).toEqual(configured)
    expect(core.languages).not.toBe(configured)
    expect(Object.isFrozen(core.languages)).toBe(true)
    expect(Object.isFrozen(core.languages[0])).toBe(true)

    configured[0]!.label = "Nederlands"

    expect(core.languages[0]?.label).toBe("Dutch")

    expect(() => {
      ;(core.languages as Language[]).push({ label: "French", code: "fr" })
    }).toThrow(TypeError)

    expect(() => {
      ;(core.languages[0] as { label: string }).label = "Nederlands"
    }).toThrow(TypeError)
  })
})
