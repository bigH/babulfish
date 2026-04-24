import { describe, expect, it } from "vitest"

import {
  WEBGPU_EVAL_CORPUS,
  isWebGpuEvalModelId,
  scoreWebGpuEvalCase,
} from "./webgpu-eval-scorer.js"

type EvalCaseId = (typeof WEBGPU_EVAL_CORPUS)[number]["id"]

const corpusById = new Map(WEBGPU_EVAL_CORPUS.map((evalCase) => [evalCase.id, evalCase]))

function requireCase(id: EvalCaseId) {
  const evalCase = corpusById.get(id)
  if (!evalCase) throw new Error(`Missing eval case ${id}`)
  return evalCase
}

describe("webgpu eval scorer", () => {
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

  it("validates known model ids", () => {
    expect(isWebGpuEvalModelId("qwen-2.5-0.5b")).toBe(true)
    expect(isWebGpuEvalModelId("translategemma-4")).toBe(false)
  })
})
