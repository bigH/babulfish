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
  readonly linkedBy?: LinkedConfig
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
  batches: TaggedTextNode[][]
  attrs: TranslatableAttr[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_RTL_LANGS: ReadonlySet<string> = new Set(["ar", "he", "ur", "fa"])

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

      const walkerConfig = { skipTags, shouldSkip, skipInside: skipSelectors }
      const allNodes = roots.flatMap((r) =>
        collectTextNodes(r, walkerConfig, originalTexts),
      )
      const allBatches = buildBatches(allNodes, charLimit)
      const allAttrs = roots.flatMap(collectTranslatableAttrs)

      const total =
        linkedGroups.length + allRich.length + allBatches.length + allAttrs.length
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
          batches: [],
          attrs: [],
        }))

        for (const el of allRich) phases[assignPhase(el, phaseRoots)]!.md.push(el)
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
