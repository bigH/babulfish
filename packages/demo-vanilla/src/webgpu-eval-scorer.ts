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

export type WebGpuEvalReference = {
  readonly quality?: string
  readonly text?: string
  readonly html?: string
  readonly notes?: string
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
  readonly references: readonly WebGpuEvalReference[]
}

export type WebGpuEvalCheck = {
  readonly name: string
  readonly pass: boolean
  readonly expected: string
  readonly actual: string
  readonly note?: string
}

export type WebGpuEvalCaseScoreBreakdown = {
  readonly checkScore: number
  readonly referenceSimilarity: number
  readonly hardFailure: boolean
  readonly hardFailureReason: string | null
}

export type ScoredWebGpuEvalCase = {
  readonly normalizedOutput: string
  readonly checks: readonly WebGpuEvalCheck[]
  readonly pass: boolean
  readonly score: number
  readonly scoreBreakdown: WebGpuEvalCaseScoreBreakdown
}

export type WebGpuEvalModelScoreBreakdown = {
  readonly weightedCheckScore: number
  readonly passedCaseRatio: number
  readonly referenceSimilarity: number
  readonly hardFailureCount: number
  readonly failureReason: string | null
}

export type WebGpuEvalModelScoreSummary = {
  readonly score: number
  readonly scoreBreakdown: WebGpuEvalModelScoreBreakdown
  readonly failuresByCategory: Readonly<Record<string, number>>
  readonly failuresByCheck: Readonly<Record<string, number>>
}

