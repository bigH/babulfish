// Preserve matcher helpers for DOM translation.
// Intent-aware model paths receive matched substrings declaratively and let
// adapters choose the preservation strategy. Legacy direct DOM callbacks use
// these placeholders before translation and restore them afterward.

import {
  createPreservationPlaceholderKey,
  isPreservationPlaceholder,
  preservationPlaceholder,
  restorePreservedSubstrings,
  type PreservationSlot,
} from "../engine/adapters/preservation.js"

export type PreserveMatcher = string | RegExp | ((text: string) => string[])
export type PreserveSlot = PreservationSlot

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
    if (match.length > 0 && !isPreservationPlaceholder(match)) values.add(match)
  }
  return [...values]
}

export function insertPlaceholders(
  source: string,
  matchers: readonly PreserveMatcher[],
): { masked: string; slots: PreserveSlot[] } {
  const slots: PreserveSlot[] = []
  const placeholderKey = createPreservationPlaceholderKey(source)
  let masked = source

  for (const matcher of matchers) {
    for (const word of matchAll(matcher, masked)) {
      const slot = {
        token: preservationPlaceholder(placeholderKey, slots.length),
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

export function collectPreservedSubstrings(
  source: string,
  matchers: readonly PreserveMatcher[],
): readonly string[] {
  return insertPlaceholders(source, matchers).slots.map(({ value }) => value)
}

export function restorePlaceholders(
  translated: string,
  slots: readonly PreserveSlot[],
): string {
  return restorePreservedSubstrings(translated, slots)
}
