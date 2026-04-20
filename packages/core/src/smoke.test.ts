import { describe, expect, expectTypeOf, it } from "vitest"
import type {
  BabulfishConfig,
  BabulfishCore,
  BabulfishEngineConfig,
  TranslateOptions,
} from "./core/babulfish.js"
import type { Capabilities, CapabilityObservation } from "./core/capabilities.js"
import { createBabulfish } from "./core/babulfish.js"
import { DEFAULT_LANGUAGES } from "./core/languages.js"
import type { Language } from "./core/languages.js"
import type { ModelState, Snapshot, TranslationState } from "./core/store.js"
import * as domBarrel from "./dom/index.js"
import * as markdown from "./dom/markdown.js"
import * as domTranslator from "./dom/translator.js"
import * as engineBarrel from "./engine/index.js"
import * as detect from "./engine/detect.js"
import * as engineModel from "./engine/model.js"
import type {
  EnablementCompat,
  EnablementConfig,
  EnablementState,
  EnablementVerdict,
  FitInference,
  ModelProfile,
  ModelProfileInput,
  ProbeMode,
  ProbeSummary,
  ResolvedRuntimePlan,
} from "./engine/runtime-plan.js"
import * as runtimePlan from "./engine/runtime-plan.js"
import * as testingBarrel from "./testing/index.js"
import * as testingScenarios from "./testing/scenarios.js"
import * as directDriver from "./testing/drivers/direct.js"
import * as vanillaDomDriver from "./testing/drivers/vanilla-dom.js"
import * as barrel from "./index.js"

const EXPECTED_ROOT_RUNTIME_EXPORTS = [
  "DEFAULT_LANGUAGES",
  "IDLE_ENABLEMENT_STATE",
  "NOT_RUN_PROBE_SUMMARY",
  "createBabulfish",
  "createDOMTranslator",
  "createEnablementCompat",
  "createEngine",
  "getTranslationCapabilities",
  "isWellFormedMarkdown",
  "parseInlineMarkdown",
  "renderInlineMarkdownToHtml",
] as const

const EXPECTED_DOM_RUNTIME_EXPORTS = [
  "createDOMTranslator",
  "isWellFormedMarkdown",
  "parseInlineMarkdown",
  "renderInlineMarkdownToHtml",
] as const

const EXPECTED_ENGINE_RUNTIME_EXPORTS = [
  "createEngine",
  "getTranslationCapabilities",
] as const

type ExpectedStructuredTextConfig = {
  readonly selector: string
}

