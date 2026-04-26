# WebGPU Translation Evals

Run live browser/model evals explicitly from the repo root:

```bash
pnpm eval:webgpu
```

By default this runs `qwen-2.5-0.5b` only. Run every WebGPU eval model one at a time:

```bash
pnpm eval:webgpu -- --model all
```

Useful options:

```bash
pnpm eval:webgpu -- --model qwen-3-0.6b
pnpm eval:webgpu -- --model gemma-3-1b-it --headed
pnpm eval:webgpu -- --model translategemma-4
pnpm eval:webgpu -- --output-dir .evals/manual-webgpu-run
```

The runner starts the vanilla Vite demo with COOP/COEP headers, launches Chromium through Playwright, requires WebGPU, loads one model, runs the JSON corpus in `evals/translation/`, then writes:

```text
.evals/web-gpu-<timestamp>/<model-name>.json
```

Text and Markdown cases run through `translateText()`. DOM cases run through `translateTo(..., { root })` against an isolated per-case fixture so selector and attribute preservation checks exercise the DOM path.

The corpus currently contains 38 cases: 23 `dev` and 15 `holdout`.

Install the Playwright browser if Chromium is missing:

```bash
pnpm exec playwright install chromium
```

Sample artifact shape:

```json
{
  "schemaVersion": 1,
  "pass": false,
  "browser": { "name": "chromium", "version": "143.0.7499.4" },
  "model": {
    "modelId": "qwen-2.5-0.5b",
    "resolvedModelId": "onnx-community/Qwen2.5-0.5B-Instruct",
    "adapterId": "qwen-2.5-0.5b-chat",
    "dtype": "q4f16",
    "device": "webgpu",
    "loadMs": 42131,
    "cases": [
      {
        "id": "plain-es",
        "split": "dev",
        "category": "plain",
        "sourceText": "The browser translates this short sentence.",
        "contentType": "text",
        "targetLanguage": "es",
        "rawOutput": "El navegador traduce esta breve frase.",
        "pass": true,
        "translateMs": 913,
        "checks": [
          {
            "name": "non-empty-output",
            "pass": true,
            "expected": "non-empty translated output",
            "actual": "El navegador traduce esta breve frase."
          }
        ],
        "error": null
      }
    ],
    "error": null
  }
}
```

This command is intentionally not part of `pnpm test`; it downloads and runs real models.
