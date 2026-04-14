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
import { createEngine } from "./engine/index.js"
import * as domBarrel from "./dom/index.js"
import * as barrel from "./index.js"

describe("smoke tests", () => {
  it("creates an engine with correct initial state", () => {
    const engine = createEngine()
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
    expect(barrel.createEngine).toBe(createEngine)
    expect(barrel.createDOMTranslator).toBe(createDOMTranslatorDirect)
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
