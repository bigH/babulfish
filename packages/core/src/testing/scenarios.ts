/** @experimental — subject to change */

import type { Snapshot } from "../core/index.js"
import { loadPipeline } from "../engine/pipeline-loader.js"
import { getEngineIdentity } from "../engine/testing/index.js"
import type { ConformanceDriver, ConformanceScenario } from "./drivers/types.js"

// ---------------------------------------------------------------------------
// Mock access — test file MUST vi.mock("../engine/pipeline-loader.js") first
// ---------------------------------------------------------------------------

type MockFn = {
  (...args: any[]): any
  mock: { calls: any[][] }
  mockImplementation(fn: (...args: any[]) => any): void
  mockResolvedValue(value: any): void
}

const mockedLoad = loadPipeline as unknown as MockFn

// ---------------------------------------------------------------------------
// Assertions (no vitest dependency — plain throws)
// ---------------------------------------------------------------------------

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (!Object.is(actual, expected))
    throw new Error(`${msg}: expected ${String(expected)}, got ${String(actual)}`)
}

async function expectAbortError(
  p: Promise<unknown>,
  msg: string,
): Promise<void> {
  try {
    await p
    throw new Error(`${msg}: expected AbortError but resolved`)
  } catch (err) {
    if (err instanceof Error && err.message.includes("expected AbortError"))
      throw err
    assert(
      err instanceof DOMException && err.name === "AbortError",
      `${msg}: expected AbortError, got ${err}`,
    )
  }
}

// ---------------------------------------------------------------------------
// Fake pipeline helpers
// ---------------------------------------------------------------------------

function fakePipeline(translation = "translated"): unknown {
  const generate = async () => [
    { generated_text: [{ role: "assistant", content: translation }] },
  ]
  return Object.assign(generate, { dispose: async () => {} })
}

function controllablePipeline() {
  const barriers: Array<() => void> = []
  const generate = async () => {
    await new Promise<void>((r) => barriers.push(r))
    return [
      { generated_text: [{ role: "assistant", content: "translated" }] },
    ]
  }
  return {
    pipeline: Object.assign(generate, { dispose: async () => {} }),
    barriers,
    resolveAll() {
      barriers.forEach((r) => r())
    },
  }
}

function collect(
  core: { subscribe(fn: (s: Snapshot) => void): () => void },
): Snapshot[] {
  const out: Snapshot[] = []
  core.subscribe((s) => out.push(s))
  return out
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0))

// ---------------------------------------------------------------------------
// DOM helpers (test-only, hardcoded trusted content)
// ---------------------------------------------------------------------------

