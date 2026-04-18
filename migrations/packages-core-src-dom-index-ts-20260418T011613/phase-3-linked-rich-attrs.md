# Phase 3 — Extract `linked.ts`, `rich-text.ts`, `attrs.ts`

## Objective

Extract the three remaining factory-state concerns. Each one threads
config and state through explicit parameters — no new module-level
singletons, no closures captured across file boundaries except where
the whole function itself is the closure returned from a small builder.

This phase shrinks `translator.ts` to the orchestrator: factory, state
wiring, `doTranslate`, `translatePhaseWork`, `restore`, `abort`, plus
the tightly-coupled helpers that manipulate instance-scoped maps
(`captureOriginalStructuredSubtree`, `restoreStructuredRoot`,
`translatePreservingMatches`, `transformDOMOutput`,
`buildStructuredFallbackSource`, `collectStructuredFallbackTargets`,
`translateStructuredUnit`, `resolveRoots`, `resolveStructuredUnits`,
`collectStructuredCandidates`, `findDirectTextNode`).

## Scope

New files:

- `packages/core/src/dom/linked.ts`
- `packages/core/src/dom/rich-text.ts`
- `packages/core/src/dom/attrs.ts`

Edited files:

- `packages/core/src/dom/translator.ts`
- `packages/core/src/dom/claims.ts` (flip the Phase 2 `LinkedGroup`
  import from `./translator.js` to `./linked.js`)
- `packages/core/src/dom/phases.ts` (if it imports anything moved here,
  flip; currently none — verify).

## What moves to `linked.ts`

Types (exported):

- `LinkedTarget`
- `LinkedGroup`

Functions (exported):

- `collectLinkedGroups(roots, config, originalLinkedSources)` — pure,
  takes `readonly Element[]`, the resolved `LinkedConfig`, and the
  factory's `originalLinkedSources` map. Returns `LinkedGroup[]`.
- `translateLinked(groups, ctx)` — async. `ctx` gathers the state and
  callbacks the current closure reads:
  ```ts
  type TranslateLinkedContext = {
    readonly targetLang: string
    readonly signal: AbortSignal
    readonly translate: (text: string, lang: string) => Promise<string>
    readonly transformDOMOutput: (text: string, ctx: DOMOutputTransformContext) => string
    readonly shouldSkip: (text: string) => boolean
    readonly originalTexts: WeakMap<Text, string>
    readonly originalLinkedSources: Map<string, string>
    readonly hooks?: DOMTranslatorConfig["hooks"]
    readonly onUnit: () => void
  }
  ```
  Import `captureOriginalText` from `./walker.js`. `findDirectTextNode`
  currently lives in `translator.ts` (declared at line 251, one call
  site at line 386 inside the code that moves into `translateLinked`).
  Confirmed via
  `rg -n 'findDirectTextNode' packages` at plan time: one declaration,
  one caller, both in `translator.ts`. Move `findDirectTextNode` into
  `linked.ts` as a file-local (non-exported) helper. It must not remain
  in `translator.ts` and must not land in `walker.js`.

## What moves to `rich-text.ts`

Functions (exported):

- `translateRichElement(el, ctx)` — async. `ctx`:
  ```ts
  type TranslateRichContext = {
    readonly targetLang: string
    readonly signal: AbortSignal
    readonly config: RichTextConfig
    readonly translatePreservingMatches: (
      source: string, lang: string, signal: AbortSignal,
    ) => Promise<string | null>
    readonly transformDOMOutput: (text: string, ctx: DOMOutputTransformContext) => string
    readonly originalRichElements: Map<Element, string>
    readonly hooks?: DOMTranslatorConfig["hooks"]
  }
  ```
  `isWellFormedMarkdown` and `stripInlineMarkdownMarkers` come from
  `./markdown.js`.

## What moves to `attrs.ts`

Types (exported):

- `TranslatableAttr`

Functions (exported):

- `getOriginalAttrValue(el, attrName, originalAttrs)` — pure lookup.
- `captureOriginalAttrValue(el, attrName, originalAttrs)` — mutates
  `originalAttrs`; pure otherwise.
