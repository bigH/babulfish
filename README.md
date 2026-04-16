# babulfish

Fully client-side, in-browser translation powered by a shared WebGPU/WASM runtime.
The shipped product is the package set below. The demos prove the current contract; they are not extra published bindings.

## Published packages

| Package | What it ships | Use it when |
|---|---|---|
| [`@babulfish/core`](packages/core/README.md) | Engine, DOM translator, and experimental conformance surface | You are not in React, you want direct DOM control, or you are building your own binding |
| [`@babulfish/react`](packages/react/README.md) | React provider, hooks, and stock UI | You want the shipped React surface today |
| [`babulfish`](packages/babulfish/README.md) | Permanent unscoped compat alias for `@babulfish/react` | You need old import paths to keep working |
| [`@babulfish/styles`](packages/styles/README.md) | CSS variables and animations used by the stock UI | You want the stylesheet directly or want to theme the stock UI |

Reach for `@babulfish/react` in a React app.
Reach for `@babulfish/core` everywhere else.
Use `babulfish` only when the unscoped compat name matters.

## First-party demos

| Demo | What it proves today |
|---|---|
| [`packages/demo`](packages/demo/README.md) | The actual React/provider boundary: `TranslatorProvider`, `useTranslator()`, `useTranslateDOM()`, the shipped `<TranslateButton />`, a translated root scoped by `dom.roots`, restore, and Arabic RTL |
| [`packages/demo-vanilla`](packages/demo-vanilla/README.md) | Direct `createBabulfish()` usage with multiple roots, `structuredText`, preserve/skip behavior, DOM-only `outputTransform`, raw `translateText()` bypass, restore, and RTL |
| [`packages/demo-webcomponent`](packages/demo-webcomponent/README.md) | A demo-local custom element proving Shadow DOM roots work with `@babulfish/core`, multiple elements share one engine, and the host can drive `target-lang`, `restore()`, and `babulfish-status` without piercing the shadow boundary |

There is no published Vue package, web-component package, or other binding hiding elsewhere in this repo.
If it is not in the package table above, it is not shipped.

## DOM contract today

- `dom.roots` scopes translation to selected descendants inside `document` or an explicit `dom.root`.
- `structuredText` is opt-in and only claims supported inline-rich DOM. Unsupported shapes preserve structure first and fall back safely.
- `outputTransform` only touches DOM-bound writes. `translateText()` stays raw, root-free, and ignores DOM transforms.
- `preserve.matchers` keeps exact strings intact. `shouldSkip` extends the default skip rule without replacing it.
- `restore()` returns original DOM content. RTL languages set `dir="rtl"` on translated roots, non-RTL languages set `dir="ltr"`, and restore clears that direction state.

See [`packages/core/README.md`](packages/core/README.md) for the exact `structuredText` and `outputTransform` semantics.

## React boundary today

- `TranslatorProvider` creates one core per mounted provider on first client render.
- The provider `config` is read when that core is created. Changing `config` after mount does not recreate or reconfigure the core.
- Server rendering uses a shared inert snapshot until the client provider mounts.
- `useTranslator()` is a direct projection of the core snapshot and actions. `useTranslateDOM()` is the page-level translate/restore/progress helper. There is no extra React-only DOM contract layer.

See [`packages/react/README.md`](packages/react/README.md) for the exact hook and component surface.

## Validate and release

Run these from the repo root before shipping non-trivial changes:

```bash
pnpm build
pnpm test
pnpm docs:check
```

What those mean today:

- `pnpm docs:check` runs package-doc validation for the published CSS/compat packages plus the tarball consumer smoke in [`scripts/consumer-smoke.mjs`](scripts/consumer-smoke.mjs).
- `pnpm release:check` is the full rehearsal: `build`, `test`, then `docs:check`.
- `pnpm release` performs `release:check` and then publishes the four public packages in order: `@babulfish/styles`, `@babulfish/core`, `@babulfish/react`, `babulfish`.

When publishing, keep the versions in [`packages/core/package.json`](packages/core/package.json), [`packages/react/package.json`](packages/react/package.json), [`packages/styles/package.json`](packages/styles/package.json), and [`packages/babulfish/package.json`](packages/babulfish/package.json) aligned.
