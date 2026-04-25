# @babulfish/core

UI-agnostic translation engine and DOM orchestrator for babulfish.
Use this package directly when building framework-agnostic integrations, custom elements, or your own binding layer. If you want the shipped React provider, hooks, and stock UI, use [`@babulfish/react`](../react/README.md) instead. Use [`babulfish`](../babulfish/README.md) only when you need the unscoped compat import.

## Quick start

```bash
npm install @babulfish/core @babulfish/styles @huggingface/transformers
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
`@huggingface/transformers` provides the model runtime used by `loadModel()` and translation calls.

## API summary

The public API centers on `createBabulfish(config?)`, which returns a `BabulfishCore` instance for model lifecycle, DOM translation, and snapshot subscriptions.
The config table below is intentionally a highlights view, not the full DOM config matrix.

### `createBabulfish(config?): BabulfishCore`

| Config field | Type | Description |
|---|---|---|
| `engine` | `EngineConfig` | Model and device preferences |
| `dom.roots` | `string[]` | CSS selectors for translatable subtrees |
| `dom.root` | `ParentNode \| Document` | Scoping root (default: `document`) |
| `dom.structuredText` | `StructuredTextConfig` | Claim supported inline-rich DOM as one logical prose unit |
| `dom.outputTransform` | `(translated, context) => string` | Normalize DOM-bound output immediately before writes |
| `languages` | `readonly Language[]` | Override the built-in language list |

For the full DOM config surface, read `DOMTranslatorConfig` from `@babulfish/core` plus the behavior notes below. That surface also includes `preserve`, `skipTags`, `shouldSkip`, `richText`, `linkedBy`, `phases`, `batchCharLimit`, `rtlLanguages`, `translateAttributes`, and `hooks`.

### Engine model selection

`engine.model` selects a built-in model id or an explicit custom spec. String values are built-in ids only:

- `"translategemma-4"` (default)
- `"qwen-2.5-0.5b"`
- `"qwen-3-0.6b"`
- `"gemma-3-1b-it"`

Use legacy `engine.modelId` for arbitrary Hugging Face repo ids when you still want the default TranslateGemma adapter. If both `engine.model` and `engine.modelId` are present, `modelId` overrides only the resolved repo id; adapter, file-location, dtype, and prompt behavior still come from `model`.

Custom specs make the adapter explicit:

```ts
import type { TranslationAdapter } from "@babulfish/core"

const adapter: TranslationAdapter = {
  id: "my-chat-adapter",
  label: "My chat adapter",
  validateOptions: () => ({ warnings: [], errors: [] }),
  buildInvocation: (request, options) => ({
    modelInput: [
      { role: "system", content: `Translate ${request.source.code} to ${request.target.code}.` },
      { role: "user", content: request.text },
    ],
    modelOptions: {
      max_new_tokens: options.max_new_tokens,
      do_sample: false,
      return_full_text: false,
    },
  }),
  extractText: (_request, _options, output) => ({ text: String(output) }),
}

