/** @experimental — subject to change */

import type { BabulfishCore, TranslateOptions } from "../core/babulfish.js"
import type { Snapshot } from "../core/store.js"
import type { PipelineOptions } from "../engine/pipeline-loader.js"
import { loadPipeline } from "../engine/pipeline-loader.js"
import { getEngineIdentity } from "../engine/testing/index.js"
import type {
  ConformanceDriver,
  ConformanceScenario,
  DomConformanceDriver,
} from "./drivers/types.js"
import {
  makeControllablePipeline,
  makeFakePipeline,
  type ConformancePipeline,
} from "./conformance-helpers.js"

// ---------------------------------------------------------------------------
// Mock access — test file MUST vi.mock("../engine/pipeline-loader.js") first
// ---------------------------------------------------------------------------

type MockLoadPipelineResult =
  | Awaited<ReturnType<typeof loadPipeline>>
  | ConformancePipeline

type MockedLoadPipeline = {
  (model: string, opts?: PipelineOptions): Promise<MockLoadPipelineResult>
  mock: { calls: Array<[string, PipelineOptions?]> }
  mockImplementation(
    fn: (
      model: string,
      opts?: PipelineOptions,
    ) => MockLoadPipelineResult | Promise<MockLoadPipelineResult>,
  ): void
  mockResolvedValue(value: MockLoadPipelineResult): void
}

const mockedLoad = loadPipeline as unknown as MockedLoadPipeline

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

function collect(core: Pick<BabulfishCore, "subscribe">): Snapshot[] {
  const out: Snapshot[] = []
  core.subscribe((s) => out.push(s))
  return out
}

async function withCore<T>(
  driver: ConformanceDriver,
  run: (core: BabulfishCore) => Promise<T>,
): Promise<T> {
  const core = await driver.create()
  try {
    return await run(core)
  } finally {
    await driver.dispose(core)
  }
}

async function withLoadedCore<T>(
  driver: ConformanceDriver,
  run: (core: BabulfishCore) => Promise<T>,
  translation = "translated",
): Promise<T> {
  mockedLoad.mockResolvedValue(makeFakePipeline(translation))
  return withCore(driver, async (core) => {
    await core.loadModel()
    return run(core)
  })
}

async function startPendingTranslation(
  driver: ConformanceDriver,
  lang: string,
  opts?: TranslateOptions,
): Promise<{
  readonly core: BabulfishCore
  readonly translation: Promise<void>
  readonly release: () => void
}> {
  const { pipeline, waitForStart, release } = makeControllablePipeline()
  mockedLoad.mockResolvedValue(pipeline)
  const core = await driver.create()
  await core.loadModel()
  const translation = core.translateTo(lang, opts)
  translation.catch(() => {})
  await waitForStart()
  return {
    core,
    translation,
    release,
  }
}

// ---------------------------------------------------------------------------
// DOM helpers (test-only, hardcoded trusted content)
// ---------------------------------------------------------------------------

function setInnerHTML(el: Element, html: string): void {
  el.innerHTML = html // eslint-disable-line no-unsanitized/property
}

function ownerDocumentFor(root: ParentNode | Document): Document {
  if (root instanceof Document) return root
  assert(root.ownerDocument instanceof Document, "DOM driver root must have an ownerDocument")
  return root.ownerDocument
}

function isDomDriver(driver: ConformanceDriver): driver is DomConformanceDriver {
  return driver.supportsDOM
}