type ExpectedDOMOutputTransformContext = {
  readonly kind: "linked" | "richText" | "structuredText" | "text" | "attr"
  readonly targetLang: string
  readonly source: string
  readonly attribute?: string
}

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
    expect(Object.keys(barrel).toSorted()).toEqual(EXPECTED_ROOT_RUNTIME_EXPORTS)

    expectValueReExports(barrel, {
      createBabulfish,
      DEFAULT_LANGUAGES,
      createEngine: engineBarrel.createEngine,
      getTranslationCapabilities: engineBarrel.getTranslationCapabilities,
      createDOMTranslator: domBarrel.createDOMTranslator,
      renderInlineMarkdownToHtml: domBarrel.renderInlineMarkdownToHtml,
      parseInlineMarkdown: domBarrel.parseInlineMarkdown,
      isWellFormedMarkdown: domBarrel.isWellFormedMarkdown,
      IDLE_ENABLEMENT_STATE: runtimePlan.IDLE_ENABLEMENT_STATE,
      NOT_RUN_PROBE_SUMMARY: runtimePlan.NOT_RUN_PROBE_SUMMARY,
      createEnablementCompat: runtimePlan.createEnablementCompat,
    })

    expectTypeOf<engineModel.EngineConfig>().toEqualTypeOf<barrel.EngineConfig>()
    expectTypeOf<engineModel.Translator>().toEqualTypeOf<barrel.Translator>()
    expectTypeOf<engineModel.TranslatorEvents>().toEqualTypeOf<barrel.TranslatorEvents>()
    expectTypeOf<engineModel.TranslatorStatus>().toEqualTypeOf<barrel.TranslatorStatus>()
    expectTypeOf<BabulfishCore>().toEqualTypeOf<barrel.BabulfishCore>()
    expectTypeOf<BabulfishConfig>().toEqualTypeOf<barrel.BabulfishConfig>()
    expectTypeOf<BabulfishEngineConfig>().toEqualTypeOf<barrel.BabulfishEngineConfig>()
    expectTypeOf<TranslateOptions>().toEqualTypeOf<barrel.TranslateOptions>()
    expectTypeOf<Capabilities>().toEqualTypeOf<barrel.Capabilities>()
    expectTypeOf<CapabilityObservation>().toEqualTypeOf<barrel.CapabilityObservation>()
    expectTypeOf<Language>().toEqualTypeOf<barrel.Language>()
    expectTypeOf<Snapshot>().toEqualTypeOf<barrel.Snapshot>()
    expectTypeOf<ModelState>().toEqualTypeOf<barrel.ModelState>()
    expectTypeOf<TranslationState>().toEqualTypeOf<barrel.TranslationState>()
    expectTypeOf<detect.DevicePreference>().toEqualTypeOf<barrel.DevicePreference>()
    expectTypeOf<detect.ResolvedDevice>().toEqualTypeOf<barrel.ResolvedDevice>()
    expectTypeOf<detect.TranslationCapabilities>().toEqualTypeOf<barrel.TranslationCapabilities>()
    expectTypeOf<EnablementCompat>().toEqualTypeOf<barrel.EnablementCompat>()
    expectTypeOf<EnablementConfig>().toEqualTypeOf<barrel.EnablementConfig>()
    expectTypeOf<EnablementState>().toEqualTypeOf<barrel.EnablementState>()
    expectTypeOf<EnablementVerdict>().toEqualTypeOf<barrel.EnablementVerdict>()
    expectTypeOf<FitInference>().toEqualTypeOf<barrel.FitInference>()
    expectTypeOf<ModelProfile>().toEqualTypeOf<barrel.ModelProfile>()
    expectTypeOf<ModelProfileInput>().toEqualTypeOf<barrel.ModelProfileInput>()
    expectTypeOf<ProbeMode>().toEqualTypeOf<barrel.ProbeMode>()
    expectTypeOf<ProbeSummary>().toEqualTypeOf<barrel.ProbeSummary>()
    expectTypeOf<ResolvedRuntimePlan>().toEqualTypeOf<barrel.ResolvedRuntimePlan>()
    expectTypeOf<domTranslator.DOMTranslatorConfig>().toEqualTypeOf<barrel.DOMTranslatorConfig>()
    expectTypeOf<domTranslator.DOMTranslator>().toEqualTypeOf<barrel.DOMTranslator>()
    expectTypeOf<domTranslator.RichTextConfig>().toEqualTypeOf<barrel.RichTextConfig>()
    expectTypeOf<domTranslator.LinkedConfig>().toEqualTypeOf<barrel.LinkedConfig>()
    expectTypeOf<barrel.StructuredTextConfig>().toEqualTypeOf<ExpectedStructuredTextConfig>()
    expectTypeOf<barrel.DOMOutputTransformContext>()
      .toEqualTypeOf<ExpectedDOMOutputTransformContext>()
    expectTypeOf<domTranslator.StructuredTextConfig>().toEqualTypeOf<barrel.StructuredTextConfig>()
    expectTypeOf<domTranslator.DOMOutputTransformContext>()
      .toEqualTypeOf<barrel.DOMOutputTransformContext>()
    expectTypeOf<domBarrel.PreserveMatcher>().toEqualTypeOf<barrel.PreserveMatcher>()
  })

  it("engine barrel re-exports the public engine surface without detection internals", () => {
    expect(Object.keys(engineBarrel).toSorted()).toEqual(EXPECTED_ENGINE_RUNTIME_EXPORTS)

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
    expect(Object.keys(domBarrel).toSorted()).toEqual(EXPECTED_DOM_RUNTIME_EXPORTS)

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
    expectTypeOf<domBarrel.StructuredTextConfig>().toEqualTypeOf<ExpectedStructuredTextConfig>()
    expectTypeOf<domBarrel.DOMOutputTransformContext>()
      .toEqualTypeOf<ExpectedDOMOutputTransformContext>()
    expectTypeOf<domTranslator.StructuredTextConfig>()
      .toEqualTypeOf<domBarrel.StructuredTextConfig>()
    expectTypeOf<domTranslator.DOMOutputTransformContext>()
      .toEqualTypeOf<domBarrel.DOMOutputTransformContext>()
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
