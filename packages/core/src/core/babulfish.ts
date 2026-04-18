import type { RuntimePreferenceConfig, ResolvedRuntimePlan } from "../engine/runtime-plan.js"
import type { DOMTranslatorConfig, DOMTranslator } from "../dom/translator.js"
import { createDOMTranslator } from "../dom/translator.js"
import { acquireEngine, tagCoreWithEngineIdentity } from "./engine-handle.js"
import { createStore, type Snapshot } from "./store.js"
import type { ModelState, TranslationState } from "./store.js"
import { createProgressController } from "./progress.js"
import {
  createReadonlyLanguageList,
  DEFAULT_LANGUAGES,
  type Language,
} from "./languages.js"
import { detectCapabilities } from "./capabilities.js"
import {
  createIdleEnablementState,
  getOrCreateEnablementAssessment,
  resolveRuntimePreferences,
  NOT_RUN_PROBE_SUMMARY,
  type EnablementAssessment,
  type ModelProfile,
  type ProbeSummary,
} from "../engine/runtime-plan.js"
import { runAdapterSmokeProbe, PROBE_VERSION } from "../engine/probe.js"
import {
  createProbeCacheKey,
  createObservationFingerprint,
  getProbeCacheEntry,
  setProbeCacheEntry,
  type ProbeOutcome,
} from "../engine/probe-cache.js"

export type TranslateOptions = {
  readonly signal?: AbortSignal
  readonly root?: ParentNode | Document
}

export interface BabulfishCore {
  readonly snapshot: Snapshot
  subscribe(listener: (s: Snapshot) => void): () => void
  loadModel(opts?: { signal?: AbortSignal }): Promise<void>
  translateTo(lang: string, opts?: TranslateOptions): Promise<void>
  translateText(text: string, lang: string, opts?: { signal?: AbortSignal }): Promise<string>
  restore(opts?: { root?: ParentNode | Document }): void
  abort(): void
  dispose(): Promise<void>
  readonly languages: ReadonlyArray<Language>
}

export type BabulfishEngineConfig = RuntimePreferenceConfig

export type BabulfishConfig = {
  readonly engine?: BabulfishEngineConfig
  readonly dom?: Omit<DOMTranslatorConfig, "translate" | "root"> & {
    readonly root?: ParentNode | Document
  }
  readonly languages?: readonly Language[]
}

function addAbortListener(signal: AbortSignal, listener: () => void): () => void {
  if (signal.aborted) {
    listener()
    return () => {}
  }

  signal.addEventListener("abort", listener, { once: true })
  return () => {
    signal.removeEventListener("abort", listener)
  }
}

async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) throw signal.reason

  let removeAbortListener = () => {}
  const abortPromise = new Promise<never>((_, reject) => {
    removeAbortListener = addAbortListener(signal, () => reject(signal.reason))
  })

  try {
    return await Promise.race([promise, abortPromise])
  } finally {
    removeAbortListener()
  }
}

const IDLE_MODEL_STATE: ModelState = Object.freeze({ status: "idle" })
const READY_MODEL_STATE: ModelState = Object.freeze({ status: "ready" })
const IDLE_TRANSLATION_STATE: TranslationState = Object.freeze({ status: "idle" })
const INITIAL_TRANSLATION_STATE: TranslationState = Object.freeze({
  status: "translating",
  progress: 0,
})

