import { createBabulfish, type BabulfishConfig, type BabulfishCore } from "@babulfish/core"

import {
  resolveDemoRuntimeSelectionFromSearchParams,
  toEngineSelection,
  type DemoRuntimeSelection,
  type ResolvedDemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"

export const STRUCTURED_SOURCE = [
  "Structured text keeps inline emphasis, links, and line breaks",
  "while code stays opaque.",
].join("\n")

export const STRUCTURED_DOM_SUFFIX = " [dom-structured]"

export const DEMO_ROOTS = [
  { label: "copy", selector: "[data-demo-copy]" },
  { label: "aside", selector: "[data-demo-aside]" },
] as const

export const DEMO_DOM_CONFIG = {
  roots: DEMO_ROOTS.map(({ selector }) => selector),
  structuredText: { selector: "[data-structured]" },
  preserve: {
    matchers: ["babulfish", "TranslateGemma", "WebGPU"],
  },
  shouldSkip: (text, defaultSkip) => defaultSkip(text) || text.startsWith("SKU-"),
  outputTransform: (translated, context) =>
    context.kind === "structuredText"
      ? `${translated}${STRUCTURED_DOM_SUFFIX}`
      : translated,
} satisfies NonNullable<BabulfishConfig["dom"]>

export type DemoCoreFactory = (config: BabulfishConfig) => BabulfishCore

export function createRuntimeStateFromSearchParams(
  searchParams: URLSearchParams,
): ResolvedDemoRuntimeSelection {
  return resolveDemoRuntimeSelectionFromSearchParams(searchParams)
}

export function createVanillaDemoCore(
  selection: DemoRuntimeSelection,
  createCore: DemoCoreFactory = createBabulfish,
): BabulfishCore {
  return createCore({
    engine: toEngineSelection(selection),
    dom: DEMO_DOM_CONFIG,
  })
}

export function bootstrapVanillaDemoRuntime(
  searchParams: URLSearchParams,
  createCore: DemoCoreFactory = createBabulfish,
): {
  readonly runtimeState: ResolvedDemoRuntimeSelection
  readonly core: BabulfishCore
} {
  const runtimeState = createRuntimeStateFromSearchParams(searchParams)

  return {
    runtimeState,
    core: createVanillaDemoCore(runtimeState.selection, createCore),
  }
}

export function getLoadModeLabel(autoload: boolean): string {
  return autoload ? "Autoload" : "Manual load"
}
