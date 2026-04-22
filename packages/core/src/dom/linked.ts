import type {
  DOMOutputTransformContext,
  DOMTranslatorConfig,
  LinkedConfig,
} from "./translator.js"
import { captureOriginalText } from "./walker.js"

export type LinkedTarget = {
  readonly el: Element
  readonly textNode: Text
}

export type LinkedGroup = {
  readonly key: string
  readonly writableTargets: readonly LinkedTarget[]
  readonly sourceText: string
}

type TranslateLinkedContext = {
  readonly targetLang: string
  readonly signal: AbortSignal
  readonly translate: (text: string, lang: string) => Promise<string>
  readonly transformDOMOutput: (
    text: string,
    ctx: DOMOutputTransformContext,
  ) => string
  readonly shouldSkip: (text: string) => boolean
  readonly originalTexts: WeakMap<Text, string>
  readonly originalLinkedSources: Map<string, string>
  readonly hooks?: DOMTranslatorConfig["hooks"]
  readonly onUnit: () => void
}

function findDirectTextNode(el: Element): Text | null {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      return child as Text
    }
  }
  return null
}

export function collectLinkedGroups(
  roots: readonly Element[],
  config: LinkedConfig,
  originalLinkedSources: Map<string, string>,
): LinkedGroup[] {
  const { selector, keyAttribute } = config
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

export async function translateLinked(
  groups: readonly LinkedGroup[],
  ctx: TranslateLinkedContext,
): Promise<void> {
  const {
    hooks,
    originalLinkedSources,
    originalTexts,
    shouldSkip,
    signal,
    targetLang,
    transformDOMOutput,
    translate,
    onUnit,
  } = ctx

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
      hooks?.onTranslateStart?.(el)
    }

    const translated = await translate(sourceText, targetLang)
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
      hooks?.onTranslateEnd?.(el)
    }

    onUnit()
  }
}
