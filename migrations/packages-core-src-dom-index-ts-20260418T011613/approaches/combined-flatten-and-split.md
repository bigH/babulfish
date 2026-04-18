# Approach: Flatten the barrel *and* split the translator

## Strategy

Do both refactors in one migration. The two are independent but reinforce
each other, and the code is unreleased at the `dom/` boundary: we pay no
compatibility cost for moving files and renaming imports now.

1. Split `translator.ts` into cohesive siblings per
   `split-translator.md`.
2. Delete `dom/index.ts`. Rewrite the two consumers
   (`packages/core/src/index.ts` and `packages/core/src/smoke.test.ts`) to
   import from the concrete modules.

## Scope

- All of `split-translator.md`.
- All of `flatten-barrel.md`.
- Net file delta: delete `dom/index.ts`; add `dom/linked.ts`,
  `dom/rich-text.ts`, `dom/structured-text.ts`, `dom/attrs.ts`,
  `dom/phases.ts`, `dom/claims.ts`; shrink `dom/translator.ts` substantially.

## Phases

1. **Split first**, flatten second. The split changes where definitions
   live; doing it first means the flatten step can point consumers at
   the *final* file homes in one pass.
2. Within the split, follow the order from `split-translator.md`:
   structured-text → claims/phases → linked/rich-text/attrs → trim
   factory. Run tests after each extraction.
3. Flatten: update `packages/core/src/index.ts` to import
   `createDOMTranslator` from `./dom/translator.js`, the markdown trio
   from `./dom/markdown.js`, and `PreserveMatcher` from
   `./dom/preserve.js`. Update `smoke.test.ts`. Delete `dom/index.ts`.
4. Full validation: `pnpm build && pnpm test && pnpm docs:check`.

## Tradeoffs

- **Pro:** One plan, one PR stack, one round of review. The code lands in
  its final shape instead of doing a cosmetic pass then a structural pass
  a week later.
- **Pro:** Consistent with the "direct wide-scope rewrites in unreleased
  code" rule. No flags, no staged rollouts, no transitional re-exports.
- **Pro:** By the end, every exported symbol has a fully qualified path
  that points directly at its definition, and `translator.ts` is down to
  the orchestrator's actual job.
- **Con:** Bigger diff than either alone. Reviewers need the plan to
  follow along. Mitigated by phase gating (tests green between steps) and
  a Mermaid diagram in the PR.
- **Con:** If a structural mistake ships in the split, flattening at the
  same time means more places to fix. Mitigated by running the full
  `__tests__/` suite after every extraction.

## Risk Profile

Moderate — same as `split-translator.md`, with a trivial additive on top
from the flatten. The barrel deletion is a mechanical typecheck-enforced
change. The split is the real risk surface; see that document for its
mitigations.

## Why this fits the taste

- "Prefer direct wide-scope rewrites in unreleased code when change risk
  is negligible. Avoid flags, compatibility scaffolding, and staged
  rollouts in this phase."
- "Prefer cohesive, discoverable module boundaries with clear fully
  qualified names."
- "Prefer splitting modules when it improves naming, cohesion, or size."
- "Prefer deleting unreleased legacy paths aggressively."

## Why this might be wrong

If reviewer bandwidth is tight, a single PR doing both may be harder to
approve than two focused PRs. The fallback is to split this into two PRs
in the same plan (flatten first because it is trivial, then split) while
keeping the same end state.
