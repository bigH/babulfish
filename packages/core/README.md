# @babulfish/core

UI-agnostic translation engine and DOM orchestrator for babulfish.
Use this package directly when building framework-agnostic integrations, custom elements, or your own binding layer.

## Quick start

```bash
npm install @babulfish/core @babulfish/styles
```

```ts
import { createBabulfish, type Snapshot } from "@babulfish/core"
import "@babulfish/styles/css"

const core = createBabulfish({
  dom: { roots: ["article"] },
})

core.subscribe((snapshot: Snapshot) => {
  console.log(snapshot.model.status, snapshot.translation.status)
})

await core.loadModel()
await core.translateTo("es")
core.restore()
```

`createBabulfish` returns a `BabulfishCore` instance that manages model lifecycle, DOM translation, and snapshot subscriptions. The `dom.roots` option accepts CSS selectors identifying which subtrees to translate.

## API summary

See [design doc §2.2](../../docs/ui-agnostic-core.md#22-typescript-interface) for the full interface specification.

### `createBabulfish(config?): BabulfishCore`

| Config field | Type | Description |
|---|---|---|
| `engine` | `EngineConfig` | Model and device preferences |
| `dom.roots` | `string[]` | CSS selectors for translatable subtrees |
| `dom.root` | `ParentNode \| Document` | Scoping root (default: `document`) |
| `languages` | `readonly Language[]` | Override the built-in language list |

### `BabulfishCore`

| Member | Signature | Description |
|---|---|---|
| `snapshot` | `Snapshot` | Current state (model, translation, language, capabilities) |
| `subscribe` | `(listener: (s: Snapshot) => void) => () => void` | Subscribe to state changes; returns unsubscribe |
| `loadModel` | `(opts?) => Promise<void>` | Download and initialize the translation model |
| `translateTo` | `(lang, opts?) => Promise<void>` | Translate all DOM roots to the given language |
| `translateText` | `(text, lang, opts?) => Promise<string>` | Translate a single string (no DOM side effects) |
| `restore` | `(opts?) => void` | Restore original content |
| `abort` | `() => void` | Cancel in-flight translation |
| `dispose` | `() => Promise<void>` | Release engine ref-count and clean up |
| `languages` | `ReadonlyArray<Language>` | Available target languages |

### Snapshot shape

```ts
{
  model: { status: "idle" | "downloading" | "ready" | "error", progress?: number, error?: unknown }
  translation: { status: "idle" | "translating", progress?: number }
  currentLanguage: string | null
  capabilities: { ready: boolean, hasWebGPU: boolean, canTranslate: boolean, device: "webgpu" | "wasm" | null, isMobile: boolean }
}
```

## For binding authors

The conformance test suite at `@babulfish/core/testing` provides shared scenarios that any binding should pass. See [`@babulfish/react`](../react/README.md) for an example of a binding that uses the conformance driver.

```ts
import { scenarios, type ConformanceDriver } from "@babulfish/core/testing"
```

This export is marked `@experimental` — the scenario list and driver interface may change.

## Related packages

- [`@babulfish/react`](../react/README.md) — React binding
- [`@babulfish/styles`](../styles/README.md) — CSS custom properties and animations
- [`@babulfish/demo-vanilla`](../demo-vanilla/README.md) — Zero-framework demo
- [`@babulfish/demo-webcomponent`](../demo-webcomponent/README.md) — Shadow DOM custom element demo
- [Design document](../../docs/ui-agnostic-core.md)