export function createBabulfish(config?: BabulfishConfig): BabulfishCore {
  const capabilities = detectCapabilities()
  const store = createStore(capabilities)
  const progress = createProgressController()
  const languages = config?.languages
    ? createReadonlyLanguageList(config.languages)
    : DEFAULT_LANGUAGES
  const defaultRoot = config?.dom?.root
  let disposed = false
  let engineHandle: ReturnType<typeof acquireEngine> | null = null
  let unsubStatus: (() => void) | null = null
  let unsubProgress: (() => void) | null = null
  let assessmentPromise: Promise<EnablementAssessment> | null = null
  let assessment: EnablementAssessment | null = null

  function assertNotDisposed(): void {
    if (disposed) throw new Error("Core is disposed")
  }

  function requireLoadedEngine(): NonNullable<typeof engineHandle>["engine"] {
    if (!engineHandle) {
      throw new Error("Translation model not loaded. Call loadModel() first.")
    }

    return engineHandle.engine
  }

  function modelStateForStatus(
    previousSnapshot: Snapshot,
    nextStatus: ModelState["status"],
    error?: unknown,
  ): ModelState {
    switch (nextStatus) {
      case "downloading":
        return {
          status: "downloading",
          progress:
            previousSnapshot.model.status === "downloading" ? previousSnapshot.model.progress : 0,
        }
      case "ready":
        return READY_MODEL_STATE
      case "error":
        return { status: "error", error }
      default:
        return IDLE_MODEL_STATE
    }
  }

  function setTranslationStarted(lang: string): void {
    store.set((prev) => ({
      ...prev,
      translation: INITIAL_TRANSLATION_STATE,
      currentLanguage: lang,
    }))
  }

  function setTranslationIdle(): void {
    store.set((prev) => {
      if (prev.translation.status === "idle") return prev
      return { ...prev, translation: IDLE_TRANSLATION_STATE }
    })
  }

  function restoreTranslationState(): void {
    store.set((prev) => {
      if (prev.translation.status === "idle" && prev.currentLanguage === null) return prev
      return {
        ...prev,
        translation: IDLE_TRANSLATION_STATE,
        currentLanguage: null,
      }
    })
  }

  function attachEngineHandle(plan: ResolvedRuntimePlan): NonNullable<typeof engineHandle> {
    if (engineHandle) {
      return engineHandle
    }

    const handle = acquireEngine(plan)
    engineHandle = handle
    tagCoreWithEngineIdentity(core, handle.id)

    unsubStatus = handle.engine.on("status-change", ({ to, error }) =>
      store.set((prev) => ({ ...prev, model: modelStateForStatus(prev, to, error) })),
    )

    unsubProgress = handle.engine.on("progress", ({ loaded, total }) => {
      store.set((prev) => {
        const p = total > 0 ? loaded / total : 0
        if (prev.model.status === "downloading" && prev.model.progress === p) return prev
        return { ...prev, model: { status: "downloading", progress: p } }
      })
    })

    store.set((prev) => {
      const nextModel = modelStateForStatus(prev, handle.engine.status)
      if (prev.model === nextModel) {
        return prev
      }
      if (prev.model.status === nextModel.status) {
        if (prev.model.status !== "downloading") {
          return prev
        }
        if (nextModel.status === "downloading" && prev.model.progress === nextModel.progress) {
          return prev
        }
      }
      return { ...prev, model: nextModel }
    })

    return handle
  }

  function buildProbeCacheKey(modelProfile: ModelProfile | null): string {
    const resolvedConfig = resolveRuntimePreferences(config?.engine)
    return createProbeCacheKey({
      modelProfileId: modelProfile?.id ?? "",
      modelProfileVersion: modelProfile?.version ?? "",
      modelId: resolvedConfig.modelId,
      dtype: resolvedConfig.dtype,
      device: resolvedConfig.device,
      policyVersion: resolvedConfig.enablement.policy,
      probeVersion: PROBE_VERSION,
      observationFingerprint: createObservationFingerprint(capabilities),
    })
  }

  function finalizeProbeOutcome(
    initialAssessment: EnablementAssessment,
    outcome: ProbeOutcome,
    cacheStatus: "hit" | "miss",
  ): EnablementAssessment {
    const resolvedConfig = resolveRuntimePreferences(config?.engine)
    const probeSummary: ProbeSummary = {
      status: outcome.passed ? "passed" : "failed",
      kind: "adapter-smoke",
      cache: cacheStatus,
      note: outcome.note,
    }

    let terminalAssessment: EnablementAssessment

    if (outcome.passed) {
      terminalAssessment = Object.freeze({
        modelProfile: initialAssessment.modelProfile,
        inference: initialAssessment.inference,
        verdict: {
          outcome: "gpu-preferred" as const,
          resolvedDevice: "webgpu" as const,
          reason: `Probe verified WebGPU adapter. ${outcome.note}`,
        },
        runtimePlan: Object.freeze({
          modelId: resolvedConfig.modelId,
          dtype: resolvedConfig.dtype,
          resolvedDevice: "webgpu" as const,
          sourceLanguage: resolvedConfig.sourceLanguage,
          maxNewTokens: resolvedConfig.maxNewTokens,
        }),
      })
    } else if (resolvedConfig.device === "webgpu") {
      terminalAssessment = Object.freeze({
        modelProfile: initialAssessment.modelProfile,
        inference: initialAssessment.inference,
        verdict: {
          outcome: "denied" as const,
          resolvedDevice: null,
          reason: `WebGPU was explicitly requested, but the probe failed. ${outcome.note}`,
        },
        runtimePlan: null,
      })
    } else {
      terminalAssessment = Object.freeze({
        modelProfile: initialAssessment.modelProfile,
        inference: initialAssessment.inference,
        verdict: {
          outcome: "wasm-only" as const,
          resolvedDevice: "wasm" as const,
          reason: `Probe could not verify WebGPU. Falling back to WASM. ${outcome.note}`,
        },
        runtimePlan: Object.freeze({
          modelId: resolvedConfig.modelId,
          dtype: resolvedConfig.dtype,
          resolvedDevice: "wasm" as const,
          sourceLanguage: resolvedConfig.sourceLanguage,
          maxNewTokens: resolvedConfig.maxNewTokens,
        }),
      })
    }

    if (!disposed) {
      assessment = terminalAssessment
      store.set((prev) => ({
        ...prev,
        enablement: {
          status: "ready" as const,
          modelProfile: terminalAssessment.modelProfile,
          inference: terminalAssessment.inference,
          probe: probeSummary,
          verdict: terminalAssessment.verdict,
        },
      }))
    }

    return terminalAssessment
  }

  async function runProbeFlow(
    initialAssessment: EnablementAssessment,
  ): Promise<EnablementAssessment> {
    store.set((prev) => ({
      ...prev,
      enablement: {
        status: "probing" as const,
        modelProfile: initialAssessment.modelProfile,
        inference: initialAssessment.inference,
        probe: {
          status: "running" as const,
          kind: "adapter-smoke" as const,
          cache: null,
          note: "",
        },
        verdict: initialAssessment.verdict,
      },
    }))

    const cacheKey = buildProbeCacheKey(initialAssessment.modelProfile)

    const cached = getProbeCacheEntry(cacheKey)
    if (cached) {
      return finalizeProbeOutcome(initialAssessment, cached, "hit")
    }

    let probeResult
    try {
      probeResult = await runAdapterSmokeProbe()
    } catch (error) {
      if (!disposed) {
        store.set((prev) => ({
          ...prev,
          enablement: {
            status: "error" as const,
            modelProfile: initialAssessment.modelProfile,
            inference: initialAssessment.inference,
            probe: {
              status: "error" as const,
              kind: "adapter-smoke" as const,
              cache: "miss" as const,
              note: error instanceof Error ? error.message : "Probe failed unexpectedly.",
            },
            verdict: initialAssessment.verdict,
          },
        }))
      }
      throw error
    }

    if (probeResult.aborted) {
      throw new DOMException("Probe aborted", "AbortError")
    }

    const outcome: ProbeOutcome = {
      passed: probeResult.passed,
      features: probeResult.features,
      note: probeResult.note,
    }
    setProbeCacheEntry(cacheKey, outcome)

    return finalizeProbeOutcome(initialAssessment, outcome, "miss")
  }

  async function ensureEnablementAssessment(): Promise<EnablementAssessment> {
    assertNotDisposed()

    if (assessment) {
      return assessment
    }

    if (assessmentPromise) {
      return assessmentPromise
    }

    store.set((prev) => {
      if (prev.enablement.status === "assessing") return prev
      return {
        ...prev,
        enablement: {
          ...prev.enablement,
          status: "assessing",
        },
      }
    })

    const nextAssessment = getOrCreateEnablementAssessment(config?.engine, capabilities)
      .then(async (result) => {
        if (disposed) return result

        const resolvedConfig = resolveRuntimePreferences(config?.engine)
        const probeMode = resolvedConfig.enablement.probe

        if (result.verdict.outcome === "needs-probe" && probeMode === "if-needed") {
          return runProbeFlow(result)
        }

        assessment = result
        store.set((prev) => ({
          ...prev,
          enablement: {
            status: "ready",
            modelProfile: result.modelProfile,
            inference: result.inference,
            probe: NOT_RUN_PROBE_SUMMARY,
            verdict: result.verdict,
          },
        }))
        return result
      })
      .catch((error) => {
        if (!disposed) {
          store.set((prev) => ({
            ...prev,
            enablement: {
              ...createIdleEnablementState(),
              status: "error",
              verdict: {
                outcome: "unknown",
                resolvedDevice: null,
                reason: error instanceof Error ? error.message : "Enablement assessment failed.",
              },
            },
          }))
        }
        throw error
      })
      .finally(() => {
        assessmentPromise = null
      })

    assessmentPromise = nextAssessment
    return nextAssessment
  }

  function buildDomTranslator(rootOverride?: ParentNode | Document): DOMTranslator | null {
    if (!config?.dom) return null
    const { root: _configRoot, ...domConfig } = config.dom
    return createDOMTranslator({
      ...domConfig,
      root: rootOverride ?? defaultRoot,
      translate: (text, lang) => requireLoadedEngine().translate(text, lang),
    })
  }

  const domTranslator: DOMTranslator | null = buildDomTranslator()

  function getDomTranslator(rootOverride?: ParentNode | Document): DOMTranslator | null {
    if (!config?.dom) return null
    if (rootOverride && rootOverride !== defaultRoot) return buildDomTranslator(rootOverride)
    return domTranslator
  }

  async function loadModel(opts?: { signal?: AbortSignal }): Promise<void> {
    assertNotDisposed()
    const nextAssessment = await raceWithAbort(ensureEnablementAssessment(), opts?.signal)
    if (!nextAssessment.runtimePlan) {
      throw new Error(nextAssessment.verdict.reason)
    }

    const handle = attachEngineHandle(nextAssessment.runtimePlan)
    await raceWithAbort(handle.engine.load(), opts?.signal)
  }

  async function translateTo(lang: string, opts?: TranslateOptions): Promise<void> {
    assertNotDisposed()

    if (lang === "restore") {
      throw new Error(
        "Unknown language code: restore. Use core.restore() to restore the original DOM.",
      )
    }

    const run = progress.startRun()
    const externalSignal = opts?.signal
    const removeExternalAbortListener = externalSignal
      ? addAbortListener(externalSignal, () => {
          if (run.isCurrent()) progress.abortCurrent()
        })
      : null

    setTranslationStarted(lang)

    function resetTranslationIfCurrentRun(): void {
      if (!run.isCurrent()) return
      setTranslationIdle()
    }

    try {
      run.signal.throwIfAborted()

      const translator = getDomTranslator(opts?.root)
      if (translator) {
        const translatePromise = translator.translate(lang)
        const removeRunAbortListener = addAbortListener(run.signal, () => translator.abort())
        try {
          await translatePromise
        } finally {
          removeRunAbortListener()
        }
      }

      run.signal.throwIfAborted()
    } finally {
      removeExternalAbortListener?.()
      resetTranslationIfCurrentRun()
    }
  }

  async function translateText(
    text: string,
    lang: string,
    opts?: { signal?: AbortSignal },
  ): Promise<string> {
    assertNotDisposed()
    return raceWithAbort(requireLoadedEngine().translate(text, lang), opts?.signal)
  }

  function restore(opts?: { root?: ParentNode | Document }): void {
    if (disposed) return

    progress.abortCurrent()

    const translator = getDomTranslator(opts?.root)
    if (translator) translator.restore()

    restoreTranslationState()
  }

  function abort(): void {
    if (disposed) return
    progress.abortCurrent()
    if (domTranslator) domTranslator.abort()
    setTranslationIdle()
  }

  async function dispose(): Promise<void> {
    if (disposed) return
    disposed = true
    progress.dispose()
    unsubStatus?.()
    unsubProgress?.()
    store.dispose()
  }

  const core: BabulfishCore = {
    get snapshot() { return store.get() },
    subscribe: (listener) => store.subscribe(listener),
    loadModel,
    translateTo,
    translateText,
    restore,
    abort,
    dispose,
    languages,
  }

  return core
}
