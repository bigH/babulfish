export type ConformancePipeline = {
  (): Promise<
    readonly [{ readonly generated_text: readonly [{ readonly role: "assistant"; readonly content: string }] }]
  >
  dispose: () => Promise<void>
}

export function makeFakePipeline(translation = "translated"): ConformancePipeline {
  const generate: ConformancePipeline = async () => [
    { generated_text: [{ role: "assistant", content: translation }] },
  ]
  return Object.assign(generate, { dispose: async () => {} })
}
