# Phase 5 — Trim `translator.ts` and run full validation

## Objective

Close the migration. Move the last two structured-text pipeline
helpers out of `translator.ts` into `structured-text.ts`. Then read
`translator.ts` end-to-end with every extraction in place and confirm
it holds only orchestrator concerns. Run the full release bar.

Phase 5 is small on code changes but committed on one: the tail move
of `resolveStructuredUnits` + `collectStructuredCandidates`. These
were left behind in Phase 1 because they depend on `VisibleClaims`
(moved in Phase 2); after Phase 2 they are cleanly relocatable and
belong with the rest of the structured-text pipeline by the
cohesion rule in the taste directives.

## Scope

Edited files:

- `packages/core/src/dom/translator.ts`
- `packages/core/src/dom/structured-text.ts`

No public surface changes. No version bump. No dependency changes.

## Move: `resolveStructuredUnits` + `collectStructuredCandidates`

Relocate both functions from `translator.ts` into `structured-text.ts`
following the exact deps-parameter pattern established in Phase 1 for
`tryExtractStructuredUnit`:

```ts
type ResolveStructuredDeps = {
  readonly originalTexts: WeakMap<Text, string>
  readonly shouldSkip: (text: string) => boolean
  readonly claims: VisibleClaims
  readonly skipSelectors: readonly string[]
  readonly skipTags: ReadonlySet<string>
}

export function collectStructuredCandidates(
  roots: readonly Element[],
  deps: Pick<ResolveStructuredDeps, "skipSelectors" | "skipTags">,
): Element[]

export function resolveStructuredUnits(
  roots: readonly Element[],
  deps: ResolveStructuredDeps,
): StructuredTextUnit[]
```

Adjust the deps shape to match the actual closure captures at the
time of the move (`shouldSkip`, `skipSelectors`, `skipTags`,
`originalTexts`, `claims`). Do not return a curried factory — pass
deps at each call. In `translator.ts`, the sole caller
(`doTranslate`) calls the imported `resolveStructuredUnits(roots, {
originalTexts, shouldSkip, claims, skipSelectors, skipTags })`.

This is a commit, not a branch. If the move reveals additional
instance-scoped state, thread it through deps rather than leaving the
helper in `translator.ts`. The goal is zero structured-text helpers
outside `structured-text.ts` at the end of Phase 5.

## Final shape check for `translator.ts`

Walk the file against this checklist. Every item is a gate.

- [ ] Top-of-file comment, if present, describes orchestrator duties
      only — no mentions of tokenization, phase sorting internals, or
      claim logic. If drifted, rewrite in one sentence or delete.
- [ ] Imports: `./walker.js`, `./batcher.js`, `./preserve.js`,
      `./markdown.js`, `./linked.js`, `./rich-text.js`, `./attrs.js`,
      `./structured-text.js`, `./claims.js`, `./phases.js`. No unused
      imports.
- [ ] Exported types: `DOMTranslatorConfig`, `DOMTranslator`,
      `RichTextConfig`, `LinkedConfig`, `StructuredTextConfig`,
      `DOMOutputTransformContext`. No others.
- [ ] Module-level constants: `DEFAULT_RTL_LANGS` only. (All
      `STRUCTURED_*` constants moved in Phase 1;
      `HTML_NAMESPACE` moved in Phase 1.)
- [ ] Module-level helpers: `resolveRoots`, `getBatchParent`. Anything
      else is either factory-internal or belongs in a sibling module —
      move it.
- [ ] `findDirectTextNode` is **not** present (moved to `linked.ts`
      file-local in Phase 3). Verify with
      `rg -n 'findDirectTextNode' packages/core/src/dom/translator.ts`
      → no matches.
- [ ] `resolveStructuredUnits` and `collectStructuredCandidates` are
      **not** present (moved to `structured-text.ts` in this phase).
      Verify with
      `rg -n 'resolveStructuredUnits|collectStructuredCandidates' packages/core/src/dom/translator.ts`
      → only an `import` line.
