// DOM translation orchestrator.
// Creates a DOMTranslator instance that collects text nodes, batches them,
// sends them through the injected translate function, and applies results.

import type { TaggedTextNode } from "./walker.js"
import type { PreserveMatcher } from "./preserve.js"
import { collectTextNodes, defaultShouldSkip, buildSkipTags } from "./walker.js"
import {
  applyTranslation,
  buildBatches,
  DEFAULT_BATCH_CHAR_LIMIT,
} from "./batcher.js"
import { insertPlaceholders, restorePlaceholders } from "./preserve.js"
import { isWellFormedMarkdown } from "./markdown.js"

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export type RichTextConfig = {
  readonly selector: string
  readonly sourceAttribute: string
  readonly render: (markdown: string) => string
  readonly validate?: (html: string) => boolean
}

export type LinkedConfig = {
  readonly selector: string
  readonly keyAttribute: string
}

export type StructuredTextConfig = {
  readonly selector: string
}

export type DOMOutputTransformContext = {
  readonly kind: "linked" | "richText" | "structuredText" | "text" | "attr"
  readonly targetLang: string
  readonly source: string
  readonly attribute?: string
}

export type DOMTranslatorConfig = {
  readonly translate: (text: string, targetLang: string) => Promise<string>
  readonly roots: string[]
  /** Scoping root for DOM queries. Defaults to `document` when omitted. */
  readonly root?: ParentNode | Document
  readonly phases?: string[]
  readonly preserve?: { matchers: PreserveMatcher[] }
  readonly skipTags?: string[]
  readonly shouldSkip?: (
    text: string,
    defaultSkip: (text: string) => boolean,
  ) => boolean
  readonly richText?: RichTextConfig
  readonly structuredText?: StructuredTextConfig
  readonly linkedBy?: LinkedConfig
  readonly outputTransform?: (
    translated: string,
    context: DOMOutputTransformContext,
  ) => string
  readonly batchCharLimit?: number
  readonly rtlLanguages?: ReadonlySet<string>
  readonly translateAttributes?: string[]
  readonly hooks?: {
    readonly onTranslateStart?: (element: Element) => void
    readonly onTranslateEnd?: (element: Element) => void
    readonly onProgress?: (done: number, total: number) => void
    readonly onDirectionChange?: (root: Element, dir: "ltr" | "rtl") => void
  }
}

export type DOMTranslator = {
  translate(targetLang: string): Promise<void>
  restore(): void
  abort(): void
  readonly isTranslating: boolean
  readonly currentLang: string | null
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type TranslatableAttr = {
  readonly el: Element
  readonly attr: string
  readonly text: string
}

type LinkedTarget = {
  readonly el: Element
  readonly textNode: Text
}

type LinkedGroup = {
  readonly key: string
  readonly writableTargets: readonly LinkedTarget[]
  readonly sourceText: string
}

type PhaseWork = {
  md: Element[]
  structured: StructuredTextUnit[]
  batches: TaggedTextNode[][]
  attrs: TranslatableAttr[]
}

type StructuredTokenKind =
  | "text-open"
  | "text-close"
  | "element-open"
  | "element-close"
  | "br"
  | "code"

type StructuredTokenDescriptor = {
  readonly token: string
  readonly kind: StructuredTokenKind
  readonly slotId: number
}

type StructuredTextSlot = {
  readonly node: Text
  readonly slotId: number
}

type StructuredTextUnit = {
  readonly root: Element
  readonly serialized: string
  readonly textSlots: readonly StructuredTextSlot[]
  readonly tokenSequence: readonly StructuredTokenDescriptor[]
}

type VisibleClaims = {
  readonly linkedTextNodes: Set<Text>
  readonly richRoots: readonly Element[]
  readonly structuredRoots: Set<Element>
  readonly structuredTextNodes: Set<Text>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_RTL_LANGS: ReadonlySet<string> = new Set(["ar", "he", "ur", "fa"])
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

function compareDocumentOrder(a: Node, b: Node): number {
  if (a === b) return 0
  const relation = a.compareDocumentPosition(b)
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  return 0
}

function buildStructuredToken(key: string, slotId: number): string {
  return `${STRUCTURED_TOKEN_PREFIX}${key}:${slotId}${STRUCTURED_TOKEN_SUFFIX}`
}

function isInertStructuredSpan(el: Element): boolean {
  if (el.localName !== "span") return true
  return Array.from(el.attributes).every((attr) =>
    attr.name.startsWith("data-") || STRUCTURED_INERT_SPAN_ATTRS.has(attr.name))
}

function resolveRoots(
  selectors: readonly string[],
  scope: ParentNode | Document,
): Element[] {
  return selectors
    .map((sel) => scope.querySelector(sel))
    .filter((el): el is Element => el !== null)
}

function findDirectTextNode(el: Element): Text | null {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      return child as Text
    }
  }
  return null
}

