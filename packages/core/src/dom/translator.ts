import type { TaggedTextNode } from "./walker.js"
import type { PreserveMatcher } from "./preserve.js"
import {
  buildVisibleClaims, claimStructuredTextNodes, containsClaimedLinkedTextNode,
  hasNestedStructuredConflict, overlapsClaimedRoot, type VisibleClaims,
} from "./claims.js"
export type { VisibleClaims } from "./claims.js"
import {
  buildSkipTags,
  captureOriginalText,
  collectTextNodes,
  defaultShouldSkip,
  forEachTextNode,
} from "./walker.js"
import {
  applyTranslation,
  buildBatches,
  DEFAULT_BATCH_CHAR_LIMIT,
} from "./batcher.js"
import {
  assignPhase, compareDocumentOrder, compareVisibleWork, findOwningRootIndex,
  type PhaseWork, type TranslatableAttr, type VisibleWork,
} from "./phases.js"
import { insertPlaceholders, restorePlaceholders } from "./preserve.js"
import { isWellFormedMarkdown, stripInlineMarkdownMarkers } from "./markdown.js"
import {
  extractStructuredTextValues as extractStructuredCommitPlan,
  type StructuredTextUnit,
  tryExtractStructuredUnit as extractStructuredUnit,
} from "./structured-text.js"

