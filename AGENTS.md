# AGENTS.md

## Purpose

This repo is a publishable monorepo for babulfish: fully client-side, in-browser translation powered by a shared WebGPU/WASM runtime.

It is not just the demo app. The real product is the package set:

- [`@babulfish/core`](packages/core/README.md): framework-agnostic engine, DOM translator, and shared testing surface
- [`@babulfish/react`](packages/react/README.md): React binding and stock UI
- [`@babulfish/styles`](packages/styles/README.md): CSS contract and animations
- [`babulfish`](packages/babulfish/README.md): permanent unscoped compat alias for `@babulfish/react`

Treat package READMEs, `package.json` files, and contract/conformance tests as the source of truth. The root README is the overview, not the whole story.

## Tooling We Encourage

- `pnpm` only. The workspace is pinned to `pnpm@10.33.0`.
- Node `>=20`.
- `pnpm --filter <package>` for package-scoped work.
- `rg` / `rg --files` for search.
- TypeScript everywhere. `pnpm lint` is `tsc --noEmit` across the workspace.
- Vitest for tests.
- `tsup` for published package builds.
- Vite for `demo-vanilla` and `demo-webcomponent`.
- Next.js for the private React demo in [`packages/demo`](packages/demo/README.md).
- Changesets for versioning and release orchestration.
- GitHub Actions as the CI and publish path.

## Validation

Run these from the repo root after non-trivial edits:

```bash
pnpm build
pnpm test
pnpm docs:check
```

`pnpm docs:check` is part of the publish contract, not just docs lint. It currently covers package-doc validation plus the tarball consumer smoke in [`scripts/consumer-smoke.mjs`](scripts/consumer-smoke.mjs).

If you only need to iterate on one package, use `pnpm --filter <package> ...`, then still finish with the root checks before shipping.

## Packaging Constraints

- Only [`packages/core/src/engine/pipeline-loader.ts`](packages/core/src/engine/pipeline-loader.ts) may import `@huggingface/transformers`. That restriction is enforced in [`eslint.config.js`](eslint.config.js).
- CSS exports must stay local bridge files such as [`packages/react/src/babulfish.css`](packages/react/src/babulfish.css) and [`packages/babulfish/src/babulfish.css`](packages/babulfish/src/babulfish.css). Do not point package `exports` at another package specifier for CSS.
- `@babulfish/core`, `@babulfish/react`, `@babulfish/styles`, and `babulfish` version together as a fixed Changesets group. Demo packages are private and are not published.

## Publishing And Changesets

When a change affects a published package or its public contract:

1. Create a changeset:

   ```bash
   pnpm changeset
   ```

2. Pick the correct bump type and write a short, user-facing summary.
3. Commit the generated `.changeset/*.md` file with the code change.
4. If you need to apply version bumps locally, run:

   ```bash
   pnpm version
   ```

5. Publishing is automated through [`.github/workflows/release.yml`](.github/workflows/release.yml) on `main`.
6. Local publishing uses:

   ```bash
   pnpm release
   ```

   That path runs `build`, `test`, `docs:check`, and `changeset publish`, so only use it when you intentionally mean to publish.

## Workspace Packages

- [`packages/core`](packages/core/README.md): `@babulfish/core`, the engine + DOM translator + testing surface
- [`packages/react`](packages/react/README.md): `@babulfish/react`, the React provider, hooks, and stock UI components
- [`packages/styles`](packages/styles/README.md): `@babulfish/styles`, CSS custom properties and animations
- [`packages/babulfish`](packages/babulfish/README.md): `babulfish`, the permanent unscoped compat package
- [`packages/demo`](packages/demo/README.md): private Next.js demo for the intended React integration
- [`packages/demo-vanilla`](packages/demo-vanilla/README.md): minimal zero-framework demo using `@babulfish/core` directly
- [`packages/demo-webcomponent`](packages/demo-webcomponent/README.md): Shadow DOM / custom-element demo proving isolated roots can still share one engine

## Demo Map

- Use [`packages/demo`](packages/demo/README.md) when checking the full React UX.
- Use [`packages/demo-vanilla`](packages/demo-vanilla/README.md) when checking the smallest direct-DOM path and COOP/COEP setup for WebGPU `SharedArrayBuffer`.
- Use [`packages/demo-webcomponent`](packages/demo-webcomponent/README.md) when checking Shadow DOM behavior and the custom-element surface.

## Verification Matrix

- Core contract or DOM/runtime changes: run the core Vitest suite and shared conformance tests in [`packages/core/src/testing/scenarios.ts`](packages/core/src/testing/scenarios.ts).
- React binding changes: run the React Vitest suite, including [`conformance.test.tsx`](packages/react/src/__tests__/conformance.test.tsx) and [`public-api.test.ts`](packages/react/src/__tests__/public-api.test.ts).
- Packaging, exports, README, or release changes: run [`scripts/consumer-smoke.mjs`](scripts/consumer-smoke.mjs) via `pnpm docs:check`.

## Source Of Truth

- Start with the package README for the area you are editing.
- Use tests and manifests to confirm behavior, not memory.
- Plans live in [`docs/plans/`](docs/plans/). Right now the main repo-level plan is [`ui-agnostic-polish.md`](docs/plans/ui-agnostic-polish.md).
