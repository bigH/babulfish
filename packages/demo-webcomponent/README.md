# @babulfish/demo-webcomponent

A zero-framework demo proving babulfish works inside Shadow DOM via a custom element. Two `<babulfish-translator>` instances share a single translation engine while rendering into isolated shadow trees.

## Run

```bash
pnpm --filter @babulfish/demo-webcomponent dev
```

## Custom Element API

### `<babulfish-translator>`

Renders a self-contained translation UI into its Shadow DOM: language selector, restore button, model loader, translatable content, and status bar.

### Attributes

| Attribute      | Type     | Description                                                                 |
|----------------|----------|-----------------------------------------------------------------------------|
| `target-lang`  | `string` | Setting this attribute triggers `core.translateTo(value)` if a model is loaded. |

### Events

| Event              | Type          | Bubbles | Composed | Detail                                |
|--------------------|---------------|---------|----------|---------------------------------------|
| `babulfish-status` | `CustomEvent` | `true`  | `true`   | `Snapshot` from `@babulfish/core`     |

The `detail` payload is a frozen `Snapshot` object:

```ts
{
  model: { status: "idle" | "downloading" | "ready" | "error", progress?: number, error?: unknown }
  translation: { status: "idle" | "translating", progress?: number }
  currentLanguage: string | null
  capabilities: { ready: boolean, hasWebGPU: boolean, canTranslate: boolean, device: "webgpu" | "wasm" | null, isMobile: boolean }
}
```

Listen from the host page:

```js
document.querySelector("babulfish-translator")
  .addEventListener("babulfish-status", (e) => {
    console.log(e.detail.model.status)
  })
```

### Methods

| Method      | Signature    | Description                                    |
|-------------|--------------|------------------------------------------------|
| `restore()` | `() => void` | Restores original content and resets language.  |

### Lifecycle

- **`connectedCallback`** — attaches Shadow DOM, creates `BabulfishCore` scoped to the shadow root, subscribes to snapshots, and wires controls.
- **`disconnectedCallback`** — unsubscribes and calls `core.dispose()`, releasing the engine ref-count.

Multiple elements on the same page share one engine instance (singleton). The model downloads once regardless of how many elements exist.

## Build

```bash
pnpm --filter @babulfish/demo-webcomponent build
```

Produces a static `dist/` folder servable with `pnpm --filter @babulfish/demo-webcomponent preview`.

## Related packages

- [`@babulfish/core`](../core/README.md) — the engine this demo uses directly
- [`@babulfish/styles`](../styles/README.md) — CSS custom properties
- [`@babulfish/demo-vanilla`](../demo-vanilla/README.md) — Zero-framework vanilla DOM demo
- [Root README](../../README.md) — "Pick your binding" overview
