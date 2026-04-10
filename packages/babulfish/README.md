# babulfish

> A babel-fish that's resistant to droughts. 100% client-side translation via WebGPU/WASM.

No server. No API keys. Translation runs entirely in the browser using [TranslateGemma](https://huggingface.co/onnx-community/translategemma-text-4b-it-ONNX) via `@huggingface/transformers`.

**Heads up:** the default model is ~2.9 GB (q4 quantized). It's cached after the first download, but users need a decent connection and a WebGPU-capable browser for the best experience. WASM fallback is available but slower.

## Quick Start

```tsx
import { BabulfishProvider, TranslateButton } from "babulfish"
import "babulfish/css"

function App() {
  return (
    <BabulfishProvider config={{ dom: { roots: ["#content"] } }}>
      <main id="content">
        <h1>Hello, world</h1>
        <p>This text can be translated client-side.</p>
      </main>
      <TranslateButton />
    </BabulfishProvider>
  )
}
```

That's it. The button handles model download, language selection, and DOM translation.

## Installation

```bash
npm install babulfish @huggingface/transformers react
```

`react` and `@huggingface/transformers` are peer dependencies. Both are optional if you only use a subset of the library (e.g. engine-only without React).

## Architecture

babulfish is three layers, each usable independently:

```
┌─────────────────────────────────────────────┐
│  React Bindings  (babulfish)                │
│  BabulfishProvider, TranslateButton, hooks  │
├─────────────────────────────────────────────┤
│  DOM Translator  (babulfish/dom)            │
│  Tree walking, batching, placeholder logic  │
├─────────────────────────────────────────────┤
│  Engine  (babulfish/engine)                 │
│  Model lifecycle, WebGPU/WASM inference     │
└─────────────────────────────────────────────┘
```

- **Engine** — loads the ONNX model, runs text-to-text translation. Framework-agnostic.
- **DOM Translator** — walks DOM trees, collects text nodes, batches them, calls a translate function, applies results. No dependency on the engine or React.
- **React Bindings** — wires engine + DOM translator into React context with ready-made components.

## API Reference

### Engine (`babulfish/engine`)

```ts
import { createEngine } from "babulfish/engine"
import type { EngineConfig, Translator, TranslatorStatus } from "babulfish/engine"
```

#### `createEngine(config?: EngineConfig): Translator`

Creates a translation engine instance.

| Config field     | Type                                  | Default                                              |
|------------------|---------------------------------------|------------------------------------------------------|
| `modelId`        | `string`                              | `"onnx-community/translategemma-text-4b-it-ONNX"`   |
| `dtype`          | `"q4" \| "q8" \| "fp16" \| "fp32"`   | `"q4"`                                               |
| `device`         | `"auto" \| "webgpu" \| "wasm"`       | `"auto"`                                             |
| `maxNewTokens`   | `number`                              | `512`                                                |
| `sourceLanguage` | `string`                              | `"en"`                                               |

#### `Translator`

```ts
type Translator = {
  load(): Promise<void>
  translate(text: string, targetLang: string): Promise<string>
  dispose(): void
  on<K extends keyof TranslatorEvents>(event: K, handler: (data: TranslatorEvents[K]) => void): () => void
  readonly status: TranslatorStatus  // "idle" | "downloading" | "ready" | "error"
}
```

Standalone usage (no React):

```ts
const engine = createEngine({ device: "webgpu" })

engine.on("progress", ({ loaded, total }) => {
  console.log(`${Math.round((loaded / total) * 100)}%`)
})

await engine.load()
const result = await engine.translate("Hello, world", "es-ES")
// → "Hola, mundo"

engine.dispose()
```

---

### DOM Translator (`babulfish/dom`)

```ts
import { createDOMTranslator } from "babulfish/dom"
import type { DOMTranslatorConfig, DOMTranslator } from "babulfish/dom"
```

#### `createDOMTranslator(config: DOMTranslatorConfig): DOMTranslator`

Creates a DOM translator that walks the specified root elements, collects text, translates in batches, and applies results in-place. Calling `restore()` reverts all changes.

| Config field          | Type                                                                         | Required | Default      |
|-----------------------|------------------------------------------------------------------------------|----------|--------------|
| `translate`           | `(text: string, targetLang: string) => Promise<string>`                      | Yes      | —            |
| `roots`               | `string[]`                                                                   | Yes      | —            |
| `phases`              | `string[]`                                                                   | No       | —            |
| `preserve`            | `{ matchers: PreserveMatcher[] }`                                            | No       | —            |
| `skipTags`            | `string[]`                                                                   | No       | —            |
| `shouldSkip`          | `(text: string, defaultSkip: (text: string) => boolean) => boolean`          | No       | —            |
| `richText`            | `RichTextConfig`                                                             | No       | —            |
| `linkedBy`            | `LinkedConfig`                                                               | No       | —            |
| `batchCharLimit`      | `number`                                                                     | No       | `500`        |
| `rtlLanguages`        | `ReadonlySet<string>`                                                        | No       | `ar,he,ur,fa`|
| `translateAttributes` | `string[]`                                                                   | No       | `["title"]`  |
| `hooks`               | `{ onTranslateStart?, onTranslateEnd?, onProgress?, onDirectionChange? }`    | No       | —            |

#### `DOMTranslator`

```ts
type DOMTranslator = {
  translate(targetLang: string): Promise<void>
  restore(): void
  abort(): void
  readonly isTranslating: boolean
  readonly currentLang: string | null
}
```

Standalone usage (with any translation backend):

```ts
const dt = createDOMTranslator({
  translate: (text, lang) => myTranslateAPI(text, lang),
  roots: ["#app"],
})

await dt.translate("fr")
// Later...
dt.restore()
```

---

### React Bindings (`babulfish`)

The default import includes everything: engine types, DOM types, and React components.

#### `<BabulfishProvider>`

Wraps your app. Creates the engine and DOM translator, stores them in context.

```tsx
<BabulfishProvider config={{
  engine: { device: "webgpu", dtype: "q4" },
  dom: { roots: ["#content"] },
  languages: [
    { label: "English (Original)", code: "restore" },
    { label: "Spanish", code: "es-ES" },
    { label: "French", code: "fr" },
  ],
}}>
  {children}
</BabulfishProvider>
```

| Prop               | Type                | Description                           |
|--------------------|---------------------|---------------------------------------|
| `config.engine`    | `EngineConfig`      | Engine options (model, device, etc.)  |
| `config.dom`       | `DOMTranslatorConfig` (minus `translate`) | DOM translator options |
| `config.languages` | `BabulfishLanguage[]` | Language list for dropdowns         |

If `languages` is omitted, `DEFAULT_LANGUAGES` is used (14 languages).

#### `<TranslateButton>`

Drop-in translation button with a 5-state machine: idle -> confirm -> downloading -> ready -> translating.

```tsx
<TranslateButton
  classNames={{ container: "my-btn-wrap", button: "my-btn" }}
  progressRing={{ downloadColor: "#3b82f6", translateColor: "#ef4444" }}
/>
```

| Prop            | Type                        | Description                        |
|-----------------|-----------------------------|------------------------------------|
| `classNames`    | `TranslateButtonClassNames` | Override classes for each element   |
| `icon`          | `ReactNode`                 | Replace the default globe icon     |
| `renderTooltip` | `(props) => ReactNode`      | Custom tooltip render function     |
| `progressRing`  | `{ downloadColor?, translateColor? }` | Ring colors                |

The button auto-hides on desktops without WebGPU. On mobile, it shows a "desktop only" message.

#### `<TranslateDropdown>`

Standalone language picker. Can be used outside `TranslateButton` for custom UIs.

```tsx
<TranslateDropdown
  onSelect={(code) => handleLanguageSelect(code)}
  value={currentLanguage}
  languages={customLanguages}
/>
```

#### `useBabulfish()`

Primary hook. Returns model state, translation state, and controls.

```ts
const {
  model,          // { status: "idle" | "downloading" | "ready" | "error", progress?, error? }
  translation,    // { status: "idle" | "translating", progress? }
  currentLanguage,
  isSupported,    // WebGPU available?
  isMobile,
  languages,
  loadModel,      // () => Promise<void>
  translateTo,    // (code: string) => Promise<void>  — translates the DOM
  restore,        // () => void
  translate,      // (text: string, lang: string) => Promise<string>  — raw text
} = useBabulfish()
```

#### `useTranslateDOM()`

Lighter hook for custom UIs that only need DOM translation controls.

```ts
const { translatePage, restorePage, progress } = useTranslateDOM()

await translatePage("ja")
// progress is 0..1 during translation, null when idle
restorePage()
```

---

### CSS (`babulfish/css`)

```ts
import "babulfish/css"
```

Provides base styles, animations, and CSS custom properties for the button, tooltip, and dropdown. No Tailwind dependency.

| Custom property         | Default     | Description           |
|-------------------------|-------------|-----------------------|
| `--babulfish-accent`    | `#3b82f6`   | Primary accent color  |
| `--babulfish-error`     | `#ef4444`   | Error/active color    |
| `--babulfish-border`    | `#e5e7eb`   | Button border         |
| `--babulfish-surface`   | `#fff`      | Button background     |
| `--babulfish-muted`     | `#9ca3af`   | Muted icon color      |

Override these on `:root` or any ancestor to theme the components.

## Supported Languages

The default model (TranslateGemma 4B) supports translation between many language pairs. The built-in `DEFAULT_LANGUAGES` list:

| Language              | Code    |
|-----------------------|---------|
| English (Original)    | `restore` (special: reverts to original) |
| Spanish               | `es-ES` |
| French                | `fr`    |
| German                | `de`    |
| Japanese              | `ja`    |
| Korean                | `ko`    |
| Chinese (Simplified)  | `zh-CN` |
| Hindi                 | `hi`    |
| Portuguese (Brazil)   | `pt-BR` |
| Arabic                | `ar`    |
| Russian               | `ru`    |
| Italian               | `it`    |
| Thai                  | `th`    |
| Vietnamese            | `vi`    |

Pass a custom `languages` array to `BabulfishProvider` to add or remove languages.

## Custom UI

Skip `TranslateButton` and build your own with hooks:

```tsx
import { BabulfishProvider, useBabulfish } from "babulfish"
import "babulfish/css"

function MyTranslateUI() {
  const { model, loadModel, translateTo, restore, currentLanguage } = useBabulfish()

  if (model.status === "idle") {
    return <button onClick={loadModel}>Load translator</button>
  }

  if (model.status === "downloading") {
    return <p>Downloading model: {Math.round(model.progress * 100)}%</p>
  }

  return (
    <div>
      <select onChange={(e) => {
        const code = e.target.value
        code === "restore" ? restore() : translateTo(code)
      }} value={currentLanguage ?? "restore"}>
        <option value="restore">English (Original)</option>
        <option value="es-ES">Spanish</option>
        <option value="ja">Japanese</option>
      </select>
    </div>
  )
}

function App() {
  return (
    <BabulfishProvider config={{ dom: { roots: ["#content"] } }}>
      <MyTranslateUI />
      <main id="content">
        <p>Translatable content here.</p>
      </main>
    </BabulfishProvider>
  )
}
```

## Advanced

### Rich Text / Markdown

Translate elements that contain inline markdown (bold/italic). The translated markdown is re-rendered to HTML.

```tsx
import { renderInlineMarkdownToHtml } from "babulfish/dom"

<BabulfishProvider config={{
  dom: {
    roots: ["#content"],
    richText: {
      selector: "[data-md]",
      sourceAttribute: "data-md",
      render: renderInlineMarkdownToHtml,
    },
  },
}}>
```

Elements matching `selector` are translated from the `sourceAttribute` value (markdown source) rather than their inner HTML. The `render` function converts the translated markdown back to HTML.

### Preserve List

Protect strings that must not be translated (brand names, technical terms):

```tsx
<BabulfishProvider config={{
  dom: {
    roots: ["#content"],
    preserve: {
      matchers: [
        "babulfish",                    // exact string
        /\b[A-Z]{2,}\b/g,              // regex (e.g. acronyms)
        (text) => extractBrandNames(text), // custom function
      ],
    },
  },
}}>
```

A `PreserveMatcher` is `string | RegExp | ((text: string) => string[])`. Matched strings are replaced with placeholders before translation and restored afterward.

### Linked Elements

Translate a group of elements sharing a key attribute once, then apply the same result to all:

```tsx
<BabulfishProvider config={{
  dom: {
    roots: ["#content"],
    linkedBy: {
      selector: "[data-translate-key]",
      keyAttribute: "data-translate-key",
    },
  },
}}>
```

Elements with the same `data-translate-key` value are translated once. Useful for repeated labels (e.g. section titles that appear in both a sidebar and the main content).

### Custom Skip Logic

By default, babulfish skips text inside `<code>`, `<pre>`, `<script>`, `<style>`, and `<noscript>`. It also skips single-character strings, symbol-only strings, and number-only strings.

Override or extend:

```tsx
<BabulfishProvider config={{
  dom: {
    roots: ["#content"],
    skipTags: ["kbd", "var"],  // additional tags to skip
    shouldSkip: (text, defaultSkip) => {
      if (text.startsWith("$")) return true  // skip price strings
      return defaultSkip(text)
    },
  },
}}>
```

### Multiple Translators

Create multiple `DOMTranslator` instances for different page regions with different settings:

```ts
import { createEngine } from "babulfish/engine"
import { createDOMTranslator } from "babulfish/dom"

const engine = createEngine()
await engine.load()

const mainTranslator = createDOMTranslator({
  translate: (text, lang) => engine.translate(text, lang),
  roots: ["#main-content"],
})

const sidebarTranslator = createDOMTranslator({
  translate: (text, lang) => engine.translate(text, lang),
  roots: ["#sidebar"],
  batchCharLimit: 200,
})

await Promise.all([
  mainTranslator.translate("fr"),
  sidebarTranslator.translate("fr"),
])
```

## How It Works

1. **Model download** — On first use, the ONNX model (~2.9 GB for q4) is downloaded from Hugging Face Hub and cached by the browser.
2. **Inference** — `@huggingface/transformers` runs the model via WebGPU (preferred) or WASM fallback. Translation is text-to-text generation using TranslateGemma's chat format.
3. **DOM walking** — A `TreeWalker` collects visible text nodes under the configured roots, skipping code blocks, scripts, and short/symbol-only strings.
4. **Batching** — Text nodes are grouped into batches (default 500 chars) and translated together to reduce inference calls.
5. **Application** — Translated text replaces the original in the DOM. Original text is stored in a `WeakMap` for lossless restore.
6. **RTL handling** — For Arabic, Hebrew, Urdu, and Farsi, the `dir` attribute is automatically set on root elements.

## Browser Support

| Feature | Requirement |
|---------|-------------|
| WebGPU  | Chrome 113+, Edge 113+ (best performance) |
| WASM fallback | Any modern browser (slower) |
| SharedArrayBuffer | Required by some ONNX backends; needs [cross-origin isolation headers](https://web.dev/cross-origin-isolation-guide/) |

Mobile browsers lack WebGPU support. The `TranslateButton` detects this and shows a "desktop only" message rather than failing silently.

## License

MIT
