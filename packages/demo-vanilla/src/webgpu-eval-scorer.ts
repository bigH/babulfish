/// <reference types="vite/client" />

export type WebGpuEvalModelId =
  | "qwen-3-0.6b"
  | "gemma-3-1b-it"
  | "translategemma-4"

export const WEBGPU_EVAL_CORPUS_GLOB_PATTERNS = {
  legacyFlat: "../../../evals/translation/*.json",
  grouped: "../../../evals/translation/*/*/*/*/*.json",
  schemaExclusion: "!../../../evals/translation/schema.json",
} as const

export const WEBGPU_EVAL_SPLITS = [
  "targeted",
  "general",
  "holdout",
] as const

export const WEBGPU_EVAL_LANGUAGES = [
  "en",
  "es",
  "fr",
  "ar",
  "de",
  "ja",
  "hi",
] as const

export const WEBGPU_EVAL_SOURCE_CLASSES = [
  "first_party_authored",
  "product_derived_rewrite",
  "synthetic_template",
  "public_benchmark",
  "public_web",
  "unknown",
] as const

export const WEBGPU_EVAL_PUBLIC_EXPOSURES = [
  "private",
  "public",
  "mixed",
  "unknown",
] as const

export const WEBGPU_EVAL_REVIEW_STATUSES = [
  "draft",
  "reference_reviewed",
  "technical_reviewed",
  "holdout_approved",
  "deprecated",
] as const

export const WEBGPU_EVAL_DEFAULT_LOCAL_SPLITS = [
  "targeted",
  "general",
] as const satisfies readonly WebGpuEvalSplit[]

export type WebGpuEvalSplit = (typeof WEBGPU_EVAL_SPLITS)[number]
export type WebGpuEvalLanguage = (typeof WEBGPU_EVAL_LANGUAGES)[number]
export type WebGpuEvalContentType = "text" | "markdown" | "dom"
export type WebGpuEvalSourceClass = (typeof WEBGPU_EVAL_SOURCE_CLASSES)[number]
export type WebGpuEvalPublicExposure = (typeof WEBGPU_EVAL_PUBLIC_EXPOSURES)[number]
export type WebGpuEvalReviewStatus = (typeof WEBGPU_EVAL_REVIEW_STATUSES)[number]

export type WebGpuEvalProvenance = {
  readonly sourceClass: WebGpuEvalSourceClass
  readonly authorId: string
  readonly createdAt: string
  readonly sourceOrigin: string
  readonly derivedFrom: string | null
  readonly publicExposure: WebGpuEvalPublicExposure
  readonly reviewStatus: WebGpuEvalReviewStatus
  readonly referenceTranslatorId: string
  readonly referenceReviewerId: string
  readonly referenceReviewDate: string
  readonly technicalReviewerId: string
  readonly technicalReviewDate: string
  readonly notes: string
}

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

type WebGpuEvalPreservedSubstringCount = {
  readonly value: string
  readonly count?: number
  readonly caseSensitive?: boolean
}

type WebGpuEvalMarkdownStructure = {
  readonly headings?: readonly {
    readonly level: number
    readonly count: number
  }[]
  readonly unorderedListItems?: number
  readonly orderedListItems?: number
  readonly minListDepth?: number
  readonly fencedCodeBlocks?: {
    readonly count?: number
    readonly languages?: readonly string[]
  }
  readonly inlineCode?: {
    readonly count?: number
    readonly texts?: readonly string[]
  }
  readonly links?: {
    readonly count?: number
    readonly labels?: readonly string[]
    readonly hrefs?: readonly string[]
  }
  readonly images?: {
    readonly count?: number
    readonly altTexts?: readonly string[]
    readonly srcs?: readonly string[]
  }
  readonly tables?: {
    readonly rows?: number
    readonly cells?: number
  }
  readonly blockquotes?: number
  readonly frontmatter?: {
    readonly keys?: readonly string[]
  }
}

type WebGpuEvalCompiledPattern = {
  readonly pattern: RegExp
  readonly note: string
}

type WebGpuEvalDomSelectorCount = {
  readonly selector: string
  readonly count: number
}

type WebGpuEvalDomVisibleText = {
  readonly selector: string
  readonly text?: string
  readonly pattern?: WebGpuEvalCompiledPattern
}

type WebGpuEvalTranslatedAttribute = {
  readonly selector: string
  readonly attribute: string
  readonly expectedText?: string
  readonly expectedPattern?: WebGpuEvalCompiledPattern
  readonly forbiddenPattern?: WebGpuEvalCompiledPattern
  readonly shouldChange?: boolean
}

type WebGpuEvalDomTextIsland = {
  readonly selector: string
  readonly text?: string
}

type WebGpuEvalDomRootDir = {
  readonly selector?: string
  readonly dir: "ltr" | "rtl"
}

export type WebGpuEvalDomRunnerConfig = {
  readonly richText?: {
    readonly selector: string
    readonly sourceAttribute: string
  }
  readonly structuredText?: {
    readonly selector: string
  }
  readonly linkedBy?: {
    readonly selector: string
    readonly keyAttribute: string
  }
  readonly translateAttributes?: readonly string[]
  readonly preserveMatchers?: readonly string[]
  readonly skipTags?: readonly string[]
  readonly skipTextPatterns?: readonly WebGpuEvalCompiledPattern[]
}

export type WebGpuEvalSelection = {
  readonly split?: readonly WebGpuEvalSplit[]
  readonly category?: readonly string[]
  readonly contentType?: readonly WebGpuEvalContentType[]
  readonly sourceLanguage?: readonly WebGpuEvalLanguage[]
  readonly targetLanguage?: readonly WebGpuEvalLanguage[]
  readonly languagePair?: readonly string[]
  readonly sourceClass?: readonly WebGpuEvalSourceClass[]
}

export type WebGpuEvalRunMetadata = {
  readonly runner: string
  readonly timestamp: string
  readonly modelId: WebGpuEvalModelId
  readonly filters: WebGpuEvalSelection
  readonly reason: string | null
  readonly referencesExposed: boolean
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
  readonly sourceLanguage: WebGpuEvalLanguage
  readonly targetLanguage: WebGpuEvalLanguage
  readonly contentType: WebGpuEvalContentType
  readonly sourceClass?: WebGpuEvalSourceClass
  readonly provenance?: WebGpuEvalProvenance
  readonly preservedSubstrings?: readonly string[]
  readonly preservedSubstringCounts?: readonly WebGpuEvalPreservedSubstringCount[]
  readonly markdownMarkers?: readonly string[]
  readonly markdownStructure?: WebGpuEvalMarkdownStructure
  readonly expectedPatterns?: readonly WebGpuEvalPatternCheck[]
  readonly forbiddenPatterns?: readonly WebGpuEvalPatternCheck[]
  readonly exactOutputOptions?: readonly string[]
  readonly sourceShouldChange?: boolean
  readonly checkBalancedQuotes?: boolean
  readonly requiredSelectors?: readonly string[]
  readonly domSelectorCounts?: readonly WebGpuEvalDomSelectorCount[]
  readonly domVisibleText?: readonly WebGpuEvalDomVisibleText[]
  readonly preservedAttributes?: readonly WebGpuEvalPreservedAttribute[]
  readonly translatedAttributes?: readonly WebGpuEvalTranslatedAttribute[]
  readonly domHiddenText?: readonly WebGpuEvalDomTextIsland[]
  readonly domSkippedText?: readonly WebGpuEvalDomTextIsland[]
  readonly domRootDir?: WebGpuEvalDomRootDir
  readonly domExecutableSafety?: boolean
  readonly domRunnerConfig?: WebGpuEvalDomRunnerConfig
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

export type WebGpuEvalCaseGroupSummary = {
  readonly split: WebGpuEvalSplit
  readonly contentType: WebGpuEvalContentType
  readonly category: string
  readonly languagePair: string
  readonly sourceClass: WebGpuEvalSourceClass | "missing"
  readonly total: number
  readonly passed: number
  readonly failed: number
  readonly hardFailures: number
  readonly failuresByCheck: Readonly<Record<string, number>>
}

export type WebGpuEvalScoreAggregationCase = WebGpuEvalModelScoreCase & {
  readonly id: string
  readonly split: WebGpuEvalSplit
  readonly sourceClass?: WebGpuEvalSourceClass
}

export type WebGpuEvalScoreGroupSummary = WebGpuEvalModelScoreSummary & {
  readonly split: WebGpuEvalSplit
  readonly sourceClass: WebGpuEvalSourceClass | "missing"
  readonly total: number
  readonly passed: number
  readonly failed: number
  readonly pass: boolean
}

export type WebGpuEvalCleanHeadlineScoreSummary = WebGpuEvalModelScoreSummary & {
  readonly pass: boolean
  readonly includedCases: number
  readonly excludedCases: number
  readonly excludedCaseIds: readonly string[]
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
  "qwen-3-0.6b",
  "gemma-3-1b-it",
  "translategemma-4",
] as const satisfies readonly WebGpuEvalModelId[]

export const DEFAULT_WEBGPU_EVAL_MODEL_ID: WebGpuEvalModelId = "qwen-3-0.6b"

type TranslationEvalJson = {
  readonly split: WebGpuEvalSplit
  readonly category: string
  readonly sourceLanguage: WebGpuEvalLanguage
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
    readonly preservedSubstringCounts?: readonly WebGpuEvalPreservedSubstringCount[]
    readonly markdownMarkers?: readonly string[]
    readonly markdownStructure?: WebGpuEvalMarkdownStructure
    readonly exactOutputOptions?: readonly string[]
    readonly checkBalancedQuotes?: boolean
    readonly requiredSelectors?: readonly string[]
    readonly domSelectorCounts?: readonly WebGpuEvalDomSelectorCount[]
    readonly domVisibleText?: readonly WebGpuEvalDomVisibleText[]
    readonly preservedAttributes?: readonly WebGpuEvalPreservedAttribute[]
    readonly translatedAttributes?: readonly WebGpuEvalTranslatedAttribute[]
    readonly domHiddenText?: readonly WebGpuEvalDomTextIsland[]
    readonly domSkippedText?: readonly WebGpuEvalDomTextIsland[]
    readonly domRootDir?: WebGpuEvalDomRootDir
    readonly domExecutableSafety?: boolean
  }
  readonly runner?: {
    readonly dom?: WebGpuEvalDomRunnerConfig
  }
  readonly provenance?: unknown
}