function domRootFor(driver: ConformanceDriver): ParentNode | Document {
  assert(isDomDriver(driver), "Scenario requires a DOM-capable driver")
  return driver.root
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
      await withLoadedCore(driver, async (core) => {
        assertEqual(core.snapshot.model.status, "ready", "model status")
      })
    },
  },

  {
    id: "snapshot-progress-monotonic",
    description: "Downloading progress is non-decreasing within a load",
    async run(driver) {
      mockedLoad.mockImplementation(
        async (_model: string, _options?: PipelineOptions) => {
          const cb = _options?.progress_callback
          cb?.({ status: "progress", name: "m.onnx", progress: 25, file: "m.onnx", loaded: 25, total: 100 })
          cb?.({ status: "progress", name: "m.onnx", progress: 50, file: "m.onnx", loaded: 50, total: 100 })
          cb?.({ status: "progress", name: "m.onnx", progress: 100, file: "m.onnx", loaded: 100, total: 100 })
          return makeFakePipeline()
        },
      )
      await withCore(driver, async (core) => {
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
      })
    },
  },

  {
    id: "snapshot-structural-sharing",
    description:
      "Translation state change preserves model/capabilities/enablement references",
    async run(driver) {
      await withLoadedCore(driver, async (core) => {
        const before = core.snapshot
        const snaps = collect(core)
        await core.translateTo("es")
        assert(snaps.length >= 2, `Expected ≥2 snapshots, got ${snaps.length}`)
        for (const s of snaps) {
          assertEqual(s.model, before.model, "model ref")
          assertEqual(s.capabilities, before.capabilities, "capabilities ref")
          assertEqual(s.enablement, before.enablement, "enablement ref")
        }
      })
    },
  },

  {
    id: "snapshot-no-spurious-notify",
    description: "restore() from already-idle does NOT invoke subscribers",
    async run(driver) {
      await withCore(driver, async (core) => {
        const snaps = collect(core)
        core.restore()
        core.restore()
        assertEqual(snaps.length, 0, "No notifications from idle restore")
      })
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
    description: "SSR-style first render stays neutral without throwing",
    async run(driver) {
      const savedWindow = globalThis.window
      delete (globalThis as Record<string, unknown>).window
      try {
        await withCore(driver, async (core) => {
          assert(core.snapshot.capabilities !== null, "capabilities defined")
          assertEqual(core.snapshot.capabilities.ready, false, "ready is false before loadModel")
          assertEqual(core.snapshot.enablement.status, "idle", "enablement idle before loadModel")
          assertEqual(
            core.snapshot.enablement.verdict.outcome,
            "unknown",
            "enablement verdict unknown before loadModel",
          )
        })
      } finally {
        globalThis.window = savedWindow
      }
    },
  },

  {
    id: "lifecycle-engine-singleton",
    description: "Two same-key cores share one runtime after loadModel()",
    async run(driver) {
      const a = await driver.create()
      try {
        const b = await driver.create()
        try {
          assertEqual(getEngineIdentity(a), undefined, "Core A identity undefined before load")
          assertEqual(getEngineIdentity(b), undefined, "Core B identity undefined before load")
          await Promise.all([a.loadModel(), b.loadModel()])
          assert(getEngineIdentity(a) !== undefined, "Core A identity defined")
          assertEqual(
            getEngineIdentity(a),
            getEngineIdentity(b),
            "Same engine identity",
          )
        } finally {
          await driver.dispose(b)
        }
      } finally {
        await driver.dispose(a)
      }
    },
  },

  {
    id: "lifecycle-mount-dispose-remount",
    description:
      "Engine identity preserved after dispose-remount; new core state clean",
    async run(driver) {
      const first = await driver.create()
      await first.loadModel()
      const id1 = getEngineIdentity(first)
      await driver.dispose(first)
      const second = await driver.create()
      try {
        assertEqual(second.snapshot.model.status, "idle", "model idle")
        assertEqual(second.snapshot.translation.status, "idle", "translation idle")
        assertEqual(second.snapshot.currentLanguage, null, "currentLanguage null")
        await second.loadModel()
        assertEqual(getEngineIdentity(second), id1, "Engine identity preserved")
      } finally {
        await driver.dispose(second)
      }
    },
  },

  {
    id: "lifecycle-concurrent-load-dedup",
    description: "Two cores loadModel() → loadPipeline called exactly once",
    async run(driver) {
      mockedLoad.mockResolvedValue(makeFakePipeline())
      const a = await driver.create()
      try {
        const b = await driver.create()
        try {
          await Promise.all([a.loadModel(), b.loadModel()])
          assertEqual(
            mockedLoad.mock.calls.length,
            1,
            "loadPipeline call count",
          )
        } finally {
          await driver.dispose(b)
        }
      } finally {
        await driver.dispose(a)
      }
    },
  },

  {
    id: "lifecycle-cross-core-dispose",
    description:
      "Dispose core A mid-flight; core B translateText resolves normally",
    async run(driver) {
      const { pipeline, release } = makeControllablePipeline()
      mockedLoad.mockResolvedValue(pipeline)
      const a = await driver.create()
      let aDisposed = false
      try {
        const b = await driver.create()
        try {
          await Promise.all([a.loadModel(), b.loadModel()])
          const snapBefore = b.snapshot
          const p = b.translateText("hello", "es")
          await a.dispose()
          aDisposed = true
          release()
          assertEqual(await p, "translated", "B translates after A disposed")
          assertEqual(b.snapshot.model.status, "ready", "B model ready")
          assertEqual(
            b.snapshot.translation,
            snapBefore.translation,
            "B translation unchanged",
          )
        } finally {
          await driver.dispose(b)
        }
      } finally {
        if (!aDisposed) await driver.dispose(a)
      }
    },
  },

  // -- Q9: Cancellation (DOM required for async translateTo gap) -------------

  {
    id: "cancel-last-caller-wins",
    description:
      "translateTo(a) then (b): first rejects AbortError, second resolves",
    requiresDOM: true,
    async run(driver) {
      const { pipeline, waitForStart, release } = makeControllablePipeline()
      mockedLoad.mockResolvedValue(pipeline)
      await withCore(driver, async (core) => {
        await core.loadModel()
        const p1 = core.translateTo("a")
        p1.catch(() => {})
        const p2 = core.translateTo("b")
        await waitForStart()
        release()
        await expectAbortError(p1, "First translateTo")
        await p2
        assertEqual(core.snapshot.currentLanguage, "b", "currentLanguage")
      })
    },
  },

  {
    id: "cancel-external-signal",
    description: "translateTo + external abort() → rejects AbortError",
    requiresDOM: true,
    async run(driver) {
      const ac = new AbortController()
      const { core, translation, release } = await startPendingTranslation(
        driver,
        "es",
        { signal: ac.signal },
      )
      try {
        ac.abort()
        release()
        await expectAbortError(translation, "External abort")
      } finally {
        await driver.dispose(core)
      }
    },
  },

  {
    id: "cancel-dispose-mid-translate",
    description:
      "dispose() mid-translation rejects pending Promise with AbortError",
    requiresDOM: true,
    async run(driver) {
      const { core, translation, release } = await startPendingTranslation(
        driver,
        "es",
      )
      const dispose = driver.dispose(core)
      release()
      await expectAbortError(translation, "translateTo during dispose")
      await dispose
    },
  },

  {
    id: "cancel-abort-to-idle",
    description:
      "abort() mid-translation → idle; no stale completion to subscribers",
    requiresDOM: true,
    async run(driver) {
      const { core, translation, release } = await startPendingTranslation(
        driver,
        "es",
      )
      try {
        const snaps = collect(core)
        core.abort()
        release()
        await expectAbortError(translation, "abort() mid-translation")
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
      } finally {
        await driver.dispose(core)
      }
    },
  },

  // -- Q10: Root override ----------------------------------------------------

  {
    id: "root-override",
    description:
      "translateTo with root override only affects the fragment",
    requiresDOM: true,
    async run(driver) {
      await withLoadedCore(driver, async (core) => {
        const root = domRootFor(driver)
        const original = root.querySelector("#app p")?.textContent ?? ""
        const doc = ownerDocumentFor(root)
        const container = doc.createElement("div")
        // Safe: hardcoded test fixture, not user content
        setInnerHTML(container, '<div id="app"><p>Override me</p></div>')
        await core.translateTo("es", { root: container })
        assert(
          container.querySelector("#app p")?.textContent !== "Override me",
          "Fragment text should change",
        )
        assertEqual(
          root.querySelector("#app p")?.textContent ?? "",
          original,
          "Default root untouched",
        )
      }, "traducido")
    },
  },

  // -- Invariant 4.5: translateText purity -----------------------------------

  {
    id: "translate-text-purity",
    description:
      "translateText() does not mutate snapshot or invoke subscribers",
    async run(driver) {
      await withLoadedCore(driver, async (core) => {
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
      }, "hola")
    },
  },
]

/** @experimental — subject to change */
export function scenariosForDriver(
  driver: ConformanceDriver,
): readonly ConformanceScenario[] {
  return scenarios.filter((scenario) => driver.supportsDOM || !scenario.requiresDOM)
}