const EXPLANATION_WRAPPER_PATTERN =
  /\b(here is|here's|translation:|translated text|the translation|spanish:|french:|arabic:|in spanish|in french|in arabic|as requested|sure[,!]|voici|traduction\s*:|aqui esta|aqu[ií] est[aá])\b/i

const PROMPT_ECHO_PATTERN =
  /\b(translate from|output only|you are a translation engine|preserve these exact substrings|source language|target language)\b/i

const ARABIC_SCRIPT_PATTERN = /\p{Script=Arabic}/u
const CHRF_MAX_NGRAM = 6
const CHRF_BETA = 2
const CASE_CHECK_SCORE_WEIGHT = 0.85
const CASE_REFERENCE_SIMILARITY_WEIGHT = 0.15
const MODEL_CHECK_SCORE_WEIGHT = 0.7
const MODEL_PASSED_CASE_RATIO_WEIGHT = 0.2
const MODEL_REFERENCE_SIMILARITY_WEIGHT = 0.1

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
  readonly references: readonly WebGpuEvalReference[]
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
    references: referencesFor(json, id),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function optionalString(value: unknown, label: string, id: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string") return value
  throw new Error(`Eval case ${id} has non-string reference.${label}`)
}

function referencesFor(
  json: TranslationEvalJson,
  id: string,
): readonly WebGpuEvalReference[] {
  const references = (json as { references?: unknown }).references
  if (!Array.isArray(references) || references.length === 0) {
    throw new Error(`Eval case ${id} must define at least one reference translation`)
  }

  return references.map((reference, index) =>
    referenceFor(json.contentType, reference, id, index),
  )
}

function referenceFor(
  contentType: WebGpuEvalContentType,
  reference: unknown,
  id: string,
  index: number,
): WebGpuEvalReference {
  if (!isRecord(reference)) {
    throw new Error(`Eval case ${id} reference ${index + 1} must be an object`)
  }

  const text = optionalString(reference.text, "text", id)
  const html = optionalString(reference.html, "html", id)
  const quality = optionalString(reference.quality, "quality", id)
  const notes = optionalString(reference.notes, "notes", id)

  if (contentType === "dom") {
    if (!html) {
      throw new Error(`DOM eval case ${id} reference ${index + 1} must define html`)
    }
  } else if (!text) {
    throw new Error(`Text eval case ${id} reference ${index + 1} must define text`)
  }

  return {
    ...(quality ? { quality } : {}),
    ...(text ? { text } : {}),
    ...(html ? { html } : {}),
    ...(notes ? { notes } : {}),
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
  return text.normalize("NFC").replace(/\s+/g, " ").trim()
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

function styleHidesElement(style: string): boolean {
  return /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\s*(?:;|$)/i.test(style)
}

function isHiddenElement(element: Element): boolean {
  if (
    element.tagName === "SCRIPT" ||
    element.tagName === "STYLE" ||
    element.tagName === "NOSCRIPT" ||
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return true
  }

  return styleHidesElement(element.getAttribute("style") ?? "")
}

function visibleTextFromHtml(html: string): string {
  const fragment = createHtmlFragment(html)
  if (fragment === null) return normalizeText(html.replace(/<[^>]*>/g, " "))

  const visibleText: string[] = []
  const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let parent = node.parentElement
      while (parent) {
        if (isHiddenElement(parent)) return NodeFilter.FILTER_REJECT
        parent = parent.parentElement
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })

  let current = walker.nextNode()
  while (current) {
    visibleText.push(current.textContent ?? "")
    current = walker.nextNode()
  }

  return normalizeText(visibleText.join(" "))
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

function roundScore(score: number): number {
  return Math.round(clampScore(score) * 1_000_000) / 1_000_000
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  if (score < 0) return 0
  if (score > 1) return 1
  return score
}

function characterNgramCounts(text: string, size: number): Map<string, number> {
  const chars = Array.from(text)
  const counts = new Map<string, number>()
  if (chars.length < size) return counts

  for (let index = 0; index <= chars.length - size; index += 1) {
    const gram = chars.slice(index, index + size).join("")
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }

  return counts
}

function totalNgramCount(counts: ReadonlyMap<string, number>): number {
  let total = 0
  for (const count of counts.values()) total += count
  return total
}

function overlapNgramCount(
  candidate: ReadonlyMap<string, number>,
  reference: ReadonlyMap<string, number>,
): number {
  let total = 0
  for (const [gram, candidateCount] of candidate) {
    total += Math.min(candidateCount, reference.get(gram) ?? 0)
  }
  return total
}

export function chrfSimilarity(candidate: string, reference: string): number {
  const normalizedCandidate = normalizeText(candidate)
  const normalizedReference = normalizeText(reference)

  if (normalizedCandidate.length === 0) return 0
  if (normalizedCandidate === normalizedReference) return 1

  let overlap = 0
  let candidateTotal = 0
  let referenceTotal = 0

  for (let size = 1; size <= CHRF_MAX_NGRAM; size += 1) {
    const candidateCounts = characterNgramCounts(normalizedCandidate, size)
    const referenceCounts = characterNgramCounts(normalizedReference, size)
    overlap += overlapNgramCount(candidateCounts, referenceCounts)
    candidateTotal += totalNgramCount(candidateCounts)
    referenceTotal += totalNgramCount(referenceCounts)
  }

  if (candidateTotal === 0 || referenceTotal === 0 || overlap === 0) return 0

  const precision = overlap / candidateTotal
  const recall = overlap / referenceTotal
  const betaSquared = CHRF_BETA * CHRF_BETA

  return roundScore(
    ((1 + betaSquared) * precision * recall) / (betaSquared * precision + recall),
  )
}

function referenceTextFor(evalCase: WebGpuEvalCase, reference: WebGpuEvalReference): string | null {
  if (evalCase.contentType === "dom") {
    if (reference.html) return visibleTextFromHtml(reference.html)
    if (reference.text) return reference.text
    return null
  }

  if (reference.text) return reference.text
  if (reference.html) return visibleTextFromHtml(reference.html)
  return null
}

function exactOutputOptionMatches(evalCase: WebGpuEvalCase, output: string): boolean {
  const options = evalCase.exactOutputOptions
  if (!options) return false
  const normalizedOutput = normalizeText(output)
  return options.some((option) => normalizeText(option) === normalizedOutput)
}

export function scoreReferenceSimilarity(
  evalCase: WebGpuEvalCase,
  rawOutput: string,
): number {
  const normalizedOutput = normalizeText(rawOutput)
  if (normalizedOutput.length === 0) return 0
  if (exactOutputOptionMatches(evalCase, rawOutput)) return 1

  const candidate =
    evalCase.contentType === "dom" ? visibleTextFromHtml(rawOutput) : normalizedOutput
  const references = evalCase.references
    .map((reference) => referenceTextFor(evalCase, reference))
    .filter(
      (reference): reference is string =>
        reference !== null && normalizeText(reference).length > 0,
    )

  if (references.length === 0) return 0

  return roundScore(
    Math.max(...references.map((reference) => chrfSimilarity(candidate, reference))),
  )
}

function passedCheckRatio(checks: readonly WebGpuEvalCheck[]): number {
  if (checks.length === 0) return 0
  const passed = checks.filter((check) => check.pass).length
  return passed / checks.length
}

function failedCheck(checks: readonly WebGpuEvalCheck[], name: string): boolean {
  return checks.some((check) => check.name === name && !check.pass)
}

function hardFailureReasonFor(
  evalCase: WebGpuEvalCase,
  rawOutput: string,
  normalizedOutput: string,
  checks: readonly WebGpuEvalCheck[],
): string | null {
  if (failedCheck(checks, "non-empty-output")) return "empty-output"
  if (failedCheck(checks, "no-prompt-echo")) return "prompt-echo"
  if (failedCheck(checks, "no-explanation-wrapper")) return "explanation-wrapper"
  if (evalCase.sourceShouldChange && sourceLooksCopied(evalCase.sourceText, rawOutput)) {
    return "source-copied"
  }
  if (evalCase.targetLanguage === "ar" && !ARABIC_SCRIPT_PATTERN.test(normalizedOutput)) {
    return "wrong-target-script"
  }
  return null
}

function buildCaseScoreBreakdown(
  evalCase: WebGpuEvalCase,
  rawOutput: string,
  normalizedOutput: string,
  checks: readonly WebGpuEvalCheck[],
): WebGpuEvalCaseScoreBreakdown {
  const hardFailureReason = hardFailureReasonFor(evalCase, rawOutput, normalizedOutput, checks)
  const hardFailure = hardFailureReason !== null

  return {
    checkScore: hardFailure ? 0 : roundScore(passedCheckRatio(checks)),
    referenceSimilarity: hardFailure ? 0 : scoreReferenceSimilarity(evalCase, rawOutput),
    hardFailure,
    hardFailureReason,
  }
}

function caseScoreFromBreakdown(breakdown: WebGpuEvalCaseScoreBreakdown): number {
  if (breakdown.hardFailure) return 0

  return roundScore(
    breakdown.checkScore * CASE_CHECK_SCORE_WEIGHT +
      breakdown.referenceSimilarity * CASE_REFERENCE_SIMILARITY_WEIGHT,
  )
}

export function scoreWebGpuEvalGenerationFailure(
  errorMessage: string,
): ScoredWebGpuEvalCase {
  return scoreFailedEvalCase("", {
    checkName: "generation-completed",
    expected: "translation resolves",
    errorMessage,
    hardFailureReason: "generation-error",
  })
}

export function scoreWebGpuEvalValidationFailure(
  rawOutput: string,
  errorMessage: string,
): ScoredWebGpuEvalCase {
  return scoreFailedEvalCase(rawOutput, {
    checkName: "scoring-completed",
    expected: "scoring completes",
    errorMessage,
    hardFailureReason: "validation-error",
  })
}

function scoreFailedEvalCase(
  rawOutput: string,
  failure: {
    readonly checkName: string
    readonly expected: string
    readonly errorMessage: string
    readonly hardFailureReason: string
  },
): ScoredWebGpuEvalCase {
  const checks = [
    createCheck(
      failure.checkName,
      false,
      failure.expected,
      failure.errorMessage,
    ),
  ]

  return {
    normalizedOutput: normalizeText(rawOutput),
    checks,
    pass: false,
    score: 0,
    scoreBreakdown: {
      checkScore: 0,
      referenceSimilarity: 0,
      hardFailure: true,
      hardFailureReason: failure.hardFailureReason,
    },
  }
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

  const scoreBreakdown = buildCaseScoreBreakdown(
    evalCase,
    rawOutput,
    normalizedOutput,
    checks,
  )

  return {
    normalizedOutput,
    checks,
    pass: checks.every((check) => check.pass),
    score: caseScoreFromBreakdown(scoreBreakdown),
    scoreBreakdown,
  }
}

export type WebGpuEvalModelScoreCase = {
  readonly category: string
  readonly checks: readonly WebGpuEvalCheck[]
  readonly pass: boolean
  readonly scoreBreakdown: WebGpuEvalCaseScoreBreakdown
}

function incrementCounter(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1
}

function failuresByCategory(
  cases: readonly WebGpuEvalModelScoreCase[],
): Readonly<Record<string, number>> {
  const failures: Record<string, number> = {}

  for (const evalCase of cases) {
    if (evalCase.pass) continue
    incrementCounter(failures, evalCase.category)
  }

  return failures
}

function failuresByCheck(
  cases: readonly WebGpuEvalModelScoreCase[],
): Readonly<Record<string, number>> {
  const failures: Record<string, number> = {}

  for (const evalCase of cases) {
    for (const check of evalCase.checks) {
      if (check.pass) continue
      incrementCounter(failures, check.name)
    }
  }

  return failures
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function scoreWebGpuEvalModel(
  cases: readonly WebGpuEvalModelScoreCase[],
  failureReason: string | null = null,
): WebGpuEvalModelScoreSummary {
  if (failureReason !== null) {
    return {
      score: 0,
      scoreBreakdown: {
        weightedCheckScore: 0,
        passedCaseRatio: 0,
        referenceSimilarity: 0,
        hardFailureCount: 0,
        failureReason,
      },
      failuresByCategory: {},
      failuresByCheck: {},
    }
  }

  const weightedCheckScore = roundScore(
    average(cases.map((evalCase) => evalCase.scoreBreakdown.checkScore)),
  )
  const passedCaseRatio = roundScore(
    cases.length === 0 ? 0 : cases.filter((evalCase) => evalCase.pass).length / cases.length,
  )
  const referenceSimilarity = roundScore(
    average(cases.map((evalCase) => evalCase.scoreBreakdown.referenceSimilarity)),
  )
  const hardFailureCount = cases.filter(
    (evalCase) => evalCase.scoreBreakdown.hardFailure,
  ).length

  return {
    score: roundScore(
      weightedCheckScore * MODEL_CHECK_SCORE_WEIGHT +
        passedCaseRatio * MODEL_PASSED_CASE_RATIO_WEIGHT +
        referenceSimilarity * MODEL_REFERENCE_SIMILARITY_WEIGHT,
    ),
    scoreBreakdown: {
      weightedCheckScore,
      passedCaseRatio,
      referenceSimilarity,
      hardFailureCount,
      failureReason: null,
    },
    failuresByCategory: failuresByCategory(cases),
    failuresByCheck: failuresByCheck(cases),
  }
}

export function isWebGpuEvalModelId(value: string): value is WebGpuEvalModelId {
  return WEBGPU_EVAL_MODEL_IDS.includes(value as WebGpuEvalModelId)
}