type TranslationEvalModuleMap = Readonly<Record<string, unknown>>

const WEBGPU_EVAL_CONTENT_TYPES = ["text", "markdown", "dom"] as const

const TOP_LEVEL_EVAL_KEYS = new Set([
  "split",
  "category",
  "sourceLanguage",
  "targetLanguage",
  "contentType",
  "source",
  "references",
  "checks",
  "runner",
  "provenance",
])

const SOURCE_KEYS = new Set(["text", "html"])
const REFERENCE_KEYS = new Set(["quality", "text", "html", "notes"])
const CHECK_KEYS = new Set([
  "sourceShouldChange",
  "expectedPatterns",
  "forbiddenPatterns",
  "preservedSubstrings",
  "preservedSubstringCounts",
  "markdownMarkers",
  "markdownStructure",
  "exactOutputOptions",
  "checkBalancedQuotes",
  "requiredSelectors",
  "domSelectorCounts",
  "domVisibleText",
  "preservedAttributes",
  "translatedAttributes",
  "domHiddenText",
  "domSkippedText",
  "domRootDir",
  "domExecutableSafety",
])

const MARKDOWN_STRUCTURE_KEYS = new Set([
  "headings",
  "unorderedListItems",
  "orderedListItems",
  "minListDepth",
  "fencedCodeBlocks",
  "inlineCode",
  "links",
  "images",
  "tables",
  "blockquotes",
  "frontmatter",
])

const FENCED_CODE_KEYS = new Set(["count", "languages"])
const INLINE_CODE_KEYS = new Set(["count", "texts"])
const LINK_KEYS = new Set(["count", "labels", "hrefs"])
const IMAGE_KEYS = new Set(["count", "altTexts", "srcs"])
const TABLE_KEYS = new Set(["rows", "cells"])
const FRONTMATTER_KEYS = new Set(["keys"])
const RUNNER_KEYS = new Set(["dom"])
const DOM_RUNNER_KEYS = new Set([
  "richText",
  "structuredText",
  "linkedBy",
  "translateAttributes",
  "preserveMatchers",
  "skipTags",
  "skipTextPatterns",
])
const RICH_TEXT_RUNNER_KEYS = new Set(["selector", "sourceAttribute"])
const STRUCTURED_TEXT_RUNNER_KEYS = new Set(["selector"])
const LINKED_BY_RUNNER_KEYS = new Set(["selector", "keyAttribute"])
const PROVENANCE_KEYS = new Set([
  "sourceClass",
  "authorId",
  "createdAt",
  "sourceOrigin",
  "derivedFrom",
  "publicExposure",
  "reviewStatus",
  "referenceTranslatorId",
  "referenceReviewerId",
  "referenceReviewDate",
  "technicalReviewerId",
  "technicalReviewDate",
  "notes",
])
const PRIVATE_HOLDOUT_SOURCE_CLASSES = new Set<WebGpuEvalSourceClass>([
  "first_party_authored",
  "product_derived_rewrite",
  "synthetic_template",
])
const PUBLIC_SOURCE_CLASSES = new Set<WebGpuEvalSourceClass>([
  "public_benchmark",
  "public_web",
])

const translationEvalModules = import.meta.glob<unknown>(
  // Vite requires literal glob patterns here; keep these synced with
  // WEBGPU_EVAL_CORPUS_GLOB_PATTERNS.
  [
    "../../../evals/translation/*.json",
    "../../../evals/translation/*/*/*/*/*.json",
    "!../../../evals/translation/schema.json",
  ],
  { eager: true, import: "default" },
)

export const WEBGPU_EVAL_CORPUS = loadWebGpuEvalCorpusFromModules(translationEvalModules)

export function loadWebGpuEvalCorpusFromModules(
  modules: TranslationEvalModuleMap,
): readonly WebGpuEvalCase[] {
  const cases = Object.entries(modules)
    .map(([path, json]) => createEvalCase(path, json))
    .sort((left, right) => left.id.localeCompare(right.id))

  assertUniqueIds(cases)
  return cases
}

function createEvalCase(path: string, rawJson: unknown): WebGpuEvalCase {
  const pathMetadata = evalCasePathMetadata(path)
  const json = translationEvalJsonFor(rawJson, pathMetadata.id)
  assertGroupedPathMatchesJson(pathMetadata, json)
  const provenance = provenanceFor(json.provenance, pathMetadata, json)
  const sourceText = sourceTextFor(json, pathMetadata.id)
  assertImplicitPreservedCountsExist(sourceText, json.checks.preservedSubstringCounts, pathMetadata.id)

  return {
    id: pathMetadata.id,
    split: json.split,
    category: json.category,
    sourceText,
    sourceLanguage: json.sourceLanguage,
    targetLanguage: json.targetLanguage,
    contentType: json.contentType,
    sourceClass: provenance?.sourceClass,
    provenance,
    sourceShouldChange: json.checks.sourceShouldChange,
    preservedSubstrings: json.checks.preservedSubstrings,
    preservedSubstringCounts: json.checks.preservedSubstringCounts,
    markdownMarkers: json.checks.markdownMarkers,
    markdownStructure: json.checks.markdownStructure,
    expectedPatterns: compilePatterns(
      "expected-pattern",
      json.checks.expectedPatterns,
      pathMetadata.id,
    ),
    forbiddenPatterns: compilePatterns(
      "forbidden-pattern",
      json.checks.forbiddenPatterns,
      pathMetadata.id,
    ),
    exactOutputOptions: json.checks.exactOutputOptions,
    checkBalancedQuotes: json.checks.checkBalancedQuotes,
    requiredSelectors: json.checks.requiredSelectors,
    domSelectorCounts: json.checks.domSelectorCounts,
    domVisibleText: json.checks.domVisibleText,
    preservedAttributes: json.checks.preservedAttributes,
    translatedAttributes: json.checks.translatedAttributes,
    domHiddenText: json.checks.domHiddenText,
    domSkippedText: json.checks.domSkippedText,
    domRootDir: json.checks.domRootDir,
    domExecutableSafety: json.checks.domExecutableSafety,
    domRunnerConfig: json.runner?.dom,
    references: json.references,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function assertKnownKeys(
  record: Readonly<Record<string, unknown>>,
  allowedKeys: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new Error(`${label} has unknown key: ${key}`)
  }
}

function requiredString(value: unknown, label: string, id: string): string {
  if (typeof value === "string" && value.length > 0) return value
  throw new Error(`Eval case ${id} must define string ${label}`)
}

function optionalString(value: unknown, label: string, id: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string") return value
  throw new Error(`Eval case ${id} has non-string ${label}`)
}

function optionalBoolean(value: unknown, label: string, id: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value === "boolean") return value
  throw new Error(`Eval case ${id} has non-boolean ${label}`)
}

