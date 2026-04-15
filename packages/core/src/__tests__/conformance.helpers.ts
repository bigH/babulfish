type ConformancePipeline = {
  (): Promise<readonly [{ readonly generated_text: readonly [{ readonly role: "assistant"; readonly content: string }] }]>
  dispose: () => Promise<void>
}

export const DEFAULT_CONFORMANCE_HTML = '<div id="app"><p>Hello world</p></div>'

export function makeFakePipeline(translation = "translated"): ConformancePipeline {
  const generate: ConformancePipeline = async () => [
    { generated_text: [{ role: "assistant", content: translation }] },
  ]
  return Object.assign(generate, { dispose: async () => {} })
}

export function resetConformanceDocument(html: string = DEFAULT_CONFORMANCE_HTML): void {
  document.body.innerHTML = html // eslint-disable-line no-unsanitized/property
}
