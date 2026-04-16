# @babulfish/demo-webcomponent

Private Vite demo with a demo-local `<babulfish-translator>` custom element.
This package is not published to npm, and there is no published web-component package in this repo. The point here is to prove that [`@babulfish/core`](../core/README.md) works inside Shadow DOM and that a host page can drive those roots through a small element contract.

## What it proves

- Two custom elements render into separate shadow roots while sharing one translation engine.
- The host page drives both instances through shared runtime controls plus the `target-lang` attribute and public `restore()` method.
- Each element emits `babulfish-status` with the current core `Snapshot`.
- The host controls interact without reaching through the shadow boundary to mutate translated content directly.

## Demo-local element contract

### `<babulfish-translator>`

Renders a small translation UI into its own shadow root: language select, restore button, load-model button, translated content, and a status line that includes requested vs resolved runtime.

### Attribute

| Attribute | Type | Description |
|---|---|---|
| `device` | `"auto" \| "wasm" \| "webgpu"` | Requested runtime preference for the demo-local catalog selection |
| `model-id` | `string` | Requested demo-local model id |
| `dtype` | `"q4" \| "q8" \| "fp16" \| "fp32"` | Requested quantization / core `dtype` |
| `target-lang` | `string` | When the model is ready, setting this triggers `core.translateTo(value)` |

### Event

| Event | Type | Bubbles | Composed | Detail |
|---|---|---|---|---|
| `babulfish-status` | `CustomEvent` | `true` | `true` | `Snapshot` from `@babulfish/core` |

### Method

| Method | Signature | Description |
|---|---|---|
| `restore()` | `() => void` | Clears `target-lang`, calls `core.restore()`, and resets the local select |

Changing `device`, `model-id`, or `dtype` recreates the element's core instance after a restore. Matching normalized selections keep shared-runtime behavior possible; divergent normalized selections can split runtime keys. This element contract is demo code, not package contract.

## Run

```bash
pnpm --filter @babulfish/demo-webcomponent dev
```

Build and preview:

```bash
pnpm --filter @babulfish/demo-webcomponent build
pnpm --filter @babulfish/demo-webcomponent preview
```

Run the element tests:

```bash
pnpm --filter @babulfish/demo-webcomponent test
```

## Related docs

- [`@babulfish/core`](../core/README.md) — engine and DOM contract
- [Root README](../../README.md) — package chooser and release flow
