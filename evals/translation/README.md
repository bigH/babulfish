# Translation Eval Corpus

The corpus still supports the legacy flat set:

```text
evals/translation/plain-es.json
```

Flat case IDs are the filename stem, so `plain-es.json` stays `plain-es`.

PR 1 also enabled the grouped layout:

```text
evals/translation/<split>/<contentType>/<category>/<source>-<target>/<slug>.json
```

Grouped case IDs are the grouped path without `.json`, for example:

```text
targeted/markdown/markdown/en-es/release-note-link-list
```

For grouped files, the path and JSON must agree on:

- `split`
- `contentType`
- `category`
- `sourceLanguage`
- `targetLanguage`

The schema artifact is [`schema.json`](schema.json). It documents the current case shape, deterministic PR 2 checks, per-case DOM runner config, and provenance metadata. Provenance is required for new grouped cases. Legacy flat files are temporarily grandfathered so the existing 38 flat cases do not need migration churn.

Current corpus count after PR 6:

- 117 total cases.
- 72 `targeted` cases: 23 legacy flat cases plus 49 grouped PR 4 cases.
- 27 `general` cases: 15 legacy flat cases plus 12 public/mixed regression/comparability probes.
- 18 reviewed grouped `holdout` seed cases from PR 5.

The PR 4 grouped `targeted` expansion adds 15 markdown, 18 text/preservation-family, and 16 DOM cases. They are all private `targeted` cases with full provenance and use only existing deterministic PR 2 check types.

The PR 5 clean holdout seed adds 6 text, 6 markdown, and 6 DOM cases. The seed is intentionally 18 cases rather than the phase-1 target of 36 because the repo does not contain concrete evidence of bilingual reviewer capacity for a larger reviewed batch. Every PR 5 case is private, `holdout_approved`, auditable through concrete source origins, and excluded from default local runs unless selected explicitly.

Grouped provenance is validated before live evals run:

- `holdout` must be private, auditable, and `holdout_approved`.
- `synthetic_template` and `product_derived_rewrite` must explain `derivedFrom`.
- `public_benchmark` and `public_web` are allowed only in `general`.
- Public-source `general` cases must carry public or mixed exposure plus a contamination warning in `notes`.

PR 6 expands the public-source `general` set to 12 public or mixed-exposure cases. They keep `category: "calibration-public"` as a provenance signal. They are contamination-marked regression/comparability probes, not clean holdout material, and clean headline scoring excludes them by source class. The original PR 3 `sentinel-public-*` fixtures remain in the set to keep provenance and reporting gates covered.

Deterministic checks are opt-in so legacy case scoring stays stable.

New opt-in checks include:

- `preservedSubstringCounts` for repeated protected tokens.
- `markdownStructure` for headings, lists, code, links, images, tables, blockquotes, and frontmatter keys.
- DOM selector counts, selector-scoped visible text, translated attributes, hidden text, skipped text islands, optional root `dir`, and executable-attribute safety.

DOM cases may also set `runner.dom` for rich text, structured text, linked text, translated attributes, preserve matchers, skip tags, and skip text patterns.

Score reporting now has two layers:

- Raw model scoring still scores exactly the selected cases.
- Clean headline scoring excludes `public_benchmark` and `public_web` cases and reports excluded case IDs.

Score groups are aggregated by `split` and `sourceClass`. Artifact case-group summaries also include pass/fail counts and scores by split, content type, category, language pair, and source class.
