// TreeWalker utilities for collecting translatable text nodes.

export interface TaggedTextNode {
  readonly node: Text
  readonly text: string
}

export interface WalkerConfig {
  readonly skipTags: ReadonlySet<string>
  readonly shouldSkip: (text: string) => boolean
  readonly skipInside?: readonly string[]
}

const DEFAULT_SKIP_TAGS: ReadonlySet<string> = new Set([
  "CODE", "PRE", "SCRIPT", "STYLE", "NOSCRIPT",
])

const SYMBOL_ONLY = /^[\p{P}\p{S}\p{Z}\p{Cc}]+$/u
const NUMBER_ONLY = /^[\d\s.,\-–—/]+$/u

export function defaultShouldSkip(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length <= 1) return true
  if (SYMBOL_ONLY.test(trimmed)) return true
  if (NUMBER_ONLY.test(trimmed)) return true
  return false
}

export function buildSkipTags(extra?: readonly string[]): ReadonlySet<string> {
  const skipTags = new Set(DEFAULT_SKIP_TAGS)
  for (const tag of extra ?? []) {
    skipTags.add(tag.toUpperCase())
  }
  return skipTags
}

function getSourceText(
  node: Text,
  originalTexts: WeakMap<Text, string>,
): string {
  return originalTexts.get(node) ?? node.textContent ?? ""
}

function isInsideSkipped(
  node: Node,
  skipTags: ReadonlySet<string>,
  skipSelectors: readonly string[],
): boolean {
  let current = node.parentElement
  while (current) {
    if (skipTags.has(current.tagName)) return true
    for (const selector of skipSelectors) {
      if (current.matches(selector)) return true
    }
    current = current.parentElement
  }
  return false
}

export function collectTextNodes(
  root: Element,
  config: WalkerConfig,
  originalTexts: WeakMap<Text, string>,
): TaggedTextNode[] {
  const skipSelectors = config.skipInside ?? []
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Text) {
      if (isInsideSkipped(node, config.skipTags, skipSelectors))
        return NodeFilter.FILTER_REJECT
      const sourceText = getSourceText(node, originalTexts)
      const trimmed = sourceText.trim()
      if (!trimmed) return NodeFilter.FILTER_REJECT
      if (config.shouldSkip(trimmed)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const nodes: TaggedTextNode[] = []
  let current = walker.nextNode() as Text | null
  while (current) {
    const sourceText = getSourceText(current, originalTexts)
    if (!originalTexts.has(current)) {
      originalTexts.set(current, sourceText)
    }
    nodes.push({ node: current, text: sourceText })
    current = walker.nextNode() as Text | null
  }
  return nodes
}
