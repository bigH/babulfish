/// <reference types="vite/client" />

export type WebGpuEvalModelId =
  | "qwen-2.5-0.5b"
  | "qwen-3-0.6b"
  | "gemma-3-1b-it"
  | "translategemma-4"

export type WebGpuEvalContentType = "text" | "markdown" | "dom"
export type WebGpuEvalSplit = "dev" | "holdout"

type WebGpuEvalPatternCheck = {
  readonly name: string
  readonly pattern: RegExp
  readonly note: string
}

type WebGpuEvalPreservedAttribute = {
  readonly selector: string
  readonly attribute: string
  readonly value: string
}

export type WebGpuEvalCase = {
  readonly id: string
  readonly split: WebGpuEvalSplit
  readonly category: string
  readonly sourceText: string
  readonly sourceLanguage: "en"
  readonly targetLanguage: "es" | "fr" | "ar"
  readonly contentType: WebGpuEvalContentType
  readonly preservedSubstrings?: readonly string[]
  readonly markdownMarkers?: readonly string[]
  readonly expectedPatterns?: readonly WebGpuEvalPatternCheck[]
  readonly forbiddenPatterns?: readonly WebGpuEvalPatternCheck[]
  readonly exactOutputOptions?: readonly string[]
  readonly sourceShouldChange?: boolean
  readonly checkBalancedQuotes?: boolean
  readonly requiredSelectors?: readonly string[]
  readonly preservedAttributes?: readonly WebGpuEvalPreservedAttribute[]
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

type TranslationEvalJson = {
  readonly split: WebGpuEvalSplit
  readonly category: string
  readonly sourceLanguage: "en"
  readonly targetLanguage: WebGpuEvalCase["targetLanguage"]
  readonly contentType: WebGpuEvalContentType
  readonly source: {
    readonly text?: string
    readonly html?: string
  }
  readonly checks: {
    readonly sourceShouldChange?: boolean
    readonly expectedPatterns?: readonly string[]
    readonly forbiddenPatterns?: readonly string[]
    readonly preservedSubstrings?: readonly string[]
    readonly markdownMarkers?: readonly string[]
    readonly exactOutputOptions?: readonly string[]
    readonly checkBalancedQuotes?: boolean
    readonly requiredSelectors?: readonly string[]
    readonly preservedAttributes?: readonly WebGpuEvalPreservedAttribute[]
  }
}

const translationEvalModules = import.meta.glob<TranslationEvalJson>(
  "../../../evals/translation/*.json",
  { eager: true, import: "default" },
)

export const WEBGPU_EVAL_CORPUS = loadWebGpuEvalCorpus()

function loadWebGpuEvalCorpus(): readonly WebGpuEvalCase[] {
  const cases = Object.entries(translationEvalModules)
    .map(([path, json]) => createEvalCase(path, json))
    .sort((left, right) => left.id.localeCompare(right.id))

  assertUniqueIds(cases)
  return cases
}

function createEvalCase(path: string, json: TranslationEvalJson): WebGpuEvalCase {
  const id = caseIdFromPath(path)
  return {
    id,
    split: json.split,
    category: json.category,
    sourceText: sourceTextFor(json, id),
    sourceLanguage: json.sourceLanguage,
    targetLanguage: json.targetLanguage,
    contentType: json.contentType,
    sourceShouldChange: json.checks.sourceShouldChange,
    preservedSubstrings: json.checks.preservedSubstrings,
    markdownMarkers: json.checks.markdownMarkers,
    expectedPatterns: compilePatterns("expected-pattern", json.checks.expectedPatterns),
    forbiddenPatterns: compilePatterns("forbidden-pattern", json.checks.forbiddenPatterns),
    exactOutputOptions: json.checks.exactOutputOptions,
    checkBalancedQuotes: json.checks.checkBalancedQuotes,
    requiredSelectors: json.checks.requiredSelectors,
    preservedAttributes: json.checks.preservedAttributes,
  }
}

function caseIdFromPath(path: string): string {
  const filename = path.split("/").at(-1)
  if (!filename?.endsWith(".json")) throw new Error(`Invalid eval corpus path: ${path}`)
  return filename.slice(0, -".json".length)
}

function sourceTextFor(json: TranslationEvalJson, id: string): string {
  if (json.contentType === "dom") {
    if (!json.source.html) throw new Error(`DOM eval case ${id} is missing source.html`)
    return json.source.html
  }

  if (!json.source.text) throw new Error(`Text eval case ${id} is missing source.text`)
  return json.source.text
}

function compilePatterns(
  namePrefix: "expected-pattern" | "forbidden-pattern",
  patterns: readonly string[] = [],
): readonly WebGpuEvalPatternCheck[] {
  return patterns.map((rawPattern, index) => {
    const { source, flags } = parseRegexSource(rawPattern)
    return {
      name: `${namePrefix}:${index + 1}`,
      pattern: new RegExp(source, flags),
      note: rawPattern,
    }
  })
}

function parseRegexSource(rawPattern: string): { readonly source: string; readonly flags: string } {
  if (rawPattern.startsWith("(?i)")) {
    return { source: rawPattern.slice("(?i)".length), flags: "i" }
  }

  return { source: rawPattern, flags: "" }
}

function assertUniqueIds(cases: readonly WebGpuEvalCase[]): void {
  const seen = new Set<string>()
  for (const evalCase of cases) {
    if (seen.has(evalCase.id)) throw new Error(`Duplicate WebGPU eval case id: ${evalCase.id}`)
    seen.add(evalCase.id)
  }
}

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

function createHtmlFragment(html: string): DocumentFragment | null {
  if (typeof document === "undefined") return null

  const template = document.createElement("template")
  template.innerHTML = html
  return template.content
}

function scoreRequiredSelector(
  fragment: DocumentFragment | null,
  selector: string,
  output: string,
): WebGpuEvalCheck {
  return createCheck(
    `selector:${selector}`,
    fragment !== null && fragment.querySelector(selector) !== null,
    `HTML contains selector ${selector}`,
    output,
  )
}

function scorePreservedAttribute(
  fragment: DocumentFragment | null,
  expected: WebGpuEvalPreservedAttribute,
  output: string,
): WebGpuEvalCheck {
  const actual = fragment?.querySelector(expected.selector)?.getAttribute(expected.attribute)

  return createCheck(
    `attribute:${expected.selector}[${expected.attribute}]`,
    actual === expected.value,
    expected.value,
    actual ?? "<missing>",
    output,
  )
}

export function scoreWebGpuEvalCase(
  evalCase: WebGpuEvalCase,
  rawOutput: string,
): ScoredWebGpuEvalCase {
  const normalizedOutput = normalizeText(rawOutput)
  const htmlFragment = evalCase.contentType === "dom" ? createHtmlFragment(rawOutput) : null
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

  for (const forbidden of evalCase.forbiddenPatterns ?? []) {
    checks.push(
      createCheck(
        forbidden.name,
        !forbidden.pattern.test(rawOutput),
        `does not match ${forbidden.pattern}`,
        normalizedOutput,
        forbidden.note,
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

  for (const selector of evalCase.requiredSelectors ?? []) {
    checks.push(scoreRequiredSelector(htmlFragment, selector, normalizedOutput))
  }

  for (const attribute of evalCase.preservedAttributes ?? []) {
    checks.push(scorePreservedAttribute(htmlFragment, attribute, normalizedOutput))
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