function optionalStringList(
  value: unknown,
  label: string,
  id: string,
): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Eval case ${id} must define ${label} as an array of strings`)
  }
  return value
}

function requiredCount(value: unknown, label: string, id: string): number {
  if (Number.isInteger(value) && Number(value) >= 0) return Number(value)
  throw new Error(`Eval case ${id} must define ${label} as a non-negative integer`)
}

function optionalCount(value: unknown, label: string, id: string): number | undefined {
  if (value === undefined) return undefined
  return requiredCount(value, label, id)
}

function requiredOneBasedCount(value: unknown, label: string, id: string): number {
  const count = requiredCount(value, label, id)
  if (count > 0) return count
  throw new Error(`Eval case ${id} must define ${label} as a positive integer`)
}

function requiredSelector(value: unknown, label: string, id: string): string {
  const selector = requiredString(value, label, id)
  assertValidCssSelector(selector, label, id)
  return selector
}

function optionalSelector(value: unknown, label: string, id: string): string | undefined {
  if (value === undefined) return undefined
  return requiredSelector(value, label, id)
}

function requiredEnum<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  label: string,
  id: string,
): T {
  if (typeof value === "string" && allowedValues.includes(value as T)) return value as T
  throw new Error(
    `Eval case ${id} has invalid ${label}: ${String(value)}`,
  )
}

function requiredDateString(value: unknown, label: string, id: string): string {
  const date = requiredString(value, label, id)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  throw new Error(`Eval case ${id} must define ${label} as YYYY-MM-DD`)
}

function requiredNullableString(value: unknown, label: string, id: string): string | null {
  if (value === null) return null
  return requiredString(value, label, id)
}

function hasConcreteText(value: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function hasVaguePrivateSourceOrigin(sourceOrigin: string): boolean {
  return new Set(["private", "internal", "unknown"]).has(
    sourceOrigin.trim().toLocaleLowerCase("en-US"),
  )
}

function assertProvenancePolicy(
  provenance: WebGpuEvalProvenance,
  split: WebGpuEvalSplit,
  id: string,
): void {
  if (
    (provenance.sourceClass === "synthetic_template" ||
      provenance.sourceClass === "product_derived_rewrite") &&
    !hasConcreteText(provenance.derivedFrom)
  ) {
    throw new Error(
      `Eval case ${id} provenance.derivedFrom is required for sourceClass ${provenance.sourceClass}`,
    )
  }

  const isPublicSource = PUBLIC_SOURCE_CLASSES.has(provenance.sourceClass)

  if (isPublicSource && split !== "general") {
    throw new Error(
      `Eval case ${id} provenance sourceClass ${provenance.sourceClass} is only allowed in general`,
    )
  }

  if (split === "holdout") {
    if (!PRIVATE_HOLDOUT_SOURCE_CLASSES.has(provenance.sourceClass)) {
      throw new Error(
        `Eval case ${id} holdout provenance.sourceClass must be private and auditable`,
      )
    }
    if (provenance.publicExposure !== "private") {
      throw new Error(
        `Eval case ${id} holdout provenance.publicExposure must be private`,
      )
    }
    if (provenance.reviewStatus !== "holdout_approved") {
      throw new Error(
        `Eval case ${id} holdout provenance.reviewStatus must be holdout_approved`,
      )
    }
    if (hasVaguePrivateSourceOrigin(provenance.sourceOrigin)) {
      throw new Error(
        `Eval case ${id} holdout provenance.sourceOrigin must name a concrete private source`,
      )
    }
  }

  if (split === "general" && isPublicSource) {
    if (provenance.publicExposure !== "public" && provenance.publicExposure !== "mixed") {
      throw new Error(
        `Eval case ${id} public-source general provenance.publicExposure must be public or mixed`,
      )
    }
    if (!/contamination/i.test(provenance.notes)) {
      throw new Error(
        `Eval case ${id} public-source general provenance.notes must include a contamination warning`,
      )
    }
    if (provenance.reviewStatus === "holdout_approved") {
      throw new Error(
        `Eval case ${id} public-source general provenance.reviewStatus must not be holdout_approved`,
      )
    }
  }
}

function provenanceFor(
  value: unknown,
  metadata: EvalCasePathMetadata,
  json: TranslationEvalJson,
): WebGpuEvalProvenance | undefined {
  if (value === undefined) {
    if (
      metadata.kind === "grouped" ||
      json.split === "holdout"
    ) {
      throw new Error(`Eval case ${metadata.id} must define provenance`)
    }
    return undefined
  }

  if (!isRecord(value)) throw new Error(`Eval case ${metadata.id} must define provenance object`)
  assertKnownKeys(value, PROVENANCE_KEYS, `Eval case ${metadata.id} provenance`)

  const provenance: WebGpuEvalProvenance = {
    sourceClass: requiredEnum(
      value.sourceClass,
      WEBGPU_EVAL_SOURCE_CLASSES,
      "provenance.sourceClass",
      metadata.id,
    ),
    authorId: requiredString(value.authorId, "provenance.authorId", metadata.id),
    createdAt: requiredDateString(value.createdAt, "provenance.createdAt", metadata.id),
    sourceOrigin: requiredString(value.sourceOrigin, "provenance.sourceOrigin", metadata.id),
    derivedFrom: requiredNullableString(value.derivedFrom, "provenance.derivedFrom", metadata.id),
    publicExposure: requiredEnum(
      value.publicExposure,
      WEBGPU_EVAL_PUBLIC_EXPOSURES,
      "provenance.publicExposure",
      metadata.id,
    ),
    reviewStatus: requiredEnum(
      value.reviewStatus,
      WEBGPU_EVAL_REVIEW_STATUSES,
      "provenance.reviewStatus",
      metadata.id,
    ),
    referenceTranslatorId: requiredString(
      value.referenceTranslatorId,
      "provenance.referenceTranslatorId",
      metadata.id,
    ),
    referenceReviewerId: requiredString(
      value.referenceReviewerId,
      "provenance.referenceReviewerId",
      metadata.id,
    ),
    referenceReviewDate: requiredDateString(
      value.referenceReviewDate,
      "provenance.referenceReviewDate",
      metadata.id,
    ),
    technicalReviewerId: requiredString(
      value.technicalReviewerId,
      "provenance.technicalReviewerId",
      metadata.id,
    ),
    technicalReviewDate: requiredDateString(
      value.technicalReviewDate,
      "provenance.technicalReviewDate",
      metadata.id,
    ),
    notes: requiredString(value.notes, "provenance.notes", metadata.id),
  }

  assertProvenancePolicy(provenance, json.split, metadata.id)
  return provenance
}

function assertValidCssSelector(selector: string, label: string, id: string): void {
  if (typeof document === "undefined") return

  try {
    document.createDocumentFragment().querySelector(selector)
  } catch (error) {
    throw new Error(
      `Eval case ${id} has invalid CSS selector ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function sourceFor(value: unknown, id: string): TranslationEvalJson["source"] {
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define source object`)
  assertKnownKeys(value, SOURCE_KEYS, `Eval case ${id} source`)

  return {
    ...(optionalString(value.text, "source.text", id) ? { text: value.text as string } : {}),
    ...(optionalString(value.html, "source.html", id) ? { html: value.html as string } : {}),
  }
}

function preservedAttributesFor(
  value: unknown,
  id: string,
): readonly WebGpuEvalPreservedAttribute[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error(`Eval case ${id} must define checks.preservedAttributes as an array`)
  }

  return value.map((attribute, index) => {
    if (!isRecord(attribute)) {
      throw new Error(
        `Eval case ${id} checks.preservedAttributes ${index + 1} must be an object`,
      )
    }

    const selector = requiredString(
      attribute.selector,
      `checks.preservedAttributes ${index + 1}.selector`,
      id,
    )
    assertValidCssSelector(selector, `checks.preservedAttributes ${index + 1}.selector`, id)
    const attributeName = requiredString(
      attribute.attribute,
      `checks.preservedAttributes ${index + 1}.attribute`,
      id,
    )
    const expectedValue = requiredString(
      attribute.value,
      `checks.preservedAttributes ${index + 1}.value`,
      id,
    )

    return { selector, attribute: attributeName, value: expectedValue }
  })
}

function preservedSubstringCountsFor(
  value: unknown,
  id: string,
): readonly WebGpuEvalPreservedSubstringCount[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new Error(`Eval case ${id} must define checks.preservedSubstringCounts as an array`)
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(
        `Eval case ${id} checks.preservedSubstringCounts ${index + 1} must be an object`,
      )
    }
    assertKnownKeys(
      item,
      new Set(["value", "count", "caseSensitive"]),
      `Eval case ${id} checks.preservedSubstringCounts ${index + 1}`,
    )

    return {
      value: requiredString(item.value, `checks.preservedSubstringCounts ${index + 1}.value`, id),
      ...(item.count !== undefined
        ? { count: requiredOneBasedCount(item.count, `checks.preservedSubstringCounts ${index + 1}.count`, id) }
        : {}),
      ...(item.caseSensitive !== undefined
        ? {
            caseSensitive: optionalBoolean(
              item.caseSensitive,
              `checks.preservedSubstringCounts ${index + 1}.caseSensitive`,
              id,
            ),
          }
        : {}),
    }
  })
}

function assertImplicitPreservedCountsExist(
  sourceText: string,
  values: readonly WebGpuEvalPreservedSubstringCount[] | undefined,
  id: string,
): void {
  for (const value of values ?? []) {
    if (value.count !== undefined) continue
    const count = countSubstringOccurrences(
      sourceText,
      value.value,
      value.caseSensitive ?? true,
    )
    if (count === 0) {
      throw new Error(
        `Eval case ${id} preservedSubstringCounts value ${value.value} is absent from source and has no explicit count`,
      )
    }
  }
}

function countObjectFor(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
  id: string,
): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define ${label} as an object`)
  assertKnownKeys(value, allowedKeys, `Eval case ${id} ${label}`)
  return value
}

function markdownStructureFor(
  value: unknown,
  id: string,
): WebGpuEvalMarkdownStructure | undefined {
  if (value === undefined) return undefined
  const record = countObjectFor(value, MARKDOWN_STRUCTURE_KEYS, "checks.markdownStructure", id)
  const headings = record.headings
  if (
    headings !== undefined &&
    (!Array.isArray(headings) || headings.some((heading) => !isRecord(heading)))
  ) {
    throw new Error(`Eval case ${id} must define checks.markdownStructure.headings as objects`)
  }

  return {
    ...(headings !== undefined
      ? {
          headings: (headings as readonly Record<string, unknown>[]).map((heading, index) => {
            assertKnownKeys(
              heading,
              new Set(["level", "count"]),
              `Eval case ${id} checks.markdownStructure.headings ${index + 1}`,
            )
            const level = requiredCount(
              heading.level,
              `checks.markdownStructure.headings ${index + 1}.level`,
              id,
            )
            if (level < 1 || level > 6) {
              throw new Error(`Eval case ${id} markdown heading level must be between 1 and 6`)
            }
            return {
              level,
              count: requiredCount(
                heading.count,
                `checks.markdownStructure.headings ${index + 1}.count`,
                id,
              ),
            }
          }),
        }
      : {}),
    ...(record.unorderedListItems !== undefined
      ? {
          unorderedListItems: requiredCount(
            record.unorderedListItems,
            "checks.markdownStructure.unorderedListItems",
            id,
          ),
        }
      : {}),
    ...(record.orderedListItems !== undefined
      ? {
          orderedListItems: requiredCount(
            record.orderedListItems,
            "checks.markdownStructure.orderedListItems",
            id,
          ),
        }
      : {}),
    ...(record.minListDepth !== undefined
      ? {
          minListDepth: requiredCount(
            record.minListDepth,
            "checks.markdownStructure.minListDepth",
            id,
          ),
        }
      : {}),
    ...(record.fencedCodeBlocks !== undefined
      ? { fencedCodeBlocks: fencedCodeBlocksFor(record.fencedCodeBlocks, id) }
      : {}),
    ...(record.inlineCode !== undefined ? { inlineCode: inlineCodeFor(record.inlineCode, id) } : {}),
    ...(record.links !== undefined ? { links: linksFor(record.links, id) } : {}),
    ...(record.images !== undefined ? { images: imagesFor(record.images, id) } : {}),
    ...(record.tables !== undefined ? { tables: tablesFor(record.tables, id) } : {}),
    ...(record.blockquotes !== undefined
      ? {
          blockquotes: requiredCount(
            record.blockquotes,
            "checks.markdownStructure.blockquotes",
            id,
          ),
        }
      : {}),
    ...(record.frontmatter !== undefined ? { frontmatter: frontmatterFor(record.frontmatter, id) } : {}),
  }
}

