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
pnpm eval:webgpu -- --split dev --category markdown
pnpm eval:webgpu -- --content-type dom --language-pair en-es
pnpm eval:webgpu -- --source-language en --target-language fr
pnpm eval:webgpu -- --source-class synthetic_template
pnpm eval:webgpu -- --split calibration-public --source-class public_benchmark
pnpm eval:webgpu -- --split holdout-clean --holdout-reason "release gate"
pnpm eval:webgpu -- --output-dir .evals/manual-webgpu-run
```

The runner starts the vanilla Vite demo with COOP/COEP headers, launches Chromium through Playwright, requires WebGPU, loads one model, runs the JSON corpus in `evals/translation/`, then writes:

```text
.evals/web-gpu-<timestamp>/<model-name>.json
```

Text and Markdown cases run through `translateText()`. DOM cases run through `translateTo(..., { root })` against an isolated per-case fixture so selector and attribute checks exercise the DOM path. DOM artifacts capture the eval root `outerHTML`, which keeps root-level `dir` assertions visible.

The default local report run uses `--split dev,holdout`. `holdout-clean` is excluded unless explicitly selected, and selecting it requires `--holdout-reason`. `calibration-public` is also explicit so public sentinel fixtures do not perturb local optimization baselines.

The corpus currently contains 107 cases:

- 38 legacy flat cases: 23 `dev` and 15 `holdout`.
- 49 grouped PR 4 `dev` cases covering markdown, preservation-family text, and forward DOM behavior.
- 18 grouped PR 5 `holdout-clean` seed cases covering text basics, preservation/entities/source-copy, markdown, and DOM behavior.
- 2 tiny PR 3 `calibration-public` sentinel fixtures for gating and reporting tests only.

The clean holdout seed is 18 cases, not the phase-1 target of 36, because the repo does not contain concrete evidence of bilingual reviewer capacity for a larger reviewed batch. There is still no calibration-public expansion beyond the sentinels.

Live WebGPU evals are intentionally opt-in and are not part of `pnpm test`; they download and run real models.

## Corpus Layout

Legacy flat files keep working during the migration:

```text
evals/translation/plain-es.json
```

Their case ID is still the filename stem, such as `plain-es`.

Future grouped cases use:

```text
evals/translation/<split>/<contentType>/<category>/<source>-<target>/<slug>.json
```

Grouped IDs are the grouped path without `.json`, such as:

```text
dev/markdown/markdown/en-es/release-note-link-list
```

For grouped files, the loader validates that path-derived `split`, `contentType`, `category`, `sourceLanguage`, and `targetLanguage` match the JSON fields. Unknown top-level JSON keys and unknown `checks` keys are rejected before live evals run.

The schema artifact lives at [`evals/translation/schema.json`](../evals/translation/schema.json), with corpus notes in [`evals/translation/README.md`](../evals/translation/README.md). It documents PR 2 deterministic checks and the PR 3 `provenance` gates. Provenance is required for grouped cases; legacy flat files are temporarily grandfathered.

Grouped provenance gates:

- `holdout-clean` must be private, `holdout_approved`, and backed by concrete source/reviewer metadata.
- `synthetic_template` and `product_derived_rewrite` require `derivedFrom`.
- public source classes are allowed only in `calibration-public`.
- `calibration-public` must record public or mixed exposure and a contamination warning.

## Deterministic Checks

PR 2 checks are opt-in so legacy case scoring stays stable:

- `preservedSubstringCounts` counts protected tokens from the source or explicit metadata.
- `markdownStructure` checks heading/list/code/link/image/table/blockquote/frontmatter structure.
- DOM checks cover selector counts, scoped visible text, preserved and translated attributes, hidden text, skipped text islands, optional root `dir`, and executable-attribute safety.

DOM cases can also set `runner.dom` for case-specific `richText`, `structuredText`, `linkedBy`, `translateAttributes`, `preserveMatchers`, `skipTags`, and `skipTextPatterns`.

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

Reference similarity uses a local chrF-style character n-gram F-score over normalized Unicode text. It uses `references` from the loaded `evals/translation/` cases, supports multiple references, and takes the best score. Text and Markdown compare against reference `text`. DOM compares visible text from output HTML against visible text from reference HTML; selector and attribute checks still enforce structure. Exact output allowlists win for tiny UI labels.

No LLM judge is used as the primary score.

Artifacts include both raw scoring and clean headline scoring. Raw `model.score` scores exactly the selected cases. `model.cleanHeadlineScore` excludes `calibration-public`, reports the excluded case IDs, and is the score to quote for clean local reporting. `model.scoreGroupSummaries` groups score summaries only by `split` and `sourceClass`; `model.caseGroupSummaries` remains the non-score triage breakdown by split/content/category/language/source class.

Holdout-clean artifacts also record auditable run metadata:

- runner
- timestamp
- model ID
- filters
- reason
- whether references were exposed

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
    "cleanHeadlineScore": {
      "score": 0.742,
      "pass": false,
      "includedCases": 87,
      "excludedCases": 0,
      "excludedCaseIds": [],
      "scoreBreakdown": {
        "weightedCheckScore": 0.84,
        "passedCaseRatio": 0.61,
        "referenceSimilarity": 0.52,
        "hardFailureCount": 0,
        "failureReason": null
      }
    },
    "failuresByCategory": {
      "preservation": 2,
      "output-only": 1
    },
    "failuresByCheck": {
      "no-prompt-echo": 1,
      "preserve:babulfish": 2
    },
    "caseGroupSummaries": [
      {
        "split": "dev",
        "contentType": "markdown",
        "category": "markdown",
        "languagePair": "en-es",
        "sourceClass": "missing",
        "total": 4,
        "passed": 3,
        "failed": 1,
        "hardFailures": 0,
        "failuresByCheck": {
          "markdown-link-href:/docs/runtime": 1
        }
      }
    ],
    "scoreGroupSummaries": [
      {
        "split": "dev",
        "sourceClass": "missing",
        "total": 23,
        "passed": 14,
        "failed": 9,
        "pass": false,
        "score": 0.742
      }
    ],
    "runMetadata": {
      "runner": "webgpu-eval-cli",
      "timestamp": "2026-04-28T19:00:00.000Z",
      "modelId": "qwen-3-0.6b",
      "filters": { "split": ["dev", "holdout"] },
      "reason": null,
      "referencesExposed": false
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
