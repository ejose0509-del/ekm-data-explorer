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
Tabs: Your data, Clean & enhance, Analyze, Charts. Private per-person storage; change history with undo. No example dataset: people start from their own data.

## Brand Commitments
Name open to change (currently "EKM · Every Kid Matters"). Must not look like a generic SaaS dashboard, a lab-instrument costume, or playful/cute.

## Accessibility & Inclusion
Keyboard operable, visible focus, WCAG AA contrast on the chalkboard, respects reduced motion.
