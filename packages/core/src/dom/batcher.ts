// Text node batching — groups nodes into translation-sized batches,
// respecting block-element boundaries.

import type { TaggedTextNode } from "./walker.js"

const DEFAULT_BATCH_CHAR_LIMIT = 500

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DETAILS", "DIALOG",
  "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM",
  "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HGROUP", "HR", "LI",
  "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "UL",
])

function hitBlockBoundary(a: Text, b: Text): boolean {
  if (a.parentElement === b.parentElement) return false

  let cursor: Node | null = a.nextSibling
  while (cursor && cursor !== b) {
    if (
      cursor.nodeType === Node.ELEMENT_NODE &&
      BLOCK_TAGS.has((cursor as Element).tagName)
    ) {
      return true
    }
    cursor = cursor.nextSibling
  }

  // Different parents means a structural boundary
  if (!cursor) return true

  return false
}

export function buildBatches(
  nodes: readonly TaggedTextNode[],
  charLimit: number = DEFAULT_BATCH_CHAR_LIMIT,
): TaggedTextNode[][] {
  if (nodes.length === 0) return []

  const first = nodes[0]!
  const batches: TaggedTextNode[][] = []
  let batch: TaggedTextNode[] = [first]
  let length = first.text.length

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1]!
    const curr = nodes[i]!
    const wouldExceed = length + curr.text.length > charLimit
    const boundary = hitBlockBoundary(prev.node, curr.node)

    if (wouldExceed || boundary) {
      batches.push(batch)
      batch = [curr]
      length = curr.text.length
    } else {
      batch.push(curr)
      length += curr.text.length
    }
  }

  if (batch.length > 0) batches.push(batch)
  return batches
}

export function applyTranslation(
  batch: readonly TaggedTextNode[],
  translated: string,
): void {
  const parts = translated.split("\n")
  if (parts.length === batch.length) {
    for (let i = 0; i < batch.length; i++) {
      batch[i]!.node.textContent = parts[i]!
    }
  } else {
    batch[0]!.node.textContent = translated
    for (let i = 1; i < batch.length; i++) {
      batch[i]!.node.textContent = ""
    }
  }
}