function fencedCodeBlocksFor(
  value: unknown,
  id: string,
): NonNullable<WebGpuEvalMarkdownStructure["fencedCodeBlocks"]> {
  const record = countObjectFor(value, FENCED_CODE_KEYS, "checks.markdownStructure.fencedCodeBlocks", id)
  return {
    ...(record.count !== undefined
      ? { count: requiredCount(record.count, "checks.markdownStructure.fencedCodeBlocks.count", id) }
      : {}),
    ...(record.languages !== undefined
      ? { languages: optionalStringList(record.languages, "checks.markdownStructure.fencedCodeBlocks.languages", id) ?? [] }
      : {}),
  }
}

function inlineCodeFor(
  value: unknown,
  id: string,
): NonNullable<WebGpuEvalMarkdownStructure["inlineCode"]> {
  const record = countObjectFor(value, INLINE_CODE_KEYS, "checks.markdownStructure.inlineCode", id)
  return {
    ...(record.count !== undefined
      ? { count: requiredCount(record.count, "checks.markdownStructure.inlineCode.count", id) }
      : {}),
    ...(record.texts !== undefined
      ? { texts: optionalStringList(record.texts, "checks.markdownStructure.inlineCode.texts", id) ?? [] }
      : {}),
  }
}

function linksFor(
  value: unknown,
  id: string,
): NonNullable<WebGpuEvalMarkdownStructure["links"]> {
  const record = countObjectFor(value, LINK_KEYS, "checks.markdownStructure.links", id)
  return {
    ...(record.count !== undefined
      ? { count: requiredCount(record.count, "checks.markdownStructure.links.count", id) }
      : {}),
    ...(record.labels !== undefined
      ? { labels: optionalStringList(record.labels, "checks.markdownStructure.links.labels", id) ?? [] }
      : {}),
    ...(record.hrefs !== undefined
      ? { hrefs: optionalStringList(record.hrefs, "checks.markdownStructure.links.hrefs", id) ?? [] }
      : {}),
  }
}

function imagesFor(
  value: unknown,
  id: string,
): NonNullable<WebGpuEvalMarkdownStructure["images"]> {
  const record = countObjectFor(value, IMAGE_KEYS, "checks.markdownStructure.images", id)
  return {
    ...(record.count !== undefined
      ? { count: requiredCount(record.count, "checks.markdownStructure.images.count", id) }
      : {}),
    ...(record.altTexts !== undefined
      ? { altTexts: optionalStringList(record.altTexts, "checks.markdownStructure.images.altTexts", id) ?? [] }
      : {}),
    ...(record.srcs !== undefined
      ? { srcs: optionalStringList(record.srcs, "checks.markdownStructure.images.srcs", id) ?? [] }
      : {}),
  }
}

function tablesFor(
  value: unknown,
  id: string,
): NonNullable<WebGpuEvalMarkdownStructure["tables"]> {
  const record = countObjectFor(value, TABLE_KEYS, "checks.markdownStructure.tables", id)
  return {
    ...(record.rows !== undefined
      ? { rows: requiredCount(record.rows, "checks.markdownStructure.tables.rows", id) }
      : {}),
    ...(record.cells !== undefined
      ? { cells: requiredCount(record.cells, "checks.markdownStructure.tables.cells", id) }
      : {}),
  }
}

function frontmatterFor(
  value: unknown,
  id: string,
): NonNullable<WebGpuEvalMarkdownStructure["frontmatter"]> {
  const record = countObjectFor(value, FRONTMATTER_KEYS, "checks.markdownStructure.frontmatter", id)
  return {
    ...(record.keys !== undefined
      ? { keys: optionalStringList(record.keys, "checks.markdownStructure.frontmatter.keys", id) ?? [] }
      : {}),
  }
}

function domSelectorCountsFor(
  value: unknown,
  id: string,
): readonly WebGpuEvalDomSelectorCount[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`Eval case ${id} must define checks.domSelectorCounts as an array`)

  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Eval case ${id} checks.domSelectorCounts ${index + 1} must be an object`)
    assertKnownKeys(item, new Set(["selector", "count"]), `Eval case ${id} checks.domSelectorCounts ${index + 1}`)
    return {
      selector: requiredSelector(item.selector, `checks.domSelectorCounts ${index + 1}.selector`, id),
      count: requiredCount(item.count, `checks.domSelectorCounts ${index + 1}.count`, id),
    }
  })
}

function domVisibleTextFor(
  value: unknown,
  id: string,
): readonly WebGpuEvalDomVisibleText[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`Eval case ${id} must define checks.domVisibleText as an array`)

  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Eval case ${id} checks.domVisibleText ${index + 1} must be an object`)
    assertKnownKeys(item, new Set(["selector", "text", "pattern"]), `Eval case ${id} checks.domVisibleText ${index + 1}`)
    const text = optionalString(item.text, `checks.domVisibleText ${index + 1}.text`, id)
    const pattern = optionalString(item.pattern, `checks.domVisibleText ${index + 1}.pattern`, id)
    if (!text && !pattern) {
      throw new Error(`Eval case ${id} checks.domVisibleText ${index + 1} must define text or pattern`)
    }
    return {
      selector: requiredSelector(item.selector, `checks.domVisibleText ${index + 1}.selector`, id),
      ...(text ? { text } : {}),
      ...(pattern ? { pattern: compilePattern(`domVisibleText ${index + 1}.pattern`, pattern, id) } : {}),
    }
  })
}

function translatedAttributesFor(
  value: unknown,
  id: string,
): readonly WebGpuEvalTranslatedAttribute[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`Eval case ${id} must define checks.translatedAttributes as an array`)

  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Eval case ${id} checks.translatedAttributes ${index + 1} must be an object`)
    assertKnownKeys(
      item,
      new Set(["selector", "attribute", "expectedText", "expectedPattern", "forbiddenPattern", "shouldChange"]),
      `Eval case ${id} checks.translatedAttributes ${index + 1}`,
    )
    const expectedText = optionalString(item.expectedText, `checks.translatedAttributes ${index + 1}.expectedText`, id)
    const expectedPattern = optionalString(item.expectedPattern, `checks.translatedAttributes ${index + 1}.expectedPattern`, id)
    const forbiddenPattern = optionalString(item.forbiddenPattern, `checks.translatedAttributes ${index + 1}.forbiddenPattern`, id)

    return {
      selector: requiredSelector(item.selector, `checks.translatedAttributes ${index + 1}.selector`, id),
      attribute: requiredString(item.attribute, `checks.translatedAttributes ${index + 1}.attribute`, id),
      ...(expectedText ? { expectedText } : {}),
      ...(expectedPattern ? { expectedPattern: compilePattern(`translatedAttributes ${index + 1}.expectedPattern`, expectedPattern, id) } : {}),
      ...(forbiddenPattern ? { forbiddenPattern: compilePattern(`translatedAttributes ${index + 1}.forbiddenPattern`, forbiddenPattern, id) } : {}),
      ...(item.shouldChange !== undefined
        ? {
            shouldChange: optionalBoolean(
              item.shouldChange,
              `checks.translatedAttributes ${index + 1}.shouldChange`,
              id,
            ),
          }
        : {}),
    }
  })
}

function domTextIslandsFor(
  value: unknown,
  key: "domHiddenText" | "domSkippedText",
  id: string,
): readonly WebGpuEvalDomTextIsland[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`Eval case ${id} must define checks.${key} as an array`)

  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Eval case ${id} checks.${key} ${index + 1} must be an object`)
    assertKnownKeys(item, new Set(["selector", "text"]), `Eval case ${id} checks.${key} ${index + 1}`)
    const text = optionalString(item.text, `checks.${key} ${index + 1}.text`, id)
    return {
      selector: requiredSelector(item.selector, `checks.${key} ${index + 1}.selector`, id),
      ...(text ? { text } : {}),
    }
  })
}

function domRootDirFor(value: unknown, id: string): WebGpuEvalDomRootDir | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define checks.domRootDir as an object`)
  assertKnownKeys(value, new Set(["selector", "dir"]), `Eval case ${id} checks.domRootDir`)
  return {
    ...(value.selector !== undefined
      ? { selector: optionalSelector(value.selector, "checks.domRootDir.selector", id) }
      : {}),
    dir: requiredEnum(value.dir, ["ltr", "rtl"] as const, "checks.domRootDir.dir", id),
  }
}

function domRunnerConfigFor(value: unknown, id: string): TranslationEvalJson["runner"] {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define runner as an object`)
  assertKnownKeys(value, RUNNER_KEYS, `Eval case ${id} runner`)

  return value.dom === undefined ? {} : { dom: domRunnerDomConfigFor(value.dom, id) }
}

