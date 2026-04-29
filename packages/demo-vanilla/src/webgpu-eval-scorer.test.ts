// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import {
  WEBGPU_EVAL_CORPUS_GLOB_PATTERNS,
  WEBGPU_EVAL_CORPUS,
  chrfSimilarity,
  createWebGpuEvalRunMetadata,
  defaultWebGpuEvalSelection,
  filterWebGpuEvalCorpus,
  isWebGpuEvalModelId,
  loadWebGpuEvalCorpusFromModules,
  scoreReferenceSimilarity,
  scoreWebGpuEvalCleanHeadline,
  scoreWebGpuEvalCase,
  scoreWebGpuEvalGenerationFailure,
  scoreWebGpuEvalModel,
  scoreWebGpuEvalValidationFailure,
  summarizeWebGpuEvalScoreGroups,
  summarizeWebGpuEvalCaseGroups,
  type WebGpuEvalCase,
  type WebGpuEvalCheck,
  type WebGpuEvalProvenance,
  type WebGpuEvalScoreAggregationCase,
} from "./webgpu-eval-scorer.js"

type EvalCaseId = (typeof WEBGPU_EVAL_CORPUS)[number]["id"]

const corpusById = new Map(WEBGPU_EVAL_CORPUS.map((evalCase) => [evalCase.id, evalCase]))
const portedInlineCaseIds = [
  "plain-es",
  "plain-fr",
  "markdown-es",
  "brands-fr",
  "ui-save-es",
  "punctuation-fr",
  "rtl-ar",
  "output-only-es",
] as const

function requireCase(id: EvalCaseId) {
  const evalCase = corpusById.get(id)
  if (!evalCase) throw new Error(`Missing eval case ${id}`)
  return evalCase
}

function countBy<T>(items: readonly T[], keyFor: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = keyFor(item)
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function check(name: string, pass: boolean): WebGpuEvalCheck {
  return {
    name,
    pass,
    expected: pass ? "passes" : "should pass",
    actual: pass ? "passes" : "failed",
  }
}

function privateProvenance(
  overrides: Partial<WebGpuEvalProvenance> = {},
): WebGpuEvalProvenance {
  return {
    sourceClass: "first_party_authored",
    authorId: "team-evals",
    createdAt: "2026-04-28",
    sourceOrigin: "private-ticket BF-123",
    derivedFrom: null,
    publicExposure: "private",
    reviewStatus: "holdout_approved",
    referenceTranslatorId: "translator-es-1",
    referenceReviewerId: "reviewer-es-1",
    referenceReviewDate: "2026-04-28",
    technicalReviewerId: "tech-reviewer-1",
    technicalReviewDate: "2026-04-28",
    notes: "authored for eval coverage",
    ...overrides,
  }
}

function publicProvenance(
  overrides: Partial<WebGpuEvalProvenance> = {},
): WebGpuEvalProvenance {
  return privateProvenance({
    sourceClass: "public_benchmark",
    sourceOrigin: "sentinel-public-benchmark-fixture",
    derivedFrom: "synthetic public-labeled sentinel; not imported from a benchmark",
    publicExposure: "public",
    reviewStatus: "technical_reviewed",
    notes: "contamination warning: public-labeled sentinel for aggregation gates only",
    ...overrides,
  })
}

function syntheticCase(overrides: Partial<WebGpuEvalCase> = {}): WebGpuEvalCase {
  return {
    id: "synthetic",
    split: "dev",
    category: "plain",
    sourceText: "Hello world",
    sourceLanguage: "en",
    targetLanguage: "es",
    contentType: "text",
    references: [{ quality: "primary", text: "Hola mundo" }],
    ...overrides,
  }
}

function translationJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    split: "dev",
    category: "plain",
    sourceLanguage: "en",
    targetLanguage: "es",
    contentType: "text",
    source: { text: "The browser translates this short sentence." },
    references: [{ quality: "primary", text: "El navegador traduce esta breve frase." }],
    checks: { sourceShouldChange: true },
    provenance: privateProvenance({ reviewStatus: "draft" }),
    ...overrides,
  }
}

function scoredCase(
  overrides: Partial<WebGpuEvalScoreAggregationCase> = {},
): WebGpuEvalScoreAggregationCase {
  const pass = overrides.pass ?? true
  return {
    id: "scored",
    split: "dev",
    sourceClass: "first_party_authored",
    category: "plain",
    pass,
    checks: [check("expected-pattern:1", pass)],
    scoreBreakdown: {
      checkScore: pass ? 1 : 0,
      referenceSimilarity: pass ? 1 : 0,
      hardFailure: !pass,
      hardFailureReason: pass ? null : "generation-error",
    },
    ...overrides,
  }
}

