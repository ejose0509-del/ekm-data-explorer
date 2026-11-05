# EKM: guide for coding agents

EKM is a browser-based statistical analyzer. People add a dataset, check and clean it, run statistics, chart it, and read in plain language what the results mean. Everything is calculated in the browser. It ships as **one self-contained HTML page**.

## Build and check

```bash
python3 build.py                  # src/ -> dist/index.html
python3 tests/check_stats.py      # statistics vs SciPy (needs node, numpy, scipy)
python3 tests/check_methods.py    # S3/ML vs statsmodels, scikit-learn, pingouin, factor_analyzer
node tests/check_trust.js         # versioning, time gaps, fidelity, ranges and verified Python/R replay
node tests/check_new_features.js  # browser checks for Plan, new analyses, editing, workflow, connectors, exports
```

Open `dist/index.html` in a browser to use it. Run the stats check after any change to `src/stats.js` or `src/stats2.js`; all 171 fixed values plus the 1,017-case Welch accuracy gate (including the original 30) must match SciPy. The same command also runs 195 model numerical cases (1,755 comparisons). Run the methods check after any change to `src/stats3.js` or `src/ml.js`; all 44 groups must match (it needs `pip install numpy scipy pandas statsmodels scikit-learn pingouin factor_analyzer`). Browser suites need Playwright (`PLAYWRIGHT_MODULE`, `BROWSER_CHANNEL=chrome`); set `EKM_PYTHON` to a Python with those packages so the new-feature suite also runs the exported Python script and checks it reproduces EKM's numbers.

## Layout

| File | What it owns |
|---|---|
| `src/index.template.html` | Page shell: head, fonts, ledge band with the six tabs, `#view` |
| `src/theme.css` | The whole stylesheet: tokens on `:root`, components, layouts |
| `src/core.js` | Router: `st.tab`, `VIEWS`, `render()`, `nav()`, `esc()`, `go2()`, `refocus()` |
| `src/stats.js` | `S`: describe, Welch t, ANOVA, chi-square, correlation, OLS, p-value functions |
| `src/stats2.js` | `S2`: Shapiro–Wilk, Levene, Mann–Whitney, Kruskal–Wallis, Wilcoxon, paired t, Holm post-hoc, logistic, power, BIC Bayes factors |
| `src/analyzer.js` | Datasets (`A`), file parsing, private storage (`ST`), the Your data, Analyze and Charts views, SVG chart builders, formulas |
| `src/enhancer.js` | Clean & enhance: health checks, fixes, change history, OpenRefine clustering, KNN fill, Isolation Forest |
| `src/empty.js` | First-run previews for each tab |
| `src/features.js` | Assumption checks, post-hoc, paired/logistic/pivot analyses, APA text, next steps, plain-English questions |
| `src/datatools.js` | Formula columns (safe parser, no `eval`), join, wide/long reshape, replaying steps |
| `src/export.js` | Downloads (SVG/PNG/report/CSV/steps) and results shared with the team |
| `src/deep.js` | Go deeper panel: worked steps, Q-Q/residual plots, null simulation, sampling lab, distribution fits, prediction, correlation map |
| `src/space.js` | 3D view (canvas renderer) and the 3D chart type |
| `src/writeup.js` | Write-up tab, limitations, saved result evidence |
| `src/reliability.js` | Validity checks before interpretation and write-up capture |
| `src/project.js` | Native downloads, portable projects, conflict-aware browser persistence |
| `src/input-integrity.js` | Original values, import settings, worksheet selection, reversible types |
| `src/responsive-checks.js` | Cancellable background relationship screening, focus retention, stable worked arithmetic |
| `src/local-model.js` | Optional same-origin local model bridge |
| `src/assistant.js` | Offline question routing, grounded explanations, self-check and write-up review |
| `src/stats3.js` | `S3`: noncentral t/F/χ² and exact power, repeated-measures ANOVA (Mauchly, GG/HF), Friedman, REML mixed models, cluster-robust OLS, Cronbach/omega, PCA, principal-axis FA, varimax/promax, KMO/Bartlett, parallel analysis, Cohen/weighted/Fleiss kappa, ICC, Little's MCAR, MICE (PMM), Rubin's rules |
| `src/ml.js` | `ML`: CART trees, random forests, elastic net / ridge / lasso, penalized logistic, k-fold / stratified / grouped / time-series splits, regression and classification metrics, ROC, calibration |
| `src/methods.js` | Analysis kinds `rmanova`, `mixed`, `reliability`, `factor`, `agree`, `missing` (with multiple imputation); shared helpers `memo`, `mselList`, `choice`, `table`, `xyLines`, `likelyId` |
| `src/modeling.js` | Analysis kind `model`: cross-validated prediction, model comparison, permutation importance, calibration, out-of-fold prediction column |
| `src/editing.js` | Editable grid, multi-condition filters (`A.sel.where`), variable labels/units/value labels, recoding, appending, typed joins |
| `src/plan.js` | Plan tab: sample size, power and minimum detectable effect, dropout and design effect, justification text |
| `src/workflow.js` | Recorded workflow steps, rerun-and-compare, Python and R script export, hash-chained audit trail, project fields for all of these |
| `src/publish.js` | Large-file import (worker parsing, up to 50 MB subject to memory, spreadsheets 25 MB), Parquet, cached column work, native .docx and PDF export, figure options |
| `src/connect.js` | Import from links and SQLite, refresh with recipe replay, scheduled refresh, team workspace |
| `src/trust.js` | Row/column versions, cancellation, explicit valid ranges and project metadata |
| `src/verified-export.js` | Self-contained Python/R workflow replay using Node, with data fingerprints and numerical comparisons |
| `src/layout.js` | Analysis menu grouped by purpose |
| `src/vendor/parquet.js` | hyparquet bundle (MIT, see `src/vendor/LICENSE-hyparquet.txt`), inlined in its own `<script>` |

