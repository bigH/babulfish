# @babulfish/react

React bindings for babulfish client-side translation.
Thin projection of [`@babulfish/core`](../core/README.md) — all state flows through `useSyncExternalStore`, no internal `useState` for core-owned data.

## Quick start

```bash
npm install @babulfish/react @huggingface/transformers
```

```tsx
import { TranslatorProvider, useTranslator } from "@babulfish/react"
import "@babulfish/react/css"

function App() {
  return (
    <TranslatorProvider>
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
    </>
  )
}
```

`@huggingface/transformers` provides the model runtime used by `loadModel()` and translation calls.

## CSS

Import styles via either path — they resolve to the same stylesheet:

```ts
import "@babulfish/react/css"   // convenience re-export
import "@babulfish/styles/css"  // direct import
```

See [`@babulfish/styles`](../styles/README.md) for the custom-property contract.

## Components

### `<TranslatorProvider>`

Wraps your app with a `BabulfishCore` context. Accepts an optional `config` prop (`BabulfishConfig` from `@babulfish/core`). Lazy-creates the core instance on first client render; SSR-safe.

```tsx
<TranslatorProvider config={{ dom: { roots: [".content"] } }}>
  {children}
</TranslatorProvider>
```

### `<TranslateButton>`

Pre-built 5-state translation button (idle, confirm, downloading, ready, translating). Renders a globe icon with progress ring and tooltip.

| Prop | Type | Description |
|---|---|---|
| `classNames` | `TranslateButtonClassNames` | Override CSS class names for each sub-element |
| `icon` | `ReactNode` | Custom icon element |
| `renderTooltip` | `(state) => ReactNode` | Custom tooltip renderer |
| `progressRing` | `boolean` | Show download progress ring (default: true) |

### `<TranslateDropdown>`

Language picker dropdown with an "Original" restore option.

| Prop | Type | Description |
|---|---|---|
| `onSelect` | `(code: string) => void` | Called when a language is selected |
| `onRestore` | `() => void` | Called when "Original" is selected |
| `value` | `string` | Currently selected language code |
| `disabled` | `boolean` | Disable the dropdown |
| `languages` | `Language[]` | Override language list |

## Hooks

### `useTranslator()`

Returns the full translator state and actions:

| Field | Type | Description |
|---|---|---|
| `model` | `ModelState` | `{ status, progress?, error? }` |
| `translation` | `TranslationState` | `{ status, progress? }` |
| `currentLanguage` | `string \| null` | Active target language |
| `languages` | `ReadonlyArray<Language>` | Available languages |
| `loadModel` | `() => Promise<void>` | Start model download |
| `translateTo` | `(code: string) => Promise<void>` | Translate DOM to language |
| `restore` | `() => void` | Restore original content |
| `translate` | `(text, lang) => Promise<string>` | Translate a single string |
| `isSupported` | `boolean` | Browser can run translations |
| `hasWebGPU` | `boolean` | WebGPU available |
| `canTranslate` | `boolean` | Model loaded and ready |

### `useTranslateDOM()`

Convenience hook for page-level translate/restore:

| Field | Type | Description |
|---|---|---|
| `translatePage` | `(lang: string) => Promise<void>` | Translate the page |
| `restorePage` | `() => void` | Restore original content |
| `progress` | `number \| null` | Translation progress (0–1) |

## Related packages

- [`@babulfish/core`](../core/README.md) — UI-agnostic engine and contract
- [`@babulfish/styles`](../styles/README.md) — CSS custom properties and animations
