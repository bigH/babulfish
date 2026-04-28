# WebGPU Translation Evals

Run live browser/model evals explicitly from the repo root:

```bash
pnpm eval:webgpu
```

By default this runs `qwen-3-0.6b` only. Run every WebGPU eval model one at a time:

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

Live WebGPU evals are intentionally opt-in and are not part of `pnpm test`; they download and run real models.

## Pass/Fail And Score

Pass/fail is the hard gate:

- A case passes only when every deterministic boolean check passes.
- A model passes only when every attempted case passes.
- Environment and model-load failures are model-level failures.
- Per-case generation failures produce failed case artifacts and the runner continues.

Scalar scores sit beside that contract. They do not loosen pass/fail.

The model score is deterministic and local:

```text
model_score =
  weightedCheckScore * 0.70
+ passedCaseRatio    * 0.20
+ referenceSimilarity * 0.10
```

Each case score is:

```text
case_score =
  checkScore          * 0.85
+ referenceSimilarity * 0.15
```

Hard failures set the case score to `0`. Current hard failures are generation errors, empty output, prompt echo, explanation wrappers, copied source when `sourceShouldChange` is set, and missing Arabic script for Arabic targets.

Reference similarity uses a local chrF-style character n-gram F-score over normalized Unicode text. It uses `references` from `evals/translation/*.json`, supports multiple references, and takes the best score. Text and Markdown compare against reference `text`. DOM compares visible text from output HTML against visible text from reference HTML; selector and attribute checks still enforce structure. Exact output allowlists win for tiny UI labels.

No LLM judge is used as the primary score.

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
    "modelId": "qwen-3-0.6b",
    "resolvedModelId": "onnx-community/Qwen3-0.6B-ONNX",
    "adapterId": "qwen-3-0.6b-chat",
    "dtype": "q4f16",
    "device": "webgpu",
    "loadMs": 42131,
    "score": 0.742,
    "scoreBreakdown": {
      "weightedCheckScore": 0.84,
      "passedCaseRatio": 0.61,
      "referenceSimilarity": 0.52,
      "hardFailureCount": 0,
      "failureReason": null
    },
    "failuresByCategory": {
      "preservation": 2,
      "output-only": 1
    },
    "failuresByCheck": {
      "no-prompt-echo": 1,
      "preserve:babulfish": 2
    },
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
        "score": 1,
        "scoreBreakdown": {
          "checkScore": 1,
          "referenceSimilarity": 1,
          "hardFailure": false,
          "hardFailureReason": null
        },
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
