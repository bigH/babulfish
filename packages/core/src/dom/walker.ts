// TreeWalker utilities for collecting translatable text nodes.

export interface TaggedTextNode {
  readonly node: Text
  readonly text: string
}

export interface WalkerConfig {
  readonly skipTags: ReadonlySet<string>
  readonly shouldSkip: (text: string) => boolean
  readonly skipInside?: ReadonlyArray<{ selector: string }>
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
  if (!extra || extra.length === 0) return DEFAULT_SKIP_TAGS
  return new Set([...DEFAULT_SKIP_TAGS, ...extra.map((t) => t.toUpperCase())])
}

function isInsideSkipped(
  node: Node,
  skipTags: ReadonlySet<string>,
  skipSelectors: ReadonlyArray<{ selector: string }>,
): boolean {
  let current = node.parentElement
  while (current) {
    if (skipTags.has(current.tagName)) return true
    for (const { selector } of skipSelectors) {
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
  skipSelectors: ReadonlyArray<{ selector: string }> = [],
): TaggedTextNode[] {
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Text) {
      if (isInsideSkipped(node, config.skipTags, skipSelectors))
        return NodeFilter.FILTER_REJECT
      const sourceText = originalTexts.get(node) ?? node.textContent ?? ""
      const trimmed = sourceText.trim()
      if (!trimmed) return NodeFilter.FILTER_REJECT
      if (config.shouldSkip(trimmed)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const nodes: TaggedTextNode[] = []
  let current = walker.nextNode() as Text | null
  while (current) {
    const sourceText = originalTexts.get(current) ?? current.textContent ?? ""
    if (!originalTexts.has(current)) {
      originalTexts.set(current, sourceText)
    }
    nodes.push({ node: current, text: sourceText })
    current = walker.nextNode() as Text | null
  }
  return nodes
}
