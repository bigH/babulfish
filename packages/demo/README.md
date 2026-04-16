# babulfish-demo

Private Next.js demo for the shipped [`@babulfish/react`](../react/README.md) surface.
This package is not published to npm. It exists to prove the current React boundary in first-party code we control.

## What it proves

- `TranslatorProvider` scopes the app once.
- `useTranslator()` and `useTranslateDOM()` expose the live provider state shown in the status panel.
- The fixed globe button is the shipped stock `<TranslateButton />`.
- Only `[data-demo-root]` is inside `dom.roots`; the control panel stays outside the translated scope.
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