describe("webgpu eval scorer", () => {
  it("loads legacy flat cases, grouped dev/holdout-clean cases, and PR 6 calibration-public cases", () => {
    const groupedDevCases = WEBGPU_EVAL_CORPUS.filter((evalCase) =>
      evalCase.id.startsWith("dev/"),
    )
    const groupedHoldoutCleanCases = WEBGPU_EVAL_CORPUS.filter((evalCase) =>
      evalCase.id.startsWith("holdout-clean/"),
    )

    expect(WEBGPU_EVAL_CORPUS).toHaveLength(117)
    expect(corpusById.size).toBe(117)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.split === "dev")).toHaveLength(72)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.split === "holdout")).toHaveLength(15)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.split === "holdout-clean")).toHaveLength(18)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.split === "calibration-public")).toHaveLength(12)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.contentType === "dom")).toHaveLength(32)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.contentType === "markdown")).toHaveLength(30)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.contentType === "text")).toHaveLength(55)
    expect(groupedDevCases).toHaveLength(49)
    expect(groupedDevCases.every((evalCase) => evalCase.provenance)).toBe(true)
    expect(groupedDevCases.every((evalCase) => evalCase.sourceClass !== "public_benchmark"))
      .toBe(true)
    expect(groupedDevCases.every((evalCase) => evalCase.sourceClass !== "public_web"))
      .toBe(true)
    expect(groupedHoldoutCleanCases).toHaveLength(18)
    expect(countBy(groupedHoldoutCleanCases, (evalCase) => evalCase.contentType)).toEqual({
      dom: 6,
      markdown: 6,
      text: 6,
    })
    expect(
      countBy(
        groupedHoldoutCleanCases,
        (evalCase) => `${evalCase.sourceLanguage}-${evalCase.targetLanguage}`,
      ),
    ).toEqual({
      "ar-en": 2,
      "en-ar": 4,
      "en-es": 4,
      "en-fr": 4,
      "es-en": 2,
      "fr-en": 2,
    })
    expect(
      countBy(groupedHoldoutCleanCases, (evalCase) => evalCase.sourceClass ?? "missing"),
    ).toEqual({
      first_party_authored: 8,
      product_derived_rewrite: 5,
      synthetic_template: 5,
    })
    expect(
      groupedHoldoutCleanCases.every(
        (evalCase) =>
          evalCase.provenance?.publicExposure === "private" &&
          evalCase.provenance.reviewStatus === "holdout_approved",
      ),
    ).toBe(true)
    expect(
      groupedHoldoutCleanCases.every(
        (evalCase) =>
          evalCase.sourceClass === "first_party_authored" ||
          evalCase.sourceClass === "product_derived_rewrite" ||
          evalCase.sourceClass === "synthetic_template",
      ),
    ).toBe(true)
  })

  it("includes the grouped path glob without loading the schema as a case", () => {
    expect(WEBGPU_EVAL_CORPUS_GLOB_PATTERNS.grouped).toBe(
      "../../../evals/translation/*/*/*/*/*.json",
    )
    expect(WEBGPU_EVAL_CORPUS_GLOB_PATTERNS.schemaExclusion).toBe(
      "!../../../evals/translation/schema.json",
    )
  })

  it("loads grouped paths with path-derived IDs", () => {
    const cases = loadWebGpuEvalCorpusFromModules({
      "../../../evals/translation/dev/text/plain/en-es/browser-short.json": translationJson(),
    })

    expect(cases).toHaveLength(1)
    expect(cases[0]?.id).toBe("dev/text/plain/en-es/browser-short")
    expect(cases[0]?.split).toBe("dev")
    expect(cases[0]?.category).toBe("plain")
    expect(cases[0]?.sourceLanguage).toBe("en")
    expect(cases[0]?.targetLanguage).toBe("es")
  })

  it.each([
    [
      "split",
      "../../../evals/translation/dev/text/plain/en-es/browser-short.json",
      { split: "holdout" },
      /path split "dev" does not match JSON split "holdout"/,
    ],
    [
      "content type",
      "../../../evals/translation/dev/text/plain/en-es/browser-short.json",
      { contentType: "markdown" },
      /path contentType "text" does not match JSON contentType "markdown"/,
    ],
    [
      "category",
      "../../../evals/translation/dev/text/plain/en-es/browser-short.json",
      { category: "ui-label" },
      /path category "plain" does not match JSON category "ui-label"/,
    ],
    [
      "source language",
      "../../../evals/translation/dev/text/plain/en-es/browser-short.json",
      { sourceLanguage: "fr" },
      /path sourceLanguage "en" does not match JSON sourceLanguage "fr"/,
    ],
    [
      "target language",
      "../../../evals/translation/dev/text/plain/en-es/browser-short.json",
      { targetLanguage: "fr" },
      /path targetLanguage "es" does not match JSON targetLanguage "fr"/,
    ],
  ])("rejects grouped path/JSON %s mismatches clearly", (_name, path, overrides, message) => {
    expect(() =>
      loadWebGpuEvalCorpusFromModules({ [path]: translationJson(overrides) }),
    ).toThrow(message)
  })

  it("rejects duplicate path-derived IDs clearly", () => {
    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/plain-es.json": translationJson(),
        "/tmp/evals/translation/plain-es.json": translationJson(),
      }),
    ).toThrow("Duplicate WebGPU eval case id: plain-es")
  })

  it("rejects unknown top-level and checks keys", () => {
    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/plain-es.json": translationJson({ unexpected: true }),
      }),
    ).toThrow("Eval case plain-es has unknown key: unexpected")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/plain-es.json": translationJson({
          checks: { sourceShouldChange: true, madeUpCheck: true },
        }),
      }),
    ).toThrow("Eval case plain-es checks has unknown key: madeUpCheck")
  })

  it("requires provenance for grouped cases while grandfathering legacy flat files", () => {
    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/dev/text/plain/en-es/browser-short.json": translationJson({
          provenance: undefined,
        }),
      }),
    ).toThrow("Eval case dev/text/plain/en-es/browser-short must define provenance")

    expect(
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/browser-short.json": translationJson({
          provenance: undefined,
        }),
      })[0]?.provenance,
    ).toBeUndefined()
  })

  it("rejects malformed provenance before live evals run", () => {
    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/dev/text/plain/en-es/browser-short.json": translationJson({
          provenance: { ...privateProvenance(), unexpected: true },
        }),
      }),
    ).toThrow("Eval case dev/text/plain/en-es/browser-short provenance has unknown key: unexpected")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/dev/text/plain/en-es/browser-short.json": translationJson({
          provenance: { ...privateProvenance(), sourceClass: "made_up" },
        }),
      }),
    ).toThrow("Eval case dev/text/plain/en-es/browser-short has invalid provenance.sourceClass")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/dev/text/plain/en-es/browser-short.json": translationJson({
          provenance: { ...privateProvenance(), createdAt: "today" },
        }),
      }),
    ).toThrow("Eval case dev/text/plain/en-es/browser-short must define provenance.createdAt as YYYY-MM-DD")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/dev/text/plain/en-es/browser-short.json": translationJson({
          provenance: publicProvenance(),
        }),
      }),
    ).toThrow("provenance sourceClass public_benchmark is only allowed in calibration-public")
  })

  it("enforces holdout-clean private approved provenance", () => {
    const holdoutPath = "../../../evals/translation/holdout-clean/text/plain/en-es/clean-short.json"
    const validHoldoutCases = [
      privateProvenance(),
      privateProvenance({
        sourceClass: "synthetic_template",
        derivedFrom: "template: product CTA with {feature} placeholder",
      }),
      privateProvenance({
        sourceClass: "product_derived_rewrite",
        derivedFrom: "rewritten from private settings screen after 2026-04-28",
      }),
    ]

    for (const provenance of validHoldoutCases) {
      expect(() =>
        loadWebGpuEvalCorpusFromModules({
          [holdoutPath]: translationJson({
            split: "holdout-clean",
            provenance,
          }),
        }),
      ).not.toThrow()
    }

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        [holdoutPath]: translationJson({
          split: "holdout-clean",
          provenance: privateProvenance({ publicExposure: "public" }),
        }),
      }),
    ).toThrow("holdout-clean provenance.publicExposure must be private")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        [holdoutPath]: translationJson({
          split: "holdout-clean",
          provenance: privateProvenance({ reviewStatus: "draft" }),
        }),
      }),
    ).toThrow("holdout-clean provenance.reviewStatus must be holdout_approved")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        [holdoutPath]: translationJson({
          split: "holdout-clean",
          provenance: privateProvenance({ sourceClass: "unknown" }),
        }),
      }),
    ).toThrow("holdout-clean provenance.sourceClass must be private and auditable")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        [holdoutPath]: translationJson({
          split: "holdout-clean",
          provenance: privateProvenance({ sourceOrigin: "private" }),
        }),
      }),
    ).toThrow("holdout-clean provenance.sourceOrigin must name a concrete private source")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        [holdoutPath]: translationJson({
          split: "holdout-clean",
          provenance: privateProvenance({
            sourceClass: "synthetic_template",
            derivedFrom: null,
          }),
        }),
      }),
    ).toThrow("provenance.derivedFrom is required for sourceClass synthetic_template")
  })

  it("enforces calibration-public provenance warnings", () => {
    const calibrationPath =
      "../../../evals/translation/calibration-public/text/calibration-public/en-es/public-short.json"

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        [calibrationPath]: translationJson({
          split: "calibration-public",
          category: "calibration-public",
          provenance: publicProvenance(),
        }),
      }),
    ).not.toThrow()

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        [calibrationPath]: translationJson({
          split: "calibration-public",
          category: "calibration-public",
          provenance: publicProvenance({ publicExposure: "private" }),
        }),
      }),
    ).toThrow("calibration-public provenance.publicExposure must be public or mixed")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        [calibrationPath]: translationJson({
          split: "calibration-public",
          category: "calibration-public",
          provenance: publicProvenance({ notes: "public benchmark lineage" }),
        }),
      }),
    ).toThrow("calibration-public provenance.notes must include a contamination warning")
  })

  it("rejects invalid content source and reference shapes", () => {
    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/plain-es.json": translationJson({
          source: { html: "<p>Hello</p>" },
        }),
      }),
    ).toThrow("Text eval case plain-es is missing source.text")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/dom-es.json": translationJson({
          contentType: "dom",
          source: { html: "<p>Hello</p>" },
          references: [{ text: "Hola" }],
        }),
      }),
    ).toThrow("DOM eval case dom-es reference 1 must define html")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/dom-es.json": translationJson({
          contentType: "dom",
          source: { text: "Hello" },
          references: [{ html: "<p>Hola</p>" }],
        }),
      }),
    ).toThrow("DOM eval case dom-es is missing source.html")

    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/markdown-es.json": translationJson({
          contentType: "markdown",
          source: { text: "## Hello" },
          references: [{ html: "<h2>Hola</h2>" }],
        }),
      }),
    ).toThrow("Text eval case markdown-es reference 1 must define text")
  })

  it("rejects invalid regex checks before live evals run", () => {
    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/plain-es.json": translationJson({
          checks: { expectedPatterns: ["["] },
        }),
      }),
    ).toThrow("Eval case plain-es has invalid expected-pattern 1")
  })

  it("rejects invalid CSS selectors before live evals run", () => {
    expect(() =>
      loadWebGpuEvalCorpusFromModules({
        "../../../evals/translation/dom-es.json": translationJson({
          contentType: "dom",
          source: { html: "<p>Hello</p>" },
          references: [{ html: "<p>Hola</p>" }],
          checks: { domSelectorCounts: [{ selector: "[", count: 1 }] },
        }),
      }),
    ).toThrow("Eval case dom-es has invalid CSS selector checks.domSelectorCounts 1.selector")
  })

  it("loads complete provenance and per-case DOM runner config", () => {
    const cases = loadWebGpuEvalCorpusFromModules({
      "../../../evals/translation/dev/dom/dom-rich-text/en-es/rich-label.json": translationJson({
        category: "dom-rich-text",
        contentType: "dom",
        source: { html: "<span data-md=\"Hello **WebGPU**\">Hello <strong>WebGPU</strong></span>" },
        references: [{ html: "<span data-md=\"Hello **WebGPU**\">Hola <strong>WebGPU</strong></span>" }],
        provenance: privateProvenance({
          sourceClass: "synthetic_template",
          derivedFrom: "template: rich DOM label with product placeholder",
        }),
        runner: {
          dom: {
            richText: {
              selector: "[data-md]",
              sourceAttribute: "data-md",
            },
            structuredText: { selector: "[data-structured]" },
            linkedBy: {
              selector: "[data-linked]",
              keyAttribute: "data-key",
            },
            translateAttributes: ["title", "aria-label"],
            preserveMatchers: ["WebGPU"],
            skipTags: ["kbd"],
            skipTextPatterns: ["^SKU-"],
          },
        },
        checks: { sourceShouldChange: true },
      }),
    })

    expect(cases[0]?.sourceClass).toBe("synthetic_template")
    expect(cases[0]?.provenance).toMatchObject({
      sourceOrigin: "private-ticket BF-123",
      reviewStatus: "holdout_approved",
      referenceReviewerId: "reviewer-es-1",
      technicalReviewDate: "2026-04-28",
    })
    expect(cases[0]?.domRunnerConfig).toMatchObject({
      richText: { selector: "[data-md]", sourceAttribute: "data-md" },
      structuredText: { selector: "[data-structured]" },
      linkedBy: { selector: "[data-linked]", keyAttribute: "data-key" },
      translateAttributes: ["title", "aria-label"],
      preserveMatchers: ["WebGPU"],
      skipTags: ["kbd"],
    })
    expect(cases[0]?.domRunnerConfig?.skipTextPatterns?.[0]?.pattern.test("SKU-123"))
      .toBe(true)
  })

  it("loads text and DOM references from the JSON corpus", () => {
    expect(requireCase("plain-es").references[0]?.text).toBe(
      "El navegador traduce esta breve frase.",
    )
    expect(requireCase("qwen3-es-dom-004").references[0]?.html).toContain(
      "<section>",
    )
  })

  it("keeps corpus metadata valid for scoring", () => {
    for (const evalCase of WEBGPU_EVAL_CORPUS) {
      expect(evalCase.references.length, evalCase.id).toBeGreaterThan(0)
      for (const reference of evalCase.references) {
        if (evalCase.contentType === "dom") {
          expect(reference.html, evalCase.id).toBeTypeOf("string")
        } else {
          expect(reference.text, evalCase.id).toBeTypeOf("string")
        }
      }
    }
  })

  it("loads the expanded calibration-public bucket with contamination-marked public provenance", () => {
    const calibrationCases = WEBGPU_EVAL_CORPUS.filter((evalCase) =>
      evalCase.id.startsWith("calibration-public/"),
    )
    const calibrationCaseIds = calibrationCases.map((evalCase) => evalCase.id).sort()

    expect(calibrationCases).toHaveLength(12)
    expect(calibrationCaseIds).toEqual([
      "calibration-public/dom/calibration-public/en-ar/public-rtl-status",
      "calibration-public/dom/calibration-public/en-es/public-card-structure",
      "calibration-public/dom/calibration-public/en-fr/public-button-attrs",
      "calibration-public/dom/calibration-public/fr-en/public-hidden-skip",
      "calibration-public/markdown/calibration-public/en-es/public-release-checklist",
      "calibration-public/markdown/calibration-public/en-fr/sentinel-public-markdown",
      "calibration-public/text/calibration-public/en-ar/public-health-notice",
      "calibration-public/text/calibration-public/en-es/public-entity-preservation",
      "calibration-public/text/calibration-public/en-es/sentinel-public-short",
      "calibration-public/text/calibration-public/en-fr/public-news-brief",
      "calibration-public/text/calibration-public/es-en/public-service-delay",
      "calibration-public/text/calibration-public/fr-en/public-weather-update",
    ])
    expect(countBy(calibrationCases, (evalCase) => evalCase.contentType)).toEqual({
      dom: 4,
      markdown: 2,
      text: 6,
    })
    expect(countBy(calibrationCases, (evalCase) => evalCase.sourceClass ?? "missing")).toEqual({
      public_benchmark: 4,
      public_web: 8,
    })
    for (const calibrationCase of calibrationCases) {
      expect(calibrationCase.category).toBe("calibration-public")
      expect(["public_benchmark", "public_web"]).toContain(calibrationCase.sourceClass)
      expect(["public", "mixed"]).toContain(calibrationCase.provenance?.publicExposure)
      expect(calibrationCase.provenance?.reviewStatus).toBe("technical_reviewed")
      expect(calibrationCase.provenance?.notes).toMatch(/contamination/i)
    }
  })

  it("keeps the ported inline cases in the dev split", () => {
    for (const id of portedInlineCaseIds) {
      expect(requireCase(id).split).toBe("dev")
    }
  })

  it("accepts a direct Spanish translation without wrappers", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("plain-es"),
      "El navegador traduce esta breve frase.",
    )

    expect(result.pass).toBe(true)
    expect(result.score).toBe(1)
    expect(result.scoreBreakdown).toEqual({
      checkScore: 1,
      referenceSimilarity: 1,
      hardFailure: false,
      hardFailureReason: null,
    })
  })

  it("rejects prompt echoes and explanation wrappers as hard failures", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("plain-fr"),
      "Here is the translation: Le navigateur traduit cette courte phrase.",
    )

    expect(result.pass).toBe(false)
    expect(result.checks.filter((check) => !check.pass).map((check) => check.name)).toContain(
      "no-explanation-wrapper",
    )
    expect(result.score).toBe(0)
    expect(result.scoreBreakdown.hardFailureReason).toBe("explanation-wrapper")
  })

  it("checks preserved substrings and markdown markers exactly", () => {
    const passing = scoreWebGpuEvalCase(
      requireCase("markdown-es"),
      "## Configuracion\n\nUsa **babulfish** con `WebGPU` hoy.",
    )
    const failing = scoreWebGpuEvalCase(
      requireCase("markdown-es"),
      "Configuracion: usa Babulfish con Web GPU hoy.",
    )

    expect(passing.pass).toBe(true)
    expect(passing.score).toBeGreaterThan(0.98)
    expect(failing.pass).toBe(false)
    expect(failing.checks.filter((check) => !check.pass).map((check) => check.name)).toEqual([
      "preserve:babulfish",
      "preserve:WebGPU",
      "markdown-marker:##",
      "markdown-marker:**",
      "markdown-marker:`",
    ])
    expect(failing.scoreBreakdown.checkScore).toBeGreaterThan(0)
    expect(failing.scoreBreakdown.checkScore).toBeLessThan(1)
  })

  it("uses exact allowlists for short UI labels", () => {
    expect(scoreWebGpuEvalCase(requireCase("ui-save-es"), "Guardar").pass).toBe(true)
    expect(scoreWebGpuEvalCase(requireCase("ui-save-es"), "Salvar archivo").pass).toBe(false)
    expect(scoreWebGpuEvalCase(requireCase("ui-save-es"), "Guarda").scoreBreakdown.referenceSimilarity)
      .toBe(1)
  })

  it("checks Arabic script for the RTL smoke case", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("rtl-ar"),
      "ترجم رسالة الحالة المختصرة هذه.",
    )

    expect(result.pass).toBe(true)
  })

  it("classifies missing Arabic script as a hard target-script failure", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("rtl-ar"),
      "Translate this short status message.",
    )

    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
    expect(result.scoreBreakdown.hardFailureReason).toBe("wrong-target-script")
  })

  it("compiles JSON regex syntax and rejects forbidden wrapper patterns", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("qwen3-es-plain-001"),
      "Translation: El navegador traduce la pagina en segundo plano.",
    )

    expect(result.pass).toBe(false)
    expect(result.checks.some((check) => check.name === "expected-pattern:1" && check.pass)).toBe(true)
    expect(result.checks.some((check) => check.name.startsWith("forbidden-pattern:") && !check.pass))
      .toBe(true)
  })

  it("checks DOM selectors and preserved attributes", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("qwen3-es-dom-004"),
      "<section><p>Habilite el soporte de <code>WebGPU</code> para renderizado avanzado. Consulte la <a href=\"/docs/runtime\">guia</a>.</p><p>Use <code>translateNode()</code> para manejar contenido.</p></section>",
    )

    expect(result.pass).toBe(true)
  })

  it("fails preserved attribute checks when DOM attributes drift", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("qwen3-es-dom-004"),
      "<section><p>Habilite <code>WebGPU</code>. Consulte la <a href=\"/docs/changed\">guia</a>.</p><p>Use <code>translateNode()</code>.</p></section>",
    )

    expect(result.pass).toBe(false)
    expect(result.checks.some((check) =>
      check.name === "attribute:a[href]" && !check.pass,
    )).toBe(true)
  })

  it("checks count-aware preserved substrings without changing legacy preservation semantics", () => {
    const evalCase = syntheticCase({
      sourceText: "Use WebGPU beside WebGPU.",
      preservedSubstringCounts: [{ value: "WebGPU" }],
    })

    expect(scoreWebGpuEvalCase(evalCase, "Use WebGPU junto a WebGPU.").pass).toBe(true)

    const failing = scoreWebGpuEvalCase(evalCase, "Use WebGPU junto al renderizador.")
    expect(failing.pass).toBe(false)
    expect(failing.checks.find((check) => check.name === "preserve-count:WebGPU"))
      .toMatchObject({
        pass: false,
        expected: "at least 2 occurrence(s) of WebGPU",
        actual: "1 occurrence(s)",
      })
  })

  it("checks markdown structure with paired passing and failing outputs", () => {
    const evalCase = syntheticCase({
      contentType: "markdown",
      sourceText: "Release note",
      markdownStructure: {
        headings: [{ level: 2, count: 1 }],
        unorderedListItems: 2,
        orderedListItems: 2,
        minListDepth: 2,
        fencedCodeBlocks: { count: 1, languages: ["ts"] },
        inlineCode: { count: 1, texts: ["WebGPU"] },
        links: { count: 1, labels: ["guide"], hrefs: ["/docs/runtime"] },
        images: { count: 1, altTexts: ["diagram"], srcs: ["/img/flow.png"] },
        tables: { rows: 2, cells: 4 },
        blockquotes: 1,
        frontmatter: { keys: ["title"] },
      },
    })
    const passing = [
      "---",
      "title: Notes",
      "---",
      "## Lanzamiento",
      "- Uno",
      "  - Dos",
      "1. Primero",
      "2. Segundo",
      "```ts",
      "const api = \"ok\"",
      "```",
      "Usa `WebGPU` y lee [guide](/docs/runtime).",
      "![diagram](/img/flow.png)",
      "| A | B |",
      "|---|---|",
      "| C | D |",
      "> Nota",
    ].join("\n")
    const failing = [
      "Lanzamiento",
      "- Uno",
      "1. Primero",
      "```",
      "const api = \"ok\"",
      "```",
      "Usa Web GPU y lee guide.",
      "| A | B |",
      "|---|---|",
    ].join("\n")

    expect(scoreWebGpuEvalCase(evalCase, passing).pass).toBe(true)
    const failingResult = scoreWebGpuEvalCase(evalCase, failing)
    expect(failingResult.pass).toBe(false)
    expect(failingResult.checks.filter((check) => !check.pass).map((check) => check.name))
      .toEqual([
        "markdown-heading:h2",
        "markdown-unordered-list-items",
        "markdown-ordered-list-items",
        "markdown-list-depth",
        "markdown-fenced-code-language:ts",
        "markdown-inline-code-count",
        "markdown-inline-code:WebGPU",
        "markdown-link-count",
        "markdown-link-label:guide",
        "markdown-link-href:/docs/runtime",
        "markdown-image-count",
        "markdown-image-alt:diagram",
        "markdown-image-src:/img/flow.png",
        "markdown-table-rows",
        "markdown-table-cells",
        "markdown-blockquotes",
        "markdown-frontmatter-key:title",
      ])
  })

  it("checks DOM selector counts with paired passing and failing outputs", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<ul><li>One</li><li>Two</li></ul>",
      references: [{ html: "<ul><li>Uno</li><li>Dos</li></ul>" }],
      domSelectorCounts: [{ selector: "li", count: 2 }],
    })

    expect(scoreWebGpuEvalCase(evalCase, "<ul><li>Uno</li><li>Dos</li></ul>").pass)
      .toBe(true)
    const failing = scoreWebGpuEvalCase(evalCase, "<ul><li>Uno y dos</li></ul>")
    expect(failing.pass).toBe(false)
    expect(failing.checks.find((check) => check.name === "selector-count:li"))
      .toMatchObject({ pass: false, actual: "1 element(s)" })
  })

  it("checks selector-scoped visible DOM text with paired passing and failing outputs", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<article><h2>Status</h2><p>Done</p></article>",
      references: [{ html: "<article><h2>Estado</h2><p>Listo</p></article>" }],
      domVisibleText: [{ selector: "h2", text: "Estado" }],
    })

    expect(scoreWebGpuEvalCase(evalCase, "<article><h2>Estado</h2><p>Listo</p></article>").pass)
      .toBe(true)
    const failing = scoreWebGpuEvalCase(evalCase, "<article><h2>Status</h2><p>Listo</p></article>")
    expect(failing.pass).toBe(false)
    expect(failing.checks.find((check) => check.name === "visible-text:h2"))
      .toMatchObject({ pass: false, actual: "Status" })
  })

  it("checks translated DOM attributes with paired passing and failing outputs", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<button aria-label=\"Save changes\">Save</button>",
      references: [{ html: "<button aria-label=\"Guardar cambios\">Guardar</button>" }],
      translatedAttributes: [
        {
          selector: "button",
          attribute: "aria-label",
          expectedPattern: { pattern: /Guardar/, note: "Guardar" },
        },
      ],
    })

    expect(scoreWebGpuEvalCase(evalCase, "<button aria-label=\"Guardar cambios\">Guardar</button>").pass)
      .toBe(true)
    const failing = scoreWebGpuEvalCase(evalCase, "<button aria-label=\"Save changes\">Guardar</button>")
    expect(failing.pass).toBe(false)
    expect(failing.checks.find((check) => check.name === "translated-attribute:button[aria-label]"))
      .toMatchObject({ pass: false, actual: "Save changes" })
  })

  it("checks hidden DOM text stays excluded with paired passing and failing outputs", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<section><p>Visible</p><span hidden>Internal only</span></section>",
      references: [{ html: "<section><p>Visible</p><span hidden>Internal only</span></section>" }],
      domHiddenText: [{ selector: "[hidden]" }],
    })

    expect(scoreWebGpuEvalCase(evalCase, "<section><p>Visible</p><span hidden>Internal only</span></section>").pass)
      .toBe(true)
    const failing = scoreWebGpuEvalCase(evalCase, "<section><p>Visible</p><span hidden>Solo interno</span></section>")
    expect(failing.pass).toBe(false)
    expect(failing.checks.find((check) => check.name === "hidden-text:[hidden]"))
      .toMatchObject({ pass: false, actual: "Solo interno" })
  })

  it("checks skipped DOM islands with paired passing and failing outputs", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<p>Use <code>hydrateRoot()</code></p>",
      references: [{ html: "<p>Use <code>hydrateRoot()</code></p>" }],
      domSkippedText: [{ selector: "code" }],
    })

    expect(scoreWebGpuEvalCase(evalCase, "<p>Usa <code>hydrateRoot()</code></p>").pass)
      .toBe(true)
    const failing = scoreWebGpuEvalCase(evalCase, "<p>Usa <code>hidratarRaiz()</code></p>")
    expect(failing.pass).toBe(false)
    expect(failing.checks.find((check) => check.name === "skipped-text:code"))
      .toMatchObject({ pass: false, actual: "hidratarRaiz()" })
  })

  it("checks optional DOM RTL direction with paired passing and failing outputs", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<div data-webgpu-eval-root=\"\"><p>Status</p></div>",
      references: [{ html: "<div data-webgpu-eval-root=\"\" dir=\"rtl\"><p>الحالة</p></div>" }],
      domRootDir: { dir: "rtl" },
    })

    expect(scoreWebGpuEvalCase(evalCase, "<div data-webgpu-eval-root=\"\" dir=\"rtl\"><p>الحالة</p></div>").pass)
      .toBe(true)
    const failing = scoreWebGpuEvalCase(evalCase, "<div data-webgpu-eval-root=\"\" dir=\"ltr\"><p>الحالة</p></div>")
    expect(failing.pass).toBe(false)
    expect(failing.checks.find((check) => check.name === "dom-dir:[data-webgpu-eval-root]"))
      .toMatchObject({ pass: false, actual: "ltr" })
  })

  it("checks DOM executable-attribute safety with paired passing and failing outputs", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<a href=\"/docs\">Docs</a>",
      references: [{ html: "<a href=\"/docs\">Docs</a>" }],
      domExecutableSafety: true,
    })

    expect(scoreWebGpuEvalCase(evalCase, "<a href=\"/docs\">Docs</a>").pass).toBe(true)
    const failing = scoreWebGpuEvalCase(evalCase, "<a href=\"javascript:alert(1)\" onclick=\"bad()\">Docs</a>")
    expect(failing.pass).toBe(false)
    expect(failing.checks.find((check) => check.name === "dom-executable-attribute-safety"))
      .toMatchObject({ pass: false, actual: "a[href=\"javascript:alert(1)\"]" })
  })

  it("computes deterministic chrF-style reference similarity", () => {
    expect(chrfSimilarity("El navegador traduce esta breve frase.", "El navegador traduce esta breve frase."))
      .toBe(1)
    expect(chrfSimilarity("", "El navegador traduce esta breve frase.")).toBe(0)
    expect(chrfSimilarity("El navegador traduce esta frase breve.", "El navegador traduce esta breve frase."))
      .toBeGreaterThan(0.7)
    expect(chrfSimilarity("Completely unrelated output.", "El navegador traduce esta breve frase."))
      .toBeLessThan(0.25)
  })

  it("uses the best reference when multiple references are available", () => {
    const evalCase = syntheticCase({
      references: [
        { quality: "alternate", text: "Buenas tardes" },
        { quality: "primary", text: "Hola mundo" },
      ],
    })

    expect(scoreReferenceSimilarity(evalCase, "Hola mundo")).toBe(1)
  })

  it("scores DOM reference similarity from visible text", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<p>Hello <strong>world</strong></p>",
      references: [
        {
          quality: "primary",
          html: "<article><p>Hola <strong>mundo</strong></p></article>",
        },
      ],
    })

    expect(scoreReferenceSimilarity(evalCase, "<section>Hola <em>mundo</em></section>"))
      .toBe(1)
  })

  it("excludes hidden and script/style text from DOM reference similarity", () => {
    const evalCase = syntheticCase({
      contentType: "dom",
      sourceText: "<p>Hello world</p>",
      references: [
        {
          quality: "primary",
          html: "<section><p>Hola mundo</p><script>bad()</script><style>.x{}</style><span hidden>oculto</span><span aria-hidden=\"true\">oculto</span><span style=\"display: none\">oculto</span></section>",
        },
      ],
    })

    expect(scoreReferenceSimilarity(evalCase, "<article>Hola mundo</article>")).toBe(1)
  })

  it("scores per-case generation failures as zero without throwing", () => {
    const result = scoreWebGpuEvalGenerationFailure("case timed out")

    expect(result.pass).toBe(false)
    expect(result.score).toBe(0)
    expect(result.scoreBreakdown).toEqual({
      checkScore: 0,
      referenceSimilarity: 0,
      hardFailure: true,
      hardFailureReason: "generation-error",
    })
    expect(result.checks.map((evalCheck) => evalCheck.name)).toEqual([
      "generation-completed",
    ])
  })

  it("scores validation failures as zero while preserving model output", () => {
    const result = scoreWebGpuEvalValidationFailure(
      " Traduccion parcial ",
      "reference similarity crashed",
    )

    expect(result.pass).toBe(false)
    expect(result.normalizedOutput).toBe("Traduccion parcial")
    expect(result.score).toBe(0)
    expect(result.scoreBreakdown.hardFailureReason).toBe("validation-error")
    expect(result.checks).toEqual([
      {
        name: "scoring-completed",
        pass: false,
        expected: "scoring completes",
        actual: "reference similarity crashed",
      },
    ])
  })

  it("aggregates model scores and failure maps without changing pass/fail", () => {
    const summary = scoreWebGpuEvalModel([
      {
        category: "plain",
        pass: true,
        checks: [check("expected-pattern:1", true)],
        scoreBreakdown: {
          checkScore: 1,
          referenceSimilarity: 1,
          hardFailure: false,
          hardFailureReason: null,
        },
      },
      {
        category: "plain",
        pass: false,
        checks: [check("expected-pattern:1", false)],
        scoreBreakdown: {
          checkScore: 0.5,
          referenceSimilarity: 0.25,
          hardFailure: false,
          hardFailureReason: null,
        },
      },
      {
        category: "preservation",
        pass: false,
        checks: [
          check("expected-pattern:1", false),
          check("preserve:WebGPU", false),
        ],
        scoreBreakdown: {
          checkScore: 0,
          referenceSimilarity: 0,
          hardFailure: true,
          hardFailureReason: "generation-error",
        },
      },
    ])

    expect(summary.score).toBeCloseTo(0.458333)
    expect(summary.scoreBreakdown).toEqual({
      weightedCheckScore: 0.5,
      passedCaseRatio: 0.333333,
      referenceSimilarity: 0.416667,
      hardFailureCount: 1,
      failureReason: null,
    })
    expect(summary.failuresByCategory).toEqual({
      plain: 1,
      preservation: 1,
    })
    expect(summary.failuresByCheck).toEqual({
      "expected-pattern:1": 2,
      "preserve:WebGPU": 1,
    })
  })

  it("excludes calibration-public from clean headline scores without changing raw scoring", () => {
    const cleanPass = scoredCase({ id: "dev/text/plain/en-es/pass", split: "dev" })
    const cleanFail = scoredCase({
      id: "holdout-clean/text/plain/en-es/fail",
      split: "holdout-clean",
      pass: false,
      checks: [check("clean-check", false)],
      scoreBreakdown: {
        checkScore: 0,
        referenceSimilarity: 0,
        hardFailure: true,
        hardFailureReason: "generation-error",
      },
    })
    const publicFail = scoredCase({
      id: "calibration-public/text/calibration-public/en-es/fail",
      split: "calibration-public",
      sourceClass: "public_benchmark",
      category: "calibration-public",
      pass: false,
      checks: [check("public-check", false)],
      scoreBreakdown: {
        checkScore: 0,
        referenceSimilarity: 0,
        hardFailure: true,
        hardFailureReason: "generation-error",
      },
    })

    const rawSummary = scoreWebGpuEvalModel([cleanPass, cleanFail, publicFail])
    const cleanHeadline = scoreWebGpuEvalCleanHeadline([cleanPass, cleanFail, publicFail])

    expect(rawSummary.score).toBeCloseTo(0.333333)
    expect(cleanHeadline.score).toBe(0.5)
    expect(cleanHeadline.pass).toBe(false)
    expect(cleanHeadline.includedCases).toBe(2)
    expect(cleanHeadline.excludedCases).toBe(1)
    expect(cleanHeadline.excludedCaseIds).toEqual([
      "calibration-public/text/calibration-public/en-es/fail",
    ])
    expect(cleanHeadline.failuresByCheck).toEqual({ "clean-check": 1 })
  })

  it("keeps calibration-public failures visible but out of clean headline pass/fail", () => {
    const cleanHeadline = scoreWebGpuEvalCleanHeadline([
      scoredCase({ id: "dev/text/plain/en-es/pass", split: "dev" }),
      scoredCase({
        id: "holdout-clean/text/plain/en-es/pass",
        split: "holdout-clean",
      }),
      scoredCase({
        id: "calibration-public/text/calibration-public/en-es/fail",
        split: "calibration-public",
        sourceClass: "public_benchmark",
        pass: false,
        checks: [check("public-check", false)],
        scoreBreakdown: {
          checkScore: 0,
          referenceSimilarity: 0,
          hardFailure: true,
          hardFailureReason: "generation-error",
        },
      }),
    ])

    expect(cleanHeadline.pass).toBe(true)
    expect(cleanHeadline.score).toBe(1)
    expect(cleanHeadline.failuresByCheck).toEqual({})
    expect(cleanHeadline.excludedCases).toBe(1)
  })

  it("groups score summaries only by split and source class", () => {
    const groups = summarizeWebGpuEvalScoreGroups([
      scoredCase({
        id: "dev/synthetic",
        split: "dev",
        sourceClass: "synthetic_template",
      }),
      scoredCase({
        id: "dev/first-party",
        split: "dev",
        sourceClass: "first_party_authored",
        pass: false,
      }),
      scoredCase({
        id: "holdout/first-party",
        split: "holdout-clean",
        sourceClass: "first_party_authored",
      }),
      scoredCase({
        id: "calibration/public",
        split: "calibration-public",
        sourceClass: "public_benchmark",
        pass: false,
      }),
    ])

    expect(groups.map((group) => ({
      split: group.split,
      sourceClass: group.sourceClass,
      total: group.total,
      passed: group.passed,
      failed: group.failed,
      score: group.score,
      pass: group.pass,
    }))).toEqual([
      {
        split: "calibration-public",
        sourceClass: "public_benchmark",
        total: 1,
        passed: 0,
        failed: 1,
        score: 0,
        pass: false,
      },
      {
        split: "dev",
        sourceClass: "first_party_authored",
        total: 1,
        passed: 0,
        failed: 1,
        score: 0,
        pass: false,
      },
      {
        split: "dev",
        sourceClass: "synthetic_template",
        total: 1,
        passed: 1,
        failed: 0,
        score: 1,
        pass: true,
      },
      {
        split: "holdout-clean",
        sourceClass: "first_party_authored",
        total: 1,
        passed: 1,
        failed: 0,
        score: 1,
        pass: true,
      },
    ])
    expect(Object.keys(groups[0] ?? {})).not.toContain("category")
    expect(Object.keys(groups[0] ?? {})).not.toContain("contentType")
  })

  it("defaults local runs away from holdout-clean and requires holdout metadata", () => {
    expect(defaultWebGpuEvalSelection()).toEqual({ split: ["dev", "holdout"] })

    expect(createWebGpuEvalRunMetadata({
      runner: "unit-test",
      timestamp: "2026-04-28T12:00:00.000Z",
      modelId: "qwen-3-0.6b",
    })).toEqual({
      runner: "unit-test",
      timestamp: "2026-04-28T12:00:00.000Z",
      modelId: "qwen-3-0.6b",
      filters: { split: ["dev", "holdout"] },
      reason: null,
      referencesExposed: false,
    })

    expect(() =>
      createWebGpuEvalRunMetadata({
        runner: "unit-test",
        timestamp: "2026-04-28T12:00:00.000Z",
        modelId: "qwen-3-0.6b",
        filters: { split: ["holdout-clean"] },
      }),
    ).toThrow("Holdout-clean WebGPU eval runs require a reason")

    expect(createWebGpuEvalRunMetadata({
      runner: "unit-test",
      timestamp: "2026-04-28T12:00:00.000Z",
      modelId: "qwen-3-0.6b",
      filters: { split: ["dev", "holdout-clean"] },
      reason: "release gate",
      referencesExposed: true,
    })).toEqual({
      runner: "unit-test",
      timestamp: "2026-04-28T12:00:00.000Z",
      modelId: "qwen-3-0.6b",
      filters: { split: ["dev", "holdout-clean"] },
      reason: "release gate",
      referencesExposed: true,
    })
  })

  it("filters selected runner cases by split, category, content type, language pair, and source class", () => {
    const cases = [
      syntheticCase({
        id: "dev-markdown",
        split: "dev",
        category: "markdown",
        contentType: "markdown",
        sourceLanguage: "en",
        targetLanguage: "es",
        sourceClass: "synthetic_template",
      }),
      syntheticCase({
        id: "dev-dom",
        split: "dev",
        category: "dom-attrs",
        contentType: "dom",
        sourceLanguage: "en",
        targetLanguage: "fr",
        sourceClass: "first_party_authored",
      }),
      syntheticCase({
        id: "holdout-markdown",
        split: "holdout-clean",
        category: "markdown",
        contentType: "markdown",
        sourceLanguage: "en",
        targetLanguage: "es",
      }),
    ]

    expect(filterWebGpuEvalCorpus(cases, {
      split: ["dev"],
      category: ["markdown"],
      contentType: ["markdown"],
      languagePair: ["en-es"],
      sourceClass: ["synthetic_template"],
    }).map((evalCase) => evalCase.id)).toEqual(["dev-markdown"])

    expect(filterWebGpuEvalCorpus(cases, {
      sourceClass: ["synthetic_template"],
    }).map((evalCase) => evalCase.id)).toEqual(["dev-markdown"])
  })

  it("creates grouped artifact summaries without score grouping", () => {
    const groups = summarizeWebGpuEvalCaseGroups([
      {
        split: "dev",
        contentType: "markdown",
        category: "markdown",
        sourceLanguage: "en",
        targetLanguage: "es",
        sourceClass: "synthetic_template",
        pass: true,
        checks: [check("markdown-heading:h2", true)],
        scoreBreakdown: {
          checkScore: 1,
          referenceSimilarity: 1,
          hardFailure: false,
          hardFailureReason: null,
        },
      },
      {
        split: "dev",
        contentType: "markdown",
        category: "markdown",
        sourceLanguage: "en",
        targetLanguage: "es",
        sourceClass: "synthetic_template",
        pass: false,
        checks: [check("markdown-heading:h2", false)],
        scoreBreakdown: {
          checkScore: 0,
          referenceSimilarity: 0,
          hardFailure: true,
          hardFailureReason: "generation-error",
        },
      },
    ])

    expect(groups).toEqual([
      {
        split: "dev",
        contentType: "markdown",
        category: "markdown",
        languagePair: "en-es",
        sourceClass: "synthetic_template",
        total: 2,
        passed: 1,
        failed: 1,
        hardFailures: 1,
        failuresByCheck: {
          "markdown-heading:h2": 1,
        },
      },
    ])
    expect(Object.keys(groups[0] ?? {})).not.toContain("score")
  })

  it("scores model-level environment and load failures as zero", () => {
    const summary = scoreWebGpuEvalModel([], "environment: navigator.gpu missing")

    expect(summary.score).toBe(0)
    expect(summary.scoreBreakdown.failureReason).toBe("environment: navigator.gpu missing")
    expect(summary.failuresByCategory).toEqual({})
    expect(summary.failuresByCheck).toEqual({})
  })

  it("validates known model ids", () => {
    expect(isWebGpuEvalModelId("qwen-3-0.6b")).toBe(true)
    expect(isWebGpuEvalModelId("translategemma-4")).toBe(true)
  })
})
