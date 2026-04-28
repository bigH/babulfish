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
dev/markdown/markdown/en-es/release-note-link-list
```

For grouped files, the path and JSON must agree on:

- `split`
- `contentType`
- `category`
- `sourceLanguage`
- `targetLanguage`

The schema artifact is [`schema.json`](schema.json). It documents the current case shape, deterministic PR 2 checks, per-case DOM runner config, and provenance metadata. Provenance is required for new grouped cases. Legacy flat files are temporarily grandfathered so the existing 38 flat cases do not need migration churn.

Current corpus count after PR 4:

- 89 total cases.
- 72 `dev` cases: 23 legacy flat cases plus 49 grouped PR 4 cases.
- 15 legacy `holdout` cases.
- 2 tiny `calibration-public` sentinel fixtures from PR 3.
- 0 `holdout-clean` cases; the reviewed clean seed is deferred.

The PR 4 grouped `dev` expansion adds 15 markdown, 18 text/preservation-family, and 16 DOM cases. They are all private `dev` cases with full provenance and use only existing deterministic PR 2 check types.

Grouped provenance is validated before live evals run:

- `holdout-clean` must be private, auditable, and `holdout_approved`.
- `synthetic_template` and `product_derived_rewrite` must explain `derivedFrom`.
- `public_benchmark` and `public_web` are allowed only in `calibration-public`.
- `calibration-public` must carry public or mixed exposure plus a contamination warning in `notes`.

PR 3 adds exactly two `sentinel-public-*` grouped fixtures under `calibration-public`. They exist only to test provenance gates, source-class grouping, and clean-score exclusion before the real calibration corpus is added; they are not production corpus expansion.

PR 2 adds deterministic opt-in checks only. It does not add provenance gates, score grouping, holdout policy, or corpus expansion; those belong to later PRs from [`docs/plans/eval-corpus-expansion.md`](../../docs/plans/eval-corpus-expansion.md).

New opt-in checks include:

- `preservedSubstringCounts` for repeated protected tokens.
- `markdownStructure` for headings, lists, code, links, images, tables, blockquotes, and frontmatter keys.
- DOM selector counts, selector-scoped visible text, translated attributes, hidden text, skipped text islands, optional root `dir`, and executable-attribute safety.

DOM cases may also set `runner.dom` for rich text, structured text, linked text, translated attributes, preserve matchers, skip tags, and skip text patterns.

Score reporting now has two layers:

- Raw model scoring still scores exactly the selected cases.
- Clean headline scoring excludes `calibration-public` and reports excluded case IDs.

Score groups are aggregated only by `split` and `sourceClass`. The older artifact case-group summaries remain non-score triage summaries by split, content type, category, language pair, and source class.
