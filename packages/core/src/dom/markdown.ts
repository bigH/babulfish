// Inline markdown parser + HTML renderer (bold/italic only)
// Used by the DOM translator to re-render translated markdown strings.

type InlineSegment =
  | { type: "text"; content: string }
  | { type: "strong"; content: string }
  | { type: "em"; content: string }

type ParsedInlineMarkdown = {
  segments: InlineSegment[]
  wellFormed: boolean
}

const MARKERS: ReadonlyArray<{ kind: "strong" | "em"; pattern: string }> = [
  { kind: "strong", pattern: "**" },
  { kind: "em", pattern: "*" },
]

function pushText(segments: InlineSegment[], text: string): void {
  if (text.length === 0) return
  const last = segments.at(-1)
  if (last?.type === "text") {
    last.content += text
  } else {
    segments.push({ type: "text", content: text })
  }
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch)
}

function segmentToHtml(segment: InlineSegment): string {
  const safe = escapeHtml(segment.content)
  switch (segment.type) {
    case "strong":
      return `<strong>${safe}</strong>`
    case "em":
      return `<em>${safe}</em>`
    case "text":
      return safe
  }
}

function parseInlineMarkdownResult(source: string): ParsedInlineMarkdown {
  const segments: InlineSegment[] = []
  let cursor = 0
  let wellFormed = true

  while (cursor < source.length) {
    let matched = false

    for (const { kind, pattern } of MARKERS) {
      if (!source.startsWith(pattern, cursor)) continue
      const contentStart = cursor + pattern.length
      const close = source.indexOf(pattern, contentStart)
      if (close === -1) {
        pushText(segments, pattern)
        cursor += pattern.length
        wellFormed = false
        matched = true
        break
      }
      segments.push({ type: kind, content: source.slice(contentStart, close) })
      cursor = close + pattern.length
      matched = true
      break
    }

    if (matched) continue
    pushText(segments, source[cursor]!)
    cursor++
  }

  return { segments, wellFormed }
}

export function parseInlineMarkdown(source: string): InlineSegment[] {
  return parseInlineMarkdownResult(source).segments
}

export function renderInlineMarkdownToHtml(source: string): string {
  return parseInlineMarkdown(source).map(segmentToHtml).join("")
}

export function isWellFormedMarkdown(text: string): boolean {
  return parseInlineMarkdownResult(text).wellFormed
}
