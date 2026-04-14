import type { EngineConfig } from "../engine/index.js"
import type { DOMTranslatorConfig, DOMTranslator } from "../dom/index.js"
import { createDOMTranslator } from "../dom/index.js"
import { acquireEngine, releaseEngine, registerCoreEngine } from "./engine-handle.js"
import { createStore, type Snapshot } from "./store.js"
import type { ModelState } from "./store.js"
import { createProgressController } from "./progress.js"
import { DEFAULT_LANGUAGES, type Language } from "./languages.js"
import { detectCapabilities } from "./capabilities.js"

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

export type BabulfishConfig = {
  readonly engine?: EngineConfig
  readonly dom?: Omit<DOMTranslatorConfig, "translate" | "root"> & {
    readonly root?: ParentNode | Document
  }
  readonly languages?: readonly Language[]
}

export function createBabulfish(config?: BabulfishConfig): BabulfishCore {
  const store = createStore()
  const progress = createProgressController()
  const handle = acquireEngine(config?.engine)
  const engine = handle.engine
  const languages = config?.languages ?? DEFAULT_LANGUAGES
  const defaultRoot = config?.dom?.root
  let disposed = false

  const unsubStatus = engine.on("status-change", ({ to, error }) => {
    store.set((prev) => {
      let model: ModelState
      switch (to) {
        case "downloading":
          model = Object.freeze({
            status: "downloading" as const,
            progress: prev.model.status === "downloading" ? prev.model.progress : 0,
          })
          break
        case "ready":
          model = Object.freeze({ status: "ready" as const })
          break
        case "error":
          model = Object.freeze({ status: "error" as const, error })
          break
        default:
          model = Object.freeze({ status: "idle" as const })
      }
      return { ...prev, model }
    })
  })

  const unsubProgress = engine.on("progress", ({ loaded, total }) => {
    store.set((prev) => {
      const p = total > 0 ? loaded / total : 0
      if (prev.model.status === "downloading" && prev.model.progress === p) return prev
      return { ...prev, model: Object.freeze({ status: "downloading" as const, progress: p }) }
    })
  })

  const capabilities = detectCapabilities(config?.engine?.device)
  store.set((prev) => ({ ...prev, capabilities }))

  function buildDomTranslator(rootOverride?: ParentNode | Document): DOMTranslator | null {
    if (!config?.dom) return null
    const { root: _configRoot, ...domConfig } = config.dom
    return createDOMTranslator({
      ...domConfig,
      root: rootOverride ?? defaultRoot,
      translate: (text, lang) => engine.translate(text, lang),
    })
  }

  let domTranslator: DOMTranslator | null = null
  if (config?.dom) {
    domTranslator = buildDomTranslator()
  }

  function getDomTranslator(rootOverride?: ParentNode | Document): DOMTranslator | null {
    if (!config?.dom) return null
    if (rootOverride && rootOverride !== defaultRoot) return buildDomTranslator(rootOverride)
    return domTranslator
  }

  async function loadModel(opts?: { signal?: AbortSignal }): Promise<void> {
    if (disposed) throw new Error("Core is disposed")
    const signal = opts?.signal

    const loadPromise = engine.load()

    if (signal) {
      await Promise.race([
        loadPromise,
        new Promise<never>((_, reject) => {
          if (signal.aborted) {
            reject(signal.reason)
            return
          }
          signal.addEventListener("abort", () => reject(signal.reason), { once: true })
        }),
      ])
    } else {
      await loadPromise
    }
  }

  async function translateTo(lang: string, opts?: TranslateOptions): Promise<void> {
    if (disposed) throw new Error("Core is disposed")

    if (lang === "restore") {
      throw new Error(
        "Unknown language code: restore. Use core.restore() to restore the original DOM.",
      )
    }

    const { runId, signal: runSignal } = progress.startRun()
    const externalSignal = opts?.signal

    if (externalSignal) {
      externalSignal.addEventListener("abort", () => {
        if (progress.isCurrentRun(runId)) progress.abortCurrent()
      }, { once: true })
    }

    store.set((prev) => ({
      ...prev,
      translation: Object.freeze({ status: "translating" as const, progress: 0 }),
      currentLanguage: lang,
    }))

    try {
      runSignal.throwIfAborted()

      const translator = getDomTranslator(opts?.root)
      if (translator) {
        const translatePromise = translator.translate(lang)
        runSignal.addEventListener("abort", () => translator.abort(), { once: true })
        await translatePromise
      }

      runSignal.throwIfAborted()

      if (progress.isCurrentRun(runId)) {
        store.set((prev) => ({
          ...prev,
          translation: Object.freeze({ status: "idle" as const }),
        }))
      }
    } catch (err) {
      if (progress.isCurrentRun(runId)) {
        store.set((prev) => ({
          ...prev,
          translation: Object.freeze({ status: "idle" as const }),
        }))
      }
      throw err
    }
  }

  async function translateText(
    text: string,
    lang: string,
    _opts?: { signal?: AbortSignal },
  ): Promise<string> {
    if (disposed) throw new Error("Core is disposed")
    return engine.translate(text, lang)
  }

  function restore(opts?: { root?: ParentNode | Document }): void {
    if (disposed) return

    progress.abortCurrent()

    const translator = getDomTranslator(opts?.root)
    if (translator) translator.restore()

    store.set((prev) => {
      if (prev.translation.status === "idle" && prev.currentLanguage === null) return prev
      return {
        ...prev,
        translation: Object.freeze({ status: "idle" as const }),
        currentLanguage: null,
      }
    })
  }

  function abort(): void {
    if (disposed) return
    progress.abortCurrent()
    if (domTranslator) domTranslator.abort()
    store.set((prev) => {
      if (prev.translation.status === "idle") return prev
      return { ...prev, translation: Object.freeze({ status: "idle" as const }) }
    })
  }

  async function dispose(): Promise<void> {
    if (disposed) return
    disposed = true
    progress.dispose()
    unsubStatus()
    unsubProgress()
    store.dispose()
    releaseEngine(handle)
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

  registerCoreEngine(core, handle.id)
  return core
}
