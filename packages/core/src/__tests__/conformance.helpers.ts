import type { ConformancePipeline } from "../testing/conformance-helpers.js"

export { makeFakePipeline } from "../testing/conformance-helpers.js"

export const DEFAULT_CONFORMANCE_HTML = '<div id="app"><p>Hello world</p></div>'

export function resetConformanceDocument(html: string = DEFAULT_CONFORMANCE_HTML): void {
  document.body.innerHTML = html // eslint-disable-line no-unsanitized/property
}

export type { ConformancePipeline }
