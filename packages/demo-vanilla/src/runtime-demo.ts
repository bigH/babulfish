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

const DEMO_DOM_CONFIG = {
  roots: DEMO_ROOTS.map(({ selector }) => selector),
  structuredText: { selector: "[data-structured]" },
  preserve: {
    matchers: ["babulfish", "TranslateGemma", "WebGPU"],
  },
  shouldSkip: (text, defaultSkip) => defaultSkip(text) || text.startsWith("SKU-"),
  outputTransform: (translated, context) =>
    context.kind === "structuredText"
      ? `${translated} [dom-structured]`
      : translated,
} satisfies NonNullable<BabulfishConfig["dom"]>

export function createVanillaDemoCore(selection: DemoRuntimeSelection): BabulfishCore {
  return createBabulfish({
    engine: selection,
    dom: DEMO_DOM_CONFIG,
  })
}
