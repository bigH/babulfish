import type { VisibleClaims } from "./claims.js"
import {
  claimStructuredTextNodes,
  containsClaimedLinkedTextNode,
  hasNestedStructuredConflict,
  overlapsClaimedRoot,
} from "./claims.js"
import { compareDocumentOrder } from "./phases.js"
import { captureOriginalText } from "./walker.js"

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml"
const STRUCTURED_TOKEN_PREFIX = "\u27EAbf-st:"
const STRUCTURED_TOKEN_SUFFIX = "\u27EB"
const STRUCTURED_INLINE_TAGS: ReadonlySet<string> = new Set([
  "a",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "mark",
  "span",
])
const STRUCTURED_INERT_SPAN_ATTRS: ReadonlySet<string> = new Set([
  "class",
  "id",
  "title",
  "lang",
  "dir",
  "style",
])

export type StructuredTokenKind =
  | "text-open"
  | "text-close"
  | "element-open"
  | "element-close"
  | "br"
  | "code"

export type StructuredTokenDescriptor = {
  readonly token: string
  readonly kind: StructuredTokenKind
  readonly slotId: number
}

export type StructuredTextSlot = {
  readonly node: Text
  readonly slotId: number
}

export type StructuredTextUnit = {
  readonly root: Element
  readonly source: string
  readonly serialized: string
  readonly textSlots: readonly StructuredTextSlot[]
  readonly tokenSequence: readonly StructuredTokenDescriptor[]
}

export type StructuredCommitPlan = {
  readonly values: ReadonlyMap<number, string>
}

export type StructuredExtractDeps = {
  readonly originalTexts: WeakMap<Text, string>
  readonly shouldSkip: (text: string) => boolean
  readonly claims: VisibleClaims
}

type ResolveStructuredDeps = StructuredExtractDeps & {
  readonly structuredSelector: string | null
}

export function buildStructuredToken(key: string, slotId: number): string {
  return `${STRUCTURED_TOKEN_PREFIX}${key}:${slotId}${STRUCTURED_TOKEN_SUFFIX}`
}

export function isInertStructuredSpan(el: Element): boolean {
  if (el.localName !== "span") return true
  return Array.from(el.attributes).every((attr) =>
    attr.name.startsWith("data-") || STRUCTURED_INERT_SPAN_ATTRS.has(attr.name))
}

export function collectStructuredTokens(
  translated: string,
): string[] | null {
  const tokens: string[] = []
  let cursor = 0

  while (true) {
    const start = translated.indexOf(STRUCTURED_TOKEN_PREFIX, cursor)
    if (start < 0) return tokens

    const end = translated.indexOf(
      STRUCTURED_TOKEN_SUFFIX,
      start + STRUCTURED_TOKEN_PREFIX.length,
    )
    if (end < 0) return null

    tokens.push(translated.slice(start, end + STRUCTURED_TOKEN_SUFFIX.length))
    cursor = end + STRUCTURED_TOKEN_SUFFIX.length
  }
}

export function extractStructuredTextValues(
  unit: StructuredTextUnit,
  translated: string,
): StructuredCommitPlan | null {
  const foundTokens = collectStructuredTokens(translated)
  if (!foundTokens) return null

  const expectedTokens = unit.tokenSequence.map(({ token }) => token)
  if (foundTokens.length !== expectedTokens.length) return null
  if (new Set(foundTokens).size !== foundTokens.length) return null

  for (let i = 0; i < expectedTokens.length; i++) {
    if (foundTokens[i] !== expectedTokens[i]) return null
  }

  const values = new Map<number, string>()
  let cursor = 0
  let activeTextSlotId: number | null = null

  for (const token of unit.tokenSequence) {
    const index = translated.indexOf(token.token, cursor)
    if (index < 0) return null

    const between = translated.slice(cursor, index)
    if (activeTextSlotId == null) {
      if (token.kind === "br") {
        if (between !== "\n") return null
      } else if (between.length > 0) {
        return null
      }
      if (token.kind === "text-open") {
        activeTextSlotId = token.slotId
      }
    } else {
      if (between.includes(STRUCTURED_TOKEN_PREFIX)) return null
      if (token.kind !== "text-close" || token.slotId !== activeTextSlotId) {
        return null
      }
      values.set(activeTextSlotId, between)
      activeTextSlotId = null
    }

    cursor = index + token.token.length
  }

  if (activeTextSlotId != null) return null
  if (translated.slice(cursor).length > 0) return null
  return { values }
}

