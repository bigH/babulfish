import type { StructuredTextUnit } from "./structured-text.js"
import type { TaggedTextNode } from "./walker.js"
import type { TranslatableAttr } from "./attrs.js"

export type VisibleWork =
  | {
      readonly kind: "richText"
      readonly rootIndex: number
      readonly anchor: Element
      readonly element: Element
    }
  | {
      readonly kind: "structuredText"
      readonly rootIndex: number
      readonly anchor: Element
      readonly unit: StructuredTextUnit
    }
  | {
      readonly kind: "text"
      readonly rootIndex: number
      readonly anchor: Text
      readonly parent: Element
      readonly batch: TaggedTextNode[]
    }

export type PhaseWork = {
  visible: VisibleWork[]
  attrs: TranslatableAttr[]
}

export function compareDocumentOrder(a: Node, b: Node): number {
  if (a === b) return 0
  const relation = a.compareDocumentPosition(b)
  if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1
  if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  return 0
}

export function findOwningRootIndex(
  node: Node,
  roots: readonly Element[],
): number {
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]!
    if (root === node || root.contains(node)) return i
  }
  return roots.length
}

export function compareVisibleWork(a: VisibleWork, b: VisibleWork): number {
  if (a.rootIndex !== b.rootIndex) return a.rootIndex - b.rootIndex
  return compareDocumentOrder(a.anchor, b.anchor)
}

export function assignPhase(node: Node, phaseRoots: Element[][]): number {
  const el = node instanceof Element ? node : node.parentElement
  if (!el) return phaseRoots.length
  for (let i = 0; i < phaseRoots.length; i++) {
    for (const root of phaseRoots[i]!) {
      if (root === el || root.contains(el)) return i
    }
  }
  return phaseRoots.length
}
