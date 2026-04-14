// Placeholder substitution for preserved strings during translation.
// Matchers identify strings that must survive translation unchanged
// (e.g. brand names). They are replaced with numbered placeholders
// before translation and restored afterward.

export type PreserveMatcher = string | RegExp | ((text: string) => string[])

/** Collect all strings matched by a single matcher. */
function matchAll(matcher: PreserveMatcher, text: string): string[] {
  if (typeof matcher === "string") {
    return matcher.length > 0 && text.includes(matcher) ? [matcher] : []
  }
  if (matcher instanceof RegExp) {
    const flags = matcher.flags.includes("g")
      ? matcher.flags
      : matcher.flags + "g"
    return uniqueNonEmpty(
      Array.from(text.matchAll(new RegExp(matcher.source, flags)), (m) => m[0]),
    )
  }
  return uniqueNonEmpty(matcher(text))
}

function uniqueNonEmpty(matches: Iterable<string>): string[] {
  const values = new Set<string>()
  for (const match of matches) {
    if (match.length > 0) values.add(match)
  }
  return [...values]
}

export function insertPlaceholders(
  source: string,
  matchers: readonly PreserveMatcher[],
): { masked: string; slots: string[] } {
  const slots: string[] = []
  let masked = source

  for (const matcher of matchers) {
    for (const word of matchAll(matcher, masked)) {
      const tag = `\u27EA${slots.length}\u27EB`
      const nextMasked = masked.replaceAll(word, tag)
      if (nextMasked === masked) continue
      slots.push(word)
      masked = nextMasked
    }
  }

  return { masked, slots }
}

export function restorePlaceholders(
  translated: string,
  slots: readonly string[],
): string {
  let result = translated
  for (let i = 0; i < slots.length; i++) {
    result = result.replaceAll(`\u27EA${i}\u27EB`, slots[i]!)
  }
  return result
}
