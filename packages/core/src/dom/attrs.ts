export type TranslatableAttr = {
  readonly el: Element
  readonly attr: string
  readonly text: string
}

type OriginalAttrs = Map<Element, Record<string, string>>

export function getOriginalAttrValue(
  el: Element,
  attrName: string,
  originalAttrs: OriginalAttrs,
): string | null {
  const attrs = originalAttrs.get(el)
  if (attrs && attrName in attrs) return attrs[attrName]!
  return el.getAttribute(attrName)
}

export function captureOriginalAttrValue(
  el: Element,
  attrName: string,
  originalAttrs: OriginalAttrs,
): string | null {
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

export function collectTranslatableAttrs(
  root: Element,
  attrNames: readonly string[],
  shouldSkip: (text: string) => boolean,
  originalAttrs: OriginalAttrs,
): TranslatableAttr[] {
  const items: TranslatableAttr[] = []
  for (const el of root.querySelectorAll("*")) {
    for (const attrName of attrNames) {
      const sourceText = getOriginalAttrValue(el, attrName, originalAttrs)
      if (sourceText == null || shouldSkip(sourceText)) continue
      const text = captureOriginalAttrValue(el, attrName, originalAttrs)
      if (text == null) continue
      items.push({ el, attr: attrName, text })
    }
  }
  return items
}