- `collectTranslatableAttrs(root, attrNames, shouldSkip, originalAttrs)` —
  returns `TranslatableAttr[]`. Uses the two helpers above.

The attribute translation *loop* that calls `config.translate` and
`el.setAttribute` stays in `translator.ts`'s `translatePhaseWork` — it
is part of phase-aware orchestration.

## What stays in `translator.ts`

Orchestration only. After this phase, the factory body is:

1. Resolve scope, config defaults, skip tags, attr names, matchers,
   instance maps.
2. Define small closures that wrap the injected `config.translate`
   (`translatePreservingMatches`, `transformDOMOutput`) and own the
   instance maps (`captureOriginalStructuredSubtree`,
   `restoreStructuredRoot`, `translateStructuredUnit`).
3. `doTranslate` — collect units via the extracted modules, sort,
   phase-bucket, drive the loop.
4. `translatePhaseWork` — drive one phase's visible + attr work.
5. `restore`, `abort`.
6. Return the `DOMTranslator` object.

## Steps

1. Create `linked.ts`. Move types and functions. Replace closures with
   explicit parameters. Update call sites in `translator.ts` (one:
   `doTranslate`).
2. Create `rich-text.ts`. Move `translateRichElement`. Update the call
   site in `translatePhaseWork`.
3. Create `attrs.ts`. Move the three helpers. Update
   `collectTranslatableAttrs` call in `doTranslate` and the capture/get
   helpers' internal use.
4. In `translator.ts`:
   - Delete the moved definitions.
   - Add three imports.
   - Thread state through the new `ctx` parameters.
5. In `claims.ts`, change `LinkedGroup` import from `./translator.js`
   to `./linked.js`.
6. Sweep: `rg 'LinkedGroup|LinkedTarget|TranslatableAttr|translateRichElement|translateLinked|collectLinkedGroups|collectTranslatableAttrs|getOriginalAttrValue|captureOriginalAttrValue' packages/core/src/dom/translator.ts` returns only import lines and call sites.

## Ready When

- `pnpm --filter @babulfish/core test` and `pnpm --filter @babulfish/core lint`
  pass.
- `packages/core/src/dom/linked.ts`, `rich-text.ts`, and `attrs.ts`
  exist and export the listed symbols.
- `wc -l packages/core/src/dom/translator.ts` ≤ 500.
- `rg -n 'findDirectTextNode|translateRichElement|translateLinked|collectLinkedGroups|collectTranslatableAttrs|getOriginalAttrValue|captureOriginalAttrValue' packages/core/src/dom/translator.ts`
  returns only import lines and call sites — no declarations.
- No module-level singletons or cross-file closures beyond the
  orchestrator — grep confirms every instance map
  (`originalTexts`, `originalRichElements`, `originalStructuredRoots`,
  `originalAttrs`, `originalLinkedSources`, `savedDirs`) is
  declared in `translator.ts` and nowhere else.
- `dom/index.ts` still works — no public-surface change yet.

## Validation

```bash
pnpm --filter @babulfish/core test
pnpm --filter @babulfish/core lint
pnpm build
```

Focused checks:

```bash
pnpm --filter @babulfish/core test -- dom/__tests__/dom.test.ts
pnpm --filter @babulfish/core test -- dom/__tests__/translator.shadow.test.ts
```

## Non-Goals

- Do not rename any symbol.
- Do not change `DOMTranslatorConfig` or any exported type.
- Do not touch `dom/index.ts`, `packages/core/src/index.ts`, or
  `smoke.test.ts` — that is Phase 4.
- Do not add new tests; the conformance suite covers behavior. Flag
  good property-test targets (linked-group flattening, attr capture)
  for a follow-up.

## Notes for Phase 4

All new modules are usable from outside the barrel. Phase 4 deletes
the barrel and updates `packages/core/src/index.ts` to import from the
concrete modules — `createDOMTranslator` + types continue to come from
`./dom/translator.js`; nothing yet needs to be re-exported from
`linked.ts`, `rich-text.ts`, `structured-text.ts`, `attrs.ts`,
`claims.ts`, or `phases.ts` at the package boundary.