- [ ] Inside `createDOMTranslator`:
      - State: `originalTexts`, `originalRichElements`,
        `originalStructuredRoots`, `originalAttrs`,
        `originalLinkedSources`, `savedDirs`, `activeController`,
        `translating`, `lang`.
      - Bound config: `scope`, `skipTags`, `rtlLangs`, `charLimit`,
        `matchers`, `attrNames`, `shouldSkip`, `skipSelectors`.
      - Small closures: `transformDOMOutput`,
        `translatePreservingMatches`,
        `captureOriginalStructuredSubtree`, `restoreStructuredRoot`.
      - Structured-text pipeline kept locally only because it closes
        over instance maps: `buildStructuredFallbackSource`,
        `collectStructuredFallbackTargets`, `translateStructuredUnit`.
      - `doTranslate`, `translatePhaseWork`, `restore`, `abort`.
      - Return object.
- [ ] No comments that are just restatements of the section they sit
      above (e.g. `// Rich text translation` above a single function
      named `translateRichElement`). Delete.
- [ ] No `// moved to …` crumbs from earlier phases.
- [ ] No `// TODO:` comments introduced by this migration.

## Steps

1. Move `resolveStructuredUnits` and `collectStructuredCandidates`
   into `structured-text.ts` per the "Move" section above. Update the
   single caller in `translator.ts` (`doTranslate`). Re-run
   `pnpm --filter @babulfish/core test` before continuing.
2. Read `packages/core/src/dom/translator.ts` top to bottom against
   the checklist.
3. Apply the smallest possible set of fixes to bring the file into
   conformance. Each fix is a trivially reversible edit: delete a
   stale comment, relocate a helper, drop an unused import.
4. Run the full validation bar (see below).

## Ready When

- `translator.ts` passes every item on the checklist above.
- `wc -l packages/core/src/dom/translator.ts` ≤ 400.
- `rg -n 'resolveStructuredUnits|collectStructuredCandidates|findDirectTextNode|HTML_NAMESPACE|STRUCTURED_' packages/core/src/dom/translator.ts`
  returns only an `import` line (and no match for `HTML_NAMESPACE` or
  `STRUCTURED_` constants).
- No file in `packages/core/src/dom/` has dead imports or type-only
  re-exports that are not consumed.
- `pnpm build` green.
- `pnpm test` green.
- `pnpm docs:check` green (includes the tarball consumer smoke).
- `pnpm lint` green.
- `git status` is clean of stray scratch files.

## Validation

Run from repo root:

```bash
pnpm build
pnpm test
pnpm docs:check
pnpm lint
```

Reference the verification matrix in `CLAUDE.md`:

- Core contract and DOM/runtime: Vitest suite in
  `packages/core/src/dom/__tests__/` plus shared conformance tests in
  `packages/core/src/testing/scenarios.ts`.
- Packaging and exports: `scripts/consumer-smoke.mjs` via
  `pnpm docs:check`.
- React binding: not affected, but run
  `pnpm --filter @babulfish/react test` once as a sanity check since
  it consumes `createDOMTranslator`.

## Non-Goals

- Do not add new features.
- Do not rename symbols.
- Do not bump package versions — no published contract changed.
- Do not write new tests unless you find an uncovered regression
  surface during the walkthrough. Note good property-test candidates
  (structured-text tokenization, markdown well-formedness) in a
  follow-up ticket.
- Do not leave `// TODO:` crumbs for unreleased-refactor follow-ups.
  Either complete the move in this phase or explicitly de-scope it to
  a separate, tracked migration — no half-finished state in shipping
  code (taste directive: "delete unreleased legacy paths aggressively").

## Deliverables

- `packages/core/src/dom/translator.ts` in its final shape.
- All phase commits reviewed as a single PR stack or one focused PR
  referencing this plan and a Mermaid diagram of the new `dom/` module
  graph.
- `migrations/packages-core-src-dom-index-ts-20260418T011613/manifest.json`
  marked complete by the harness.
