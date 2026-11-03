# EKM: guide for coding agents

EKM is a browser-based statistical analyzer. People add a dataset, check and clean it, run statistics, chart it, and read in plain language what the results mean. Everything is calculated in the browser. It ships as **one self-contained HTML page**.

## Build and check

```bash
python3 build.py                  # src/ -> dist/index.html
python3 tests/check_stats.py      # statistics vs SciPy (needs node, numpy, scipy)
```

Open `dist/index.html` in a browser to use it. Run the stats check after any change to `src/stats.js` or `src/stats2.js`; all 30 values must match SciPy.

## Layout

| File | What it owns |
|---|---|
| `src/index.template.html` | Page shell: head, fonts, ledge band with the five tabs, `#view` |
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
| `src/writeup.js` | Write-up tab, limitations, self-check, Reviewer 2 |

**Module order matters.** `build.py` concatenates modules in a fixed order into one `<script>`. Later modules extend earlier ones by wrapping globals: `runAnalysis`, `render`, `formula`, `caption`, `toolsBar`, `chartsView` and `VIEWS.*`. To add behaviour, wrap the existing function in a new or later module instead of editing every caller. Keep the plain ES5 style (`var`, `function`), with no modules or bundler.

## How an analysis renders

`analyzeView()` calls `runAnalysis(ds)`, which returns `R = {controls, head, chart, extra, reading[], caveats[], summary, apa, next[]}`. The poster panel shows `1 Method` (help text plus `formula(R)` MathML), `2 Result` (`R.head`, chart, `R.extra`) and `3 Conclusion` (reading, caveats, APA, next steps). Below it are `deepPanel()`, `toolsBar()`, Ask Claude, and the shared results. To add an analysis kind:
1. Push to `KINDS` and `KIND_HELP`.
2. Handle it in a `runAnalysis` wrapper.
3. Optionally extend `formula`, `caption` and `deepTabs`.

## Platform constraints (Claude artifact)

- **Runtime capabilities are optional.** Private storage, Claude explanations, downloads and team sharing use `window.claude.use("db" | "user" | "sample" | "downloads")`. Every call must handle `null` (unavailable) and errors, because the page has to work fully without them, as it does when opened from disk.
- **External resources:** scripts only from cdnjs, jsDelivr or unpkg (SheetJS loads on demand); styles and fonts only from Google Fonts. No other network requests.
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
