# @babulfish/react

React bindings for babulfish client-side translation.
Use this package when you want the shipped React provider, hooks, and stock UI. Use [`@babulfish/core`](../core/README.md) directly when you are building your own binding or working outside React. [`babulfish`](../babulfish/README.md) is the same runtime surface under the permanent unscoped compat name.

## Quick start

Install this inside an existing React 18 or 19 app:

```bash
npm install @babulfish/react @huggingface/transformers
```

```tsx
import { TranslatorProvider, useTranslator } from "@babulfish/react"
import "@babulfish/react/css"

function App() {
  return (
    <TranslatorProvider config={{ dom: { roots: ["[data-babulfish-root]"] } }}>
      <YourPage />
    </TranslatorProvider>
  )
}

function YourPage() {
  const { loadModel, translateTo, restore, model } = useTranslator()

  return (
    <>
      <button onClick={() => loadModel()} disabled={model.status !== "idle"}>
        Load model
      </button>
      <button onClick={() => translateTo("fr")} disabled={model.status !== "ready"}>
        Translate to French
      </button>
      <button onClick={() => restore()}>Restore</button>

      <main data-babulfish-root>
        <h1>Hello world</h1>
        <p>This subtree is translated by babulfish.</p>
      </main>
    </>
  )
}
```

`@huggingface/transformers` provides the model runtime used by `loadModel()` and translation calls.

## CSS

Import either path. Both resolve to the same stylesheet:

```ts
import "@babulfish/react/css"
import "@babulfish/styles/css"
```

See [`@babulfish/styles`](../styles/README.md) for the custom-property contract.

## Provider boundary

### `<TranslatorProvider>`

Wraps your app in a `BabulfishCore` context.

- Creates one core per mounted provider.
- Creates that core once on first client render. Rerenders do not recreate it.
- Reads `config` when the core is created. Changing `config` after mount does not recreate or reconfigure the provider core.
- Uses a shared inert SSR fallback on the server, then switches to the client core after mount.

If you need a different config after mount, remount the provider.

`config` is `TranslatorConfig`, which is the same shape as `BabulfishConfig` from [`@babulfish/core`](../core/README.md). DOM and engine options pass through unchanged:

```tsx
<TranslatorProvider
  config={{
    engine: {
      model: "qwen-3-0.6b",
    },
    dom: {
      roots: [".content"],
      structuredText: { selector: "[data-structured]" },
      outputTransform: (translated, context) =>
        context.kind === "text" || context.kind === "structuredText"
          ? translated.normalize("NFC")
          : translated,
    },
  }}
>
  {children}
</TranslatorProvider>
```

There is no React-only wrapper API for model selection, `structuredText`, or `outputTransform`. The provider forwards the core config contract as-is; custom model specs and adapters are documented in [`@babulfish/core`](../core/README.md).

## Components

### `<TranslateButton>`

Pre-built five-state translation button: idle, confirm, downloading, ready, translating.

| Prop | Type | Description |
|---|---|---|
| `classNames` | `TranslateButtonClassNames` | Override CSS class names for each sub-element |
| `icon` | `ReactNode` | Custom icon element |
| `renderTooltip` | `(state) => ReactNode` | Custom tooltip renderer |
| `progressRing` | `{ downloadColor?: string; translateColor?: string }` | Override the ring colors used for download and translation progress |

`classNames` accepts `button`, `tooltip`, `dropdown`, `dropdownItem`, and `progressRing`.

The button treats `enablement.status` of `"idle"`, `"assessing"`, or `"probing"` as assessment-pending, and hides itself once assessment is terminal and the verdict is not `gpu-preferred` or `wasm-only`.

### `<TranslateDropdown>`

Language picker dropdown. It only shows the `"Original"` restore option when `onRestore` is provided.

| Prop | Type | Description |
|---|---|---|
| `onSelect` | `(code: string) => void` | Called when a language is selected |
| `onRestore` | `() => void` | Optional restore handler for the `"Original"` row |
| `value` | `string \| null` | Currently selected language code |
| `disabled` | `boolean` | Disable the dropdown |
| `languages` | `readonly TranslatorLanguage[]` | Override language list |

## Hooks

### `useTranslator()`

Returns the current provider snapshot plus the core actions:

| Field | Type | Description |
|---|---|---|
| `model` | `ModelState` | `{ status, progress?, error? }` |
| `translation` | `TranslationState` | `{ status, progress? }` |
| `capabilities` | `{ ready, hasWebGPU, isMobile, approxDeviceMemoryGiB, crossOriginIsolated }` | Raw browser observations from `@babulfish/core` |
| `enablement` | `EnablementState` | Primary truth for capability gating (`status`, `verdict`, `probe`). Re-exported from `@babulfish/core` |
| `currentLanguage` | `string \| null` | Active target language |
| `languages` | `ReadonlyArray<TranslatorLanguage>` | Available target languages |
| `capabilitiesReady` | `boolean` | Capability detection has completed |
| `isSupported` | `boolean` | Current browser can translate |
| `hasWebGPU` | `boolean` | WebGPU is available |
| `canTranslate` | `boolean` | Translation is available on this device/path |
| `device` | `"webgpu" \| "wasm" \| null` | Active runtime path when available |
| `isMobile` | `boolean` | Mobile-device detection flag |
| `loadModel` | `() => Promise<void>` | Download and initialize the model |
| `translateTo` | `(code: string) => Promise<void>` | Translate configured DOM roots to a language |
| `restore` | `() => void` | Restore original DOM content |
| `translate` | `(text: string, lang: string) => Promise<string>` | Raw `translateText()` helper from core |

`capabilitiesReady`, `canTranslate`, `isSupported`, and `device` are narrow compat aliases derived from `enablement` via `createEnablementCompat` from `@babulfish/core`. `hasWebGPU` and `isMobile` are raw `capabilities` observations.

`translate` is the raw string API. It does not apply DOM transforms and does not touch configured roots.

### `useTranslateDOM()`

Convenience hook for page-level translate/restore:

| Field | Type | Description |
|---|---|---|
| `translatePage` | `(lang: string) => Promise<void>` | Calls `core.translateTo(lang)` |
| `restorePage` | `() => void` | Calls `core.restore()` |
| `progress` | `number \| null` | Translation progress while translating, otherwise `null` |

## Types re-exported from `@babulfish/core`

`ModelState`, `TranslationState`, `EnablementState`, `EnablementVerdict`, `ProbeSummary`, `ProbeMode`, `Language as TranslatorLanguage`, `BabulfishConfig as TranslatorConfig`.

## Related packages

- [`@babulfish/core`](../core/README.md) — engine, DOM contract, and experimental testing surface
- [`@babulfish/styles`](../styles/README.md) — CSS custom properties and animations
- [`babulfish`](../babulfish/README.md) — unscoped compat alias with the same runtime surface
