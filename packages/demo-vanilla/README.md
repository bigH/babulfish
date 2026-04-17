# @babulfish/demo-vanilla

Private Vite demo showing direct [`@babulfish/core`](../core/README.md) integration with no UI framework.
This package is not published to npm. It exists to prove the current DOM contract without a binding layer in the way.

## What it proves

- `createBabulfish()` works directly against plain DOM APIs.
- Device, model, and quantization controls drive the same URL-backed runtime config that the demo passes into `createBabulfish()`.
- Multiple configured `dom.roots` translate together while the status panel stays outside the translated scope.
- `structuredText` claims supported inline-rich DOM as one logical unit.
- `preserve.matchers` and `shouldSkip` keep demo-specific strings exact.
- `outputTransform` is DOM-only, while `translateText()` still returns raw engine output.
- The status card keeps requested runtime preferences distinct from what enablement resolves: raw capabilities, the `status / outcome` line, the verdict reason, the resolved runtime, and a `probe:` suffix only once a probe has actually run.
- Restore resets the DOM, and Arabic flips the translated roots to RTL.

The Vite server sends the COOP/COEP headers needed for WebGPU `SharedArrayBuffer` support during local development.

## Run

```bash
pnpm --filter @babulfish/demo-vanilla dev
```

Static build:

```bash
pnpm --filter @babulfish/demo-vanilla build
pnpm --filter @babulfish/demo-vanilla preview
```

## Related docs

- [`@babulfish/core`](../core/README.md) — engine and DOM contract
- [`@babulfish/styles`](../styles/README.md) — stylesheet imported by this demo
- [Root README](../../README.md) — package chooser and release flow
