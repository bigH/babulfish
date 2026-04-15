import { describe, expect, expectTypeOf, it } from "vitest"
import { createBabulfish } from "./core/babulfish.js"
import { DEFAULT_LANGUAGES } from "./core/languages.js"
import * as domBarrel from "./dom/index.js"
import * as markdown from "./dom/markdown.js"
import * as domTranslator from "./dom/translator.js"
import * as engineBarrel from "./engine/index.js"
import * as detect from "./engine/detect.js"
import * as engineModel from "./engine/model.js"
import * as testingBarrel from "./testing/index.js"
import * as testingScenarios from "./testing/scenarios.js"
import * as directDriver from "./testing/drivers/direct.js"
import * as vanillaDomDriver from "./testing/drivers/vanilla-dom.js"
import * as barrel from "./index.js"

function expectValueReExports(
  actualModule: Record<string, unknown>,
  expectedExports: Record<string, unknown>,
): void {
  for (const [name, expectedValue] of Object.entries(expectedExports)) {
    expect(Object.hasOwn(actualModule, name)).toBe(true)
    expect(actualModule[name]).toBe(expectedValue)
  }
}

function expectMissingExports(moduleExports: Record<string, unknown>, names: readonly string[]): void {
  for (const name of names) {
    expect(Object.hasOwn(moduleExports, name)).toBe(false)
  }
}

