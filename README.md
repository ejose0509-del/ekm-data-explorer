# EKM Data Explorer

A statistical analyzer that runs entirely in the browser. Add a CSV, Excel or JSON file, check and clean it, run the analysis, chart it, and read in plain language what the results show. A Write-up tab drafts the results section.

## Use it

Open `dist/index.html` in a browser. CSV, TSV, JSON, pasted tables, statistics and charts work offline from disk. Excel imports load the spreadsheet reader from cdnjs on demand and need network access unless that script is cached. The offline assistant works without an account or connection. Native browser downloads and portable project files work without Claude. Local mode keeps a browser copy by default, with an option to turn saving off or forget the copy. Team sharing still uses optional Claude artifact services.

## Change it

```bash
python3 build.py                  # rebuilds dist/index.html from src/
python3 tests/check_stats.py      # checks every statistic against SciPy
```

Edit the files in `src/` and rebuild. `AGENTS.md` explains the structure for coding agents such as Codex; `DESIGN.md` describes the chalkboard design system; `PRODUCT.md` the users and purpose.

## Import checks

With Playwright and a Chromium browser available:

```bash
node tests/check_imports.js
```

Set `PLAYWRIGHT_MODULE` to an existing Playwright module path if it is not installed locally. Set `BROWSER_CHANNEL=chrome` to use installed Google Chrome instead of Playwright's Chromium. The suite opens the built page from disk at 1440px and 400px, tests file upload, paste and drag-drop, and checks recovery after malformed files or a failed spreadsheet-reader download. Excel success cases require access to cdnjs. The small XLSX and XLS fixtures contain only synthetic measurements; the XLSX fixture includes a second sheet to verify first-sheet selection.

JSON imports accept arrays of row objects (also under `data`, `rows`, or another array-valued property). Missing keys become empty cells and nested values are kept as JSON text. CSV imports support comma, semicolon, tab and pipe delimiters, escaped quotes and multiline cells. Short rows receive empty cells; extra values without column headers are rejected rather than discarded. Blank and duplicate working headers receive unique names. **Import settings** lets you choose dot/comma decimals and whether common tokens such as NA mean missing; the default treats only empty cells as missing. Leading-zero identifiers, unsafe integer literals and mixed numeric/text columns remain text. Dates require valid ISO calendar dates. The **Original values** preview and CSV download retain imported cell values and original headers, including after project save/open. Type changes are undoable and reject invalid numeric conversion instead of replacing values with missing cells. Re-import older datasets to recover source values already changed by earlier versions; absent original values cannot be reconstructed. Excel initially opens the first worksheet; the worksheet picker can add other sheets as separate datasets.

## Offline assistant

Ask about complete column names in Analyze, for example `Compare Score by Group`, `Relate Score and Hours`, `Predict Score from Hours`, or `Trend Score over Year`. `Check data quality` reports missing-cell counts for the current selection. Example buttons use your own column names. Ambiguous or unsupported questions leave the analysis unchanged and offer guidance. For paired analyses, verify that the first named column is Before and the second is After on the same units.

The result assistant explains the current computation, effect sizes, stored confidence intervals, assumptions, p-values and possible next steps. Answers recompute when columns, filters or datasets change. It uses explicit JavaScript rules and the existing statistical functions, not a language model, and never calls Claude sampling or sends data. It does not infer causes, invent missing intervals, verify study design, or accept arbitrary conversational requests. Existing optional storage, downloads and sharing integrations are separate from the assistant.

The Write-up tab has an offline reporting review. Each tested result is checked separately for reported effects and intervals; descriptive results show `Not applicable`. Missing evidence in older saved results is flagged for inspection. Reviews become stale when the draft changes and must be rerun. A passing reporting check does not certify statistical validity.

Run the assistant's browser suite with the same Playwright setup as the import suite:

```bash
node tests/check_assistant.js
```

It blocks external requests and verifies routing, numerical grounding, refusals, stale-state handling, write-up review, escaping and responsive behavior at 1440px and 400px.

## What is inside

- **Your data:** CSV, TSV, Excel and JSON upload, column types, profiles, CSV and steps export.
- **Clean & enhance:** health checks modelled on ydata-profiling and Palantir Foundry, clustering adapted from OpenRefine, KNN fill, Isolation Forest, formula columns, joins, reshaping, and an undoable history that can be replayed on new data.
- **Analyze:**
  - Tests: summaries, group comparisons (Welch, ANOVA, Mann–Whitney, Kruskal–Wallis, Holm post-hoc), correlation, chi-square, trends, multiple and logistic regression, paired tests, pivot tables and a correlation map.
  - With each result: assumption checks, power, Bayes factors, APA text and next steps.
  - Go deeper: worked steps, Q-Q and residual plots, null simulation, sampling lab, distribution fits, prediction with held-out checks, and a 3D view.
- **Charts:** histogram, bar, box, scatter, line, 3D, with SVG and PNG export.
- **Write-up:** plain summary, methods, results with numbered figures, limitations, self-check, offline reporting review.

## Optional local language model

