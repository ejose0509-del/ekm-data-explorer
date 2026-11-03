# EKM Data Explorer

A statistical analyzer that runs entirely in the browser. Add a CSV, Excel or JSON file, check and clean it, run the analysis, chart it, and read in plain language what the results show. A Write-up tab drafts the results section.

## Use it

Open `dist/index.html` in a browser. CSV, TSV, JSON, pasted tables, statistics and charts work offline from disk. Excel imports load the spreadsheet reader from cdnjs on demand and need network access unless that script is cached. The offline assistant works without an account or connection. Private storage between visits, downloads and team sharing still use optional Claude artifact services.

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

JSON imports accept arrays of row objects (also under `data`, `rows`, or another array-valued property). Missing keys become empty cells and nested values are kept as JSON text. CSV imports support comma, semicolon, tab and pipe delimiters, escaped quotes and multiline cells. Short rows receive empty cells; extra values without column headers are rejected rather than discarded. Blank and duplicate headers receive unique names.

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