function domRunnerDomConfigFor(value: unknown, id: string): WebGpuEvalDomRunnerConfig {
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define runner.dom as an object`)
  assertKnownKeys(value, DOM_RUNNER_KEYS, `Eval case ${id} runner.dom`)

  return {
    ...(value.richText !== undefined ? { richText: richTextRunnerConfigFor(value.richText, id) } : {}),
    ...(value.structuredText !== undefined ? { structuredText: structuredTextRunnerConfigFor(value.structuredText, id) } : {}),
    ...(value.linkedBy !== undefined ? { linkedBy: linkedByRunnerConfigFor(value.linkedBy, id) } : {}),
    ...(value.translateAttributes !== undefined
      ? { translateAttributes: optionalStringList(value.translateAttributes, "runner.dom.translateAttributes", id) ?? [] }
      : {}),
    ...(value.preserveMatchers !== undefined
      ? { preserveMatchers: optionalStringList(value.preserveMatchers, "runner.dom.preserveMatchers", id) ?? [] }
      : {}),
    ...(value.skipTags !== undefined
      ? { skipTags: optionalStringList(value.skipTags, "runner.dom.skipTags", id) ?? [] }
      : {}),
    ...(value.skipTextPatterns !== undefined
      ? {
          skipTextPatterns: (optionalStringList(value.skipTextPatterns, "runner.dom.skipTextPatterns", id) ?? [])
            .map((pattern, index) => compilePattern(`runner.dom.skipTextPatterns ${index + 1}`, pattern, id)),
        }
      : {}),
  }
}

function richTextRunnerConfigFor(value: unknown, id: string): NonNullable<WebGpuEvalDomRunnerConfig["richText"]> {
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define runner.dom.richText as an object`)
  assertKnownKeys(value, RICH_TEXT_RUNNER_KEYS, `Eval case ${id} runner.dom.richText`)
  return {
    selector: requiredSelector(value.selector, "runner.dom.richText.selector", id),
    sourceAttribute: requiredString(value.sourceAttribute, "runner.dom.richText.sourceAttribute", id),
  }
}

function structuredTextRunnerConfigFor(value: unknown, id: string): NonNullable<WebGpuEvalDomRunnerConfig["structuredText"]> {
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define runner.dom.structuredText as an object`)
  assertKnownKeys(value, STRUCTURED_TEXT_RUNNER_KEYS, `Eval case ${id} runner.dom.structuredText`)
  return {
    selector: requiredSelector(value.selector, "runner.dom.structuredText.selector", id),
  }
}

function linkedByRunnerConfigFor(value: unknown, id: string): NonNullable<WebGpuEvalDomRunnerConfig["linkedBy"]> {
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define runner.dom.linkedBy as an object`)
  assertKnownKeys(value, LINKED_BY_RUNNER_KEYS, `Eval case ${id} runner.dom.linkedBy`)
  return {
    selector: requiredSelector(value.selector, "runner.dom.linkedBy.selector", id),
    keyAttribute: requiredString(value.keyAttribute, "runner.dom.linkedBy.keyAttribute", id),
  }
}

function checksFor(value: unknown, id: string): TranslationEvalJson["checks"] {
  if (!isRecord(value)) throw new Error(`Eval case ${id} must define checks object`)
  assertKnownKeys(value, CHECK_KEYS, `Eval case ${id} checks`)

  return {
    sourceShouldChange: optionalBoolean(value.sourceShouldChange, "checks.sourceShouldChange", id),
    expectedPatterns: optionalStringList(value.expectedPatterns, "checks.expectedPatterns", id),
    forbiddenPatterns: optionalStringList(value.forbiddenPatterns, "checks.forbiddenPatterns", id),
    preservedSubstrings: optionalStringList(
      value.preservedSubstrings,
      "checks.preservedSubstrings",
      id,
    ),
    preservedSubstringCounts: preservedSubstringCountsFor(value.preservedSubstringCounts, id),
    markdownMarkers: optionalStringList(value.markdownMarkers, "checks.markdownMarkers", id),
    markdownStructure: markdownStructureFor(value.markdownStructure, id),
    exactOutputOptions: optionalStringList(
      value.exactOutputOptions,
      "checks.exactOutputOptions",
      id,
    ),
    checkBalancedQuotes: optionalBoolean(
      value.checkBalancedQuotes,
      "checks.checkBalancedQuotes",
      id,
    ),
    requiredSelectors: optionalStringList(value.requiredSelectors, "checks.requiredSelectors", id)
      ?.map((selector, index) => {
        assertValidCssSelector(selector, `checks.requiredSelectors ${index + 1}`, id)
        return selector
      }),
    domSelectorCounts: domSelectorCountsFor(value.domSelectorCounts, id),
    domVisibleText: domVisibleTextFor(value.domVisibleText, id),
    preservedAttributes: preservedAttributesFor(value.preservedAttributes, id),
    translatedAttributes: translatedAttributesFor(value.translatedAttributes, id),
    domHiddenText: domTextIslandsFor(value.domHiddenText, "domHiddenText", id),
    domSkippedText: domTextIslandsFor(value.domSkippedText, "domSkippedText", id),
    domRootDir: domRootDirFor(value.domRootDir, id),
    domExecutableSafety: optionalBoolean(value.domExecutableSafety, "checks.domExecutableSafety", id),
  }
}

function translationEvalJsonFor(value: unknown, id: string): TranslationEvalJson {
  if (!isRecord(value)) throw new Error(`Eval case ${id} must be a JSON object`)
  assertKnownKeys(value, TOP_LEVEL_EVAL_KEYS, `Eval case ${id}`)

  const contentType = requiredEnum(
    value.contentType,
    WEBGPU_EVAL_CONTENT_TYPES,
    "contentType",
    id,
  )

  return {
    split: requiredEnum(value.split, WEBGPU_EVAL_SPLITS, "split", id),
    category: requiredString(value.category, "category", id),
    sourceLanguage: requiredEnum(
      value.sourceLanguage,
      WEBGPU_EVAL_LANGUAGES,
      "sourceLanguage",
      id,
    ),
    targetLanguage: requiredEnum(
      value.targetLanguage,
      WEBGPU_EVAL_LANGUAGES,
      "targetLanguage",
      id,
    ),
    contentType,
    source: sourceFor(value.source, id),
    references: referencesFor(contentType, value.references, id),
    checks: checksFor(value.checks, id),
    runner: domRunnerConfigFor(value.runner, id),
    ...(value.provenance !== undefined ? { provenance: value.provenance } : {}),
  }
}