function setInnerHTML(el: Element, html: string): void {
  el.innerHTML = html // eslint-disable-line no-unsanitized/property
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** @experimental — subject to change */
export const scenarios: readonly ConformanceScenario[] = [
  // -- Q7: Snapshot ----------------------------------------------------------

  {
    id: "snapshot-model-ready",
    description: "loadModel resolves → model.status === 'ready'",
    async run(driver) {
      mockedLoad.mockResolvedValue(fakePipeline())
      const core = await driver.create()
      await core.loadModel()
      assertEqual(core.snapshot.model.status, "ready", "model status")
      await driver.dispose(core)
    },
  },

  {
    id: "snapshot-progress-monotonic",
    description: "Downloading progress is non-decreasing within a load",
    async run(driver) {
      mockedLoad.mockImplementation(
        async (_t: any, _m: any, opts: any) => {
          const cb = opts?.progress_callback
          cb?.({ status: "progress", file: "m.onnx", loaded: 25, total: 100 })
          cb?.({ status: "progress", file: "m.onnx", loaded: 50, total: 100 })
          cb?.({ status: "progress", file: "m.onnx", loaded: 100, total: 100 })
          return fakePipeline()
        },
      )
      const core = await driver.create()
      const values: number[] = []
      core.subscribe((s) => {
        if (s.model.status === "downloading") values.push(s.model.progress)
      })
      await core.loadModel()
      assert(values.length > 0, "Should have progress snapshots")
      for (let i = 1; i < values.length; i++)
        assert(
          values[i]! >= values[i - 1]!,
          `Progress decreased: ${values[i - 1]} → ${values[i]}`,
        )
      await driver.dispose(core)
    },
  },

  {
    id: "snapshot-structural-sharing",
    description:
      "Translation state change preserves model/capabilities references",
    async run(driver) {
      mockedLoad.mockResolvedValue(fakePipeline())
      const core = await driver.create()
      await core.loadModel()
      const before = core.snapshot
      const snaps = collect(core)
      await core.translateTo("es")
      assert(snaps.length >= 2, `Expected ≥2 snapshots, got ${snaps.length}`)
      for (const s of snaps) {
        assertEqual(s.model, before.model, "model ref")
        assertEqual(s.capabilities, before.capabilities, "capabilities ref")
      }
      await driver.dispose(core)
    },
  },

  {
    id: "snapshot-no-spurious-notify",
    description: "restore() from already-idle does NOT invoke subscribers",
    async run(driver) {
      const core = await driver.create()
      const snaps = collect(core)
      core.restore()
      core.restore()
      assertEqual(snaps.length, 0, "No notifications from idle restore")
      await driver.dispose(core)
    },
  },

  // -- Q8: Lifecycle / multi-instance ----------------------------------------

  {
    id: "lifecycle-dispose-detaches",
    description:
      "dispose() detaches subscribers; subsequent subscribe() is no-op",
    async run(driver) {
      const core = await driver.create()
      let count = 0
      core.subscribe(() => {
        count++
      })
      await driver.dispose(core)
      const unsub = core.subscribe(() => {
        count++
      })
      assertEqual(
        typeof unsub,
        "function",
        "subscribe after dispose returns function",
      )
      unsub()
      assertEqual(count, 0, "No subscriber should fire")
    },
  },

  {
    id: "lifecycle-ssr-safe",
    description: "SSR-style first render has capabilities without throwing",
    async run(driver) {
      const core = await driver.create()
      assert(core.snapshot.capabilities !== null, "capabilities defined")
      assertEqual(typeof core.snapshot.capabilities.ready, "boolean", "ready type")
      await driver.dispose(core)
    },
  },

  {
    id: "lifecycle-engine-singleton",
    description: "Two cores share one engine via getEngineIdentity()",
    async run(driver) {
      const a = await driver.create()
      const b = await driver.create()
      assert(getEngineIdentity(a) !== undefined, "Core A identity defined")
      assertEqual(
        getEngineIdentity(a),
        getEngineIdentity(b),
        "Same engine identity",
      )
      await driver.dispose(a)
      await driver.dispose(b)
    },
  },

  {
    id: "lifecycle-mount-dispose-remount",
    description:
      "Engine identity preserved after dispose-remount; new core state clean",
    async run(driver) {
      const first = await driver.create()
      const id1 = getEngineIdentity(first)
      await driver.dispose(first)
      const second = await driver.create()
      assertEqual(getEngineIdentity(second), id1, "Engine identity preserved")
      assertEqual(second.snapshot.model.status, "idle", "model idle")
      assertEqual(second.snapshot.translation.status, "idle", "translation idle")
      assertEqual(second.snapshot.currentLanguage, null, "currentLanguage null")
      await driver.dispose(second)
    },
  },

  {
    id: "lifecycle-concurrent-load-dedup",
    description: "Two cores loadModel() → loadPipeline called exactly once",
    async run(driver) {
      mockedLoad.mockResolvedValue(fakePipeline())
      const a = await driver.create()
      const b = await driver.create()
      await Promise.all([a.loadModel(), b.loadModel()])
      assertEqual(
        mockedLoad.mock.calls.length,
        1,
        "loadPipeline call count",
      )
      await driver.dispose(a)
      await driver.dispose(b)
    },
  },

  {
    id: "lifecycle-cross-core-dispose",
    description:
      "Dispose core A mid-flight; core B translateText resolves normally",
    async run(driver) {
      const { pipeline, resolveAll } = controllablePipeline()
      mockedLoad.mockResolvedValue(pipeline)
      const a = await driver.create()
      const b = await driver.create()
      await a.loadModel()
      const snapBefore = b.snapshot
      const p = b.translateText("hello", "es")
      await a.dispose()
      resolveAll()
      assertEqual(await p, "translated", "B translates after A disposed")
      assertEqual(b.snapshot.model.status, "ready", "B model ready")
      assertEqual(
        b.snapshot.translation,
        snapBefore.translation,
        "B translation unchanged",
      )
      await driver.dispose(b)
    },
  },

  // -- Q9: Cancellation (DOM required for async translateTo gap) -------------

  {
    id: "cancel-last-caller-wins",
    description:
      "translateTo(a) then (b): first rejects AbortError, second resolves",
    requiresDOM: true,
    async run(driver) {
      const { pipeline, resolveAll } = controllablePipeline()
      mockedLoad.mockResolvedValue(pipeline)
      const core = await driver.create()
      await core.loadModel()
      const p1 = core.translateTo("a")
      p1.catch(() => {})
      const p2 = core.translateTo("b")
      await tick()
      resolveAll()
      await expectAbortError(p1, "First translateTo")
      await p2
      assertEqual(core.snapshot.currentLanguage, "b", "currentLanguage")
      await driver.dispose(core)
    },
  },

  {
    id: "cancel-external-signal",
    description: "translateTo + external abort() → rejects AbortError",
    requiresDOM: true,
    async run(driver) {
      const { pipeline, resolveAll } = controllablePipeline()
      mockedLoad.mockResolvedValue(pipeline)
      const core = await driver.create()
      await core.loadModel()
      const ac = new AbortController()
      const p = core.translateTo("es", { signal: ac.signal })
      p.catch(() => {})
      await tick()
      ac.abort()
      resolveAll()
      await expectAbortError(p, "External abort")
      await driver.dispose(core)
    },
  },

  {
    id: "cancel-dispose-mid-translate",
    description:
      "dispose() mid-translation rejects pending Promise with AbortError",
    requiresDOM: true,
    async run(driver) {
      const { pipeline, resolveAll } = controllablePipeline()
      mockedLoad.mockResolvedValue(pipeline)
      const core = await driver.create()
      await core.loadModel()
      const p = core.translateTo("es")
      p.catch(() => {})
      await tick()
      const dp = driver.dispose(core)
      resolveAll()
      await expectAbortError(p, "translateTo during dispose")
      await dp
    },
  },

  {
    id: "cancel-abort-to-idle",
    description:
      "abort() mid-translation → idle; no stale completion to subscribers",
    requiresDOM: true,
    async run(driver) {
      const { pipeline, resolveAll } = controllablePipeline()
      mockedLoad.mockResolvedValue(pipeline)
      const core = await driver.create()
      await core.loadModel()
      const p = core.translateTo("es")
      p.catch(() => {})
      await tick()
      const snaps = collect(core)
      core.abort()
      resolveAll()
      try {
        await p
      } catch {
        /* expected AbortError */
      }
      assertEqual(
        core.snapshot.translation.status,
        "idle",
        "Translation idle after abort",
      )
      assertEqual(
        snaps.filter((s) => s.translation.status !== "idle").length,
        0,
        "No stale completion",
      )
      await driver.dispose(core)
    },
  },

  // -- Q10: Root override ----------------------------------------------------

  {
    id: "root-override",
    description:
      "translateTo with root override only affects the fragment",
    requiresDOM: true,
    async run(driver) {
      mockedLoad.mockResolvedValue(fakePipeline("traducido"))
      const core = await driver.create()
      await core.loadModel()
      const doc = driver.root! as Document
      const original = doc.querySelector("#app p")?.textContent ?? ""
      const container = doc.createElement("div")
      // Safe: hardcoded test fixture, not user content
      setInnerHTML(container, '<div id="app"><p>Override me</p></div>')
      await core.translateTo("es", { root: container })
      assert(
        container.querySelector("#app p")?.textContent !== "Override me",
        "Fragment text should change",
      )
      assertEqual(
        doc.querySelector("#app p")?.textContent ?? "",
        original,
        "Default root untouched",
      )
      await driver.dispose(core)
    },
  },

  // -- Invariant 4.5: translateText purity -----------------------------------

  {
    id: "translate-text-purity",
    description:
      "translateText() does not mutate snapshot or invoke subscribers",
    async run(driver) {
      mockedLoad.mockResolvedValue(fakePipeline("hola"))
      const core = await driver.create()
      await core.loadModel()
      const before = core.snapshot
      let notified = false
      core.subscribe(() => {
        notified = true
      })
      const result = await core.translateText("hello", "es")
      assertEqual(result, "hola", "Translation result")
      assertEqual(
        core.snapshot.translation,
        before.translation,
        "translation ref",
      )
      assertEqual(
        core.snapshot.currentLanguage,
        before.currentLanguage,
        "currentLanguage",
      )
      assert(!notified, "No subscriber notification during translateText")
      await driver.dispose(core)
    },
  },
]
