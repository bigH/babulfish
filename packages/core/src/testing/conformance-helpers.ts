import type { TextGenerationPipeline } from "../engine/pipeline-loader.js"

// ---------------------------------------------------------------------------
// Test-only pipeline mocks
//
// The real `TextGenerationPipeline` is a class instance whose full shape we
// never need in tests. We fake it with a callable that carries `_call`,
// `task`, `model`, `tokenizer`, and `dispose`. Consumers only exercise the
// callable branch (`pipeline(...)`) and `pipeline.dispose()`.
// ---------------------------------------------------------------------------

type Pipeline = TextGenerationPipeline
type PipelineCall = Pipeline["_call"]
type PipelineModel = Pipeline["model"]
type PipelineTokenizer = Pipeline["tokenizer"]

/** Kept as an alias so existing consumers that reference this name still work. */
export type ConformancePipeline = Pipeline

function makeGeneratedText(translation: string) {
  return [
    { generated_text: [{ role: "assistant", content: translation }] },
  ] as const
}

/**
 * Wrap a generator function as a `TextGenerationPipeline`. The generator is
 * installed as both the callable and `_call`; consumers that spy on either
 * observe every invocation.
 */
export function wrapGeneratorAsPipeline(
  generate: PipelineCall,
  dispose: () => Promise<void> = async () => {},
): Pipeline {
  const fakeModel = {} as PipelineModel
  const fakeTokenizer = {} as PipelineTokenizer
  const callable = (...args: Parameters<PipelineCall>) => generate(...args)
  // Justified cast: TextGenerationPipeline is a class with many internals
  // that tests never touch. The callable + dispose + model/tokenizer stubs
  // cover the surface we actually exercise.
  return Object.assign(callable, {
    _call: generate,
    task: "text-generation" as const,
    model: fakeModel,
    tokenizer: fakeTokenizer,
    dispose,
  }) as unknown as Pipeline
}

export function makeFakePipeline(translation = "translated"): Pipeline {
  const generate = (async () => makeGeneratedText(translation)) as unknown as PipelineCall
  return wrapGeneratorAsPipeline(generate)
}

export function makeControllablePipeline(translation = "translated"): {
  readonly pipeline: Pipeline
  waitForStart: () => Promise<void>
  release: () => void
} {
  const barriers: Array<() => void> = []
  let resolveStart = () => {}
  let released = false
  const started = new Promise<void>((resolve) => {
    resolveStart = resolve
  })
  const generate = (async () => {
    resolveStart()
    if (!released) {
      await new Promise<void>((resolve) => barriers.push(resolve))
    }
    return makeGeneratedText(translation)
  }) as unknown as PipelineCall
  const pipeline = wrapGeneratorAsPipeline(generate)

  return {
    pipeline,
    waitForStart() {
      return started
    },
    release() {
      released = true
      barriers.splice(0).forEach((resolve) => resolve())
    },
  }
}
