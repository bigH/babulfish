# babulfish-demo

Private Next.js demo for the shipped [`@babulfish/react`](../react/README.md) surface.
This package is not published to npm. It exists to prove the current React boundary in first-party code we control.

## What it proves

- `TranslatorProvider` scopes the app once.
- A small runtime control surface outside `[data-demo-root]` remounts the provider with the shared registry-derived `engine` config.
- `useTranslator()` and `useTranslateDOM()` expose the live provider state shown in the status panel.
- The fixed globe button is the shipped stock `<TranslateButton />`.
- Only `[data-demo-root]` is inside `dom.roots`; the control panel stays outside the translated scope.
- The model selector and canonical URL use shared model spec ids, for example `?model=qwen-3-0.6b`; known `modelId=<resolved-model-id>` links for the current catalog still resolve and are rewritten by the client.
- The status panel keeps model spec, resolved model id, adapter id, requested device/quantization, and resolved runtime separate from raw capabilities, enablement status, verdict reason, and the probe row when one actually ran.
- Restore returns the root to original content, and Arabic flips that root to RTL.

## Run

```bash
pnpm --filter babulfish-demo dev
```

Production build:

```bash
pnpm --filter babulfish-demo build
pnpm --filter babulfish-demo start
```

Smoke the built demo:

```bash
pnpm --filter babulfish-demo test
```

## Related docs

- [`@babulfish/react`](../react/README.md) — the React surface this demo proves
- [`@babulfish/core`](../core/README.md) — underlying engine and DOM contract
- [Root README](../../README.md) — package chooser and release flow
