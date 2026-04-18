# Phase 4 — Flatten the `dom/` barrel

## Objective

Delete `packages/core/src/dom/index.ts`. Rewrite its two consumers to
import from the concrete modules in the flattened `dom/` directory.
After this phase, `git grep createDOMTranslator` lands on its
definition, not on a barrel.

## Scope

Deleted:

- `packages/core/src/dom/index.ts`

Edited:

- `packages/core/src/index.ts`
- `packages/core/src/smoke.test.ts`

No runtime behavior changes. No published package versions bump. The
public surface of `@babulfish/core` at
`packages/core/src/index.ts` stays byte-identical in exported names.

## Pre-flight

Run from repo root:

```bash
rg -n 'dom/index' packages
```

Expected matches (nothing else in published package code):

- `packages/core/src/index.ts` — two `from "./dom/index.js"` blocks.
- `packages/core/src/smoke.test.ts` — one `import * as domBarrel`.

Anything outside `packages/core/src/` is a surprise — stop and
investigate. The `migrations/` directory can be ignored.

## What `packages/core/src/index.ts` becomes

Replace the two `from "./dom/index.js"` blocks with three direct
imports that mirror today's surface:

```ts
export {
  createDOMTranslator,
} from "./dom/translator.js"
export type {
  DOMOutputTransformContext,
  DOMTranslator,
  DOMTranslatorConfig,
  LinkedConfig,
  RichTextConfig,
  StructuredTextConfig,
} from "./dom/translator.js"

export {
  isWellFormedMarkdown,
  parseInlineMarkdown,
  renderInlineMarkdownToHtml,
} from "./dom/markdown.js"

export type { PreserveMatcher } from "./dom/preserve.js"
```

Leave every other export in that file untouched.

## What `packages/core/src/smoke.test.ts` becomes

- Delete `import * as domBarrel from "./dom/index.js"`.
- Delete the whole `"dom barrel re-exports the public DOM surface"`
  test block — the barrel is gone. Its assertions were that the barrel
  re-exports certain names with the right runtime identity and
  structural types. With the barrel deleted, that contract moves to
  `packages/core/src/index.ts`, which is already covered by
  `"barrel re-exports core, engine, and dom"`.
- In the root-barrel test, replace any `domBarrel.X` reference with
  the now-authoritative source:
  - `domBarrel.createDOMTranslator` → `domTranslator.createDOMTranslator`
  - `domBarrel.renderInlineMarkdownToHtml` → `markdown.renderInlineMarkdownToHtml`
  - `domBarrel.parseInlineMarkdown` → `markdown.parseInlineMarkdown`
  - `domBarrel.isWellFormedMarkdown` → `markdown.isWellFormedMarkdown`
  - `domBarrel.PreserveMatcher` → `preserve.PreserveMatcher`
- Add `import * as preserve from "./dom/preserve.js"` alongside the
  existing `domTranslator` and `markdown` imports.
- Delete the now-unused `EXPECTED_DOM_RUNTIME_EXPORTS` constant.

## Steps

1. Sweep with `rg -n 'dom/index' packages`. Confirm exactly the three
   occurrences listed above.
2. Edit `packages/core/src/index.ts` per the block above.
3. Edit `packages/core/src/smoke.test.ts`:
   - Add `preserve` import.
   - Rewrite the root-barrel test's `domBarrel.*` references.
   - Delete the dom-barrel test block.
   - Delete `EXPECTED_DOM_RUNTIME_EXPORTS`.
4. `rm packages/core/src/dom/index.ts`.
5. Run validation.

## Ready When

- `packages/core/src/dom/index.ts` does not exist.
- `rg -n 'dom/index' packages` returns no matches.
- `packages/core/src/index.ts` imports `createDOMTranslator` + types
  from `./dom/translator.js`, the markdown trio from `./dom/markdown.js`,
  and `PreserveMatcher` from `./dom/preserve.js`. No `./dom/index.js`
  references remain.
- `smoke.test.ts` has no `domBarrel` references and no
  `EXPECTED_DOM_RUNTIME_EXPORTS`.
- `pnpm --filter @babulfish/core test` is green.
- `pnpm lint` is green across the workspace.
- `pnpm build` is green.
- `pnpm docs:check` is green — this runs the tarball consumer smoke,
  which loads the package's public exports end-to-end.

## Validation

Run from repo root:

```bash
pnpm build
pnpm test
pnpm docs:check
```

If `pnpm docs:check` trips on the consumer smoke, suspect a missed
export in `packages/core/src/index.ts`. The tarball is built from
that file.

## Non-Goals

- Do not introduce a new barrel at a different path.
- Do not add re-exports through `translator.ts`. Each concrete module
  owns its own exports.
- Do not change type names or shapes.
- Do not touch `packages/react/` or the demo packages — they import
  from `@babulfish/core`'s top-level entry, not from `dom/`.

## Risk

Negligible. The edits are mechanical and type-checked.
`pnpm docs:check`'s consumer smoke is the backstop against a missed
export; the Vitest smoke at `packages/core/src/smoke.test.ts` is the
backstop against a local miswire.

## Notes for Phase 5

If `translator.ts` still contains dead code or comments that mention
the old barrel (e.g. `// exported via ./index.js`), Phase 5 removes
them. Otherwise Phase 5 is a read-through plus full validation.
