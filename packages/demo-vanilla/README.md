# @babulfish/demo-vanilla

Private Vite demo showing direct [`@babulfish/core`](../core/README.md) integration with no UI framework.
This package is not published to npm. It exists to prove the current DOM contract without a binding layer in the way.

## What it proves

- `createBabulfish()` works directly against plain DOM APIs.
- Device, model spec, and quantization controls drive the shared URL-backed runtime resolver.
- URLs use canonical `model=<spec-id>` values; known `modelId=<resolved-model-id>` links for the current catalog are accepted and rewritten through the shared resolver.
- The demo passes the resolver-built engine config into `createBabulfish()`, so adapters come from the shared model registry instead of demo-specific branching.
- Multiple configured `dom.roots` translate together while the status panel stays outside the translated scope.
- `structuredText` claims supported inline-rich DOM as one logical unit.
- `preserve.matchers` and `shouldSkip` keep demo-specific strings exact.
- `outputTransform` is DOM-only, while `translateText()` still returns raw engine output.
- The status card keeps runtime identity explicit: requested model spec, resolved model id, adapter id, dtype, requested device, repaired/effective device, and enablement-resolved device.
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
