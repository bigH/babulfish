import { createBabulfish, type BabulfishConfig, type BabulfishCore } from "@babulfish/core"

import type { DemoRuntimeSelection } from "../../demo-shared/src/runtime-selection.js"

export const STRUCTURED_SOURCE = [
  "Structured text keeps inline emphasis, links, and line breaks",
  "while code stays opaque.",
].join("\n")

export const DEMO_ROOTS = [
  { label: "copy", selector: "[data-demo-copy]" },
  { label: "aside", selector: "[data-demo-aside]" },
] as const

const DEMO_ROOT_SELECTORS = DEMO_ROOTS.map(({ selector }) => selector)
const STRUCTURED_TEXT_SELECTOR = "[data-structured]"
const PRESERVED_TEXT_MATCHERS = ["babulfish", "TranslateGemma", "WebGPU"]
const STRUCTURED_TEXT_SUFFIX = " [dom-structured]"

function shouldSkipDemoText(text: string, defaultSkip: (text: string) => boolean): boolean {
  return defaultSkip(text) || text.startsWith("SKU-")
}

function transformDemoOutput(
  translated: string,
  context: { kind: "structuredText" | string },
): string {
  return context.kind === "structuredText"
    ? `${translated}${STRUCTURED_TEXT_SUFFIX}`
    : translated
}

const DEMO_DOM_CONFIG = {
  roots: DEMO_ROOT_SELECTORS,
  structuredText: { selector: STRUCTURED_TEXT_SELECTOR },
  preserve: {
    matchers: PRESERVED_TEXT_MATCHERS,
  },
  shouldSkip: shouldSkipDemoText,
  outputTransform: transformDemoOutput,
} satisfies NonNullable<BabulfishConfig["dom"]>

export function createVanillaDemoCore(selection: DemoRuntimeSelection): BabulfishCore {
  return createBabulfish({
    engine: selection,
    dom: DEMO_DOM_CONFIG,
  })
}
