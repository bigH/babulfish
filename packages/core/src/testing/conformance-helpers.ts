function makeGeneratedText(translation: string) {
  return [
    { generated_text: [{ role: "assistant", content: translation }] },
  ] as const
}

export type ConformancePipeline = {
  (): Promise<ReturnType<typeof makeGeneratedText>>
  dispose: () => Promise<void>
}

export function makeFakePipeline(translation = "translated"): ConformancePipeline {
  const generate: ConformancePipeline = async () => makeGeneratedText(translation)
  return Object.assign(generate, { dispose: async () => {} })
}

export function makeControllablePipeline(translation = "translated"): {
  readonly pipeline: ConformancePipeline
  waitForStart: () => Promise<void>
  release: () => void
} {
  const barriers: Array<() => void> = []
  let resolveStart = () => {}
  let released = false
  const started = new Promise<void>((resolve) => {
    resolveStart = resolve
  })
  const generate = async () => {
    resolveStart()
    if (!released) {
      await new Promise<void>((resolve) => barriers.push(resolve))
    }
    return makeGeneratedText(translation)
  }
  const pipeline = Object.assign(generate, { dispose: async () => {} }) as ConformancePipeline

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
