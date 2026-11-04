# Product

EKM: a browser-based statistical analyzer. People add their own dataset, check and clean it, run standard statistics, chart it, and read in plain language what the results mean.

## Platform
web (single-page Claude artifact; one dark chalkboard world for every viewer, user-pinned; must work at 400px).

## Stack
Plain static HTML, CSS and JavaScript in one file. Fonts from Google Fonts only; scripts only from approved CDNs (SheetJS loaded on demand).

## Users
Researchers, scientists, and analysts who want to understand their data better; also people learning statistics. They bring CSV, Excel or JSON files and need correct numbers with an honest reading of them.

## Product Purpose
Turn a raw table into trustworthy findings: health check and cleaning first, then analysis, charts and interpretation, all computed on the person's own device.

## Positioning
Statistical rigor (results match SciPy) plus explanation in plain language. Cleaning methods follow OpenRefine, ydata-profiling, Palantir Foundry and scikit-learn. The offline assistant explains computed results with fixed rules; it does not use a language model or send data. An optional Python service offers local Ollama evidence selection when explicitly started; it sends only questions and computed evidence to loopback. The standalone page keeps working without it. Optional storage and sharing integrations remain separate.

## Capabilities and Constraints
Tabs: Plan, Your data, Clean & enhance, Analyze, Charts, Write-up. Analyses span description, group comparison (including repeated measures), relationships and prediction (including mixed models and cross-validated machine learning), measurement (reliability, factor analysis, rater agreement) and missing data (Little's test, multiple imputation). Every analysis can be recorded in a reproducible workflow, rerun and exported as Python or R scripts that use an embedded EKM engine through local Node.js and verify the recorded data and numerical summaries; every change is logged in a hash-chained audit trail. Local project save/open and optional browser persistence; private per-person cloud storage when available; change history with undo. No example dataset: people start from their own data.

## Brand Commitments
Name open to change (currently "EKM · Every Kid Matters"). Must not look like a generic SaaS dashboard, a lab-instrument costume, or playful/cute.

## Accessibility & Inclusion
Keyboard operable, visible focus, WCAG AA contrast on the chalkboard, respects reduced motion.

Data-integrity controls include explicit aggregation choices for duplicate repeated measurements, user-defined inclusive valid ranges, faithful oversized-integer imports, and unit/precision explanations. Import ceilings reflect available browser memory (at most 50 MB text/Parquet or 25 MB spreadsheets); large imports warn before proceeding if portable-project storage may be exceeded.
