export type WebGpuEvalModelId =
  | "qwen-2.5-0.5b"
  | "qwen-3-0.6b"
  | "gemma-3-1b-it"
  | "translategemma-4"

export type WebGpuEvalCase = {
  readonly id: string
  readonly sourceText: string
  readonly sourceLanguage: "en"
  readonly targetLanguage: "es" | "fr" | "ar"
  readonly contentType: "raw" | "markdown"
  readonly preservedSubstrings?: readonly string[]
  readonly markdownMarkers?: readonly string[]
  readonly expectedPatterns?: readonly {
    readonly name: string
    readonly pattern: RegExp
    readonly note: string
  }[]
  readonly exactOutputOptions?: readonly string[]
  readonly sourceShouldChange?: boolean
  readonly checkBalancedQuotes?: boolean
}

export type WebGpuEvalCheck = {
  readonly name: string
  readonly pass: boolean
  readonly expected: string
  readonly actual: string
  readonly note?: string
}

export type ScoredWebGpuEvalCase = {
  readonly normalizedOutput: string
  readonly checks: readonly WebGpuEvalCheck[]
  readonly pass: boolean
}

const EXPLANATION_WRAPPER_PATTERN =
  /\b(here is|here's|translation:|translated text|the translation|spanish:|french:|arabic:|in spanish|in french|in arabic|as requested|sure[,!]|voici|traduction\s*:|aqui esta|aqu[ií] est[aá])\b/i

const PROMPT_ECHO_PATTERN =
  /\b(translate from|output only|you are a translation engine|preserve these exact substrings|source language|target language)\b/i

export const WEBGPU_EVAL_MODEL_IDS = [
  "qwen-2.5-0.5b",
  "qwen-3-0.6b",
  "gemma-3-1b-it",
  "translategemma-4",
] as const satisfies readonly WebGpuEvalModelId[]

export const DEFAULT_WEBGPU_EVAL_MODEL_ID: WebGpuEvalModelId = "qwen-2.5-0.5b"

export const WEBGPU_EVAL_CORPUS = [
  {
    id: "plain-es",
    sourceText: "The browser translates this short sentence.",
    sourceLanguage: "en",
    targetLanguage: "es",
    contentType: "raw",
    sourceShouldChange: true,
    expectedPatterns: [
      {
        name: "spanish-smoke",
        pattern: /\b(navegador|traduce|frase|oraci[oó]n|breve)\b/i,
        note: "Spanish output should contain a plausible translated token.",
      },
    ],
  },
  {
    id: "plain-fr",
    sourceText: "The browser translates this short sentence.",
    sourceLanguage: "en",
    targetLanguage: "fr",
    contentType: "raw",
    sourceShouldChange: true,
    expectedPatterns: [
      {
        name: "french-smoke",
        pattern: /\b(navigateur|traduit|phrase|courte)\b/i,
        note: "French output should contain a plausible translated token.",
      },
    ],
  },
  {
    id: "markdown-es",
    sourceText: "## Setup\n\nUse **babulfish** with `WebGPU` today.",
    sourceLanguage: "en",
    targetLanguage: "es",
    contentType: "markdown",
    preservedSubstrings: ["babulfish", "WebGPU"],
    markdownMarkers: ["##", "**", "`"],
    sourceShouldChange: true,
  },
  {
    id: "brands-fr",
    sourceText: "Keep babulfish, TranslateGemma, and WebGPU unchanged in this sentence.",
    sourceLanguage: "en",
    targetLanguage: "fr",
    contentType: "raw",
    preservedSubstrings: ["babulfish", "TranslateGemma", "WebGPU"],
    sourceShouldChange: true,
  },
  {
    id: "ui-save-es",
    sourceText: "Save",
    sourceLanguage: "en",
    targetLanguage: "es",
    contentType: "raw",
    exactOutputOptions: ["Guardar", "Guarda"],
  },
  {
    id: "punctuation-fr",
    sourceText: "She said, \"Translate this now!\"",
    sourceLanguage: "en",
    targetLanguage: "fr",
    contentType: "raw",
    sourceShouldChange: true,
    checkBalancedQuotes: true,
    expectedPatterns: [
      {
        name: "french-quote-smoke",
        pattern: /\b(dit|traduire|maintenant|ceci)\b/i,
        note: "French output should translate the quoted sentence.",
      },
    ],
  },
  {
    id: "rtl-ar",
    sourceText: "Translate this brief status message.",
    sourceLanguage: "en",
    targetLanguage: "ar",
    contentType: "raw",
    sourceShouldChange: true,
    expectedPatterns: [
      {
        name: "arabic-script",
        pattern: /[\u0600-\u06FF]/,
        note: "Arabic output should contain Arabic script.",
      },
    ],
  },
  {
    id: "output-only-es",
    sourceText: "Return only the translated words.",
    sourceLanguage: "en",
    targetLanguage: "es",
    contentType: "raw",
    sourceShouldChange: true,
    expectedPatterns: [
      {
        name: "output-only-spanish-smoke",
        pattern: /\b(devuelve|solo|solamente|palabras|traducid[ao]s)\b/i,
        note: "Output-only case should still be a direct Spanish translation.",
      },
    ],
  },
] as const satisfies readonly WebGpuEvalCase[]

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function lowerNormalized(text: string): string {
  return normalizeText(text).toLocaleLowerCase("en-US")
}

function quoteCount(text: string): number {
  return Array.from(text).filter((char) => char === "\"").length
}

function createCheck(
  name: string,
  pass: boolean,
  expected: string,
  actual: string,
  note?: string,
): WebGpuEvalCheck {
  return note === undefined
    ? { name, pass, expected, actual }
    : { name, pass, expected, actual, note }
}

function sourceLooksCopied(sourceText: string, output: string): boolean {
  const source = lowerNormalized(sourceText)
  const normalizedOutput = lowerNormalized(output)
  if (source === normalizedOutput) return true
  if (source.length <= 12) return source === normalizedOutput
  return normalizedOutput.includes(source)
}

function scoreExactOutputOptions(
  options: readonly string[],
  output: string,
): WebGpuEvalCheck {
  const normalizedOutput = normalizeText(output)
  return createCheck(
    "exact-output",
    options.some((option) => normalizeText(option) === normalizedOutput),
    options.join(" | "),
    normalizedOutput,
    "Short UI labels use an allowlist to stay deterministic.",
  )
}

export function scoreWebGpuEvalCase(
  evalCase: WebGpuEvalCase,
  rawOutput: string,
): ScoredWebGpuEvalCase {
  const normalizedOutput = normalizeText(rawOutput)
  const checks: WebGpuEvalCheck[] = [
    createCheck(
      "non-empty-output",
      normalizedOutput.length > 0,
      "non-empty translated output",
      normalizedOutput.length === 0 ? "<empty>" : normalizedOutput,
    ),
    createCheck(
      "no-prompt-echo",
      !PROMPT_ECHO_PATTERN.test(rawOutput),
      "no prompt or instruction text",
      normalizedOutput,
    ),
    createCheck(
      "no-explanation-wrapper",
      !EXPLANATION_WRAPPER_PATTERN.test(rawOutput),
      "translation only, no explanatory wrapper",
      normalizedOutput,
    ),
  ]

  if (evalCase.sourceShouldChange) {
    checks.push(
      createCheck(
        "source-text-changed",
        !sourceLooksCopied(evalCase.sourceText, rawOutput),
        "target output differs from English source",
        normalizedOutput,
      ),
    )
  }

  for (const preserved of evalCase.preservedSubstrings ?? []) {
    checks.push(
      createCheck(
        `preserve:${preserved}`,
        rawOutput.includes(preserved),
        `exact substring ${preserved}`,
        normalizedOutput,
      ),
    )
  }

  for (const marker of evalCase.markdownMarkers ?? []) {
    checks.push(
      createCheck(
        `markdown-marker:${marker}`,
        rawOutput.includes(marker),
        `markdown marker ${marker} survives`,
        normalizedOutput,
      ),
    )
  }

  for (const expected of evalCase.expectedPatterns ?? []) {
    checks.push(
      createCheck(
        expected.name,
        expected.pattern.test(rawOutput),
        String(expected.pattern),
        normalizedOutput,
        expected.note,
      ),
    )
  }

  if (evalCase.exactOutputOptions) {
    checks.push(scoreExactOutputOptions(evalCase.exactOutputOptions, rawOutput))
  }

  if (evalCase.checkBalancedQuotes) {
    checks.push(
      createCheck(
        "balanced-quotes",
        quoteCount(rawOutput) % 2 === 0,
        "an even number of straight quotes",
        String(quoteCount(rawOutput)),
      ),
    )
  }

  return {
    normalizedOutput,
    checks,
    pass: checks.every((check) => check.pass),
  }
}

export function isWebGpuEvalModelId(value: string): value is WebGpuEvalModelId {
  return WEBGPU_EVAL_MODEL_IDS.includes(value as WebGpuEvalModelId)
}
