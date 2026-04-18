# Phase 2 — Extract `claims.ts` and `phases.ts`

## Objective

Move two small, pure concerns out of `translator.ts` into their own
files. Both are free of factory state: `claims.ts` holds the
`VisibleClaims` type and structural overlap predicates; `phases.ts`
holds the work descriptors and ordering helpers.

After this phase, `translator.ts` has lost another ~150 lines and the
new modules' signatures are all `(x, y) => T` — ideal for point-free
tests later.

## Scope

New files:

- `packages/core/src/dom/claims.ts`
- `packages/core/src/dom/phases.ts`

Edited files:

- `packages/core/src/dom/translator.ts`
- `packages/core/src/dom/structured-text.ts` (flip the Phase 1
  `VisibleClaims` import to the new home)

## What moves to `claims.ts`

Types (exported):

- `VisibleClaims`

Functions (exported):

- `buildVisibleClaims(linkedGroups, richRoots)` — takes
  `readonly LinkedGroup[]` and `readonly Element[]`, returns
  `VisibleClaims`. Keep `LinkedGroup` imported from `./translator.js`
  for this phase; Phase 3 moves `LinkedGroup` to `linked.ts` and flips
  the import.
- `overlapsClaimedRoot(candidate, claimedRoots)`
- `containsClaimedLinkedTextNode(candidate, linkedTextNodes)`
- `hasNestedStructuredConflict(candidate, rawCandidates)`
- `claimStructuredTextNodes(unit, claims)` — takes a
  `StructuredTextUnit` (imported from `./structured-text.js`) and a
  `VisibleClaims`.

## What moves to `phases.ts`

Types (exported):

- `VisibleWork` (all three variants)
- `PhaseWork`

Functions (exported):

- `compareDocumentOrder(a, b)`
- `findOwningRootIndex(node, roots)`
- `compareVisibleWork(a, b)`
- `assignPhase(node, phaseRoots)`

`VisibleWork`'s `structuredText` variant references
`StructuredTextUnit` — import from `./structured-text.js`. Its `text`
variant references `TaggedTextNode` — import from `./walker.js`.

## What stays in `translator.ts`

- `getBatchParent` — reads `batch[0]?.node.parentElement` and throws.
  Move into `phases.ts` only if it has another call site after Phase 3;
  otherwise keep it local. For this phase, keep it in `translator.ts`.
- All direct consumers of the moved symbols now import from the new
  files instead of defining them locally.

## Steps

1. Create `packages/core/src/dom/claims.ts`. Copy the listed symbols
   over. Resolve imports: `LinkedGroup` from `./translator.js`,
   `StructuredTextUnit` from `./structured-text.js`.
2. Create `packages/core/src/dom/phases.ts`. Copy the listed symbols
   over. Resolve imports: `StructuredTextUnit` from
   `./structured-text.js`, `TaggedTextNode` from `./walker.js`.
3. In `translator.ts`:
   - Delete the moved constants, types, and function bodies.
   - Add `import { ... } from "./claims.js"` and
     `import { ... } from "./phases.js"`.
   - Call sites update mechanically — `compareDocumentOrder(...)` still
     works, now resolved through the import.
4. In `structured-text.ts`, change `VisibleClaims` import from
   `./translator.js` to `./claims.js`.
5. Confirm no dangling references: `rg 'buildVisibleClaims|VisibleWork|PhaseWork|compareDocumentOrder|findOwningRootIndex|compareVisibleWork|assignPhase|overlapsClaimedRoot|containsClaimedLinkedTextNode|hasNestedStructuredConflict' packages/core/src/dom/translator.ts` returns only import lines and call sites.

## Ready When

- `pnpm --filter @babulfish/core test` and `pnpm --filter @babulfish/core lint`
  pass.
- `packages/core/src/dom/claims.ts` and
  `packages/core/src/dom/phases.ts` exist and export the listed
  symbols.
- `wc -l packages/core/src/dom/translator.ts` ≤ 670.
- `rg -n 'buildVisibleClaims|overlapsClaimedRoot|containsClaimedLinkedTextNode|hasNestedStructuredConflict|claimStructuredTextNodes|compareDocumentOrder|findOwningRootIndex|compareVisibleWork|assignPhase' packages/core/src/dom/translator.ts`
  returns only import lines and call sites — no function declarations.
- `translator.ts` has lost the moved definitions and has no duplicate
  type declarations.
- `structured-text.ts` imports `VisibleClaims` from `./claims.js`.
- No public surface change: `dom/index.ts` and
  `packages/core/src/index.ts` still point where they did.

## Validation

```bash
pnpm --filter @babulfish/core test
pnpm --filter @babulfish/core lint
pnpm build
```

Focused checks:

```bash
pnpm --filter @babulfish/core test -- dom/__tests__/dom.test.ts
```

## Non-Goals

- Do not add unit tests targeting `claims.ts` or `phases.ts` directly
  in this phase; coverage already goes through `dom.test.ts`. If the
  orchestrator phase (Phase 5) exposes a good surface for property
  tests, note it then.
- Do not touch `index.ts`.
- Do not rename any symbol.

## Notes for Phase 3

`claims.ts` imports `LinkedGroup` from `./translator.js` at the end of
this phase. Phase 3 moves `LinkedGroup` to `linked.ts`; flip the import
then.
