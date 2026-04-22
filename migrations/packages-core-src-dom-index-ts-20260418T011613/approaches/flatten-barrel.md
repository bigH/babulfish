# Approach: Flatten the `dom/` barrel

## Strategy

Delete `packages/core/src/dom/index.ts` outright. Point the remaining
package-internal consumers — `packages/core/src/index.ts` and
`packages/core/src/smoke.test.ts` — at the concrete modules
(`./dom/translator.js`, `./dom/markdown.js`, `./dom/preserve.js`).

The barrel today is a pure re-export file. The package's real public surface
is already assembled one layer up in `packages/core/src/index.ts`, which
re-exports the same symbols a second time. That is exactly the "re-export
reshaping that hides definitions" pattern our taste rules call out.

## Scope

- Delete: `packages/core/src/dom/index.ts`
- Edit: `packages/core/src/index.ts` — replace the `from "./dom/index.js"`
  re-export block with three direct re-exports by module (translator /
  markdown / preserve).
- Edit: `packages/core/src/smoke.test.ts` — drop the `import * as domBarrel
  from "./dom/index.js"` or redirect it to a still-meaningful target. The
  other two smoke imports already reference concrete modules.
- Edit: `packages/core/src/dom/manifest.json` if it enumerates exports
  (verify; currently does not appear to).

## Phases

1. Inventory every consumer of `./dom/index.js` inside the monorepo.
   The expected published-package match set is
   `packages/core/src/index.ts` and `packages/core/src/smoke.test.ts`.
   No external consumers because the package's public surface is at
   `@babulfish/core` root.
2. Rewrite those imports to point at concrete modules.
3. Delete `dom/index.ts`.
4. Run `pnpm lint`, `pnpm test`, `pnpm docs:check`.

## Tradeoffs

- **Pro:** Fully qualified names become discoverable. `git grep
  createDOMTranslator` lands on the definition, not a barrel.
- **Pro:** One less layer of indirection; the root `index.ts` is the single
  place the public surface is shaped.
- **Pro:** Tiny diff, negligible risk — tests and typecheck catch any miss.
- **Con:** The root `index.ts` grows three imports instead of two. Trivial.
- **Con:** Anyone who imported from the subpath barrel (`@babulfish/core/dom`
  at runtime) would break — but `@babulfish/core` only exports its top-level
  entry, so there is no such consumer.

## Risk Profile

Negligible. Fully mechanical. Unit tests plus `tsc --noEmit` cover every
renamed import. `pnpm docs:check` + consumer smoke exercise the published
surface end-to-end.

## Why this fits the taste

- "Prefer cohesive, discoverable module boundaries with clear fully
  qualified names. Avoid re-export reshaping that hides definitions."
- "Prefer direct wide-scope rewrites in unreleased code when change risk
  is negligible."

## Why this might be wrong

It leaves `translator.ts` at 1086 lines untouched. If the *reason* the
migration was triggered is module size/cohesion, a flatten-only pass is
cosmetic. See `split-translator.md` and `combined-flatten-and-split.md`.