function referencesFor(
  contentType: WebGpuEvalContentType,
  value: unknown,
  id: string,
): readonly WebGpuEvalReference[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Eval case ${id} must define at least one reference translation`)
  }

  return value.map((reference, index) => referenceFor(contentType, reference, id, index))
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
  assertKnownKeys(reference, REFERENCE_KEYS, `Eval case ${id} reference ${index + 1}`)

  const text = optionalString(reference.text, "reference.text", id)
  const html = optionalString(reference.html, "reference.html", id)
  const quality = optionalString(reference.quality, "reference.quality", id)
  const notes = optionalString(reference.notes, "reference.notes", id)

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

type EvalCasePathMetadata =
  | {
      readonly kind: "flat"
      readonly id: string
    }
  | {
      readonly kind: "grouped"
      readonly id: string
      readonly split: WebGpuEvalSplit
      readonly contentType: WebGpuEvalContentType
      readonly category: string
      readonly sourceLanguage: WebGpuEvalLanguage
      readonly targetLanguage: WebGpuEvalLanguage
    }

function stemFromJsonFilename(filename: string, path: string): string {
  if (!filename.endsWith(".json")) throw new Error(`Invalid eval corpus path: ${path}`)
  const stem = filename.slice(0, -".json".length)
  if (stem.length === 0) throw new Error(`Invalid eval corpus path: ${path}`)
  return stem
}

function relativeEvalCorpusPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, "/")
  const marker = "evals/translation/"
  const markerIndex = normalizedPath.indexOf(marker)
  if (markerIndex === -1) throw new Error(`Invalid eval corpus path: ${path}`)
  return normalizedPath.slice(markerIndex + marker.length)
}

function pathEnum<T extends string>(
  value: string,
  allowedValues: readonly T[],
  label: string,
  path: string,
): T {
  if (allowedValues.includes(value as T)) return value as T
  throw new Error(`Invalid eval corpus path ${path}: unknown ${label} "${value}"`)
}

function languagePairFromPath(
  languagePair: string,
  path: string,
): {
  readonly sourceLanguage: WebGpuEvalLanguage
  readonly targetLanguage: WebGpuEvalLanguage
} {
  const [sourceLanguage, targetLanguage, extra] = languagePair.split("-")
  if (!sourceLanguage || !targetLanguage || extra !== undefined) {
    throw new Error(`Invalid eval corpus path ${path}: expected <source>-<target> language pair`)
  }

  return {
    sourceLanguage: pathEnum(sourceLanguage, WEBGPU_EVAL_LANGUAGES, "source language", path),
    targetLanguage: pathEnum(targetLanguage, WEBGPU_EVAL_LANGUAGES, "target language", path),
  }
}

function evalCasePathMetadata(path: string): EvalCasePathMetadata {
  const relativePath = relativeEvalCorpusPath(path)
  const segments = relativePath.split("/")

  if (segments.length === 1) {
    return { kind: "flat", id: stemFromJsonFilename(segments[0] ?? "", path) }
  }

  if (segments.length !== 5) {
    throw new Error(
      `Invalid eval corpus path ${path}: expected flat <slug>.json or grouped <split>/<contentType>/<category>/<source>-<target>/<slug>.json`,
    )
  }

  const [splitSegment, contentTypeSegment, category, languagePair, filename] = segments
  if (!splitSegment || !contentTypeSegment || !category || !languagePair || !filename) {
    throw new Error(`Invalid eval corpus path: ${path}`)
  }

  const split = pathEnum(splitSegment, WEBGPU_EVAL_SPLITS, "split", path)
  const contentType = pathEnum(
    contentTypeSegment,
    WEBGPU_EVAL_CONTENT_TYPES,
    "content type",
    path,
  )
  const { sourceLanguage, targetLanguage } = languagePairFromPath(languagePair, path)
  const slug = stemFromJsonFilename(filename, path)

  return {
    kind: "grouped",
    id: `${split}/${contentType}/${category}/${sourceLanguage}-${targetLanguage}/${slug}`,
    split,
    contentType,
    category,
    sourceLanguage,
    targetLanguage,
  }
}

function assertPathFieldMatchesJson(
  id: string,
  field: string,
  pathValue: string,
  jsonValue: string,
): void {
  if (pathValue === jsonValue) return
  throw new Error(
    `Eval case ${id} path ${field} "${pathValue}" does not match JSON ${field} "${jsonValue}"`,
  )
}

function assertGroupedPathMatchesJson(
  metadata: EvalCasePathMetadata,
  json: TranslationEvalJson,
): void {
  if (metadata.kind === "flat") return

  assertPathFieldMatchesJson(metadata.id, "split", metadata.split, json.split)
  assertPathFieldMatchesJson(
    metadata.id,
    "contentType",
    metadata.contentType,
    json.contentType,
  )
  assertPathFieldMatchesJson(metadata.id, "category", metadata.category, json.category)
  assertPathFieldMatchesJson(
    metadata.id,
    "sourceLanguage",
    metadata.sourceLanguage,
    json.sourceLanguage,
  )
  assertPathFieldMatchesJson(
    metadata.id,
    "targetLanguage",
    metadata.targetLanguage,
    json.targetLanguage,
  )
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
  id: string,
): readonly WebGpuEvalPatternCheck[] {
  return patterns.map((rawPattern, index) => {
    const { source, flags } = parseRegexSource(rawPattern)
    try {
      return {
        name: `${namePrefix}:${index + 1}`,
        pattern: new RegExp(source, flags),
        note: rawPattern,
      }
    } catch (error) {
      throw new Error(
        `Eval case ${id} has invalid ${namePrefix} ${index + 1}: ${String(error)}`,
      )
    }
  })
}

function compilePattern(label: string, rawPattern: string, id: string): WebGpuEvalCompiledPattern {
  const { source, flags } = parseRegexSource(rawPattern)
  try {
    return {
      pattern: new RegExp(source, flags),
      note: rawPattern,
    }
  } catch (error) {
    throw new Error(
      `Eval case ${id} has invalid ${label}: ${String(error)}`,
    )
  }
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

function visibleTextFromNode(root: Node): string {
  const visibleText: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
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

function visibleTextFromHtml(html: string): string {
  const fragment = createHtmlFragment(html)
  if (fragment === null) return normalizeText(html.replace(/<[^>]*>/g, " "))

  return visibleTextFromNode(fragment)
}

function querySelectorAllSafe(fragment: DocumentFragment | null, selector: string): readonly Element[] {
  return fragment ? Array.from(fragment.querySelectorAll(selector)) : []
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

function countSubstringOccurrences(
  text: string,
  value: string,
  caseSensitive: boolean,
): number {
  const normalizedText = text.normalize("NFC")
  const normalizedValue = value.normalize("NFC")
  const haystack = caseSensitive
    ? normalizedText
    : normalizedText.toLocaleLowerCase("en-US")
  const needle = caseSensitive
    ? normalizedValue
    : normalizedValue.toLocaleLowerCase("en-US")

  if (needle.length === 0) return 0

  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

function scorePreservedSubstringCount(
  evalCase: WebGpuEvalCase,
  expected: WebGpuEvalPreservedSubstringCount,
  rawOutput: string,
): WebGpuEvalCheck {
  const caseSensitive = expected.caseSensitive ?? true
  const expectedCount = expected.count ?? countSubstringOccurrences(
    evalCase.sourceText,
    expected.value,
    caseSensitive,
  )
  const actualCount = countSubstringOccurrences(rawOutput, expected.value, caseSensitive)

  return createCheck(
    `preserve-count:${expected.value}`,
    actualCount >= expectedCount,
    `at least ${expectedCount} occurrence(s) of ${expected.value}`,
    `${actualCount} occurrence(s)`,
    caseSensitive ? "case-sensitive" : "case-insensitive",
  )
}

type ParsedMarkdown = {
  readonly headingCounts: ReadonlyMap<number, number>
  readonly unorderedListItems: number
  readonly orderedListItems: number
  readonly maxListDepth: number
  readonly fencedCodeLanguages: readonly string[]
  readonly inlineCodeTexts: readonly string[]
  readonly links: readonly {
    readonly label: string
    readonly href: string
  }[]
  readonly images: readonly {
    readonly altText: string
    readonly src: string
  }[]
  readonly tableRows: number
  readonly tableCells: number
  readonly blockquotes: number
  readonly frontmatterKeys: readonly string[]
}

function removeFencedCodeBlocks(markdown: string): string {
  return markdown.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "")
}

function parsedMarkdownFor(markdown: string): ParsedMarkdown {
  const normalized = markdown.replace(/\r\n?/g, "\n")
  const withoutCode = removeFencedCodeBlocks(normalized)
  const lines = withoutCode.split("\n")
  const headingCounts = new Map<number, number>()
  let unorderedListItems = 0
  let orderedListItems = 0
  let maxListDepth = 0
  let tableRows = 0
  let tableCells = 0
  let blockquotes = 0
  const fencedCodeLanguages: string[] = []
  const inlineCodeTexts: string[] = []
  const links: { label: string; href: string }[] = []
  const images: { altText: string; src: string }[] = []
  const frontmatterKeys: string[] = []

  for (const match of normalized.matchAll(/^```([^\s`]*)[^\n]*\n[\s\S]*?^```[^\n]*$/gm)) {
    fencedCodeLanguages.push(match[1] ?? "")
  }

  for (const match of withoutCode.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
    inlineCodeTexts.push(match[1] ?? "")
  }

  for (const match of withoutCode.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    if (match[1] === "!") {
      images.push({ altText: match[2] ?? "", src: match[3] ?? "" })
    } else {
      links.push({ label: match[2] ?? "", href: match[3] ?? "" })
    }
  }

  if (lines[0]?.trim() === "---") {
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index]?.trim() ?? ""
      if (line === "---") break
      const key = /^([A-Za-z0-9_-]+)\s*:/.exec(line)?.[1]
      if (key) frontmatterKeys.push(key)
    }
  }

  for (const line of lines) {
    const heading = /^(#{1,6})\s+/.exec(line)
    if (heading) {
      const level = heading[1]?.length ?? 0
      headingCounts.set(level, (headingCounts.get(level) ?? 0) + 1)
    }

    const unordered = /^(\s*)[-*+]\s+/.exec(line)
    if (unordered) {
      unorderedListItems += 1
      maxListDepth = Math.max(maxListDepth, listDepthFromIndent(unordered[1] ?? ""))
    }

    const ordered = /^(\s*)\d+[.)]\s+/.exec(line)
    if (ordered) {
      orderedListItems += 1
      maxListDepth = Math.max(maxListDepth, listDepthFromIndent(ordered[1] ?? ""))
    }

    if (/^>\s?/.test(line)) blockquotes += 1

    if (line.includes("|") && !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)) {
      const cells = line.split("|").map((cell) => cell.trim())
      const trimmed = cells[0] === "" ? cells.slice(1) : cells
      const withoutTrailing = trimmed.at(-1) === "" ? trimmed.slice(0, -1) : trimmed
      if (withoutTrailing.length > 1) {
        tableRows += 1
        tableCells += withoutTrailing.length
      }
    }
  }

  return {
    headingCounts,
    unorderedListItems,
    orderedListItems,
    maxListDepth,
    fencedCodeLanguages,
    inlineCodeTexts,
    links,
    images,
    tableRows,
    tableCells,
    blockquotes,
    frontmatterKeys,
  }
}

function listDepthFromIndent(indent: string): number {
  return Math.floor(indent.replaceAll("\t", "  ").length / 2) + 1
}