**Module order matters.** `build.py` concatenates modules in a fixed order into one `<script>`. Later modules extend earlier ones by wrapping globals: `runAnalysis`, `render`, `formula`, `caption`, `toolsBar`, `chartsView` and `VIEWS.*`. To add behaviour, wrap the existing function in a new or later module instead of editing every caller. Keep the plain ES5 style (`var`, `function`), with no modules or bundler.

## How an analysis renders

`analyzeView()` calls `runAnalysis(ds)`, which returns `R = {controls, head, chart, extra, reading[], caveats[], summary, apa, next[]}`. The poster panel shows `1 Method` (help text plus `formula(R)` MathML), `2 Result` (`R.head`, chart, `R.extra`) and `3 Conclusion` (reading, caveats, APA, next steps). Below it are `explanationPanel()`, `deepPanel()`, `toolsBar()`, and the shared results. The offline assistant runs after the analysis modules and uses the existing statistics; validity and project hooks run after it. Explanation and review hooks are defined in `assistant.js`. To add an analysis kind:
1. Push to `KINDS` and `KIND_HELP`, and place it in a group in `KIND_GROUPS` (`layout.js`).
2. Handle it in a `runAnalysis` wrapper.
3. Optionally extend `formula`, `caption`, `deepTabs` and `localFacts` (the offline assistant).
4. Keep `R.summary` free of NaN/Infinity: the validity gate in `reliability.js` rejects results with non-finite summaries. Array selections (checkbox lists) must be listed in `ARRAY_SEL` in `workflow.js` so projects save them.
5. Add a code template to `pyAnalysis` and `rAnalysis` in `workflow.js`, and any new recorded data step to `replayStep`, `pyStep` and `rStep`.

Expensive work is cached with `memo(ds, key, fn)` per data version (`ds.rows` identity). Steps that change data go through `applyStep` so they are undoable, replayable, recorded in the recipe and logged in the audit trail. Use `amin`/`amax` (core.js), never `Math.min.apply`, which overflows the stack on large columns.

## Platform constraints (Claude artifact)

- **Runtime capabilities are optional.** Private storage, downloads and team sharing use `window.claude.use("db" | "user" | "downloads")`. Every call must handle `null` (unavailable) and errors, because the page has to work fully without them, as it does when opened from disk.
- **External resources:** scripts only from cdnjs, jsDelivr or unpkg (SheetJS and jsPDF load on demand; hyparquet is inlined); styles and fonts only from Google Fonts. No other network requests in standalone mode. The user-authorized optional local mode, served by `local_ai/server.py`, may POST computed evidence to its same-origin loopback endpoint; Python may call only local Ollama. Local mode also offers `/api/fetch` (public http(s) links only; loopback, private and link-local addresses are refused, including after redirects) and `/api/sqlite` (read-only connection with an authorizer that denies every non-read action).
- **Untrusted data:** never `innerHTML` text from data other people can write (shared results). Escape with `esc()`.

