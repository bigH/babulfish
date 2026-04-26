// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import {
  WEBGPU_EVAL_CORPUS,
  chrfSimilarity,
  isWebGpuEvalModelId,
  scoreReferenceSimilarity,
  scoreWebGpuEvalCase,
  scoreWebGpuEvalGenerationFailure,
  scoreWebGpuEvalModel,
  scoreWebGpuEvalValidationFailure,
  type WebGpuEvalCase,
  type WebGpuEvalCheck,
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

function check(name: string, pass: boolean): WebGpuEvalCheck {
  return {
    name,
    pass,
    expected: pass ? "passes" : "should pass",
    actual: pass ? "passes" : "failed",
  }
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

describe("webgpu eval scorer", () => {
  it("loads the JSON translation corpus plus the ported inline cases", () => {
    expect(WEBGPU_EVAL_CORPUS).toHaveLength(38)
    expect(corpusById.size).toBe(38)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.split === "dev")).toHaveLength(23)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.split === "holdout")).toHaveLength(15)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.contentType === "dom")).toHaveLength(6)
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

  it("scores model-level environment and load failures as zero", () => {
    const summary = scoreWebGpuEvalModel([], "environment: navigator.gpu missing")

    expect(summary.score).toBe(0)
    expect(summary.scoreBreakdown.failureReason).toBe("environment: navigator.gpu missing")
    expect(summary.failuresByCategory).toEqual({})
    expect(summary.failuresByCheck).toEqual({})
  })

  it("validates known model ids", () => {
    expect(isWebGpuEvalModelId("qwen-2.5-0.5b")).toBe(true)
    expect(isWebGpuEvalModelId("translategemma-4")).toBe(true)
  })
})
