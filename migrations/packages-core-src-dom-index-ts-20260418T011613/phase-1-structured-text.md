# Phase 1 — Extract `structured-text.ts`

## Objective

Move the structured-text tokenization, walking, and extraction logic out
of `packages/core/src/dom/translator.ts` into a new
`packages/core/src/dom/structured-text.ts`. Leave behavior unchanged.
`translator.ts` imports and calls the extracted functions in place.

This is the biggest, most self-contained lump in the file and the
highest-leverage extraction: done first, it shrinks `translator.ts` by
roughly a third and makes every subsequent phase simpler.

## Scope

New file:

- `packages/core/src/dom/structured-text.ts`

Edited file:

- `packages/core/src/dom/translator.ts`

Everything else in this phase stays untouched.

## What moves to `structured-text.ts`

Constants:

- `STRUCTURED_TOKEN_PREFIX`, `STRUCTURED_TOKEN_SUFFIX`
- `STRUCTURED_INLINE_TAGS`
- `STRUCTURED_INERT_SPAN_ATTRS`
- `HTML_NAMESPACE` — confirmed via
  `rg -n 'HTML_NAMESPACE' packages` at plan time: three uses, all in
  `translator.ts` at lines 176 (the declaration) and inside the
  structured-text walker at 553 and 602. Both call sites move into
  `structured-text.ts`. Move `HTML_NAMESPACE` there as a file-local
  (non-exported) constant. No re-import, no re-export — the
  translator no longer references it.

Types (exported):

- `StructuredTokenKind`
- `StructuredTokenDescriptor`
- `StructuredTextSlot`
- `StructuredTextUnit`
- `StructuredCommitPlan`

Functions (exported):

- `buildStructuredToken(key, slotId)`
- `isInertStructuredSpan(el)`
- `collectStructuredTokens(translated)`
- `extractStructuredTextValues(unit, translated)`
- `tryExtractStructuredUnit(root, deps)` — the closure-captured
  `originalTexts`, `shouldSkip`, and `claims` become an explicit `deps`
  parameter:
  ```ts
  type StructuredExtractDeps = {
    readonly originalTexts: WeakMap<Text, string>
    readonly shouldSkip: (text: string) => boolean
    readonly claims: VisibleClaims
  }
  ```
  `VisibleClaims` temporarily re-exported from `translator.ts` — it
  moves in Phase 2. Do not forward-declare it; import from
  `./translator.js` for now.

`captureOriginalText` is already imported from `./walker.js` in
`translator.ts`; `structured-text.ts` imports it from the same place.

## What stays in `translator.ts`

- `captureOriginalStructuredSubtree`, `restoreStructuredRoot` — these
  touch the instance-scoped `originalStructuredRoots` map; they remain
  on the factory side. The extracted module returns descriptors, the
  factory applies them.
- `buildStructuredFallbackSource`, `collectStructuredFallbackTargets`,
  `translateStructuredUnit` — these coordinate the full translate
  pipeline; they stay with the orchestrator. They now call
  `tryExtractStructuredUnit` and `extractStructuredTextValues` from the
  new module.
- `resolveStructuredUnits`, `collectStructuredCandidates` — keep for
  now; they depend on helpers that move in Phase 2. Phase 3 is free to
  relocate them if cohesion argues for it.

## Steps

1. Create `packages/core/src/dom/structured-text.ts` with the constants,
   types, and functions above. Export everything the factory will call.
2. Define and export `StructuredExtractDeps`. Rewrite
   `tryExtractStructuredUnit` to take `(root, deps)` instead of closing
   over the factory's locals. Replace `originalTexts`, `shouldSkip`, and
   `claims` inside the function body with `deps.*`.
3. In `translator.ts`:
   - Delete the moved constants, types, and function bodies.
   - `import { ... } from "./structured-text.js"` — include every symbol
     the factory still calls.
   - Update `resolveStructuredUnits` to pass `{ originalTexts,
     shouldSkip, claims }` when calling `tryExtractStructuredUnit`.
4. Verify: no references to `STRUCTURED_TOKEN_PREFIX`,
   `STRUCTURED_INLINE_TAGS`, `isInertStructuredSpan`,
   `buildStructuredToken`, `collectStructuredTokens`,
   `extractStructuredTextValues`, or `tryExtractStructuredUnit` remain
   in `translator.ts` except via imports.

## Ready When

- `pnpm --filter @babulfish/core test` is green, including
  `dom/__tests__/dom.test.ts` structured-text scenarios and
  `translator.shadow.test.ts`.
- `pnpm --filter @babulfish/core lint` passes.
- `wc -l packages/core/src/dom/translator.ts` ≤ 820 (starts at 1085).
- `rg -n 'STRUCTURED_TOKEN_|STRUCTURED_INLINE_TAGS|STRUCTURED_INERT_SPAN_ATTRS|HTML_NAMESPACE' packages/core/src/dom/translator.ts`
  returns no matches.
- `rg -n 'isInertStructuredSpan|buildStructuredToken|collectStructuredTokens|extractStructuredTextValues|tryExtractStructuredUnit' packages/core/src/dom/translator.ts`
  returns only an `import` line.
- `packages/core/src/dom/structured-text.ts` exists and exports the
  symbols listed above.
- No new public surface: `dom/index.ts` and `packages/core/src/index.ts`
  are untouched.

## Validation

```bash
pnpm --filter @babulfish/core test
pnpm --filter @babulfish/core lint
pnpm build
```

Focused test run during iteration:

```bash
pnpm --filter @babulfish/core test -- dom/__tests__/dom.test.ts
pnpm --filter @babulfish/core test -- dom/__tests__/translator.shadow.test.ts
```

## Non-Goals

- Do not rename any exported symbol.
- Do not add property-based tests in this phase; note candidates
  (token grammar, inert-span detection) for a follow-up.
- Do not touch `dom/index.ts`.
- Do not move `resolveStructuredUnits` or
  `collectStructuredCandidates` — those depend on Phase 2 types.

## Notes for Phase 2

`structured-text.ts` imports `VisibleClaims` from `./translator.js` in
this phase. Phase 2 moves that type to `claims.ts` and flips this import
to `./claims.js`.
