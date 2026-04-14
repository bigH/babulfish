// TODO(T-3b): re-export ./core once implemented

export {
  createEngine,
} from "./engine/index.js"
export type {
  EngineConfig,
  Translator,
  TranslatorEvents,
  TranslatorStatus,
  DevicePreference,
  ResolvedDevice,
  TranslationCapabilities,
} from "./engine/index.js"
export {
  getTranslationCapabilities,
} from "./engine/index.js"

export {
  createDOMTranslator,
  renderInlineMarkdownToHtml,
  parseInlineMarkdown,
  isWellFormedMarkdown,
} from "./dom/index.js"
export type {
  DOMTranslatorConfig,
  DOMTranslator,
  RichTextConfig,
  LinkedConfig,
  PreserveMatcher,
} from "./dom/index.js"
