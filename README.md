# EKM Data Explorer

A statistical analyzer that runs entirely in the browser. Add a CSV, Excel or JSON file, check and clean it, run the analysis, chart it, and read in plain language what the results show. A Write-up tab drafts the results section.

## Use it

Open `dist/index.html` in a browser. Everything except the Claude-only extras works offline from disk: private storage between visits, Claude explanations, downloads and team sharing need the page to be opened as a Claude artifact.

## Change it

```bash
python3 build.py                  # rebuilds dist/index.html from src/
python3 tests/check_stats.py      # checks every statistic against SciPy
```

Edit the files in `src/` and rebuild. `AGENTS.md` explains the structure for coding agents such as Codex; `DESIGN.md` describes the chalkboard design system; `PRODUCT.md` the users and purpose.

## What is inside

- **Your data:** CSV, TSV, Excel and JSON upload, column types, profiles, CSV and steps export.
- **Clean & enhance:** health checks modelled on ydata-profiling and Palantir Foundry, clustering adapted from OpenRefine, KNN fill, Isolation Forest, formula columns, joins, reshaping, and an undoable history that can be replayed on new data.
- **Analyze:**
  - Tests: summaries, group comparisons (Welch, ANOVA, Mann–Whitney, Kruskal–Wallis, Holm post-hoc), correlation, chi-square, trends, multiple and logistic regression, paired tests, pivot tables and a correlation map.
  - With each result: assumption checks, power, Bayes factors, APA text and next steps.
  - Go deeper: worked steps, Q-Q and residual plots, null simulation, sampling lab, distribution fits, prediction with held-out checks, and a 3D view.
- **Charts:** histogram, bar, box, scatter, line, 3D, with SVG and PNG export.
- **Write-up:** plain summary, methods, results with numbered figures, limitations, self-check, Reviewer 2.
