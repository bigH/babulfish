// Convenience factory: creates an engine + DOM translator pair, wired together.
// This is the non-React equivalent of TranslatorProvider.

import { createEngine } from "./engine/index.js"
import { createDOMTranslator } from "./dom/index.js"
import type { EngineConfig, Translator } from "./engine/index.js"
import type { DOMTranslator, DOMTranslatorConfig } from "./dom/index.js"

export type CreateTranslatorConfig = {
  readonly engine?: EngineConfig
  readonly dom: Omit<DOMTranslatorConfig, "translate">
}

export type TranslatorPair = {
  readonly engine: Translator
  readonly dom: DOMTranslator
}

export function createTranslator(config: CreateTranslatorConfig): TranslatorPair {
  const engine = createEngine(config.engine)
  const dom = createDOMTranslator({
    ...config.dom,
    translate: (text, lang) => engine.translate(text, lang),
  })
  return { engine, dom }
}