export type RichTextConfig = {
  readonly selector: string
  readonly sourceAttribute: string
  readonly render: (markdown: string) => string
  readonly validate?: (markdown: string) => boolean
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

type LinkedTarget = {
  readonly el: Element
  readonly textNode: Text
}

export type LinkedGroup = {
  readonly key: string
  readonly writableTargets: readonly LinkedTarget[]
  readonly sourceText: string
}

const DEFAULT_RTL_LANGS: ReadonlySet<string> = new Set(["ar", "he", "ur", "fa"])

function getBatchParent(batch: readonly TaggedTextNode[]): Element {
  const parent = batch[0]?.node.parentElement
  if (!parent) {
    throw new Error("DOMTranslator text batches must have an element parent")
  }
  return parent
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

export function createDOMTranslator(config: DOMTranslatorConfig): DOMTranslator {
  const scope: ParentNode | Document = config.root ?? document

  const originalTexts = new WeakMap<Text, string>()
  const originalRichElements = new Map<Element, string>()
  const originalStructuredRoots = new Map<Element, string>()
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

  function transformDOMOutput(
    translated: string,
    context: DOMOutputTransformContext,
  ): string {
    return config.outputTransform ? config.outputTransform(translated, context) : translated
  }

  async function translatePreservingMatches(
    source: string,
    targetLang: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    const { masked, slots } = insertPlaceholders(source, matchers)
    const translated = await config.translate(masked, targetLang)
    if (signal.aborted) return null
    return restorePlaceholders(translated, slots)
  }

  const skipSelectors: string[] = []
  if (config.richText) skipSelectors.push(`[${config.richText.sourceAttribute}]`)
  if (config.linkedBy) skipSelectors.push(`[${config.linkedBy.keyAttribute}]`)

  function captureOriginalStructuredSubtree(root: Element): string {
    const original = originalStructuredRoots.get(root)
    if (original != null) return original
    const current = root.innerHTML
    originalStructuredRoots.set(root, current)
    return current
  }

  function restoreStructuredRoot(root: Element): void {
    const original = originalStructuredRoots.get(root)
    if (original == null || root.innerHTML === original) return
    root.innerHTML = original // eslint-disable-line no-unsanitized/property
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
        config.hooks?.onTranslateStart?.(el)
      }

      const translated = await config.translate(sourceText, targetLang)
      if (signal.aborted) return
      const transformed = transformDOMOutput(translated, {
        kind: "linked",
        targetLang,
        source: sourceText,
      })

      for (const { el, textNode } of writableTargets) {
        captureOriginalText(
          textNode,
          originalTexts,
          originalLinkedSources.get(key) ?? textNode.textContent ?? "",
        )
        textNode.textContent = transformed
        config.hooks?.onTranslateEnd?.(el)
      }

      onUnit()
    }
  }

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

  function resolveStructuredUnits(
    roots: readonly Element[],
    claims: VisibleClaims,
  ): StructuredTextUnit[] {
    const rawCandidates = collectStructuredCandidates(roots)
    const units: StructuredTextUnit[] = []

    for (const candidate of rawCandidates) {
      if (hasNestedStructuredConflict(candidate, rawCandidates)) continue
      if (overlapsClaimedRoot(candidate, claims.richRoots)) continue
      if (containsClaimedLinkedTextNode(candidate, claims.linkedTextNodes)) continue

      const unit = extractStructuredUnit(candidate, {
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

  function buildStructuredFallbackSource(unit: StructuredTextUnit): string {
    return unit.textSlots
      .map(({ node }) => originalTexts.get(node) ?? node.textContent ?? "")
      .join("\n")
  }

  function collectStructuredFallbackTargets(root: Element): TaggedTextNode[] {
    return collectTextNodes(root, {
      skipTags,
      shouldSkip,
      skipInside: skipSelectors,
    }, originalTexts)
  }

  function collectTranslatableAttrs(root: Element): TranslatableAttr[] {
    const items: TranslatableAttr[] = []
    for (const el of root.querySelectorAll("*")) {
      for (const attrName of attrNames) {
        const sourceText = getOriginalAttrValue(el, attrName)
        if (sourceText == null || shouldSkip(sourceText)) continue
        const text = captureOriginalAttrValue(el, attrName)
        if (text == null) continue
        items.push({ el, attr: attrName, text })
      }
    }
    return items
  }

  async function translateRichElement(
    el: Element,
    targetLang: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (!config.richText) return
    const source = el.getAttribute(config.richText.sourceAttribute)
    if (!source) return

    if (!originalRichElements.has(el)) {
      originalRichElements.set(el, el.innerHTML) // eslint-disable-line no-unsanitized/property
    }

    config.hooks?.onTranslateStart?.(el)

    const translated = await translatePreservingMatches(source, targetLang, signal)
    if (translated == null) return
    const transformed = transformDOMOutput(translated, {
      kind: "richText",
      targetLang,
      source,
    })

    const validate = config.richText.validate ?? isWellFormedMarkdown
    if (validate(transformed)) {
      const render = config.richText.render
      el.innerHTML = render(transformed) // eslint-disable-line no-unsanitized/property
    } else {
      el.textContent = stripInlineMarkdownMarkers(transformed)
    }

    config.hooks?.onTranslateEnd?.(el)
  }

  async function translateStructuredUnit(
    unit: StructuredTextUnit,
    targetLang: string,
    signal: AbortSignal,
  ): Promise<void> {
    config.hooks?.onTranslateStart?.(unit.root)

    const translated = await translatePreservingMatches(
      unit.serialized,
      targetLang,
      signal,
    )
    if (translated == null) return
    const transformed = transformDOMOutput(translated, {
      kind: "structuredText",
      targetLang,
      source: unit.source,
    })

    const exactCommit = extractStructuredCommitPlan(unit, transformed)
    if (exactCommit) {
      if (signal.aborted) return
      for (const { node, slotId } of unit.textSlots) {
        node.textContent = exactCommit.values.get(slotId) ?? ""
      }
      config.hooks?.onTranslateEnd?.(unit.root)
      return
    }

    const fallbackSource = buildStructuredFallbackSource(unit)
    const fallbackTranslated = await translatePreservingMatches(
      fallbackSource,
      targetLang,
      signal,
    )
    if (fallbackTranslated == null) return
    const transformedFallback = transformDOMOutput(fallbackTranslated, {
      kind: "structuredText",
      targetLang,
      source: unit.source,
    })

    restoreStructuredRoot(unit.root)
    const fallbackTargets = collectStructuredFallbackTargets(unit.root)
    applyTranslation(fallbackTargets, transformedFallback)

    config.hooks?.onTranslateEnd?.(unit.root)
  }

  async function doTranslate(targetLang: string): Promise<void> {
    if (activeController) activeController.abort()
    activeController = new AbortController()
    const { signal } = activeController

    translating = true
    lang = targetLang

    try {
      const roots = resolveRoots(config.roots, scope)
      if (roots.length === 0) return

      const dir = rtlLangs.has(targetLang) ? "rtl" : "ltr"
      for (const root of roots) {
        if (!savedDirs.has(root)) savedDirs.set(root, root.getAttribute("dir"))
        root.setAttribute("dir", dir)
        config.hooks?.onDirectionChange?.(root, dir)
      }

      const linkedGroups = collectLinkedGroups(roots)

      const allRich = config.richText
        ? roots.flatMap((r) =>
          Array.from(r.querySelectorAll(config.richText!.selector)),
        )
        : []

      const claims = buildVisibleClaims(linkedGroups, allRich)
      const allStructured = resolveStructuredUnits(roots, claims)
      for (const unit of allStructured) {
        captureOriginalStructuredSubtree(unit.root)
      }

      const walkerConfig = { skipTags, shouldSkip, skipInside: skipSelectors }
      const allNodes = roots.flatMap((r) =>
        collectTextNodes(r, walkerConfig, originalTexts),
      ).filter(({ node }) =>
        !claims.linkedTextNodes.has(node) && !claims.structuredTextNodes.has(node))
      const allBatches = buildBatches(allNodes, charLimit)
      const allVisible: VisibleWork[] = [
        ...allRich.map((element): VisibleWork => ({
          kind: "richText",
          rootIndex: findOwningRootIndex(element, roots),
          anchor: element,
          element,
        })),
        ...allStructured.map((unit): VisibleWork => ({
          kind: "structuredText",
          rootIndex: findOwningRootIndex(unit.root, roots),
          anchor: unit.root,
          unit,
        })),
        ...allBatches.map((batch): VisibleWork => ({
          kind: "text",
          rootIndex: findOwningRootIndex(batch[0]!.node, roots),
          anchor: batch[0]!.node,
          parent: getBatchParent(batch),
          batch,
        })),
      ].sort(compareVisibleWork)
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

      const phaseSelectors = config.phases ?? []
      const phaseRoots = phaseSelectors.map((sel) =>
        Array.from(scope.querySelectorAll(sel)),
      )
      const phases: PhaseWork[] = Array.from(
        { length: phaseSelectors.length + 1 },
        () => ({ visible: [], attrs: [] }),
      )

      for (const work of allVisible) {
        phases[assignPhase(work.anchor, phaseRoots)]!.visible.push(work)
      }
      for (const attr of allAttrs) {
        phases[assignPhase(attr.el, phaseRoots)]!.attrs.push(attr)
      }

      await translateLinked(linkedGroups, targetLang, signal, progress)

      for (const phase of phases) {
        await translatePhaseWork(phase, targetLang, signal, progress)
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
    for (const work of phase.visible) {
      if (signal.aborted) return
      if (work.kind === "richText") {
        await translateRichElement(work.element, targetLang, signal)
      } else if (work.kind === "structuredText") {
        await translateStructuredUnit(work.unit, targetLang, signal)
      } else {
        config.hooks?.onTranslateStart?.(work.parent)

        const chunk = work.batch.map((t) => t.text).join("\n")
        const result = await config.translate(chunk, targetLang)
        if (signal.aborted) return
        const transformed = transformDOMOutput(result, {
          kind: "text",
          targetLang,
          source: chunk,
        })

        applyTranslation(work.batch, transformed)

        config.hooks?.onTranslateEnd?.(work.parent)
      }

      if (signal.aborted) return
      progress()
    }

    for (const { el, attr, text } of phase.attrs) {
      if (signal.aborted) return
      const translated = await config.translate(text, targetLang)
      if (signal.aborted) return
      const transformed = transformDOMOutput(translated, {
        kind: "attr",
        targetLang,
        source: text,
        attribute: attr,
      })
      el.setAttribute(attr, transformed)
      progress()
    }
  }

  function restore(): void {
    if (activeController) {
      activeController.abort()
      activeController = null
    }
    translating = false
    lang = null

    for (const [el, dir] of savedDirs) {
      if (dir !== null) {
        el.setAttribute("dir", dir)
      } else {
        el.removeAttribute("dir")
      }
    }
    savedDirs.clear()

    for (const [el, original] of originalRichElements) {
      el.innerHTML = original // eslint-disable-line no-unsanitized/property
    }
    originalRichElements.clear()

    for (const root of originalStructuredRoots.keys()) {
      restoreStructuredRoot(root)
    }
    originalStructuredRoots.clear()

    for (const [el, attrs] of originalAttrs) {
      for (const [attrKey, value] of Object.entries(attrs)) {
        el.setAttribute(attrKey, value)
      }
    }
    originalAttrs.clear()
    originalLinkedSources.clear()

    const roots = resolveRoots(config.roots, scope)
    for (const root of roots) {
      forEachTextNode(root, (current) => {
        const original = originalTexts.get(current)
        if (original != null) {
          current.textContent = original
          originalTexts.delete(current)
        }
      })
    }
  }

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