## Design rules

The look is a lecture-hall chalkboard. Read `DESIGN.md` before UI work. Key rules:
- Use tokens from `:root` in `theme.css` only, and stay on the six-step type scale (`--t1`..`--t6`) and spacing scale (`--s1`..`--s6`).
- STIX Two Text and Math for headings and formulas; Archivo for controls and numbers.
- Yellow is the single highlight. Chalk colours carry meaning (tiers, series).
- Flat panels: no shadows, gradients or glow. The only motion is the `.rewrite` chalk-write, which reduced motion turns off.
- Standard controls, a visible focus ring, 400px phone width with no sideways scroll.
- Copy names what people recognise, says what each control does, and explains errors with a fix.

`PRODUCT.md` holds product truth: users, purpose and constraints.

## Statistics rules

Every new test follows its published definition and gets a case in `tests/stats_harness.js` and `tests/check_stats.py` against SciPy. Interpretations must never overstate: say "associated with", not "causes"; report effect sizes and uncertainty; give the rank-based alternative when normality fails.

## Result integrity and portable workflows

Models and imputations must use `dataVersion(ds)` plus all selections/filters in their keys. Background training must check its captured version before every fold and before publishing. Time validation splits distinct timestamps, with an optional gap measured in distinct periods; invalid dates are errors. Duplicate subject–condition observations require an explicit policy.

Tables are capped at 1,000,000 rows, 2,000 columns and 8,000,000 cells; CSV parsing and Parquet metadata enforce this before expanding the working table. Text/Parquet imports are capped at 50 MB, spreadsheets at 25 MB, and may be capped lower by memory. Before an import over 6 MB, the user sees the 50 MB portable-project limit and can cancel. Browser storage is smaller and cannot replace a downloaded project. No claim that every file below a byte limit fits memory.

Python/R workflow exports embed the actual EKM implementation and call Node.js locally, with network disabled. Python uses its standard library; R uses jsonlite. Save Original data (CSV) next to the script. Replay checks the full working-data fingerprint and every recorded summary value, not just process success. Keep the replay kernel self-contained: it is built from src, never fetched. Native reference templates remain available internally for comparing published methods, but the downloadable workflow uses verified replay.

## Tags, takeaways, Discover and web context

| File | What it owns |
|---|---|
| `src/tags.js` | `TAGS`; column tags on `col.tags` (`role`, `level`, `sens`, `topics`, `suggested`), row tags as a `Row tag` / `Row note` column (role `rowtag`, op `rowtag`), dataset tags on `ds.tags`; defaults from roles, Exclude filtering, sensitive-column export rules, project persistence (`p.tags`) |
| `src/explain.js` | `takeaway(ds, R)` headline and everyday translations per kind, `howSure(ds, R)`, example rows, reading level (`XL.level`), glossary (`GLOSSARY`, `linkTerms`), data overview with suggested questions |
| `src/discover.js` | `runDiscover` (local worker, explicit Run/Stop and scope), candidate tests in `testFor`, complete-family BH screening, Bonferroni row-split checks, descriptive clusters/curves, unusual rows, pattern cards |
| `src/websearch.js` | Query building (sensitive names excluded), the web panel, `/api/search` calls |

When adding an analysis kind, add a case to `takeaway` (headline and everyday lines) and, if it has a special precision measure, to `howSure`. Data-derived names in takeaway HTML must go through `nm()` / `esc()`. New pattern types need a `testFor` case, a `patternText` case and an `openSpec` entry. Web results are untrusted text: render with `esc()` only, never as HTML, and never let them alter a result. `local_ai/server.py` `/api/search` uses `EKM_SEARCH_KEY`, `--search-provider` (brave, tavily, searxng) and the test provider `EKM_SEARCH_MOCK=1`.

Regression gate for tags/interpretation/Discover: `node tests/check_tags_patterns.js` and `node tests/check_interpretation_integrity.js` (same Playwright settings). Restore the browser project only in the page bootstrap, after every schema wrapper is registered. Working CSV redaction does not apply to original-data CSVs or full project backups; keep that distinction visible and never claim that full backups are redacted.
