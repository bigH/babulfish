// Inline markdown parser + HTML renderer (bold/italic only)
// Used by the DOM translator to re-render translated markdown strings.

type InlineSegment =
  | { type: "text"; content: string }
  | { type: "strong"; content: string }
  | { type: "em"; content: string }

const MARKERS = [
  { kind: "strong", pattern: "**" },
  { kind: "em", pattern: "*" },
] as const

type InlineMarker = (typeof MARKERS)[number]

type MarkdownScan = {
  readonly segments: InlineSegment[]
  readonly isWellFormed: boolean
}

function findMarkerAt(source: string, cursor: number): InlineMarker | null {
  for (const marker of MARKERS) {
    if (source.startsWith(marker.pattern, cursor)) return marker
  }
  return null
}

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

function scanInlineMarkdown(source: string): MarkdownScan {
  const segments: InlineSegment[] = []
  let cursor = 0
  let isWellFormed = true

  while (cursor < source.length) {
    const marker = findMarkerAt(source, cursor)
    if (!marker) {
      pushText(segments, source[cursor]!)
      cursor++
      continue
    }

    const contentStart = cursor + marker.pattern.length
    const close = source.indexOf(marker.pattern, contentStart)
    if (close === -1) {
      isWellFormed = false
      pushText(segments, marker.pattern)
      cursor = contentStart
      continue
    }

    segments.push({
      type: marker.kind,
      content: source.slice(contentStart, close),
    })
    cursor = close + marker.pattern.length
  }

  return { segments, isWellFormed }
}

export function parseInlineMarkdown(source: string): InlineSegment[] {
  return scanInlineMarkdown(source).segments
}

export function renderInlineMarkdownToHtml(source: string): string {
  return parseInlineMarkdown(source).map(segmentToHtml).join("")
}

export function isWellFormedMarkdown(text: string): boolean {
  return scanInlineMarkdown(text).isWellFormed
}

export function stripInlineMarkdownMarkers(source: string): string {
  return source.replaceAll("**", "").replaceAll("*", "")
}
