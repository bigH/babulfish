import { describe, it, expect, vi, beforeEach } from "vitest"

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

const mockLoadPipeline = vi.mocked(loadPipeline)

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

function createMockPipeline(generate = createMockGenerator()) {
  const pipeline = Object.assign(generate, {
    _call: generate,
    task: "text-generation" as const,
    model: {} as unknown,
    tokenizer: {} as unknown,
    dispose: vi.fn(async () => {}),
  })
  return { generate, pipeline }
}

function setupPipelineMock() {
  const { generate, pipeline } = createMockPipeline()
  mockLoadPipeline.mockResolvedValue(pipeline)
  return { generate, pipeline }
}

function setupFailingPipelineMock(error: string): void {
  const generate = vi.fn(async () => {
    throw new Error(error)
  })
  const pipeline = createMockPipeline(generate).pipeline
  mockLoadPipeline.mockResolvedValue(pipeline)
}

function snapshots(core: ReturnType<typeof createBabulfish>) {
  const collected: Snapshot[] = []
  core.subscribe((s) => collected.push(s))
  return collected
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
})

// ---- 4.1 Engine singleton + multi-instance --------------------------------

describe("4.1 — engine singleton + multi-instance", () => {
  it("two createBabulfish calls share the same engine", () => {
    const a = createBabulfish()
    const b = createBabulfish()
    expect(getEngineIdentity(a)).toBe(getEngineIdentity(b))
    expect(getEngineIdentity(a)).toBeDefined()
  })

  it("reset helper clears the shared engine identity", () => {
    const first = createBabulfish()
    const firstIdentity = getEngineIdentity(first)

    __resetEngineForTests()

    const second = createBabulfish()

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

    await a.loadModel()

    const snapsB = snapshots(b)
    await a.dispose()

    generate.mockResolvedValueOnce([{ generated_text: createMockResult("test", "prueba") }])
    const result = await b.translateText("test", "es")
    expect(result).toBe("prueba")

    expect(b.snapshot.model.status).toBe("ready")
    expect(snapsB.every((s) => s.model.status === "ready")).toBe(true)
  })
})

// ---- 4.2 Snapshot — monolithic + structural sharing -----------------------

describe("4.2 — snapshot monolithic + structural sharing", () => {
  it("initial snapshot is Object.isFrozen", () => {
    const core = createBabulfish()
    expect(Object.isFrozen(core.snapshot)).toBe(true)
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

  it("loadModel removes external abort listener after success", async () => {
    setupPipelineMock()
    const core = createBabulfish()
    const controller = new AbortController()
    const addEventListener = vi.spyOn(controller.signal, "addEventListener")
    const removeEventListener = vi.spyOn(controller.signal, "removeEventListener")

    await core.loadModel({ signal: controller.signal })

    expect(addEventListener).toHaveBeenCalledWith("abort", expect.any(Function), { once: true })
    expect(removeEventListener).toHaveBeenCalledWith(
      "abort",
      addEventListener.mock.calls[0]?.[1] as EventListener,
    )
  })

  it("translateTo failure resets translation status to idle", async () => {
    setupFailingPipelineMock("translation failed")

    const root = document.createElement("div")
    root.innerHTML = '<div id="app"><p>Hello</p></div>'

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

    const root = document.createElement("div")
    root.innerHTML = '<div id="app"><p>Hello</p></div>'

    const core = createBabulfish({
      dom: {
        root,
        roots: ["#app"],
      },
    })
    const controller = new AbortController()
    const addEventListener = vi.spyOn(controller.signal, "addEventListener")
    const removeEventListener = vi.spyOn(controller.signal, "removeEventListener")

    await core.loadModel()
    await core.translateTo("es", { signal: controller.signal })

    expect(addEventListener).toHaveBeenCalledWith("abort", expect.any(Function), { once: true })
    expect(removeEventListener).toHaveBeenCalledWith(
      "abort",
      addEventListener.mock.calls[0]?.[1] as EventListener,
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

    configured[0].label = "Nederlands"

    expect(core.languages[0]?.label).toBe("Dutch")

    expect(() => {
      ;(core.languages as Language[]).push({ label: "French", code: "fr" })
    }).toThrow(TypeError)

    expect(() => {
      ;(core.languages[0] as { label: string }).label = "Nederlands"
    }).toThrow(TypeError)
  })
})
