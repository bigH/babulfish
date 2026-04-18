# Migration Plan: `combined-flatten-and-split`

## Goal

Split `packages/core/src/dom/translator.ts` (1085 lines, six concerns) into
cohesive sibling modules, then delete the `packages/core/src/dom/index.ts`
barrel so every public symbol is addressable by its concrete module path.

End state:

```
packages/core/src/dom/
  translator.ts       -- factory, state, doTranslate, translatePhaseWork, restore, abort
  linked.ts           -- collectLinkedGroups, translateLinked, LinkedGroup/LinkedTarget
  rich-text.ts        -- translateRichElement
  structured-text.ts  -- tokenization + extraction + unit walker + StructuredText* types
  attrs.ts            -- collectTranslatableAttrs + capture/get helpers + TranslatableAttr
  phases.ts           -- VisibleWork, PhaseWork, compareDocumentOrder,
                         findOwningRootIndex, compareVisibleWork, assignPhase
  claims.ts           -- VisibleClaims, buildVisibleClaims, overlap/contains helpers
  markdown.ts         -- (unchanged)
  preserve.ts         -- (unchanged)
  walker.ts           -- (unchanged)
  batcher.ts          -- (unchanged)
  # DELETED: index.ts
```

`packages/core/src/index.ts` imports `createDOMTranslator` + types from
`./dom/translator.js`, the markdown trio from `./dom/markdown.js`, and
`PreserveMatcher` from `./dom/preserve.js`. `packages/core/src/smoke.test.ts`
loses its `domBarrel` import and redirects assertions to the concrete
modules.

## Scope

In scope — authoritative list. Phase 4 necessarily reaches two files
outside the `packages/core/src/dom/` cluster because the barrel's only
consumers live one level up; those files are named here so the scope
matches the implementation:

Inside `packages/core/src/dom/`:

- `packages/core/src/dom/translator.ts` — edited in Phases 1–3, 5.
- `packages/core/src/dom/index.ts` — deleted in Phase 4.
- New files created in Phases 1–3: `structured-text.ts`, `claims.ts`,
  `phases.ts`, `linked.ts`, `rich-text.ts`, `attrs.ts`.

Outside `packages/core/src/dom/` (Phase 4 only):

- `packages/core/src/index.ts` — rewrites the two `./dom/index.js`
  import blocks to three concrete-module imports.
- `packages/core/src/smoke.test.ts` — drops `domBarrel` + the
  dom-barrel test block; adds a `preserve` namespace import.

Out of scope:

- `dom/markdown.ts`, `dom/preserve.ts`, `dom/walker.ts`, `dom/batcher.ts`
  (stable, not touched beyond import path shuffles where they already
  import from each other).
- React binding and demo packages. `@babulfish/core`'s public surface
  at `packages/core/src/index.ts` stays byte-identical in shape; only
  the import paths inside the package change.

## Phase Ordering

Split first, flatten second. The split decides where things live; the
flatten points consumers at the final homes in a single pass.

Within the split, extract the largest, most self-contained concern first
(`structured-text`), then the small pure modules that unblock the rest
(`claims`, `phases`), then the state-threading siblings
(`linked`, `rich-text`, `attrs`). Each extraction is a green-test
checkpoint.

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
 struct-    claims +    linked +    delete      final trim
 text       phases      rich-text   barrel      + full
 extract    extract     + attrs     + rewrite   validation
                        extract     consumers
