# EKM Data Explorer

A statistical analyzer that runs entirely in the browser. Add a CSV, Excel or JSON file, check and clean it, run the analysis, chart it, and read in plain language what the results show. A Write-up tab drafts the results section.

## Use it

Open `dist/index.html` in a browser. CSV, TSV, JSON, pasted tables, statistics and charts work offline from disk. Excel imports load the spreadsheet reader from cdnjs on demand and need network access unless that script is cached. Private storage between visits, Claude explanations, downloads and team sharing need the page to be opened as a Claude artifact.

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

## What is inside

- **Your data:** CSV, TSV, Excel and JSON upload, column types, profiles, CSV and steps export.
- **Clean & enhance:** health checks modelled on ydata-profiling and Palantir Foundry, clustering adapted from OpenRefine, KNN fill, Isolation Forest, formula columns, joins, reshaping, and an undoable history that can be replayed on new data.
- **Analyze:**
  - Tests: summaries, group comparisons (Welch, ANOVA, Mann–Whitney, Kruskal–Wallis, Holm post-hoc), correlation, chi-square, trends, multiple and logistic regression, paired tests, pivot tables and a correlation map.
  - With each result: assumption checks, power, Bayes factors, APA text and next steps.
  - Go deeper: worked steps, Q-Q and residual plots, null simulation, sampling lab, distribution fits, prediction with held-out checks, and a 3D view.
- **Charts:** histogram, bar, box, scatter, line, 3D, with SVG and PNG export.
- **Write-up:** plain summary, methods, results with numbered figures, limitations, self-check, Reviewer 2.