export function tryExtractStructuredUnit(
  root: Element,
  deps: StructuredExtractDeps,
): StructuredTextUnit | null {
  const { claims, originalTexts, shouldSkip } = deps

  if (root.namespaceURI && root.namespaceURI !== HTML_NAMESPACE) return null
  if (root.localName.includes("-")) return null
  if (!isInertStructuredSpan(root)) return null
  if (root.hasAttribute("contenteditable") && root.getAttribute("contenteditable") !== "false") {
    return null
  }

  const parts: string[] = []
  const sourceParts: string[] = []
  const tokenSequence: StructuredTokenDescriptor[] = []
  const textSlots: StructuredTextSlot[] = []
  let nextSlotId = 0

  function pushToken(kind: StructuredTokenKind, key: string, slotId: number): void {
    const token = buildStructuredToken(key, slotId)
    parts.push(token)
    tokenSequence.push({ token, kind, slotId })
  }

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text
      if (claims.linkedTextNodes.has(textNode) || claims.structuredTextNodes.has(textNode)) {
        return false
      }

      const source = captureOriginalText(textNode, originalTexts)
      const trimmed = source.trim()
      if (!trimmed) return true
      if (shouldSkip(trimmed)) return false

      const slotId = nextSlotId++
      pushToken("text-open", "text-open", slotId)
      parts.push(source)
      sourceParts.push(source)
      pushToken("text-close", "text-close", slotId)
      textSlots.push({ node: textNode, slotId })
      return true
    }

    if (node.nodeType === Node.COMMENT_NODE) {
      return true
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false
    }

    const el = node as Element
    if (el.namespaceURI && el.namespaceURI !== HTML_NAMESPACE) {
      return false
    }
    if (el.localName.includes("-")) {
      return false
    }
    if (el.hasAttribute("contenteditable") && el.getAttribute("contenteditable") !== "false") {
      return false
    }

    const tag = el.localName
    if (tag === "br") {
      const slotId = nextSlotId++
      parts.push("\n")
      sourceParts.push("\n")
      pushToken("br", "br", slotId)
      return true
    }

    if (tag === "code") {
      for (const child of el.childNodes) {
        if (child.nodeType !== Node.TEXT_NODE) return false
      }
      const slotId = nextSlotId++
      pushToken("code", "code", slotId)
      return true
    }

    if (!STRUCTURED_INLINE_TAGS.has(tag)) {
      return false
    }
    if (!isInertStructuredSpan(el)) {
      return false
    }

    const slotId = nextSlotId++
    pushToken("element-open", `element-open:${tag}`, slotId)
    for (const child of el.childNodes) {
      if (!walk(child)) return false
    }
    pushToken("element-close", `element-close:${tag}`, slotId)
    return true
  }

  for (const child of root.childNodes) {
    if (!walk(child)) return null
  }

  if (textSlots.length === 0) return null

  return {
    root,
    source: sourceParts.join(""),
    serialized: parts.join(""),
    textSlots,
    tokenSequence,
  }
}

export function collectStructuredCandidates(
  roots: readonly Element[],
  deps: Pick<ResolveStructuredDeps, "structuredSelector">,
): Element[] {
  if (!deps.structuredSelector) return []

  const seen = new Set<Element>()
  const matches: Element[] = []
  for (const root of roots) {
    for (const el of root.querySelectorAll(deps.structuredSelector)) {
      if (seen.has(el)) continue
      seen.add(el)
      matches.push(el)
    }
  }

  return matches.sort(compareDocumentOrder)
}

export function resolveStructuredUnits(
  roots: readonly Element[],
  deps: ResolveStructuredDeps,
): StructuredTextUnit[] {
  const { claims, originalTexts, shouldSkip } = deps
  const rawCandidates = collectStructuredCandidates(roots, deps)
  const units: StructuredTextUnit[] = []

  for (const candidate of rawCandidates) {
    if (hasNestedStructuredConflict(candidate, rawCandidates)) continue
    if (overlapsClaimedRoot(candidate, claims.richRoots)) continue
    if (containsClaimedLinkedTextNode(candidate, claims.linkedTextNodes)) continue

    const unit = tryExtractStructuredUnit(candidate, {
      originalTexts,
      shouldSkip,
      claims,
    })
    if (!unit) continue

    claimStructuredTextNodes(unit, claims)
    units.push(unit)
  }

  return units
}