The standalone HTML remains fully usable with the offline assistant. To enable the Python bridge, install [Ollama](https://ollama.com), start it, and download a local model once:

```bash
ollama pull qwen2.5:1.5b
python3 build.py
python3 local_ai/server.py
```

Open **http://127.0.0.1:8766/**, import your table, open Analyze, then use **Local language model** below the offline result assistant. Ask questions such as “How uncertain is this result?” or “Which assumptions should I check?” Python uses only its standard library. Use `--model NAME` to select another installed local GGUF model, or `--port NUMBER` to change the port. Stop the service with Ctrl-C. Model downloads need internet; inference uses loopback only. The Python service does not train a model or upload data.

This is deliberately a constrained language-model assistant: Ollama returns a topic and evidence references using [structured outputs](https://docs.ollama.com/capabilities/structured-outputs). Python rejects unknown fields, invented references, duplicates and arbitrary prose. The browser validates every returned sentence against the current evidence again. All evidence within the selected topic is retained so the model cannot suppress its caveats. EKM's calculations and rules supply the displayed numbers and wording; the model chooses topic and emphasis. It may still choose an irrelevant topic; this is not a guarantee of sound study design or statistical validity. It cannot provide unrestricted conversational answers. Unsupported causal requests are refused; missing models, timeouts, invalid responses and network failures fall back to the offline explanation.

The bridge accepts only same-origin requests from its loopback-served page with an ephemeral session token. It has no permissive CORS, binds only to 127.0.0.1, ignores HTTP proxy settings, and writes no dataset/question logs. Only the question and computed evidence sentences reach local Ollama; rows are not included. Those sentences can include column names, categories and individual values, so local inference is still processing potentially sensitive information. Ollama's memory/session retention is separate from EKM; consult its settings if needed.

Validation:

```bash
python3 tests/check_local_ai.py
node tests/check_local_model.js
```

The browser test uses the same `PLAYWRIGHT_MODULE` / `BROWSER_CHANNEL` settings as the existing suites. It starts a temporary real Python service and simulates model responses for repeatable validation, fallback and stale-state checks. A live model must also be smoke-tested separately.

## Reliability and local projects

Undefined estimates (including correlation with a constant complete-pair column) are blocked before interpretation or write-up capture. Supplemental checks that cannot be computed are omitted or marked unavailable. No new statistical method is introduced by these validity checks.

On Your data, **Save project (.json)** downloads datasets, column types, cleaning recipes, undo history, the current selection and write-up figures/text. **Open project** validates the entire file before replacing the current project; save existing work first. Project files up to 50 MB can be opened. Imported figures are rebuilt from allowed SVG elements/attributes and imported reporting flags must be reviewed again.

**Keep in this browser** is on by default for Python local mode and opt-in for the standalone file. Saving can fail because of browser quota or privacy settings; the UI then directs you to save a project file. **Forget browser copy** removes the saved copy and turns saving off without clearing the current tab. The saved copy is associated with the current origin/port, not synced across devices. Project files are the portable backup. A stale tab preserves a separate draft instead of overwriting a newer browser copy. Load the latest shared copy or recover a preserved draft under Your data. Forgetting the browser copy also removes those drafts and switches saving off in other open tabs. Original source files remain your responsibility.

**Check connection** checks Ollama availability and whether the configured local model is installed. The local assistant accepts supported intents before model inference, constrains the model's topic, and distinguishes unsupported questions from invalid outputs, missing models, timeouts and a busy service. Empty emphasis lists retain the complete known topic rather than treating missing ranking as an inference failure. Both Python and the browser verify topic membership and complete evidence, including duplicate counts. **Cancel request** aborts the browser request and discards late responses; already-started Ollama computation may continue until it finishes or times out, so a subsequent request may briefly be busy.

Additional verification:

```bash
node tests/check_reliability.js   # same Playwright configuration as other browser suites
python3 tests/eval_local_model.py --model qwen2.5:1.5b  # actual local inference
```

## Adversarial regression coverage

```bash
node tests/check_stress_fixes.js  # same Playwright/browser settings as above
```

The suite checks lossless source values and headers, decimal/missing settings, additional Excel worksheets, special category labels, joins and reshape round-trips, malformed project selections, keyboard continuity, model cancellation during project restore, bounded chart ticks, scaled worked arithmetic, safe question variants, multi-tab recovery, and cancellable scans of all 319,600 pairs in an 800-column table. Excel checks require the approved CDN reader. The statistics suite now compares 102 quantities against SciPy, including extreme scales, offsets, n=3 intervals and Shapiro–Wilk scale invariance. This is regression coverage, not a guarantee for every possible dataset or study design.

Relationship health checks run in a worker, with a yielding fallback if workers are unavailable. Progress and cancellation remain available while the table is usable. All pairs are screened; if more than 100 strongly correlated pairs are found, the UI shows the total and the first 100. Scientific chart axes share an exponent, and the worked correlation arithmetic uses the same scaled engine as the result.

The local topic gate also understands p-value notation such as `p = 0.007` and common Spanish statistical wording such as `¿Qué significa el valor p?`. Responses remain the prepared English evidence. Sample-size and file-combination questions lead to existing tools and planning requirements; they do not invent a sample-size target.


Full feature-flow regression suite:

```bash
node tests/check_feature_flows.js  # same Playwright/browser settings; starts its own local server
```

This exercises all ten analysis kinds and their deeper tools, six chart types, cleaning options and repeated actions, formula/replay/join/reshape controls, 3D rotation, clipboard and document exports, write-up editing, and cross-dataset state changes at desktop and 400px. It uses synthetic data and does not publish team shares. Set `EKM_SCREENSHOT_DIR` to save screenshots and result JSON; otherwise artifacts use a temporary directory. Cloud sharing is checked for its unavailable state; live account-backed storage and sharing require separate integration testing.

Deep-tool simulations and subset results are invalidated when the dataset or table changes. Delayed runs are discarded if their original selection is no longer active. Subset sizes stay within available complete observations, and the lab reports empirical subset stability rather than prospective study power. Randomization and formula p-values are compared explicitly without automatically preferring either method. Repeated derived/indicator columns have unique names, and rerunning Isolation Forest preserves source columns and the prior undo state.

Two-sided normal-approximation power includes both rejection tails, with reference checks at zero, small, positive and negative effects. Fisher-based correlation power is unavailable with three or fewer complete pairs.
