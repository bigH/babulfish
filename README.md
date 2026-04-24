# babulfish

Translate live DOM in the browser. No server round-trips, no API keys, restore the original content when you are done. babulfish assesses each browser's capabilities at runtime and picks the right path — WebGPU when it fits, WASM when it does not, and a clear `denied` verdict when nothing works. See [`packages/core/README.md`](packages/core/README.md) for the assessment details.

This repo ships a small package set for that job. The demos prove the current contract; they are not extra published bindings.

## See it in 30 seconds

If you are in React, the shortest shipped path looks like this:

```bash
npm install @babulfish/react @huggingface/transformers
```

```tsx
import {
  TranslatorProvider,
  TranslateButton,
  useTranslateDOM,
} from "@babulfish/react"
import "@babulfish/react/css"

function Article() {
  const { translatePage, restorePage } = useTranslateDOM()

  return (
    <>
      <TranslateButton />
      <button onClick={() => translatePage("es")}>Translate</button>
      <button onClick={() => restorePage()}>Restore</button>

      <article data-demo-root>
        <h1>Hello world</h1>
        <p>This subtree is inside dom.roots.</p>
      </article>
    </>
  )
}

export function App() {
  return (
    <TranslatorProvider config={{ dom: { roots: ["[data-demo-root]"] } }}>
      <Article />
    </TranslatorProvider>
  )
}
```

Want proof before reading API docs?

- [`packages/demo`](packages/demo/README.md) — full React UX: `TranslatorProvider`, stock UI, and the enablement verdict rendered live.
- [`packages/demo-vanilla`](packages/demo-vanilla/README.md) — zero-framework `createBabulfish()` with COOP/COEP configured for `SharedArrayBuffer`; proves the WASM fallback path.
- [`packages/demo-webcomponent`](packages/demo-webcomponent/README.md) — Shadow DOM plus a custom element; proves two isolated roots share one assessment and runtime.

## Pick your path

| Package | Use this if... | First-party proof |
|---|---|---|
| [`@babulfish/react`](packages/react/README.md) | You want the shipped React surface today: provider, hooks, and stock UI | [`packages/demo`](packages/demo/README.md) |
| [`@babulfish/core`](packages/core/README.md) | You want direct DOM control, no framework, or your own binding | [`packages/demo-vanilla`](packages/demo-vanilla/README.md) |
| [`babulfish`](packages/babulfish/README.md) | You need the permanent unscoped compat alias for `@babulfish/react` | same runtime surface as `@babulfish/react` |
| [`@babulfish/styles`](packages/styles/README.md) | You want the stylesheet and CSS contract used by the stock UI | imported by `@babulfish/react` and available directly |

Rule of thumb:

- In React, start with `@babulfish/react`.
- Outside React, start with `@babulfish/core`.
- Use `babulfish` only when the unscoped import path matters.

## What is real today

- Shipped React surface: `TranslatorProvider`, `useTranslator()`, `useTranslateDOM()`, `<TranslateButton />`, and `<TranslateDropdown />`.
- Shipped DOM contract: `dom.roots`, `structuredText`, `preserve.matchers`, `shouldSkip`, DOM-only `outputTransform`, restore, translated attributes, and RTL root direction.
- Shipped compat surface: `babulfish` mirrors `@babulfish/react`, and the CSS entrypoints for `@babulfish/styles`, `@babulfish/react`, and `babulfish` all resolve.
- Proven in demo code, but not published as separate packages: the custom-element and Shadow DOM path.

If it is not in the package table above, it is not shipped.

## DOM contract

- `dom.roots` scopes translation to selected descendants inside `document` or an explicit `dom.root`.
- `structuredText` is opt-in and only claims supported inline-rich DOM. Unsupported shapes preserve structure first and fall back safely.
- `outputTransform` only touches DOM-bound writes. `translateText()` stays raw, root-free, and ignores DOM transforms.
- `preserve.matchers` keeps exact strings intact. `shouldSkip` extends the default skip rule without replacing it.
- `restore()` returns original DOM content. RTL languages set `dir="rtl"` on translated roots, non-RTL languages set `dir="ltr"`, and restore clears that direction state.

See [`packages/core/README.md`](packages/core/README.md) for the exact `structuredText` and `outputTransform` semantics.

## React boundary

- `TranslatorProvider` creates one core per mounted provider on first client render.
- The provider `config` is read when that core is created. Changing `config` after mount does not recreate or reconfigure the core.
- Server rendering uses a shared inert snapshot until the client provider mounts.
- `useTranslator()` is a direct projection of the core snapshot and actions. `useTranslateDOM()` is the page-level translate/restore/progress helper. There is no extra React-only DOM contract layer.

See [`packages/react/README.md`](packages/react/README.md) for the exact hook and component surface.

## Maintainer notes

Run these from the repo root before shipping non-trivial changes:

```bash
pnpm build
pnpm test
pnpm docs:check
```

What those mean today:

- `pnpm docs:check` runs package-doc validation for the published CSS/compat packages plus the tarball consumer smoke in [`scripts/consumer-smoke.mjs`](scripts/consumer-smoke.mjs).
- `pnpm eval:webgpu` is an opt-in live Chromium/WebGPU model eval and is not part of `pnpm test`; see [`docs/webgpu-evals.md`](docs/webgpu-evals.md).
- `pnpm release:check` is the full rehearsal: `build`, `test`, then `docs:check`.
- `pnpm release` performs `release:check` and then publishes the four public packages in order: `@babulfish/styles`, `@babulfish/core`, `@babulfish/react`, `babulfish`.

When publishing, keep the versions in [`packages/core/package.json`](packages/core/package.json), [`packages/react/package.json`](packages/react/package.json), [`packages/styles/package.json`](packages/styles/package.json), and [`packages/babulfish/package.json`](packages/babulfish/package.json) aligned.