createBabulfish({
  engine: {
    model: {
      id: "my-chat-model",
      label: "My chat model",
      modelId: "acme/my-instruct-model",
      adapter,
      defaults: {
        dtype: "q4f16",
        device: "webgpu",
        subfolder: "onnx",
        modelFileName: "model",
      },
    },
  },
})
```

`q4f16` is a first-class dtype. The non-default built-ins use it with WebGPU-oriented defaults and run the adapter smoke probe when the memory heuristic cannot decide.

### `BabulfishCore`

| Member | Signature | Description |
|---|---|---|
| `snapshot` | `Snapshot` | Current state (model, translation, language, capabilities) |
| `subscribe` | `(listener: (s: Snapshot) => void) => () => void` | Subscribe to state changes; returns unsubscribe |
| `loadModel` | `(opts?) => Promise<void>` | Download and initialize the translation model |
| `translateTo` | `(lang, opts?) => Promise<void>` | Translate all DOM roots to the given language |
| `translateText` | `(text, lang, opts?) => Promise<string>` | Translate a single string with raw engine output (no DOM side effects or DOM transforms) |
| `restore` | `(opts?) => void` | Restore original content |
| `abort` | `() => void` | Cancel in-flight translation |
| `dispose` | `() => Promise<void>` | Detach this core's subscriptions and mark it unusable; the shared runtime engine stays pooled for other cores |
| `languages` | `ReadonlyArray<Language>` | Available target languages |

### Snapshot shape

```ts
{
  model: { status: "idle" | "downloading" | "ready" | "error", progress?: number, error?: unknown }
  translation: { status: "idle" | "translating", progress?: number }
  currentLanguage: string | null
  capabilities: { ready: boolean, hasWebGPU: boolean, isMobile: boolean, approxDeviceMemoryGiB: number | null, crossOriginIsolated: boolean }
  enablement: {
    status: "idle" | "assessing" | "probing" | "ready" | "error"
    modelProfile: ModelProfile | null
    inference: FitInference | null
    probe: { status, kind, cache, note }
    verdict: { outcome, resolvedDevice, reason }
  }
}
```

### Capabilities vs enablement

`capabilities` is the raw browser-observed surface — what we can see. `enablement` is the assessment — what we decide. The two stay separate so observations never pretend to be verdicts.

`enablement.verdict.outcome`:

- `unknown` — not assessed yet
- `needs-probe` — memory heuristic inconclusive; a probe could break the tie
- `denied` — the requested runtime is not available here (e.g., WebGPU explicitly required but not present)
- `gpu-preferred` — WebGPU path is ready to use
- `wasm-only` — WASM path is ready to use

### Probe

Probes are optional. Set `EnablementConfig.probe` to `"if-needed"` or `"manual"` to enable one; default is `"off"`. A probe is a coarse backend smoke check — it requests an adapter and device, checks required feature bits, and runs a tiny fixed-cost op. It is not a fit oracle, does not measure VRAM, and does not simulate a real translation. Probe results cache per page session only.

### Binding helpers

Binding authors can derive narrow compat booleans from `enablement` with `createEnablementCompat(state)`, and seed neutral state from `IDLE_ENABLEMENT_STATE` and `NOT_RUN_PROBE_SUMMARY`. See [`@babulfish/react`](../react/README.md) for how the shipped binding uses them.

## DOM config

`createBabulfish({ dom: ... })` uses the same DOM translator contract exported from `@babulfish/core`.

### Other current DOM behavior

- `dom.roots` selects the translated descendants inside `document` or an explicit `dom.root`.
- `dom.preserve.matchers` declares exact strings that should survive translation. Built-in model paths receive that as preservation intent; direct `createDOMTranslator` callbacks use legacy placeholder masking unless `passTranslationIntent: true` is set.
- Default skip rules already avoid tags such as `code` and `pre`. `dom.shouldSkip(text, defaultSkip)` lets you extend that rule without replacing it.
- `restore()` restores plain text, linked groups, authored `richText`, structured roots, translated attributes, and root direction back to the original DOM state.
- RTL languages set `dir="rtl"` on translated roots, non-RTL languages set `dir="ltr"`, and `restore()` clears that direction state.

### `structuredText`

Use `dom.structuredText = { selector }` when some live inline-rich DOM should translate as one logical prose unit instead of as plain text batches.

- Selector resolution is descendants-only via `root.querySelectorAll(selector)`. If you want a whole region claimed as one unit, wrap it in a descendant element and target that wrapper.
- Supported v1 shapes: eligible text nodes, `br`, `a`, `strong`/`b`, `em`/`i`, `u`, `s`/`del`, `mark`, `code`, and inert `span` wrappers.
- Supported behavior: text translates as one unit, `br` round-trips as a logical newline, links and inline emphasis survive exact rehydration, and `code` stays opaque so its descendant text is not translated.
- `dom.preserve.matchers` still contribute preservation intent during structured source extraction, just as they do for authored `richText`.
- Unsupported or ineligible candidates are not claimed as structured text. The original DOM stays untouched and the subtree falls back to the normal plain-text plus translated-attribute collection path.
- If a claimed structured root later fails exact rehydration, babulfish restores the original subtree first and then runs local structured fallback for that same root. That fallback preserves the DOM structure while falling back to text-node writes, so inline formatting meaning may be reduced.
- Attributes inside a structured root still run later through `translateAttributes`; `structuredText` only changes how visible text is grouped.

Unsupported or ineligible v1 shapes include:

- nested block content such as paragraphs, headings, lists, tables, blockquotes, sectioning elements, or anything else that would require layout-aware rewriting
- form controls, editable regions, and interactive widgets
- media and embedded content such as `img`, `picture`, `video`, `audio`, `canvas`, or `iframe`
- `svg`, `math`, ruby/annotation content, unknown namespaces, or custom elements
- `script`, `style`, `noscript`, and `template`
- descendants already claimed by `linkedBy` or authored `richText`
- nested or overlapping `structuredText` candidates

### `outputTransform`

Use `dom.outputTransform(translated, context)` to normalize DOM-bound output immediately before babulfish writes it back.

- It runs for `linked`, `richText`, `structuredText`, plain text batches, and translated attributes.
- `context.source` is the human-readable pre-translation source for that logical unit. `context.attribute` is only set for attribute writes.
- It is DOM-only. It does not change engine output, does not affect `translateText()`, and does not expose scheduler or placeholder internals.
- If the transform produces invalid `richText` or invalid structured output, babulfish uses the same fallback rules as untransformed output.

## For binding authors

The conformance test suite at `@babulfish/core/testing` provides shared scenarios that any binding should pass. See [`@babulfish/react`](../react/README.md) for an example of a binding that uses the conformance driver.

```ts
import { scenarios, type ConformanceDriver } from "@babulfish/core/testing"
```

This export is marked `@experimental` — the scenario list and driver interface may change.

## Related packages

- [`@babulfish/react`](../react/README.md) — React binding
- [`@babulfish/styles`](../styles/README.md) — CSS custom properties and animations