describe("smoke tests", () => {
  it("creates an engine with correct initial state", () => {
    const engine = engineModel.createEngine()
    expect(engine).toBeDefined()
    expect(engine.status).toBe("idle")
    expect(typeof engine.load).toBe("function")
    expect(typeof engine.translate).toBe("function")
    expect(typeof engine.dispose).toBe("function")
    expect(typeof engine.on).toBe("function")
  })

  it("creates a DOM translator", () => {
    const translator = domTranslator.createDOMTranslator({
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
    expectValueReExports(barrel, {
      createBabulfish,
      DEFAULT_LANGUAGES,
      createEngine: engineBarrel.createEngine,
      getTranslationCapabilities: engineBarrel.getTranslationCapabilities,
      createDOMTranslator: domBarrel.createDOMTranslator,
      renderInlineMarkdownToHtml: domBarrel.renderInlineMarkdownToHtml,
      parseInlineMarkdown: domBarrel.parseInlineMarkdown,
      isWellFormedMarkdown: domBarrel.isWellFormedMarkdown,
    })

    expectTypeOf<engineModel.EngineConfig>().toEqualTypeOf<barrel.EngineConfig>()
    expectTypeOf<engineModel.Translator>().toEqualTypeOf<barrel.Translator>()
    expectTypeOf<engineModel.TranslatorEvents>().toEqualTypeOf<barrel.TranslatorEvents>()
    expectTypeOf<engineModel.TranslatorStatus>().toEqualTypeOf<barrel.TranslatorStatus>()
    expectTypeOf<detect.DevicePreference>().toEqualTypeOf<barrel.DevicePreference>()
    expectTypeOf<detect.ResolvedDevice>().toEqualTypeOf<barrel.ResolvedDevice>()
    expectTypeOf<detect.TranslationCapabilities>().toEqualTypeOf<barrel.TranslationCapabilities>()
    expectTypeOf<domTranslator.DOMTranslatorConfig>().toEqualTypeOf<barrel.DOMTranslatorConfig>()
    expectTypeOf<domTranslator.DOMTranslator>().toEqualTypeOf<barrel.DOMTranslator>()
    expectTypeOf<domTranslator.RichTextConfig>().toEqualTypeOf<barrel.RichTextConfig>()
    expectTypeOf<domTranslator.LinkedConfig>().toEqualTypeOf<barrel.LinkedConfig>()
    expectTypeOf<domBarrel.PreserveMatcher>().toEqualTypeOf<barrel.PreserveMatcher>()
  })

  it("engine barrel re-exports the public engine surface without detection internals", () => {
    expectValueReExports(engineBarrel, {
      createEngine: engineModel.createEngine,
      getTranslationCapabilities: detect.getTranslationCapabilities,
    })
    expectMissingExports(engineBarrel, ["isWebGPUAvailable", "isMobileDevice", "resolveDevice"])

    expectTypeOf<typeof engineBarrel>().toMatchTypeOf<{
      createEngine: typeof engineModel.createEngine
      getTranslationCapabilities: typeof detect.getTranslationCapabilities
    }>()

    expectTypeOf<engineModel.EngineConfig>().toEqualTypeOf<engineBarrel.EngineConfig>()
    expectTypeOf<engineModel.Translator>().toEqualTypeOf<engineBarrel.Translator>()
    expectTypeOf<engineModel.TranslatorEvents>().toEqualTypeOf<engineBarrel.TranslatorEvents>()
    expectTypeOf<engineModel.TranslatorStatus>().toEqualTypeOf<engineBarrel.TranslatorStatus>()
    expectTypeOf<detect.DevicePreference>().toEqualTypeOf<engineBarrel.DevicePreference>()
    expectTypeOf<detect.ResolvedDevice>().toEqualTypeOf<engineBarrel.ResolvedDevice>()
    expectTypeOf<detect.TranslationCapabilities>().toEqualTypeOf<engineBarrel.TranslationCapabilities>()
  })

  it("dom barrel re-exports the public DOM surface", () => {
    expectValueReExports(domBarrel, {
      createDOMTranslator: domTranslator.createDOMTranslator,
      renderInlineMarkdownToHtml: markdown.renderInlineMarkdownToHtml,
      parseInlineMarkdown: markdown.parseInlineMarkdown,
      isWellFormedMarkdown: markdown.isWellFormedMarkdown,
    })

    expectTypeOf<typeof domBarrel>().toMatchTypeOf<{
      createDOMTranslator: typeof domTranslator.createDOMTranslator
      renderInlineMarkdownToHtml: typeof markdown.renderInlineMarkdownToHtml
      parseInlineMarkdown: typeof markdown.parseInlineMarkdown
      isWellFormedMarkdown: typeof markdown.isWellFormedMarkdown
    }>()

    expectTypeOf<domTranslator.DOMTranslatorConfig>().toEqualTypeOf<domBarrel.DOMTranslatorConfig>()
    expectTypeOf<domTranslator.DOMTranslator>().toEqualTypeOf<domBarrel.DOMTranslator>()
    expectTypeOf<domTranslator.RichTextConfig>().toEqualTypeOf<domBarrel.RichTextConfig>()
    expectTypeOf<domTranslator.LinkedConfig>().toEqualTypeOf<domBarrel.LinkedConfig>()
    expectTypeOf<barrel.PreserveMatcher>().toEqualTypeOf<domBarrel.PreserveMatcher>()
  })

  it("testing barrel re-exports the public conformance surface with truthful driver types", () => {
    expectValueReExports(testingBarrel, {
      scenarios: testingScenarios.scenarios,
      scenariosForDriver: testingScenarios.scenariosForDriver,
      createDirectDriver: directDriver.createDirectDriver,
      createVanillaDomDriver: vanillaDomDriver.createVanillaDomDriver,
    })

    const direct = testingBarrel.createDirectDriver()
    const vanilla = testingBarrel.createVanillaDomDriver()

    expectTypeOf(direct.supportsDOM).toEqualTypeOf<false>()
    expectTypeOf(vanilla.supportsDOM).toEqualTypeOf<true>()
    expectTypeOf(vanilla.root).toEqualTypeOf<ParentNode | Document>()

    expect(testingBarrel.scenariosForDriver(direct).length).toBeLessThan(
      testingBarrel.scenarios.length,
    )
    expect(testingBarrel.scenariosForDriver(vanilla)).toHaveLength(
      testingBarrel.scenarios.length,
    )
  })
})
