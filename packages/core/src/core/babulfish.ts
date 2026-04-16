import type { EngineConfig } from "../engine/model.js"
import type { DOMTranslatorConfig, DOMTranslator } from "../dom/translator.js"
import { createDOMTranslator } from "../dom/translator.js"
import { acquireEngine, registerCoreEngine } from "./engine-handle.js"
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

function cloneLanguages(languages: readonly Language[]): ReadonlyArray<Language> {
  return Object.freeze(languages.map((language) => Object.freeze({ ...language })))
}

export function createBabulfish(config?: BabulfishConfig): BabulfishCore {
  const capabilities = detectCapabilities(config?.engine?.device)
  const store = createStore(capabilities)
  const progress = createProgressController()
  const handle = acquireEngine(config?.engine)
  const engine = handle.engine
  const languages = config?.languages ? cloneLanguages(config.languages) : DEFAULT_LANGUAGES
  const defaultRoot = config?.dom?.root
  let disposed = false

  const unsubStatus = engine.on("status-change", ({ to, error }) => {
    store.set((prev) => {
      let model: ModelState
      switch (to) {
        case "downloading":
          model = {
            status: "downloading" as const,
            progress: prev.model.status === "downloading" ? prev.model.progress : 0,
          }
          break
        case "ready":
          model = { status: "ready" as const }
          break
        case "error":
          model = { status: "error" as const, error }
          break
        default:
          model = { status: "idle" as const }
      }
      return { ...prev, model }
    })
  })

  const unsubProgress = engine.on("progress", ({ loaded, total }) => {
    store.set((prev) => {
      const p = total > 0 ? loaded / total : 0
      if (prev.model.status === "downloading" && prev.model.progress === p) return prev
      return { ...prev, model: { status: "downloading" as const, progress: p } }
    })
  })

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
    await raceWithAbort(engine.load(), opts?.signal)
  }

  async function translateTo(lang: string, opts?: TranslateOptions): Promise<void> {
    if (disposed) throw new Error("Core is disposed")

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

    store.set((prev) => ({
      ...prev,
      translation: { status: "translating" as const, progress: 0 },
      currentLanguage: lang,
    }))

    function resetTranslationIfCurrentRun(): void {
      if (!run.isCurrent()) return
      store.set((prev) => {
        if (prev.translation.status === "idle") return prev
        return {
          ...prev,
          translation: { status: "idle" as const },
        }
      })
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
    if (disposed) throw new Error("Core is disposed")
    return raceWithAbort(engine.translate(text, lang), opts?.signal)
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
        translation: { status: "idle" as const },
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
      return { ...prev, translation: { status: "idle" as const } }
    })
  }

  async function dispose(): Promise<void> {
    if (disposed) return
    disposed = true
    progress.dispose()
    unsubStatus()
    unsubProgress()
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

  registerCoreEngine(core, handle.id)
  return core
}
