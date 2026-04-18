# Approach: Split `translator.ts` into cohesive submodules

## Strategy

Leave the `dom/index.ts` barrel alone for now. Attack the real size problem:
`packages/core/src/dom/translator.ts` is 1086 lines and mixes at least six
distinct concerns under one factory. Split those concerns into sibling
modules. `translator.ts` shrinks to the orchestrator / factory only.

## Concerns identified in `translator.ts`

1. **Structured-text tokenization + parsing** — `STRUCTURED_TOKEN_*`
   constants, `buildStructuredToken`, `isInertStructuredSpan`,
   `tryExtractStructuredUnit`, `collectStructuredTokens`,
   `extractStructuredTextValues`, plus the `StructuredText*` types. Roughly
   300 lines and self-contained; it knows nothing about the factory's state.
2. **Linked group collection + translation** — `collectLinkedGroups`,
   `translateLinked`, `LinkedGroup`/`LinkedTarget` types.
3. **Rich-text element translation** — `translateRichElement` and the
   `originalRichElements` capture/restore hooks.
4. **Attribute collection + translation** — `TranslatableAttr`,
   `collectTranslatableAttrs`, `captureOriginalAttrValue`,
   `getOriginalAttrValue`.
5. **Phase assignment + work ordering** — `PhaseWork`, `VisibleWork`,
   `compareDocumentOrder`, `findOwningRootIndex`, `compareVisibleWork`,
   `assignPhase`.
6. **Claim bookkeeping** — `VisibleClaims`, `buildVisibleClaims`,
   `overlapsClaimedRoot`, `containsClaimedLinkedTextNode`,
   `hasNestedStructuredConflict`.

## Proposed file layout

```
packages/core/src/dom/
  translator.ts           -- factory, state, doTranslate, restore, abort
  linked.ts               -- collectLinkedGroups, translateLinked
  rich-text.ts            -- translateRichElement
  structured-text.ts      -- tokenization + extraction + unit walker
  attrs.ts                -- collect + capture + apply attribute translation
  phases.ts               -- VisibleWork, phase assignment, document-order sort
  claims.ts               -- VisibleClaims + overlap checks
```

The factory wires them together. Each sibling file exports pure functions
or a small closure keyed on the shared state pieces it needs (typically
`originalTexts`, `originalRichElements`, etc., passed as parameters).

## Phases

1. Extract `structured-text.ts` first — it is the largest, most
   self-contained lump. All the constants, `StructuredText*` types, and
   the token pipeline move out. Verify via existing
   `translator.shadow.test.ts` + `dom.test.ts`.
2. Extract `claims.ts` and `phases.ts` — small, pure modules that unblock
   the rest.
3. Extract `linked.ts`, `rich-text.ts`, `attrs.ts`. These each consume a
   slice of the factory's state; pass that state in as explicit parameters
   rather than closing over it when possible.
4. Trim `translator.ts` to factory + `doTranslate` + `restore` + `abort`.
5. `pnpm lint`, `pnpm test`, `pnpm docs:check`.

## Tradeoffs

- **Pro:** Each file names one concern; `translator.ts` shrinks to a
  readable orchestrator.
- **Pro:** `structured-text.ts` becomes independently testable — its token
  grammar is precisely the kind of small, pure-ish function property
  testing is good at.
- **Pro:** No public surface change. `dom/index.ts` and
  `packages/core/src/index.ts` stay identical.
- **Con:** State threading. Some helpers currently close over factory
  locals (e.g. `originalTexts`, `originalRichElements`, `shouldSkip`).
  Extracting them means either passing state explicitly or returning
  small sub-factories — both are fine but need deliberate design.
- **Con:** Larger diff than `flatten-barrel.md`; more review surface.

## Risk Profile

Moderate. Behavior must not change; the existing Vitest suite in
`packages/core/src/dom/__tests__/` is the safety net (especially
`dom.test.ts` and `translator.shadow.test.ts`). The structured-text
extraction is the highest-risk step because of its interaction with the
`claims` set — explicit state parameters plus a round of tests after each
phase keep regressions local.

## Why this fits the taste

- "Prefer splitting modules when it improves naming, cohesion, or size."
- "Prefer extracting shared libraries once a concern has 2+ real call
  sites" — several of these concerns already have internal fan-out.
- "Prefer property-based tests for small, fast, pure-ish functions" —
  structured-text tokenization and `isWellFormedMarkdown` get much more
  testable once isolated.

## Why this might be wrong

If the barrel is the actual sticking point (for example, `dom/index.ts`
is growing accidental API), this does nothing about it. Pair with
`combined-flatten-and-split.md`.