```

Every phase ends with the workspace in a shippable state: `pnpm build`,
`pnpm --filter @babulfish/core test`, and the existing lint pass stay
green. `pnpm docs:check` (which includes the tarball consumer smoke) only
needs to run at the end of Phase 4 and again in Phase 5 — the earlier
phases do not change package exports.

## Phase Summary

1. **phase-1-structured-text.md** — extract
   `packages/core/src/dom/structured-text.ts`. Moves all
   `STRUCTURED_TOKEN_*` constants, `StructuredText*`/`StructuredToken*`
   types, `buildStructuredToken`, `isInertStructuredSpan`,
   `tryExtractStructuredUnit`, `collectStructuredTokens`, and
   `extractStructuredTextValues`. State (`originalTexts`, `shouldSkip`,
   `claims`) passes in as explicit arguments.
2. **phase-2-claims-and-phases.md** — extract
   `packages/core/src/dom/claims.ts` and
   `packages/core/src/dom/phases.ts`. Pure helpers with no factory-state
   capture.
3. **phase-3-linked-rich-attrs.md** — extract `linked.ts`, `rich-text.ts`,
   and `attrs.ts`. Each exports either pure functions or a small
   state-bound closure; prefer explicit state parameters over closures
   where the call site has them on hand.
4. **phase-4-flatten-barrel.md** — delete
   `packages/core/src/dom/index.ts`. Rewrite imports in
   `packages/core/src/index.ts` and `packages/core/src/smoke.test.ts` to
   point at concrete modules. Replace the `domBarrel` smoke assertions
   with per-module assertions.
5. **phase-5-trim-and-validate.md** — relocate
   `resolveStructuredUnits` + `collectStructuredCandidates` into
   `structured-text.ts` (threading deps explicitly, same pattern as
   Phase 1's `tryExtractStructuredUnit`), then read-through
   `translator.ts` to confirm it is the orchestrator only (factory,
   `doTranslate`, `translatePhaseWork`, `restore`, `abort`, and the
   tightly-coupled helpers `captureOriginalStructuredSubtree`,
   `restoreStructuredRoot`, `translatePreservingMatches`,
   `transformDOMOutput`, `translateStructuredUnit`). Run the full
   validation bar: `pnpm build && pnpm test && pnpm docs:check`.

## Dependencies

- Phase 2 has no structural dependency on Phase 1, but we do it after
  Phase 1 so `phases.ts` can import the `StructuredTextUnit` type from
  its new home (`structured-text.ts`) rather than from `translator.ts`.
- Phase 3 depends on Phases 1+2 because `linked.ts` and `attrs.ts`
  reference `VisibleClaims`/`TranslatableAttr`/helpers that should live
  in their sibling modules at that point.
- Phase 4 depends on the full split being done — otherwise it would have
  to be redone when a symbol moves.
- Phase 5 is cleanup over the previous four and a full `docs:check` pass.

## Validation Strategy

Per-phase checks (run from `packages/core/`):

```bash
pnpm --filter @babulfish/core test
pnpm lint
```

The Vitest suite covers every behavior in scope:

- `packages/core/src/dom/__tests__/dom.test.ts` — end-to-end translator
  behavior including linked groups, structured text, rich text, attrs.
- `packages/core/src/dom/__tests__/translator.shadow.test.ts` — Shadow
  DOM rooting.
- `packages/core/src/dom/__tests__/markdown.test.ts`,
  `preserve.test.ts`, `walker.test.ts`, `batcher.test.ts` — supporting
  modules.
- `packages/core/src/smoke.test.ts` — barrel shape contract; updated in
  Phase 4.

Full release-grade validation at the end of Phases 4 and 5:

```bash
pnpm build
pnpm test
pnpm docs:check
```

## Line-Count Gates

`translator.ts` starts at **1085 lines**. Each phase has a concrete
upper-bound gate via `wc -l packages/core/src/dom/translator.ts`:

| After phase | Upper bound |
|---|---|
| Phase 1 | ≤ 820 |
| Phase 2 | ≤ 670 |
| Phase 3 | ≤ 500 |
| Phase 5 | ≤ 400 |

These are gates, not targets — being well under is fine. Exceeding a
gate means an extraction left more behind than the plan intends; stop
and reconcile before moving on.

## Quality Bars

- No comment drift: names that change must carry meaning on their own;
  delete any comment that becomes a restatement of the new filename or
  function name.
- Single responsibility per file: if a helper is reached from only one
  call site and belongs semantically to the new sibling, move it —
  do not leave stragglers in `translator.ts`.
- Types co-located with producers: `StructuredText*` types live in
  `structured-text.ts`; `LinkedGroup`/`LinkedTarget` in `linked.ts`;
  `TranslatableAttr` in `attrs.ts`; `VisibleWork`/`PhaseWork` in
  `phases.ts`; `VisibleClaims` in `claims.ts`. Re-export from
  `translator.ts` only the symbols currently exported there.
- No transitional re-exports. No `// moved to ...` comments. The git
  history is the migration log.
- Imports use fully qualified paths. No barrel in this subtree after
  Phase 4.

## Rollback

Each phase is a self-contained commit (or tight commit cluster). Revert
in reverse order. Because no public surface changes until Phase 4, a
rollback of Phases 1–3 is invisible to consumers.

Phase 4's public-surface move is still backwards-compatible at the
package boundary — `@babulfish/core` only exports from
`packages/core/src/index.ts`, which re-exports the same names throughout.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Closure-captured state (`originalTexts`, `shouldSkip`, `claims`) leaks through module boundaries | Phase 1/3 make state an explicit parameter. No module-level singletons. |
| Structured-text extraction silently breaks token grammar | Phase 1 runs `dom.test.ts`' structured-text cases after the move before proceeding. |
| Barrel deletion misses a consumer | Phase 4 begins with a `rg 'dom/index'` sweep of the whole monorepo before any edits. |
| Smoke test type assertions reference `domBarrel` exports | Phase 4 rewrites `EXPECTED_DOM_RUNTIME_EXPORTS`' assertions to target `domTranslator` + `markdown` + `preserve` directly. |
| Reviewer bandwidth | Each phase is a self-contained commit; the PR body links to this plan and the Mermaid diagram from the approach. |