function scoreMarkdownStructure(
  structure: WebGpuEvalMarkdownStructure,
  rawOutput: string,
): readonly WebGpuEvalCheck[] {
  const parsed = parsedMarkdownFor(rawOutput)
  const checks: WebGpuEvalCheck[] = []

  for (const heading of structure.headings ?? []) {
    const actual = parsed.headingCounts.get(heading.level) ?? 0
    checks.push(
      createCheck(
        `markdown-heading:h${heading.level}`,
        actual === heading.count,
        `${heading.count} h${heading.level} heading(s)`,
        `${actual} h${heading.level} heading(s)`,
      ),
    )
  }

  if (structure.unorderedListItems !== undefined) {
    checks.push(
      createCheck(
        "markdown-unordered-list-items",
        parsed.unorderedListItems === structure.unorderedListItems,
        `${structure.unorderedListItems} unordered list item(s)`,
        `${parsed.unorderedListItems} unordered list item(s)`,
      ),
    )
  }

  if (structure.orderedListItems !== undefined) {
    checks.push(
      createCheck(
        "markdown-ordered-list-items",
        parsed.orderedListItems === structure.orderedListItems,
        `${structure.orderedListItems} ordered list item(s)`,
        `${parsed.orderedListItems} ordered list item(s)`,
      ),
    )
  }

  if (structure.minListDepth !== undefined) {
    checks.push(
      createCheck(
        "markdown-list-depth",
        parsed.maxListDepth >= structure.minListDepth,
        `list depth at least ${structure.minListDepth}`,
        `list depth ${parsed.maxListDepth}`,
      ),
    )
  }

  if (structure.fencedCodeBlocks?.count !== undefined) {
    checks.push(
      createCheck(
        "markdown-fenced-code-blocks",
        parsed.fencedCodeLanguages.length === structure.fencedCodeBlocks.count,
        `${structure.fencedCodeBlocks.count} fenced code block(s)`,
        `${parsed.fencedCodeLanguages.length} fenced code block(s)`,
      ),
    )
  }

  for (const language of structure.fencedCodeBlocks?.languages ?? []) {
    checks.push(
      createCheck(
        `markdown-fenced-code-language:${language}`,
        parsed.fencedCodeLanguages.includes(language),
        `fenced code language ${language}`,
        parsed.fencedCodeLanguages.join(", ") || "<none>",
      ),
    )
  }

  if (structure.inlineCode?.count !== undefined) {
    checks.push(
      createCheck(
        "markdown-inline-code-count",
        parsed.inlineCodeTexts.length === structure.inlineCode.count,
        `${structure.inlineCode.count} inline code span(s)`,
        `${parsed.inlineCodeTexts.length} inline code span(s)`,
      ),
    )
  }

  for (const text of structure.inlineCode?.texts ?? []) {
    checks.push(
      createCheck(
        `markdown-inline-code:${text}`,
        parsed.inlineCodeTexts.includes(text),
        `inline code ${text}`,
        parsed.inlineCodeTexts.join(", ") || "<none>",
      ),
    )
  }

  if (structure.links?.count !== undefined) {
    checks.push(
      createCheck(
        "markdown-link-count",
        parsed.links.length === structure.links.count,
        `${structure.links.count} link(s)`,
        `${parsed.links.length} link(s)`,
      ),
    )
  }

  for (const label of structure.links?.labels ?? []) {
    checks.push(
      createCheck(
        `markdown-link-label:${label}`,
        parsed.links.some((link) => link.label === label),
        `link label ${label}`,
        parsed.links.map((link) => link.label).join(", ") || "<none>",
      ),
    )
  }

  for (const href of structure.links?.hrefs ?? []) {
    checks.push(
      createCheck(
        `markdown-link-href:${href}`,
        parsed.links.some((link) => link.href === href),
        `link href ${href}`,
        parsed.links.map((link) => link.href).join(", ") || "<none>",
      ),
    )
  }

  if (structure.images?.count !== undefined) {
    checks.push(
      createCheck(
        "markdown-image-count",
        parsed.images.length === structure.images.count,
        `${structure.images.count} image(s)`,
        `${parsed.images.length} image(s)`,
      ),
    )
  }

  for (const altText of structure.images?.altTexts ?? []) {
    checks.push(
      createCheck(
        `markdown-image-alt:${altText}`,
        parsed.images.some((image) => image.altText === altText),
        `image alt ${altText}`,
        parsed.images.map((image) => image.altText).join(", ") || "<none>",
      ),
    )
  }

  for (const src of structure.images?.srcs ?? []) {
    checks.push(
      createCheck(
        `markdown-image-src:${src}`,
        parsed.images.some((image) => image.src === src),
        `image src ${src}`,
        parsed.images.map((image) => image.src).join(", ") || "<none>",
      ),
    )
  }

  if (structure.tables?.rows !== undefined) {
    checks.push(
      createCheck(
        "markdown-table-rows",
        parsed.tableRows === structure.tables.rows,
        `${structure.tables.rows} table row(s)`,
        `${parsed.tableRows} table row(s)`,
      ),
    )
  }

  if (structure.tables?.cells !== undefined) {
    checks.push(
      createCheck(
        "markdown-table-cells",
        parsed.tableCells === structure.tables.cells,
        `${structure.tables.cells} table cell(s)`,
        `${parsed.tableCells} table cell(s)`,
      ),
    )
  }

  if (structure.blockquotes !== undefined) {
    checks.push(
      createCheck(
        "markdown-blockquotes",
        parsed.blockquotes === structure.blockquotes,
        `${structure.blockquotes} blockquote line(s)`,
        `${parsed.blockquotes} blockquote line(s)`,
      ),
    )
  }

  for (const key of structure.frontmatter?.keys ?? []) {
    checks.push(
      createCheck(
        `markdown-frontmatter-key:${key}`,
        parsed.frontmatterKeys.includes(key),
        `frontmatter key ${key}`,
        parsed.frontmatterKeys.join(", ") || "<none>",
      ),
    )
  }

  return checks
}

function scoreDomSelectorCount(
  fragment: DocumentFragment | null,
  expected: WebGpuEvalDomSelectorCount,
): WebGpuEvalCheck {
  const actualCount = querySelectorAllSafe(fragment, expected.selector).length

  return createCheck(
    `selector-count:${expected.selector}`,
    actualCount === expected.count,
    `${expected.count} element(s) matching ${expected.selector}`,
    `${actualCount} element(s)`,
  )
}

function scoreDomVisibleText(
  fragment: DocumentFragment | null,
  expected: WebGpuEvalDomVisibleText,
): WebGpuEvalCheck {
  const actual = normalizeText(
    querySelectorAllSafe(fragment, expected.selector)
      .map((element) => visibleTextFromNode(element))
      .join(" "),
  )
  const pass =
    (expected.text === undefined || actual.includes(normalizeText(expected.text))) &&
    (expected.pattern === undefined || expected.pattern.pattern.test(actual))

  return createCheck(
    `visible-text:${expected.selector}`,
    pass,
    expected.text ?? String(expected.pattern?.pattern),
    actual || "<empty>",
    expected.pattern?.note,
  )
}

function scoreTranslatedAttribute(
  sourceFragment: DocumentFragment | null,
  outputFragment: DocumentFragment | null,
  expected: WebGpuEvalTranslatedAttribute,
): WebGpuEvalCheck {
  const sourceValue = sourceFragment
    ?.querySelector(expected.selector)
    ?.getAttribute(expected.attribute)
  const actual = outputFragment
    ?.querySelector(expected.selector)
    ?.getAttribute(expected.attribute)
  const shouldChange = expected.shouldChange ?? true
  const pass =
    actual !== null &&
    actual !== undefined &&
    (!shouldChange || actual !== (sourceValue ?? null)) &&
    (expected.expectedText === undefined || actual === expected.expectedText) &&
    (expected.expectedPattern === undefined || expected.expectedPattern.pattern.test(actual)) &&
    (expected.forbiddenPattern === undefined || !expected.forbiddenPattern.pattern.test(actual))

  return createCheck(
    `translated-attribute:${expected.selector}[${expected.attribute}]`,
    pass,
    translatedAttributeExpectation(expected, shouldChange),
    actual ?? "<missing>",
    expected.expectedPattern?.note ?? expected.forbiddenPattern?.note,
  )
}

function translatedAttributeExpectation(
  expected: WebGpuEvalTranslatedAttribute,
  shouldChange: boolean,
): string {
  const parts = [
    shouldChange ? "attribute changed from source" : null,
    expected.expectedText ? `equals ${expected.expectedText}` : null,
    expected.expectedPattern ? `matches ${expected.expectedPattern.pattern}` : null,
    expected.forbiddenPattern ? `does not match ${expected.forbiddenPattern.pattern}` : null,
  ].filter((part): part is string => part !== null)

  return parts.join("; ")
}

function textIslandExpectedText(
  sourceFragment: DocumentFragment | null,
  expected: WebGpuEvalDomTextIsland,
): string | null {
  if (expected.text !== undefined) return expected.text
  return sourceFragment?.querySelector(expected.selector)?.textContent ?? null
}

function scoreDomTextIsland(
  sourceFragment: DocumentFragment | null,
  outputFragment: DocumentFragment | null,
  expected: WebGpuEvalDomTextIsland,
  kind: "hidden-text" | "skipped-text",
): WebGpuEvalCheck {
  const expectedText = textIslandExpectedText(sourceFragment, expected)
  const actualText = outputFragment?.querySelector(expected.selector)?.textContent ?? null

  return createCheck(
    `${kind}:${expected.selector}`,
    expectedText !== null && actualText === expectedText,
    expectedText ?? "<source text missing>",
    actualText ?? "<missing>",
  )
}

function scoreDomRootDir(
  fragment: DocumentFragment | null,
  expected: WebGpuEvalDomRootDir,
): WebGpuEvalCheck {
  const selector = expected.selector ?? "[data-webgpu-eval-root]"
  const actual = fragment?.querySelector(selector)?.getAttribute("dir")

  return createCheck(
    `dom-dir:${selector}`,
    actual === expected.dir,
    expected.dir,
    actual ?? "<missing>",
  )
}

const EXECUTABLE_URL_ATTRIBUTES = new Set([
  "href",
  "src",
  "xlink:href",
  "formaction",
  "action",
  "poster",
])

function unsafeExecutableAttribute(fragment: DocumentFragment | null): string | null {
  if (fragment === null) return "HTML could not be parsed"

  for (const element of Array.from(fragment.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLocaleLowerCase("en-US")
      const value = attribute.value.trim().toLocaleLowerCase("en-US")
      if (name.startsWith("on")) {
        return `${element.tagName.toLowerCase()}[${attribute.name}]`
      }
      if (
        EXECUTABLE_URL_ATTRIBUTES.has(name) &&
        /^(?:javascript|vbscript|data:text\/html)\s*:/.test(value)
      ) {
        return `${element.tagName.toLowerCase()}[${attribute.name}="${attribute.value}"]`
      }
    }
  }

  return null
}

