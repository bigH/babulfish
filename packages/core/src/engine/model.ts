// Model lifecycle: load pipeline, translate text, emit events

import type { TextGenerationPipeline, ProgressInfo } from "./pipeline-loader.js"
import { loadPipeline } from "./pipeline-loader.js"
import { getTranslationCapabilities } from "./detect.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EngineConfig = {
  readonly modelId?: string
  readonly dtype?: "q4" | "q8" | "fp16" | "fp32"
  readonly device?: "auto" | "webgpu" | "wasm"
  readonly maxNewTokens?: number
  readonly sourceLanguage?: string
}

export type TranslatorStatus = "idle" | "downloading" | "ready" | "error"

export type TranslatorEvents = {
  "status-change": { from: TranslatorStatus; to: TranslatorStatus; error?: unknown }
  "progress": { loaded: number; total: number; name?: string }
}

export type Translator = {
  load(): Promise<void>
  translate(text: string, targetLang: string): Promise<string>
  dispose(): void
  on<K extends keyof TranslatorEvents>(
    event: K,
    handler: (data: TranslatorEvents[K]) => void,
  ): () => void
  readonly status: TranslatorStatus
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MODEL_ID = "onnx-community/translategemma-text-4b-it-ONNX"
const DEFAULT_DTYPE = "q4" as const
const DEFAULT_DEVICE = "auto" as const
const DEFAULT_MAX_NEW_TOKENS = 512
const DEFAULT_SOURCE_LANGUAGE = "en"

// ---------------------------------------------------------------------------
// Event emitter (minimal, typed)
// ---------------------------------------------------------------------------

type Listeners = {
  [K in keyof TranslatorEvents]: Set<(data: TranslatorEvents[K]) => void>
}

function createListeners(): Listeners {
  return {
    "status-change": new Set(),
    "progress": new Set(),
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEngine(config?: EngineConfig): Translator {
  const modelId = config?.modelId ?? DEFAULT_MODEL_ID
  const dtype = config?.dtype ?? DEFAULT_DTYPE
  const device = config?.device ?? DEFAULT_DEVICE
  const maxNewTokens = config?.maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS
  const sourceLanguage = config?.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE

  let currentStatus: TranslatorStatus = "idle"
  let pipelinePromise: Promise<TextGenerationPipeline> | null = null
  let loadPromise: Promise<void> | null = null
  let lifecycleVersion = 0
  const listeners = createListeners()

  // -- Helpers --------------------------------------------------------------

  function emit<K extends keyof TranslatorEvents>(
    event: K,
    data: TranslatorEvents[K],
  ): void {
    for (const handler of listeners[event]) {
      handler(data)
    }
  }

  function transition(to: TranslatorStatus, error?: unknown): void {
    const from = currentStatus
    if (from === to) return
    currentStatus = to
    emit("status-change", error !== undefined ? { from, to, error } : { from, to })
  }

  function buildProgressCallback(): (event: ProgressInfo) => void {
    const loaded = new Map<string, number>()
    const totals = new Map<string, number>()
    let hasAggregateProgress = false

    return (event: ProgressInfo) => {
      if (event.status === "progress_total") {
        hasAggregateProgress = true
        emit("progress", {
          loaded: event.loaded,
          total: event.total,
          name: event.name,
        })
        return
      }

      if (event.status !== "progress" || hasAggregateProgress) return
      loaded.set(event.file, event.loaded)
      totals.set(event.file, event.total)

      let loadedSum = 0
      let totalSum = 0
      loaded.forEach((bytes) => { loadedSum += bytes })
      totals.forEach((bytes) => { totalSum += bytes })

      emit("progress", {
        loaded: loadedSum,
        total: totalSum,
        name: event.file,
      })
    }
  }

  // -- Public API -----------------------------------------------------------

  async function load(): Promise<void> {
    if (loadPromise) {
      await loadPromise
      return
    }

    transition("downloading")
    const version = lifecycleVersion

    loadPromise = (async () => {
      const resolvedDevice = getTranslationCapabilities(device).device

      pipelinePromise = loadPipeline(modelId, {
        dtype,
        device: resolvedDevice,
        progress_callback: buildProgressCallback(),
      })

      await pipelinePromise
    })()

    try {
      await loadPromise
      if (lifecycleVersion === version) transition("ready")
    } catch (err) {
      if (lifecycleVersion === version) {
        pipelinePromise = null
        loadPromise = null
        transition("error", err)
      }
      throw err
    }
  }

  async function translate(text: string, targetLang: string): Promise<string> {
    if (!pipelinePromise) {
      throw new Error(
        "Translation model not loaded. Call load() first.",
      )
    }

    const generator = await pipelinePromise

    const messages = [
      {
        role: "user" as const,
        content: [
          {
            type: "text",
            source_lang_code: sourceLanguage,
            target_lang_code: targetLang,
            text,
          },
        ],
      },
    ]

    const result = await generator(messages, { max_new_tokens: maxNewTokens })
    const firstResult = result[0]
    const lastMessage = firstResult?.generated_text.at(-1)

    if (!lastMessage || typeof lastMessage.content !== "string") {
      throw new Error("Unexpected model output format")
    }

    return lastMessage.content
  }

  function dispose(): void {
    lifecycleVersion += 1

    // Release GPU/WASM resources held by the pipeline. The resolved
    // pipeline exposes a dispose() method that frees ONNX sessions
    // and WebGPU buffers. Fire-and-forget: we don't need to await.
    const pending = pipelinePromise
    if (pending) {
      pending.then((p) => {
        if (typeof p?.dispose === "function") p.dispose()
      }).catch(() => { /* already handled during load */ })
    }

    pipelinePromise = null
    loadPromise = null
    transition("idle")
  }

  function on<K extends keyof TranslatorEvents>(
    event: K,
    handler: (data: TranslatorEvents[K]) => void,
  ): () => void {
    listeners[event].add(handler)
    return () => { listeners[event].delete(handler) }
  }

  return {
    load,
    translate,
    dispose,
    on,
    get status() {
      return currentStatus
    },
  }
}
