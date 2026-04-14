import { describe, it, expect, expectTypeOf } from "vitest"
import { createBabulfish } from "./core/babulfish.js"
import { DEFAULT_LANGUAGES } from "./core/languages.js"
import {
  createDOMTranslator as createDOMTranslatorDirect,
  type DOMTranslator as DOMTranslatorDirect,
  type DOMTranslatorConfig as DOMTranslatorConfigDirect,
  type LinkedConfig as LinkedConfigDirect,
  type RichTextConfig as RichTextConfigDirect,
} from "./dom/translator.js"
import {
  isWellFormedMarkdown as isWellFormedMarkdownDirect,
  parseInlineMarkdown as parseInlineMarkdownDirect,
  renderInlineMarkdownToHtml as renderInlineMarkdownToHtmlDirect,
} from "./dom/markdown.js"
import type { PreserveMatcher as PreserveMatcherDirect } from "./dom/preserve.js"
import {
  createEngine as createEngineDirect,
  type EngineConfig as EngineConfigDirect,
  type Translator as TranslatorDirect,
  type TranslatorEvents as TranslatorEventsDirect,
  type TranslatorStatus as TranslatorStatusDirect,
} from "./engine/model.js"
import {
  getTranslationCapabilities as getTranslationCapabilitiesDirect,
  type DevicePreference as DevicePreferenceDirect,
  type ResolvedDevice as ResolvedDeviceDirect,
  type TranslationCapabilities as TranslationCapabilitiesDirect,
} from "./engine/detect.js"
import * as domBarrel from "./dom/index.js"
import * as engineBarrel from "./engine/index.js"
import * as barrel from "./index.js"

describe("smoke tests", () => {
  it("creates an engine with correct initial state", () => {
    const engine = createEngineDirect()
    expect(engine).toBeDefined()
    expect(engine.status).toBe("idle")
    expect(typeof engine.load).toBe("function")
    expect(typeof engine.translate).toBe("function")
    expect(typeof engine.dispose).toBe("function")
    expect(typeof engine.on).toBe("function")
  })

  it("creates a DOM translator", () => {
    const translator = createDOMTranslatorDirect({
      translate: async (text) => text,
      roots: ["main"],
    })
    expect(translator).toBeDefined()
    expect(typeof translator.translate).toBe("function")
    expect(typeof translator.restore).toBe("function")
    expect(typeof translator.abort).toBe("function")
    expect(translator.isTranslating).toBe(false)
    expect(translator.currentLang).toBeNull()
  })

  it("barrel re-exports core, engine, and dom", () => {
    expect(barrel.createBabulfish).toBe(createBabulfish)
    expect(barrel.DEFAULT_LANGUAGES).toBe(DEFAULT_LANGUAGES)
    expect(barrel.createEngine).toBe(createEngineDirect)
    expect(barrel.createDOMTranslator).toBe(createDOMTranslatorDirect)
  })

  it("engine barrel re-exports the public engine surface without detection internals", () => {
    expect(engineBarrel.createEngine).toBe(createEngineDirect)
    expect(engineBarrel.getTranslationCapabilities).toBe(getTranslationCapabilitiesDirect)
    expect("isWebGPUAvailable" in engineBarrel).toBe(false)
    expect("isMobileDevice" in engineBarrel).toBe(false)
    expect("resolveDevice" in engineBarrel).toBe(false)

    expectTypeOf<typeof engineBarrel>().toMatchTypeOf<{
      createEngine: typeof createEngineDirect
      getTranslationCapabilities: typeof getTranslationCapabilitiesDirect
    }>()

    expectTypeOf<EngineConfigDirect>().toEqualTypeOf<engineBarrel.EngineConfig>()
    expectTypeOf<TranslatorDirect>().toEqualTypeOf<engineBarrel.Translator>()
    expectTypeOf<TranslatorEventsDirect>().toEqualTypeOf<engineBarrel.TranslatorEvents>()
    expectTypeOf<TranslatorStatusDirect>().toEqualTypeOf<engineBarrel.TranslatorStatus>()
    expectTypeOf<DevicePreferenceDirect>().toEqualTypeOf<engineBarrel.DevicePreference>()
    expectTypeOf<ResolvedDeviceDirect>().toEqualTypeOf<engineBarrel.ResolvedDevice>()
    expectTypeOf<TranslationCapabilitiesDirect>().toEqualTypeOf<engineBarrel.TranslationCapabilities>()
  })

  it("dom barrel re-exports the public DOM surface", () => {
    expect(domBarrel.createDOMTranslator).toBe(createDOMTranslatorDirect)
    expect(domBarrel.renderInlineMarkdownToHtml).toBe(renderInlineMarkdownToHtmlDirect)
    expect(domBarrel.parseInlineMarkdown).toBe(parseInlineMarkdownDirect)
    expect(domBarrel.isWellFormedMarkdown).toBe(isWellFormedMarkdownDirect)

    expectTypeOf<typeof domBarrel>().toMatchTypeOf<{
      createDOMTranslator: typeof createDOMTranslatorDirect
      renderInlineMarkdownToHtml: typeof renderInlineMarkdownToHtmlDirect
      parseInlineMarkdown: typeof parseInlineMarkdownDirect
      isWellFormedMarkdown: typeof isWellFormedMarkdownDirect
    }>()

    expectTypeOf<DOMTranslatorConfigDirect>().toEqualTypeOf<domBarrel.DOMTranslatorConfig>()
    expectTypeOf<DOMTranslatorDirect>().toEqualTypeOf<domBarrel.DOMTranslator>()
    expectTypeOf<RichTextConfigDirect>().toEqualTypeOf<domBarrel.RichTextConfig>()
    expectTypeOf<LinkedConfigDirect>().toEqualTypeOf<domBarrel.LinkedConfig>()
    expectTypeOf<PreserveMatcherDirect>().toEqualTypeOf<domBarrel.PreserveMatcher>()
  })
})
