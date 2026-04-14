// Text node batching — groups nodes into translation-sized batches,
// splitting whenever the parent element changes.

import type { TaggedTextNode } from "./walker.js"

export const DEFAULT_BATCH_CHAR_LIMIT = 500

function crossesParentBoundary(a: Text, b: Text): boolean {
  return a.parentElement !== b.parentElement
}

export function buildBatches(
  nodes: readonly TaggedTextNode[],
  charLimit: number,
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
    const boundary = crossesParentBoundary(prev.node, curr.node)

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