function scoreDomExecutableSafety(fragment: DocumentFragment | null): WebGpuEvalCheck {
  const unsafeAttribute = unsafeExecutableAttribute(fragment)

  return createCheck(
    "dom-executable-attribute-safety",
    unsafeAttribute === null,
    "no event-handler attributes or executable URLs",
    unsafeAttribute ?? "safe",
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
  const sourceHtmlFragment = evalCase.contentType === "dom"
    ? createHtmlFragment(evalCase.sourceText)
    : null
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

  for (const preserved of evalCase.preservedSubstringCounts ?? []) {
    checks.push(scorePreservedSubstringCount(evalCase, preserved, rawOutput))
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

  if (evalCase.markdownStructure) {
    checks.push(...scoreMarkdownStructure(evalCase.markdownStructure, rawOutput))
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

  for (const selectorCount of evalCase.domSelectorCounts ?? []) {
    checks.push(scoreDomSelectorCount(htmlFragment, selectorCount))
  }

  for (const visibleText of evalCase.domVisibleText ?? []) {
    checks.push(scoreDomVisibleText(htmlFragment, visibleText))
  }

  for (const attribute of evalCase.preservedAttributes ?? []) {
    checks.push(scorePreservedAttribute(htmlFragment, attribute, normalizedOutput))
  }

  for (const attribute of evalCase.translatedAttributes ?? []) {
    checks.push(scoreTranslatedAttribute(sourceHtmlFragment, htmlFragment, attribute))
  }

  for (const hiddenText of evalCase.domHiddenText ?? []) {
    checks.push(scoreDomTextIsland(sourceHtmlFragment, htmlFragment, hiddenText, "hidden-text"))
  }

  for (const skippedText of evalCase.domSkippedText ?? []) {
    checks.push(scoreDomTextIsland(sourceHtmlFragment, htmlFragment, skippedText, "skipped-text"))
  }

  if (evalCase.domRootDir) {
    checks.push(scoreDomRootDir(htmlFragment, evalCase.domRootDir))
  }

  if (evalCase.domExecutableSafety) {
    checks.push(scoreDomExecutableSafety(htmlFragment))
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

export type WebGpuEvalCaseGroupInput = WebGpuEvalModelScoreCase & {
  readonly split: WebGpuEvalSplit
  readonly contentType: WebGpuEvalContentType
  readonly sourceLanguage: WebGpuEvalLanguage
  readonly targetLanguage: WebGpuEvalLanguage
  readonly sourceClass?: WebGpuEvalSourceClass
}

function hasSelection<T extends string>(selected: readonly T[] | undefined, value: T): boolean {
  return selected === undefined || selected.length === 0 || selected.includes(value)
}

function languagePair(evalCase: Pick<WebGpuEvalCase, "sourceLanguage" | "targetLanguage">): string {
  return `${evalCase.sourceLanguage}-${evalCase.targetLanguage}`
}

export function defaultWebGpuEvalSelection(): WebGpuEvalSelection {
  return { split: WEBGPU_EVAL_DEFAULT_LOCAL_SPLITS }
}

export function normalizeWebGpuEvalSelection(
  selection: WebGpuEvalSelection = {},
): WebGpuEvalSelection {
  return selection.split === undefined || selection.split.length === 0
    ? { ...selection, split: WEBGPU_EVAL_DEFAULT_LOCAL_SPLITS }
    : selection
}

export function webGpuEvalSelectionIncludesHoldout(
  selection: WebGpuEvalSelection,
): boolean {
  return selection.split?.includes("holdout") ?? false
}

export function createWebGpuEvalRunMetadata({
  runner,
  timestamp = new Date().toISOString(),
  modelId,
  filters,
  reason,
  referencesExposed = false,
}: {
  readonly runner: string
  readonly timestamp?: string
  readonly modelId: WebGpuEvalModelId
  readonly filters?: WebGpuEvalSelection
  readonly reason?: string | null
  readonly referencesExposed?: boolean
}): WebGpuEvalRunMetadata {
  const normalizedFilters = normalizeWebGpuEvalSelection(filters)
  const normalizedReason = reason?.trim() ?? null
  if (runner.trim().length === 0) throw new Error("WebGPU eval run metadata must define runner")
  if (timestamp.trim().length === 0) {
    throw new Error("WebGPU eval run metadata must define timestamp")
  }
  if (
    webGpuEvalSelectionIncludesHoldout(normalizedFilters) &&
    normalizedReason === null
  ) {
    throw new Error("Holdout WebGPU eval runs require a reason")
  }

  return {
    runner,
    timestamp,
    modelId,
    filters: normalizedFilters,
    reason: normalizedReason,
    referencesExposed,
  }
}

export function webGpuEvalCaseMatchesSelection(
  evalCase: WebGpuEvalCase,
  selection: WebGpuEvalSelection = {},
): boolean {
  return (
    hasSelection(selection.split, evalCase.split) &&
    hasSelection(selection.category, evalCase.category) &&
    hasSelection(selection.contentType, evalCase.contentType) &&
    hasSelection(selection.sourceLanguage, evalCase.sourceLanguage) &&
    hasSelection(selection.targetLanguage, evalCase.targetLanguage) &&
    hasSelection(selection.languagePair, languagePair(evalCase)) &&
    (
      selection.sourceClass === undefined ||
      selection.sourceClass.length === 0 ||
      (evalCase.sourceClass !== undefined && selection.sourceClass.includes(evalCase.sourceClass))
    )
  )
}

export function filterWebGpuEvalCorpus(
  cases: readonly WebGpuEvalCase[],
  selection: WebGpuEvalSelection = {},
): readonly WebGpuEvalCase[] {
  return cases.filter((evalCase) => webGpuEvalCaseMatchesSelection(evalCase, selection))
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

function groupKeyFor(evalCase: WebGpuEvalCaseGroupInput): string {
  return [
    evalCase.split,
    evalCase.contentType,
    evalCase.category,
    languagePair(evalCase),
    evalCase.sourceClass ?? "missing",
  ].join("\u0000")
}

export function summarizeWebGpuEvalCaseGroups(
  cases: readonly WebGpuEvalCaseGroupInput[],
): readonly WebGpuEvalCaseGroupSummary[] {
  const groups = new Map<string, WebGpuEvalCaseGroupInput[]>()
  for (const evalCase of cases) {
    const key = groupKeyFor(evalCase)
    groups.set(key, [...(groups.get(key) ?? []), evalCase])
  }

  return Array.from(groups.values(), (groupCases) => {
    const first = groupCases[0]
    if (!first) throw new Error("Case group unexpectedly empty")
    const sourceClass: WebGpuEvalCaseGroupSummary["sourceClass"] = first.sourceClass ?? "missing"
    return {
      split: first.split,
      contentType: first.contentType,
      category: first.category,
      languagePair: languagePair(first),
      sourceClass,
      total: groupCases.length,
      passed: groupCases.filter((evalCase) => evalCase.pass).length,
      failed: groupCases.filter((evalCase) => !evalCase.pass).length,
      hardFailures: groupCases.filter((evalCase) => evalCase.scoreBreakdown.hardFailure).length,
      failuresByCheck: failuresByCheck(groupCases),
    }
  }).sort((left, right) =>
    [
      left.split.localeCompare(right.split),
      left.contentType.localeCompare(right.contentType),
      left.category.localeCompare(right.category),
      left.languagePair.localeCompare(right.languagePair),
      left.sourceClass.localeCompare(right.sourceClass),
    ].find((comparison) => comparison !== 0) ?? 0,
  )
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

export function scoreWebGpuEvalCleanHeadline(
  cases: readonly WebGpuEvalScoreAggregationCase[],
): WebGpuEvalCleanHeadlineScoreSummary {
  const includedCases = cases.filter(
    (evalCase) => !PUBLIC_SOURCE_CLASSES.has(evalCase.sourceClass ?? "unknown"),
  )
  const excludedCaseIds = cases
    .filter((evalCase) => PUBLIC_SOURCE_CLASSES.has(evalCase.sourceClass ?? "unknown"))
    .map((evalCase) => evalCase.id)
  const summary = scoreWebGpuEvalModel(includedCases)

  return {
    ...summary,
    pass: includedCases.length > 0 && includedCases.every((evalCase) => evalCase.pass),
    includedCases: includedCases.length,
    excludedCases: excludedCaseIds.length,
    excludedCaseIds,
  }
}

function scoreGroupKeyFor(evalCase: WebGpuEvalScoreAggregationCase): string {
  return [evalCase.split, evalCase.sourceClass ?? "missing"].join("\u0000")
}

export function summarizeWebGpuEvalScoreGroups(
  cases: readonly WebGpuEvalScoreAggregationCase[],
): readonly WebGpuEvalScoreGroupSummary[] {
  const groups = new Map<string, WebGpuEvalScoreAggregationCase[]>()
  for (const evalCase of cases) {
    const key = scoreGroupKeyFor(evalCase)
    groups.set(key, [...(groups.get(key) ?? []), evalCase])
  }

  return Array.from(groups.values(), (groupCases) => {
    const first = groupCases[0]
    if (!first) throw new Error("Score group unexpectedly empty")
    const summary = scoreWebGpuEvalModel(groupCases)
    const sourceClass: WebGpuEvalScoreGroupSummary["sourceClass"] =
      first.sourceClass ?? "missing"
    return {
      ...summary,
      split: first.split,
      sourceClass,
      total: groupCases.length,
      passed: groupCases.filter((evalCase) => evalCase.pass).length,
      failed: groupCases.filter((evalCase) => !evalCase.pass).length,
      pass: groupCases.every((evalCase) => evalCase.pass),
    }
  }).sort((left, right) =>
    [
      left.split.localeCompare(right.split),
      left.sourceClass.localeCompare(right.sourceClass),
    ].find((comparison) => comparison !== 0) ?? 0,
  )
}

export function isWebGpuEvalModelId(value: string): value is WebGpuEvalModelId {
  return WEBGPU_EVAL_MODEL_IDS.includes(value as WebGpuEvalModelId)
}
