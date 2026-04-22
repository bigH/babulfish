import type { TaggedTextNode } from "./walker.js"
import type { PreserveMatcher } from "./preserve.js"
import { collectTranslatableAttrs } from "./attrs.js"
import { buildVisibleClaims } from "./claims.js"
import { buildSkipTags, collectTextNodes, defaultShouldSkip, forEachTextNode } from "./walker.js"
import { applyTranslation, buildBatches, DEFAULT_BATCH_CHAR_LIMIT } from "./batcher.js"
import { assignPhase, compareVisibleWork, findOwningRootIndex, type PhaseWork, type VisibleWork } from "./phases.js"
import { insertPlaceholders, restorePlaceholders } from "./preserve.js"
import { collectLinkedGroups, translateLinked } from "./linked.js"
import { translateRichElement } from "./rich-text.js"
import {
  extractStructuredTextValues as extractStructuredCommitPlan,
  resolveStructuredUnits as resolveStructuredTextUnits,
  type StructuredTextUnit,
} from "./structured-text.js"

export type RichTextConfig = {
  readonly selector: string
  readonly sourceAttribute: string
  readonly render: (markdown: string) => string
  readonly validate?: (markdown: string) => boolean
}

export type LinkedConfig = { readonly selector: string; readonly keyAttribute: string }

export type StructuredTextConfig = { readonly selector: string }

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
  readonly shouldSkip?: (text: string, defaultSkip: (text: string) => boolean) => boolean
  readonly richText?: RichTextConfig
  readonly structuredText?: StructuredTextConfig
  readonly linkedBy?: LinkedConfig
  readonly outputTransform?: (translated: string, context: DOMOutputTransformContext) => string
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
  readonly isTranslating: boolean; readonly currentLang: string | null
}

const DEFAULT_RTL_LANGS: ReadonlySet<string> = new Set(["ar", "he", "ur", "fa"])

function getBatchParent(batch: readonly TaggedTextNode[]): Element {
  const parent = batch[0]?.node.parentElement
  if (!parent) {
    throw new Error("DOMTranslator text batches must have an element parent")
  }
  return parent
}

function resolveRoots(selectors: readonly string[], scope: ParentNode | Document): Element[] {
  return selectors.map((sel) => scope.querySelector(sel)).filter((el): el is Element => el !== null)
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

  function transformDOMOutput(translated: string, context: DOMOutputTransformContext): string {
    return config.outputTransform ? config.outputTransform(translated, context) : translated
  }

  async function translatePreservingMatches(source: string, targetLang: string, signal: AbortSignal): Promise<string | null> {
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

  function buildStructuredFallbackSource(unit: StructuredTextUnit): string {
    return unit.textSlots
      .map(({ node }) => originalTexts.get(node) ?? node.textContent ?? "")
      .join("\n")
  }

  function collectStructuredFallbackTargets(root: Element): TaggedTextNode[] {
    return collectTextNodes(root, { skipTags, shouldSkip, skipInside: skipSelectors }, originalTexts)
  }

  async function translateStructuredUnit(unit: StructuredTextUnit, targetLang: string, signal: AbortSignal): Promise<void> {
    config.hooks?.onTranslateStart?.(unit.root)

    const translated = await translatePreservingMatches(unit.serialized, targetLang, signal)
    if (translated == null) return
    const transformed = transformDOMOutput(translated, { kind: "structuredText", targetLang, source: unit.source })

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
    const fallbackTranslated = await translatePreservingMatches(fallbackSource, targetLang, signal)
    if (fallbackTranslated == null) return
    const transformedFallback = transformDOMOutput(fallbackTranslated, { kind: "structuredText", targetLang, source: unit.source })

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

      const linkedGroups = config.linkedBy
        ? collectLinkedGroups(roots, config.linkedBy, originalLinkedSources)
        : []

      const allRich = config.richText
        ? roots.flatMap((r) => Array.from(r.querySelectorAll(config.richText!.selector)))
        : []

      const claims = buildVisibleClaims(linkedGroups, allRich)
      const allStructured = resolveStructuredTextUnits(roots, {
        claims,
        originalTexts,
        shouldSkip,
        structuredSelector: config.structuredText?.selector ?? null,
      })
      for (const unit of allStructured) {
        captureOriginalStructuredSubtree(unit.root)
      }

      const walkerConfig = { skipTags, shouldSkip, skipInside: skipSelectors }
      const allNodes = roots
        .flatMap((r) => collectTextNodes(r, walkerConfig, originalTexts))
        .filter(({ node }) => !claims.linkedTextNodes.has(node) && !claims.structuredTextNodes.has(node))
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
      const allAttrs = roots.flatMap((root) => collectTranslatableAttrs(root, attrNames, shouldSkip, originalAttrs))

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
      const phaseRoots = phaseSelectors.map((sel) => Array.from(scope.querySelectorAll(sel)))
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

      await translateLinked(linkedGroups, {
        targetLang,
        signal,
        translate: config.translate,
        transformDOMOutput,
        shouldSkip,
        originalTexts,
        originalLinkedSources,
        hooks: config.hooks,
        onUnit: progress,
      })

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
        if (config.richText) {
          await translateRichElement(work.element, {
            targetLang,
            signal,
            config: config.richText,
            translatePreservingMatches,
            transformDOMOutput,
            originalRichElements,
            hooks: config.hooks,
          })
        }
      } else if (work.kind === "structuredText") {
        await translateStructuredUnit(work.unit, targetLang, signal)
      } else {
        config.hooks?.onTranslateStart?.(work.parent)

        const chunk = work.batch.map((t) => t.text).join("\n")
        const result = await config.translate(chunk, targetLang)
        if (signal.aborted) return
        const transformed = transformDOMOutput(result, { kind: "text", targetLang, source: chunk })

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
      const transformed = transformDOMOutput(translated, { kind: "attr", targetLang, source: text, attribute: attr })
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
