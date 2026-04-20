// Placeholder substitution for preserved strings during translation.
// Matchers identify strings that must survive translation unchanged
// (e.g. brand names). They are replaced with internal placeholders
// before translation and restored afterward.

export type PreserveMatcher = string | RegExp | ((text: string) => string[])
export type PreserveSlot = {
  readonly token: string
  readonly value: string
}

const PLACEHOLDER_PREFIX = "\u27EAbf-preserve:"
const PLACEHOLDER_SUFFIX = "\u27EB"

const placeholder = (key: string, index: number): string =>
  `${PLACEHOLDER_PREFIX}${key}:${index}${PLACEHOLDER_SUFFIX}`

function createPlaceholderKey(source: string): string {
  let nextKey = 0
  while (source.includes(`${PLACEHOLDER_PREFIX}${nextKey}:`)) {
    nextKey++
  }
  return String(nextKey)
}

function isPlaceholderToken(value: string): boolean {
  return value.startsWith(PLACEHOLDER_PREFIX) && value.endsWith(PLACEHOLDER_SUFFIX)
}

/** Collect all strings matched by a single matcher. */
function matchAll(matcher: PreserveMatcher, text: string): string[] {
  if (typeof matcher === "string") {
    return matcher.length > 0 && text.includes(matcher) ? [matcher] : []
  }
  if (matcher instanceof RegExp) {
    const flags = matcher.flags.includes("g")
      ? matcher.flags
      : matcher.flags + "g"
    return collectUniqueNonEmptyMatches(
      Array.from(text.matchAll(new RegExp(matcher.source, flags)), (m) => m[0]),
    )
  }
  return collectUniqueNonEmptyMatches(matcher(text))
}

function collectUniqueNonEmptyMatches(matches: Iterable<string>): string[] {
  const values = new Set<string>()
  for (const match of matches) {
    if (match.length > 0 && !isPlaceholderToken(match)) values.add(match)
  }
  return [...values]
}

export function insertPlaceholders(
  source: string,
  matchers: readonly PreserveMatcher[],
): { masked: string; slots: PreserveSlot[] } {
  const slots: PreserveSlot[] = []
  const placeholderKey = createPlaceholderKey(source)
  let masked = source

  for (const matcher of matchers) {
    for (const word of matchAll(matcher, masked)) {
      const slot = {
        token: placeholder(placeholderKey, slots.length),
        value: word,
      }
      const nextMasked = masked.replaceAll(word, slot.token)
      if (nextMasked === masked) continue
      slots.push(slot)
      masked = nextMasked
    }
  }

  return { masked, slots }
}

export function restorePlaceholders(
  translated: string,
  slots: readonly PreserveSlot[],
): string {
  let result = translated
  for (const slot of slots) {
    result = result.replaceAll(slot.token, slot.value)
  }
  return result
}