function assignPhase(node: Node, phaseRoots: Element[][]): number {
  const el = node instanceof Element ? node : node.parentElement
  if (!el) return phaseRoots.length
  for (let i = 0; i < phaseRoots.length; i++) {
    for (const root of phaseRoots[i]!) {
      if (root === el || root.contains(el)) return i
    }
  }
  return phaseRoots.length
}

function notifyStart(
  target: Text | Element,
  hook?: (element: Element) => void,
): void {
  if (!hook) return
  const el = target instanceof Element ? target : target.parentElement
  if (el) hook(el)
}

function notifyEnd(
  target: Text | Element,
  hook?: (element: Element) => void,
): void {
  if (!hook) return
  const el = target instanceof Element ? target : target.parentElement
  if (el) hook(el)
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createDOMTranslator(config: DOMTranslatorConfig): DOMTranslator {
  const scope: ParentNode | Document = config.root ?? document

  // Instance-scoped state — no module singletons
  const originalTexts = new WeakMap<Text, string>()
  const originalRichElements = new Map<Element, string>()
  const originalAttrs = new Map<Element, Record<string, string>>()
  const originalLinkedSources = new Map<string, string>()
  const savedDirs = new Map<Element, string | null>()
  let activeController: AbortController | null = null
  let translating = false
  let lang: string | null = null

  const skipTags = buildSkipTags(config.skipTags)
  const rtlLangs = config.rtlLanguages ?? DEFAULT_RTL_LANGS
  const charLimit = config.batchCharLimit ?? DEFAULT_BATCH_CHAR_LIMIT
  const matchers = config.preserve?.matchers ?? []
  const attrNames = config.translateAttributes ?? ["title"]

  const shouldSkip = config.shouldSkip
    ? (text: string) => config.shouldSkip!(text, defaultShouldSkip)
    : defaultShouldSkip

  // Skip selectors: elements whose children should be excluded from
  // plain-text walking (they are translated separately).
  const skipSelectors: string[] = []
  if (config.richText) skipSelectors.push(`[${config.richText.sourceAttribute}]`)
  if (config.linkedBy) skipSelectors.push(`[${config.linkedBy.keyAttribute}]`)

  function captureLinkedOriginalText(node: Text, key: string): string {
    const original = originalTexts.get(node)
    if (original != null) return original
    const current = originalLinkedSources.get(key) ?? node.textContent ?? ""
    originalTexts.set(node, current)
    return current
  }

  function captureOriginalTextValue(node: Text): string {
    const original = originalTexts.get(node)
    if (original != null) return original
    const current = node.textContent ?? ""
    originalTexts.set(node, current)
    return current
  }

  function getOriginalAttrValue(el: Element, attrName: string): string | null {
    const attrs = originalAttrs.get(el)
    if (attrs && attrName in attrs) return attrs[attrName]!
    return el.getAttribute(attrName)
  }

  function captureOriginalAttrValue(el: Element, attrName: string): string | null {
    const current = el.getAttribute(attrName)
    if (current == null) return null

    let attrs = originalAttrs.get(el)
    if (!attrs) {
      attrs = {}
      originalAttrs.set(el, attrs)
    }

    if (!(attrName in attrs)) {
      attrs[attrName] = current
    }

    return attrs[attrName]!
  }

  // -------------------------------------------------------------------------
  // Linked element sync (e.g. section titles)
  // -------------------------------------------------------------------------

  function collectLinkedGroups(roots: Element[]): LinkedGroup[] {
    if (!config.linkedBy) return []

    const { selector, keyAttribute } = config.linkedBy
    const elementsByKey = new Map<string, Element[]>()

    for (const root of roots) {
      for (const el of root.querySelectorAll(selector)) {
        const key = el.getAttribute(keyAttribute)
        if (key == null) continue

        const group = elementsByKey.get(key)
        if (group) {
          group.push(el)
        } else {
          elementsByKey.set(key, [el])
        }
      }
    }

    return Array.from(elementsByKey, ([key, elements]) => {
      const writableTargets = elements.flatMap((el) => {
        const textNode = findDirectTextNode(el)
        return textNode ? [{ el, textNode }] : []
      })
      const sourceText =
        originalLinkedSources.get(key)
        ?? writableTargets[0]?.textNode.textContent?.trim()
        ?? ""

      return {
        key,
        writableTargets,
        sourceText,
      }
    })
  }

  async function translateLinked(
    groups: readonly LinkedGroup[],
    targetLang: string,
    signal: AbortSignal,
    onUnit: () => void,
  ): Promise<void> {
    for (const { key, writableTargets, sourceText } of groups) {
      if (signal.aborted) return
      if (writableTargets.length === 0) {
        onUnit()
        continue
      }

      if (!sourceText || shouldSkip(sourceText)) {
        onUnit()
        continue
      }
      if (!originalLinkedSources.has(key)) {
        originalLinkedSources.set(key, sourceText)
      }

      for (const { el } of writableTargets) {
        notifyStart(el, config.hooks?.onTranslateStart)
      }

      const translated = await config.translate(sourceText, targetLang)
      if (signal.aborted) return

      for (const { el, textNode } of writableTargets) {
        captureLinkedOriginalText(textNode, key)
        textNode.textContent = translated
        notifyEnd(el, config.hooks?.onTranslateEnd)
      }

      onUnit()
    }
  }

  // -------------------------------------------------------------------------
  // Attribute collection
  // -------------------------------------------------------------------------

  function collectStructuredCandidates(roots: readonly Element[]): Element[] {
    if (!config.structuredText) return []

    const seen = new Set<Element>()
    const matches: Element[] = []
    for (const root of roots) {
      for (const el of root.querySelectorAll(config.structuredText.selector)) {
        if (seen.has(el)) continue
        seen.add(el)
        matches.push(el)
      }
    }

    return matches.sort(compareDocumentOrder)
  }

  function buildVisibleClaims(
    linkedGroups: readonly LinkedGroup[],
    richRoots: readonly Element[],
  ): VisibleClaims {
    return {
      linkedTextNodes: new Set(
        linkedGroups.flatMap((group) =>
          group.writableTargets.map((target) => target.textNode),
        ),
      ),
      richRoots,
      structuredRoots: new Set<Element>(),
      structuredTextNodes: new Set<Text>(),
    }
  }

  function overlapsClaimedRoot(
    candidate: Element,
    claimedRoots: Iterable<Element>,
  ): boolean {
    for (const claimedRoot of claimedRoots) {
      if (
        claimedRoot === candidate
        || claimedRoot.contains(candidate)
        || candidate.contains(claimedRoot)
      ) {
        return true
      }
    }
    return false
  }

  function containsClaimedLinkedTextNode(
    candidate: Element,
    linkedTextNodes: ReadonlySet<Text>,
  ): boolean {
    for (const textNode of linkedTextNodes) {
      if (candidate.contains(textNode)) return true
    }
    return false
  }

  function hasNestedStructuredConflict(
    candidate: Element,
    rawCandidates: readonly Element[],
  ): boolean {
    return rawCandidates.some((other) =>
      other !== candidate && (other.contains(candidate) || candidate.contains(other)))
  }

  function claimStructuredUnit(
    unit: StructuredTextUnit,
    claims: VisibleClaims,
  ): void {
    claims.structuredRoots.add(unit.root)
    for (const { node } of unit.textSlots) {
      claims.structuredTextNodes.add(node)
    }
  }

  function resolveStructuredUnits(
    roots: readonly Element[],
    claims: VisibleClaims,
  ): StructuredTextUnit[] {
    const rawCandidates = collectStructuredCandidates(roots)
    const units: StructuredTextUnit[] = []

    for (const candidate of rawCandidates) {
      if (hasNestedStructuredConflict(candidate, rawCandidates)) continue
      if (overlapsClaimedRoot(candidate, claims.richRoots)) continue
      if (overlapsClaimedRoot(candidate, claims.structuredRoots)) continue
      if (containsClaimedLinkedTextNode(candidate, claims.linkedTextNodes)) continue

      const unit = tryExtractStructuredUnit(candidate, claims)
      if (!unit) continue

      claimStructuredUnit(unit, claims)
      units.push(unit)
    }

    return units
  }

  function tryExtractStructuredUnit(
    root: Element,
    claims: VisibleClaims,
  ): StructuredTextUnit | null {
    if (root.namespaceURI && root.namespaceURI !== HTML_NAMESPACE) return null
    if (root.localName.includes("-")) return null
    if (!isInertStructuredSpan(root)) return null
    if (root.hasAttribute("contenteditable") && root.getAttribute("contenteditable") !== "false") {
      return null
    }

    const parts: string[] = []
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

        const source = captureOriginalTextValue(textNode)
        const trimmed = source.trim()
        if (!trimmed) return true
        if (shouldSkip(trimmed)) return false

        const slotId = nextSlotId++
        pushToken("text-open", "text-open", slotId)
        parts.push(source)
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
      serialized: parts.join(""),
      textSlots,
      tokenSequence,
    }
  }

  function extractStructuredTextValues(
    unit: StructuredTextUnit,
    translated: string,
  ): Map<number, string> | null {
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
    return values
  }

  function collectTranslatableAttrs(root: Element): TranslatableAttr[] {
    const items: TranslatableAttr[] = []
    for (const attrName of attrNames) {
      for (const el of root.querySelectorAll(`[${attrName}]`)) {
        const sourceText = getOriginalAttrValue(el, attrName)
        if (sourceText == null || shouldSkip(sourceText)) continue
        const text = captureOriginalAttrValue(el, attrName)
        if (text == null) continue
        items.push({ el, attr: attrName, text })
      }
    }
    return items
  }

  // -------------------------------------------------------------------------
  // Rich text translation
  // -------------------------------------------------------------------------

  async function translateRichElement(
    el: Element,
    targetLang: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (!config.richText) return
    const source = el.getAttribute(config.richText.sourceAttribute)
    if (!source) return

    if (!originalRichElements.has(el)) {
      // Safe: capturing current DOM state for later restore
      originalRichElements.set(el, el.innerHTML) // eslint-disable-line no-unsanitized/property
    }

    notifyStart(el, config.hooks?.onTranslateStart)

    const { masked, slots } = insertPlaceholders(source, matchers)
    const rawTranslation = await config.translate(masked, targetLang)
    if (signal.aborted) return
    const translated = restorePlaceholders(rawTranslation, slots)

    const validate = config.richText.validate ?? isWellFormedMarkdown
    if (validate(translated)) {
      const render = config.richText.render
      // Safe: render function provided by consumer is responsible for escaping.
      // Default (renderInlineMarkdownToHtml) escapes all text segments.
      el.innerHTML = render(translated) // eslint-disable-line no-unsanitized/property
    } else {
      el.textContent = translated.replaceAll("**", "").replaceAll("*", "")
    }

    notifyEnd(el, config.hooks?.onTranslateEnd)
  }

  async function translateStructuredUnit(
    unit: StructuredTextUnit,
    targetLang: string,
    signal: AbortSignal,
  ): Promise<void> {
    notifyStart(unit.root, config.hooks?.onTranslateStart)

    const { masked, slots } = insertPlaceholders(unit.serialized, matchers)
    const rawTranslation = await config.translate(masked, targetLang)
    if (signal.aborted) return
    const translated = restorePlaceholders(rawTranslation, slots)

    const values = extractStructuredTextValues(unit, translated)
    if (values) {
      for (const { node, slotId } of unit.textSlots) {
        node.textContent = values.get(slotId) ?? ""
      }
    }

    notifyEnd(unit.root, config.hooks?.onTranslateEnd)
  }

  // -------------------------------------------------------------------------
  // Core translate
  // -------------------------------------------------------------------------

  async function doTranslate(targetLang: string): Promise<void> {
    if (activeController) activeController.abort()
    activeController = new AbortController()
    const { signal } = activeController

    translating = true
    lang = targetLang

    try {
      const roots = resolveRoots(config.roots, scope)
      if (roots.length === 0) return

      // RTL direction
      const dir = rtlLangs.has(targetLang) ? "rtl" : "ltr"
      for (const root of roots) {
        if (!savedDirs.has(root)) savedDirs.set(root, root.getAttribute("dir"))
        root.setAttribute("dir", dir)
        config.hooks?.onDirectionChange?.(root, dir)
      }

      // Collect all translatable units before mutation
      const linkedGroups = collectLinkedGroups(roots)

      const allRich = config.richText
        ? roots.flatMap((r) =>
          Array.from(r.querySelectorAll(config.richText!.selector)),
        )
        : []

      const claims = buildVisibleClaims(linkedGroups, allRich)
      const allStructured = resolveStructuredUnits(roots, claims)

      const walkerConfig = { skipTags, shouldSkip, skipInside: skipSelectors }
      const allNodes = roots.flatMap((r) =>
        collectTextNodes(r, walkerConfig, originalTexts),
      ).filter(({ node }) =>
        !claims.linkedTextNodes.has(node) && !claims.structuredTextNodes.has(node))
      const allBatches = buildBatches(allNodes, charLimit)
      const allAttrs = roots.flatMap(collectTranslatableAttrs)

      const total =
        linkedGroups.length
        + allRich.length
        + allStructured.length
        + allBatches.length
        + allAttrs.length
      let done = 0

      const progress = () => {
        done++
        config.hooks?.onProgress?.(done, total)
      }

      // If phases configured, partition work; otherwise treat as single phase
      if (config.phases && config.phases.length > 0) {
        const phaseRoots = config.phases.map((sel) =>
          Array.from(scope.querySelectorAll(sel)),
        )
        const phaseCount = config.phases.length + 1
        const phases: PhaseWork[] = Array.from({ length: phaseCount }, () => ({
          md: [],
          structured: [],
          batches: [],
          attrs: [],
        }))

        for (const el of allRich) phases[assignPhase(el, phaseRoots)]!.md.push(el)
        for (const unit of allStructured) {
          phases[assignPhase(unit.root, phaseRoots)]!.structured.push(unit)
        }
        for (const batch of allBatches) {
          phases[assignPhase(batch[0]!.node, phaseRoots)]!.batches.push(batch)
        }
        for (const attr of allAttrs) {
          phases[assignPhase(attr.el, phaseRoots)]!.attrs.push(attr)
        }

        // Linked elements first (like section titles)
        await translateLinked(linkedGroups, targetLang, signal, progress)

        for (const phase of phases) {
          await translatePhaseWork(phase, targetLang, signal, progress)
        }
      } else {
        // No phases: linked first, then everything in one pass
        await translateLinked(linkedGroups, targetLang, signal, progress)

        const singlePhase: PhaseWork = {
          md: allRich,
          structured: allStructured,
          batches: allBatches,
          attrs: allAttrs,
        }
        await translatePhaseWork(singlePhase, targetLang, signal, progress)
      }
    } finally {
      translating = false
    }
  }

  async function translatePhaseWork(
    phase: PhaseWork,
    targetLang: string,
    signal: AbortSignal,
    progress: () => void,
  ): Promise<void> {
    // Rich text elements
    for (const el of phase.md) {
      if (signal.aborted) return
      await translateRichElement(el, targetLang, signal)
      if (signal.aborted) return
      progress()
    }

    // Structured text roots
    for (const unit of phase.structured) {
      if (signal.aborted) return
      await translateStructuredUnit(unit, targetLang, signal)
      if (signal.aborted) return
      progress()
    }

    // Text node batches
    for (const batch of phase.batches) {
      if (signal.aborted) return

      const parents = new Set(
        batch.map((t) => t.node.parentElement).filter(Boolean) as Element[],
      )
      for (const p of parents)
        notifyStart(p, config.hooks?.onTranslateStart)

      const chunk = batch.map((t) => t.text).join("\n")
      const result = await config.translate(chunk, targetLang)
      if (signal.aborted) return

      applyTranslation(batch, result)

      for (const p of parents)
        notifyEnd(p, config.hooks?.onTranslateEnd)

      progress()
    }

    // Attributes
    for (const { el, attr, text } of phase.attrs) {
      if (signal.aborted) return
      const translated = await config.translate(text, targetLang)
      if (signal.aborted) return
      el.setAttribute(attr, translated)
      progress()
    }
  }

  // -------------------------------------------------------------------------
  // Restore
  // -------------------------------------------------------------------------

  function restore(): void {
    if (activeController) {
      activeController.abort()
      activeController = null
    }
    translating = false
    lang = null

    // Restore dir attributes
    for (const [el, dir] of savedDirs) {
      if (dir !== null) {
        el.setAttribute("dir", dir)
      } else {
        el.removeAttribute("dir")
      }
    }
    savedDirs.clear()

    // Safe: restoring previously captured DOM content
    for (const [el, original] of originalRichElements) {
      el.innerHTML = original // eslint-disable-line no-unsanitized/property
    }
    originalRichElements.clear()

    // Restore attributes
    for (const [el, attrs] of originalAttrs) {
      for (const [attrKey, value] of Object.entries(attrs)) {
        el.setAttribute(attrKey, value)
      }
    }
    originalAttrs.clear()
    originalLinkedSources.clear()

    // Restore text nodes
    const roots = resolveRoots(config.roots, scope)
    for (const root of roots) {
      const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let current = walker.nextNode() as Text | null
      while (current) {
        const original = originalTexts.get(current)
        if (original != null) {
          current.textContent = original
          originalTexts.delete(current)
        }
        current = walker.nextNode() as Text | null
      }
    }
  }

  // -------------------------------------------------------------------------
  // Abort
  // -------------------------------------------------------------------------

  function abort(): void {
    if (activeController) {
      activeController.abort()
      activeController = null
    }
    translating = false
  }

  return {
    translate: doTranslate,
    restore,
    abort,
    get isTranslating() {
      return translating
    },
    get currentLang() {
      return lang
    },
  }
}
