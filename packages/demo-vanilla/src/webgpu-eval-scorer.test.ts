// @vitest-environment jsdom

import { describe, expect, it } from "vitest"

import {
  WEBGPU_EVAL_CORPUS,
  isWebGpuEvalModelId,
  scoreWebGpuEvalCase,
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

describe("webgpu eval scorer", () => {
  it("loads the JSON translation corpus plus the ported inline cases", () => {
    expect(WEBGPU_EVAL_CORPUS).toHaveLength(38)
    expect(corpusById.size).toBe(38)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.split === "dev")).toHaveLength(23)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.split === "holdout")).toHaveLength(15)
    expect(WEBGPU_EVAL_CORPUS.filter((evalCase) => evalCase.contentType === "dom")).toHaveLength(6)
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
  })

  it("rejects prompt echoes and explanation wrappers", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("plain-fr"),
      "Here is the translation: Le navigateur traduit cette courte phrase.",
    )

    expect(result.pass).toBe(false)
    expect(result.checks.filter((check) => !check.pass).map((check) => check.name)).toContain(
      "no-explanation-wrapper",
    )
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
    expect(failing.pass).toBe(false)
    expect(failing.checks.filter((check) => !check.pass).map((check) => check.name)).toEqual([
      "preserve:babulfish",
      "preserve:WebGPU",
      "markdown-marker:##",
      "markdown-marker:**",
      "markdown-marker:`",
    ])
  })

  it("uses exact allowlists for short UI labels", () => {
    expect(scoreWebGpuEvalCase(requireCase("ui-save-es"), "Guardar").pass).toBe(true)
    expect(scoreWebGpuEvalCase(requireCase("ui-save-es"), "Salvar archivo").pass).toBe(false)
  })

  it("checks Arabic script for the RTL smoke case", () => {
    const result = scoreWebGpuEvalCase(
      requireCase("rtl-ar"),
      "ترجم رسالة الحالة المختصرة هذه.",
    )

    expect(result.pass).toBe(true)
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

  it("validates known model ids", () => {
    expect(isWebGpuEvalModelId("qwen-2.5-0.5b")).toBe(true)
    expect(isWebGpuEvalModelId("translategemma-4")).toBe(true)
  })
})
