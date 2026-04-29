import type {
  TranslationAdapter,
  TranslationOptions,
  TranslationRequest,
  TranslationResult,
} from "../../translation-adapter.js"
import type { TranslationModelInvocation } from "../translate.js"
import {
  ChatModelBaseAdapter,
  type ChatInput,
  type ChatOptions,
} from "../chat.js"

const LANGUAGE_NAMES: Readonly<Record<string, string>> = Object.freeze({
  ar: "Arabic",
  de: "German",
  en: "English",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  pt: "Portuguese",
  ru: "Russian",
  th: "Thai",
  vi: "Vietnamese",
  zh: "Chinese",
})

const GEMMA_AUTO_PRESERVE_TERMS = Object.freeze([
  "Babulfish",
  "babulfish",
  "WebGPU",
  "WASM",
  "ONNX",
])
const GEMMA_AUTO_PRESERVE_LIMIT = 16
const OUTER_MARKDOWN_FENCE_PATTERN = /^\s*```[A-Za-z-]*\s*\n([\s\S]*?)\n```\s*$/u
const BALANCED_QUOTE_BLOCK_PATTERN = /^\s*("""|''')\s*\n?([\s\S]*?)\n?\1\s*$/u
const MARKDOWN_LINE_SPLIT_PATTERN = /\r?\n/u
const FENCED_CODE_START_PATTERN = /^(\s*)(`{3,}|~{3,})(.*)$/u
const HEADING_PATTERN = /^(\s*)(#{1,6})(\s+)(.*)$/u
const UNORDERED_LIST_PATTERN = /^(\s*)([-+*])(\s+)(.*)$/u
const ORDERED_LIST_PATTERN = /^(\s*)(\d+)([.)])(\s+)(.*)$/u
const BLOCKQUOTE_PATTERN = /^(\s*>+\s?)(.*)$/u
const BLOCK_MARKDOWN_PATTERNS = Object.freeze([
  HEADING_PATTERN,
  UNORDERED_LIST_PATTERN,
  ORDERED_LIST_PATTERN,
  BLOCKQUOTE_PATTERN,
  FENCED_CODE_START_PATTERN,
])

type MarkdownLineShape =
  | { readonly kind: "plain" }
  | { readonly kind: "heading"; readonly prefix: string }
  | { readonly kind: "unordered"; readonly prefix: string }
  | { readonly kind: "ordered"; readonly prefix: string }
  | { readonly kind: "blockquote"; readonly prefix: string }

type MarkdownLink = {
  readonly full: string
  readonly label: string
  readonly href: string
}

function collectMatches(text: string, pattern: RegExp): string[] {
  return Array.from(text.matchAll(pattern), (match) => match[0])
}

function stripOuterMarkdownAnswerFences(text: string): string {
  const outerFence = OUTER_MARKDOWN_FENCE_PATTERN.exec(text)
  if (outerFence) return outerFence[1]!.trim()

  const quoted = BALANCED_QUOTE_BLOCK_PATTERN.exec(text)
  return quoted ? quoted[2]!.trim() : text.trim()
}

function normalizeMarkdownAnswerText(text: string): string {
  return stripOuterMarkdownAnswerFences(text)
    .replace(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/giu,
      (_match, depth: string, content: string) =>
        `${"#".repeat(Number(depth))} ${content.trim()}`,
    )
    .replace(/\s+((?:\d+[.)]|[-+*])\s+)/gu, "\n$1")
    .trim()
}

function lineShape(line: string): MarkdownLineShape {
  const heading = HEADING_PATTERN.exec(line)
  if (heading) {
    return { kind: "heading", prefix: `${heading[1]}${heading[2]}${heading[3]}` }
  }

  const unordered = UNORDERED_LIST_PATTERN.exec(line)
  if (unordered) {
    return {
      kind: "unordered",
      prefix: `${unordered[1]}${unordered[2]}${unordered[3]}`,
    }
  }

  const ordered = ORDERED_LIST_PATTERN.exec(line)
  if (ordered) {
    return {
      kind: "ordered",
      prefix: `${ordered[1]}${ordered[2]}${ordered[3]}${ordered[4]}`,
    }
  }

  const blockquote = BLOCKQUOTE_PATTERN.exec(line)
  if (blockquote) return { kind: "blockquote", prefix: blockquote[1]! }

  return { kind: "plain" }
}

function stripLineShape(line: string, shape: MarkdownLineShape): string {
  switch (shape.kind) {
    case "heading":
      return line.replace(HEADING_PATTERN, "$4").trimStart()
    case "unordered":
      return line.replace(UNORDERED_LIST_PATTERN, "$4").trimStart()
    case "ordered":
      return line.replace(ORDERED_LIST_PATTERN, "$5").trimStart()
    case "blockquote":
      return line.replace(BLOCKQUOTE_PATTERN, "$2").trimStart()
    case "plain":
      return line
  }
}

function hasCompatibleLineShape(line: string, shape: MarkdownLineShape): boolean {
  switch (shape.kind) {
    case "heading":
      return HEADING_PATTERN.test(line)
    case "unordered":
      return UNORDERED_LIST_PATTERN.test(line)
    case "ordered":
      return ORDERED_LIST_PATTERN.test(line)
    case "blockquote":
      return BLOCKQUOTE_PATTERN.test(line)
    case "plain":
      return true
  }
}

function applyLineShape(line: string, sourceLine: string): string {
  const shape = lineShape(sourceLine)
  if (shape.kind === "plain" || hasCompatibleLineShape(line, shape)) return line

  return `${shape.prefix}${stripLineShape(line, shape)}`
}

function isFencedCodeStart(line: string): boolean {
  return FENCED_CODE_START_PATTERN.test(line)
}

function sourceFencedCodeLines(sourceLines: readonly string[]): readonly string[] {
  const lines: string[] = []
  let inFence = false
  let fenceMarker = ""

  for (const line of sourceLines) {
    const start = FENCED_CODE_START_PATTERN.exec(line)
    if (!inFence && start) {
      inFence = true
      fenceMarker = start[2]!
      lines.push(line)
      continue
    }

    if (inFence) {
      lines.push(line)
      if (line.trim() === fenceMarker) {
        inFence = false
        fenceMarker = ""
      }
    }
  }

  return lines
}

function sourceVisibleMarkdownLines(sourceLines: readonly string[]): readonly string[] {
  const lines: string[] = []
  let inFence = false
  let fenceMarker = ""

  for (const line of sourceLines) {
    const start = FENCED_CODE_START_PATTERN.exec(line)
    if (!inFence && start) {
      inFence = true
      fenceMarker = start[2]!
      continue
    }

    if (inFence) {
      if (line.trim() === fenceMarker) {
        inFence = false
        fenceMarker = ""
      }
      continue
    }

    lines.push(line)
  }

  return lines
}

function restoreMissingCodeFence(source: string, translated: string): string {
  const sourceLines = source.split(MARKDOWN_LINE_SPLIT_PATTERN)
  const codeLines = sourceFencedCodeLines(sourceLines)
  if (
    codeLines.length === 0 ||
    translated.split(MARKDOWN_LINE_SPLIT_PATTERN).some(isFencedCodeStart)
  ) {
    return translated
  }

  const translatedWithoutFence = translated.split(MARKDOWN_LINE_SPLIT_PATTERN)
  const insertAt = sourceLines.findIndex(isFencedCodeStart)
  const before = translatedWithoutFence.slice(0, Math.max(0, insertAt))
  const after = translatedWithoutFence.slice(Math.max(0, insertAt))
  return [...before, ...codeLines, ...after].join("\n")
}

function isBlockMarkdownLine(line: string): boolean {
  return BLOCK_MARKDOWN_PATTERNS.some((pattern) => pattern.test(line))
}

function hasBlockMarkdownSyntax(text: string): boolean {
  return text.split(MARKDOWN_LINE_SPLIT_PATTERN).some(isBlockMarkdownLine)
}

function withoutBlankLines(lines: readonly string[]): readonly string[] {
  return lines.filter((line) => line.trim().length > 0)
}

function splitFirstHeadingChunk(
  sourceLines: readonly string[],
  text: string,
): readonly string[] {
  if (lineShape(sourceLines[0] ?? "").kind !== "heading") return [text]

  const colon = /^(.{3,80}?):\s+(.+)$/u.exec(text)
  if (colon) return [colon[1]!.trim(), colon[2]!.trim()]

  const dash = /^(.{3,80}?)\s[-–—]\s(.+)$/u.exec(text)
  return dash ? [dash[1]!.trim(), dash[2]!.trim()] : [text]
}

function splitSentenceChunks(text: string): readonly string[] {
  return text
    .split(/(?<=[.!?。！？؟])\s+/u)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
}

function fitChunkCount(
  chunks: readonly string[],
  count: number,
): readonly string[] | null {
  if (chunks.length < count) return null
  if (chunks.length === count) return chunks

  return [...chunks.slice(0, count - 1), chunks.slice(count - 1).join(" ")]
}

function splitCollapsedMarkdownTranslation(
  sourceLines: readonly string[],
  translatedLines: readonly string[],
): readonly string[] | null {
  const visibleSourceLines = withoutBlankLines(sourceVisibleMarkdownLines(sourceLines))
  if (
    visibleSourceLines.length <= translatedLines.length ||
    translatedLines.some(isFencedCodeStart)
  ) {
    return null
  }

  const text = translatedLines.join(" ").replace(/\s+/gu, " ").trim()
  if (text.length === 0) return null

  const headingChunks = splitFirstHeadingChunk(visibleSourceLines, text)
  const first = headingChunks[0]
  if (!first) return null

  const rest = headingChunks.slice(1)
  const chunks = [
    first,
    ...splitSentenceChunks(rest.length === 0 ? "" : rest.join(" ")),
  ].filter((chunk): chunk is string => chunk.length > 0)

  return fitChunkCount(chunks, visibleSourceLines.length)
}

function restoreSourceLineShapes(source: string, translated: string): string {
  const sourceLines = normalizeMarkdownAnswerText(source).split(MARKDOWN_LINE_SPLIT_PATTERN)
  const translatedLines = translated.split(MARKDOWN_LINE_SPLIT_PATTERN)

  if (sourceLines.length !== translatedLines.length) {
    const visibleSourceLines = sourceVisibleMarkdownLines(sourceLines)
    const collapsedLines = splitCollapsedMarkdownTranslation(
      sourceLines,
      translatedLines,
    )
    const repairLines =
      collapsedLines ??
      (visibleSourceLines.length === translatedLines.length ? translatedLines : null)

    if (!repairLines) return translated

    const shapeSourceLines =
      collapsedLines === null ? visibleSourceLines : withoutBlankLines(visibleSourceLines)

    return repairLines
      .map((line, index) => applyLineShape(line, shapeSourceLines[index]!))
      .join("\n")
  }

  return translatedLines
    .map((line, index) => applyLineShape(line, sourceLines[index]!))
    .join("\n")
}

function collectMarkdownLinks(text: string): readonly MarkdownLink[] {
  const seen = new Set<string>()
  const links: MarkdownLink[] = []

  for (const match of text.matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/gu)) {
    const full = match[0]
    const label = match[1]!
    const href = match[2]!
    if (seen.has(full)) continue
    seen.add(full)
    links.push({ full, label, href })
  }

  return links
}

function restoreDroppedMarkdownLink(translated: string, link: MarkdownLink): string {
  if (translated.includes(link.full) || translated.includes(`](${link.href})`)) {
    return translated
  }

  const hrefStart = translated.indexOf(link.href)
  if (hrefStart === -1) return translated

  const hrefEnd = hrefStart + link.href.length
  const previousChar = translated[hrefStart - 1]
  const nextChar = translated[hrefEnd]
  if (previousChar === "`" && nextChar === "`") {
    return `${translated.slice(0, hrefStart - 1)}[${link.label}](${link.href})${translated.slice(hrefEnd + 1)}`
  }

  if (previousChar === "(" && nextChar === ")") return translated

  return `${translated.slice(0, hrefStart)}[${link.label}](${link.href})${translated.slice(hrefEnd)}`
}

function restoreDroppedMarkdownLinks(source: string, translated: string): string {
  return collectMarkdownLinks(source).reduce(restoreDroppedMarkdownLink, translated)
}

type InlineMarkdownSpan = {
  readonly wrapped: string
  readonly inner: string
}

function collectRepairableInlineMarkdownSpans(text: string): readonly InlineMarkdownSpan[] {
  const spans = [
    ...collectMatches(text, /`[^`\n]+`/gu),
    ...collectMatches(text, /\*\*[^*\n]+\*\*/gu),
  ]
  const seen = new Set<string>()
  const repairable: InlineMarkdownSpan[] = []

  for (const wrapped of spans) {
    const inner = wrapped.startsWith("`")
      ? wrapped.slice(1, -1)
      : wrapped.slice(2, -2)
    if (!/[A-Za-z0-9_@./$"()-]/u.test(inner) || seen.has(wrapped)) continue
    seen.add(wrapped)
    repairable.push({ wrapped, inner })
  }

  return repairable
}

function isMarkdownRepairIdentifierChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_@/$"`()*-]/u.test(char)
}

function isMarkdownRepairBoundaryBefore(text: string, start: number): boolean {
  const previous = text[start - 1]
  if (previous === ".") return !isMarkdownRepairIdentifierChar(text[start - 2])
  return previous === undefined || !isMarkdownRepairIdentifierChar(previous)
}

function isMarkdownRepairBoundaryAfter(text: string, end: number): boolean {
  const next = text[end]
  if (next === ".") return !isMarkdownRepairIdentifierChar(text[end + 1])
  return next === undefined || !isMarkdownRepairIdentifierChar(next)
}

function restoreDroppedInlineMarkdownWrapper(
  translated: string,
  span: InlineMarkdownSpan,
): string {
  let repaired = ""
  let cursor = 0

  while (cursor < translated.length) {
    const start = translated.indexOf(span.inner, cursor)
    if (start === -1) {
      repaired += translated.slice(cursor)
      break
    }

    const end = start + span.inner.length
    repaired += translated.slice(cursor, start)
    repaired +=
      isMarkdownRepairBoundaryBefore(translated, start) &&
      isMarkdownRepairBoundaryAfter(translated, end)
        ? span.wrapped
        : translated.slice(start, end)
    cursor = end
  }

  return repaired
}

function restoreDroppedInlineMarkdownWrappers(
  source: string,
  translated: string,
): string {
  let repaired = translated

  for (const { wrapped, inner } of collectRepairableInlineMarkdownSpans(source)) {
    if (repaired.includes(wrapped)) continue

    repaired = restoreDroppedInlineMarkdownWrapper(repaired, { wrapped, inner })
  }

  return repaired
}

function repairGemmaMarkdown(source: string, translated: string): string {
  return restoreDroppedMarkdownLinks(
    source,
    restoreDroppedInlineMarkdownWrappers(
      source,
      restoreMissingCodeFence(
        source,
        restoreSourceLineShapes(source, normalizeMarkdownAnswerText(translated)),
      ),
    ),
  )
}

function shouldRepairGemmaMarkdown(
  request: TranslationRequest,
  options: TranslationOptions,
): boolean {
  return (
    options.content_type === "markdown" ||
    (options.content_type === undefined && hasBlockMarkdownSyntax(request.text))
  )
}

function isIdentifierBoundary(char: string | undefined): boolean {
  return char === undefined || !/[A-Za-z0-9_@./-]/u.test(char)
}

function includesStandaloneTerm(text: string, term: string): boolean {
  let start = text.indexOf(term)
  while (start !== -1) {
    const end = start + term.length
    if (isIdentifierBoundary(text[start - 1]) && isIdentifierBoundary(text[end])) {
      return true
    }
    start = text.indexOf(term, end)
  }
  return false
}

function collectGemmaAutoPreservedSubstrings(text: string): readonly string[] {
  const candidates = [
    ...collectMatches(text, /`[^`\n]+`/gu),
    ...collectMatches(text, /\bhttps?:\/\/[^\s<>)]+/giu),
    ...collectMatches(text, /@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*/giu),
    ...collectMatches(text, /\{\{\s*[A-Za-z_$][\w$.-]*\s*\}\}/gu),
    ...collectMatches(text, /\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gu),
    ...collectMatches(text, /\b[A-Z]{2,}-\d+\b/gu),
    ...collectMatches(text, /\b\d{4}-\d{2}-\d{2}\b/gu),
    ...collectMatches(text, /\bv?\d+(?:\.\d+){1,}(?:[-+][\w.-]+)?\b/giu),
    ...collectMatches(text, /\b[A-Za-z0-9_.-]+\.(?:[cm]?[jt]sx?|json|css|html|md|ya?ml)\b/gu),
    ...collectMatches(text, /\b[$A-Z_a-z][$\w]*(?:\.[A-Z_a-z][$\w]*)+\b/gu),
    ...collectMatches(text, /\b[A-Z_a-z][$\w]*\(\)/gu),
    ...collectMatches(text, /\b(?:[a-z]+[A-Z][A-Za-z0-9]*|[A-Z]+[a-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z]{2,})\b/gu),
    ...GEMMA_AUTO_PRESERVE_TERMS.filter((term) =>
      includesStandaloneTerm(text, term),
    ),
  ]
  const seen = new Set<string>()
  const preserved: string[] = []

  for (const candidate of candidates) {
    if (candidate.length === 0 || seen.has(candidate)) continue
    seen.add(candidate)
    preserved.push(candidate)
    if (preserved.length >= GEMMA_AUTO_PRESERVE_LIMIT) break
  }

  return preserved
}

function formatLanguageName(code: string): string {
  const normalizedCode = code.toLowerCase()
  const baseCode = normalizedCode.split(/[-_]/)[0] ?? normalizedCode
  const name = LANGUAGE_NAMES[normalizedCode] ?? LANGUAGE_NAMES[baseCode]
  return name === undefined ? code : `${name} (${code})`
}

function formatSourceBlock(request: TranslationRequest): string {
  return `Source:\n${request.text}`
}

export class Gemma3ChatAdapter extends ChatModelBaseAdapter {
  constructor() {
    super({
      id: "gemma-3-1b-it-chat",
      label: "Gemma 3 1B IT chat translator",
    })
  }

  protected override defaultPreservationApproach(
    options: TranslationOptions,
  ): "placeholders" | "none" {
    return this.preservedSubstrings(options).length > 0 ? "placeholders" : "none"
  }

  override buildInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ChatInput, ChatOptions> {
    return super.buildInvocation(request, this.withAutoPreservation(request, options))
  }

  override extractText(
    request: TranslationRequest,
    options: TranslationOptions,
    output: unknown,
  ): TranslationResult {
    const result = super.extractText(
      request,
      this.withAutoPreservation(request, options),
      output,
    )

    if (!shouldRepairGemmaMarkdown(request, options)) return result

    return { text: repairGemmaMarkdown(request.text, result.text) }
  }

  protected override buildModelInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ChatInput, ChatOptions> {
    const invocation = super.buildModelInvocation(request, options)

    return {
      ...invocation,
      modelInput: [
        invocation.modelInput[0],
        {
          role: "user",
          content: this.buildUserPrompt(request, options),
        },
      ],
    }
  }

  private withAutoPreservation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationOptions {
    if (options.preservation_approach === "placeholders") return options

    const autoPreserved = collectGemmaAutoPreservedSubstrings(request.text)
    if (autoPreserved.length === 0) return options

    const nextOptions = {
      ...options,
      substrings_to_preserve: [
        ...(options.substrings_to_preserve ?? []),
        ...autoPreserved,
      ],
    }

    if (
      options.preservation_approach === "prompting" ||
      (options.substrings_to_preserve ?? []).length > 0
    ) {
      return nextOptions
    }

    return { ...nextOptions, preservation_approach: "prompting" }
  }

  private buildUserPrompt(
    request: TranslationRequest,
    options: TranslationOptions,
  ): string {
    const target = formatLanguageName(request.target.code)

    if (options.content_type === "markdown") {
      return [
        `Translate this Markdown to ${target}.`,
        "Keep Markdown syntax, tables, headings, lists, blockquotes, images, links, code fences, and code spans structurally intact.",
        "Return only the translated Markdown.",
        "",
        formatSourceBlock(request),
      ].join("\n")
    }

    if (options.content_type === "structured") {
      return [
        `Translate this structured text to ${target}.`,
        "Copy structured tokens exactly and keep them in order.",
        "Return only the translated text.",
        "",
        formatSourceBlock(request),
      ].join("\n")
    }

    return [
      `Translate this text to ${target}.`,
      "Return only the translated text.",
      "",
      formatSourceBlock(request),
    ].join("\n")
  }

  protected override buildSystemPrompt(
    request: TranslationRequest,
    options: TranslationOptions,
  ): string {
    const instructions = [
      `You are a translation engine. Translate from ${formatLanguageName(request.source.code)} to ${formatLanguageName(request.target.code)}.`,
      "Output only the translation.",
      "Translate short UI labels, buttons, headings, and sentence fragments naturally; do not copy source text just because it is short.",
      "Keep brand names, product names, code identifiers, URLs, numbers, and preserved terms unchanged; translate the surrounding prose.",
      `Use ${formatLanguageName(request.target.code)} vocabulary and script; do not answer in any other language.`,
      "Do not return the source unchanged when it contains translatable prose.",
    ]

    if (options.content_type === "markdown") {
      instructions.push(
        "Preserve Markdown formatting markers exactly, including headings, tables, blockquotes, images, links, code fences, code spans, emphasis, and lists; translate only human-readable prose.",
      )
    }

    if (options.content_type === "structured") {
      instructions.push("Copy all structured tokens exactly and keep them in order.")
    }

    if (this.usesPromptPreservation(options)) {
      instructions.push(
        `Preserve these exact substrings unchanged: ${JSON.stringify(this.preservedSubstrings(options))}.`,
      )
    }

    if (this.usesPlaceholderPreservation(options)) {
      instructions.push("Copy every preservation token exactly unchanged.")
    }

    return instructions.join(" ")
  }
}

export const gemma3ChatAdapter: TranslationAdapter<
  ChatInput,
  unknown,
  ChatOptions
> = Object.freeze(new Gemma3ChatAdapter())
