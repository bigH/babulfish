# @babulfish/demo-vanilla

Zero-framework translation demo — proves that `@babulfish/core` works with pure DOM APIs and no UI framework. Uses Vite as a dev server with COOP/COEP headers for WebGPU `SharedArrayBuffer` support.

## Run

```bash
pnpm --filter @babulfish/demo-vanilla dev
```

Static build:

```bash
pnpm --filter @babulfish/demo-vanilla build
pnpm --filter @babulfish/demo-vanilla preview
```

## Related packages

- [`@babulfish/core`](../core/README.md) — the engine this demo uses directly
- [`@babulfish/styles`](../styles/README.md) — CSS custom properties imported by this demo
- [`@babulfish/demo-webcomponent`](../demo-webcomponent/README.md) — Shadow DOM custom element demo
- [Root README](../../README.md) — "Pick your binding" overview
