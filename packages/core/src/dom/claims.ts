import type { StructuredTextUnit } from "./structured-text.js"
import type { LinkedGroup } from "./translator.js"

export type VisibleClaims = {
  readonly linkedTextNodes: Set<Text>
  readonly richRoots: readonly Element[]
  readonly structuredTextNodes: Set<Text>
}

export function buildVisibleClaims(
  linkedGroups: readonly LinkedGroup[],
  richRoots: readonly Element[],
): VisibleClaims {
  return {
    linkedTextNodes: new Set(
      linkedGroups.flatMap((group) =>
        group.writableTargets.map((target) => target.textNode),
      ),
    ),
    richRoots,
    structuredTextNodes: new Set<Text>(),
  }
}

export function overlapsClaimedRoot(
  candidate: Element,
  claimedRoots: Iterable<Element>,
): boolean {
  for (const claimedRoot of claimedRoots) {
    if (
      claimedRoot === candidate
      || claimedRoot.contains(candidate)
      || candidate.contains(claimedRoot)
    ) {
      return true
    }
  }
  return false
}

export function containsClaimedLinkedTextNode(
  candidate: Element,
  linkedTextNodes: ReadonlySet<Text>,
): boolean {
  for (const textNode of linkedTextNodes) {
    if (candidate.contains(textNode)) return true
  }
  return false
}

export function hasNestedStructuredConflict(
  candidate: Element,
  rawCandidates: readonly Element[],
): boolean {
  return rawCandidates.some((other) =>
    other !== candidate && (other.contains(candidate) || candidate.contains(other)))
}

export function claimStructuredTextNodes(
  unit: StructuredTextUnit,
  claims: VisibleClaims,
): void {
  for (const { node } of unit.textSlots) {
    claims.structuredTextNodes.add(node)
  }
}
