export type PreservationSlot = {
  readonly token: string
  readonly value: string
}

const PLACEHOLDER_PREFIX = "__BF_PRESERVE_"
const PLACEHOLDER_SUFFIX = "__"

export const preservationPlaceholder = (key: string, index: number): string =>
  `${PLACEHOLDER_PREFIX}${key}_${index}${PLACEHOLDER_SUFFIX}`

export function createPreservationPlaceholderKey(source: string): string {
  let nextKey = 0
  while (source.includes(`${PLACEHOLDER_PREFIX}${nextKey}_`)) {
    nextKey++
  }
  return String(nextKey)
}

export function isPreservationPlaceholder(value: string): boolean {
  return value.startsWith(PLACEHOLDER_PREFIX) && value.endsWith(PLACEHOLDER_SUFFIX)
}

export function normalizedPreservedSubstrings(
  substrings: readonly string[] | undefined,
): readonly string[] {
  if (!substrings) return []

  const seen = new Set<string>()
  const values: string[] = []
  for (const substring of substrings) {
    if (substring.length === 0 || seen.has(substring)) continue
    seen.add(substring)
    values.push(substring)
  }
  return values
}

export function maskPreservedSubstrings(
  source: string,
  substrings: readonly string[],
): { readonly masked: string; readonly slots: readonly PreservationSlot[] } {
  const slots: PreservationSlot[] = []
  const placeholderKey = createPreservationPlaceholderKey(source)
  let masked = source

  for (const substring of normalizedPreservedSubstrings(substrings)) {
    const slot = {
      token: preservationPlaceholder(placeholderKey, slots.length),
      value: substring,
    }
    const nextMasked = masked.replaceAll(substring, slot.token)
    if (nextMasked === masked) continue
    slots.push(slot)
    masked = nextMasked
  }

  return { masked, slots }
}

export function restorePreservedSubstrings(
  translated: string,
  slots: readonly PreservationSlot[],
): string {
  let result = translated
  for (const slot of slots) {
    result = result.replaceAll(slot.token, slot.value)
  }
  return result
}
