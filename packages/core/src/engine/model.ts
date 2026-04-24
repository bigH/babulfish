// Model lifecycle: load pipeline, translate text, emit events

import {
  DEFAULT_RESOLVED_DEVICE,
  type ModelDType,
} from "./config.js"
import type { TextGenerationPipeline, ProgressInfo } from "./pipeline-loader.js"
import { loadPipeline } from "./pipeline-loader.js"
import type { ResolvedDevice } from "./detect.js"
import { resolveTranslationModelConfig } from "./model-registry.js"
import type { TranslationModelSelection } from "./model-spec.js"
import type { TranslationOptions, TranslationRequest } from "./translation-adapter.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EngineConfig = {
  readonly model?: TranslationModelSelection
  readonly modelId?: string
  readonly dtype?: ModelDType
  readonly device?: ResolvedDevice
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
  const resolvedConfig = resolveTranslationModelConfig(config)
  const {
    adapter,
    modelId,
    dtype,
    maxNewTokens,
    sourceLanguage,
    subfolder,
    modelFileName,
  } = resolvedConfig
  const device = resolvedConfig.device === "auto"
    ? DEFAULT_RESOLVED_DEVICE
    : resolvedConfig.device

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

  function buildPipelineOptions(): NonNullable<Parameters<typeof loadPipeline>[1]> & {
    readonly subfolder?: string
    readonly model_file_name?: string
  } {
    return {
      dtype,
      device,
      progress_callback: buildProgressCallback(),
      ...(subfolder === null ? {} : { subfolder }),
      ...(modelFileName === null ? {} : { model_file_name: modelFileName }),
    }
  }

  // -- Public API -----------------------------------------------------------

  async function load(): Promise<void> {
    if (loadPromise) {
      await loadPromise
      return
    }

    const version = lifecycleVersion

    const nextLoad = (async () => {
      const nextPipeline = loadPipeline(modelId, {
        ...buildPipelineOptions(),
      })
      pipelinePromise = nextPipeline

      await nextPipeline
    })()
    loadPromise = nextLoad
    transition("downloading")

    try {
      await nextLoad
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

    const request: TranslationRequest = {
      text,
      source: { code: sourceLanguage },
      target: { code: targetLang },
    }
    const options: TranslationOptions = { max_new_tokens: maxNewTokens }
    const { modelInput, modelOptions } = adapter.buildInvocation(request, options)

    const generate = generator as unknown as (
      input: unknown,
      options: unknown,
    ) => Promise<unknown>
    const result = await generate(modelInput, modelOptions)

    return adapter.extractText(request, options, result).text
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
