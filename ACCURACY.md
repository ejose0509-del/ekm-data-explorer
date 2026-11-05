# Accuracy repair ledger

Each entry is a separate repair. Passing one entry does not certify another.
No design changes are part of these repairs. Cases use represented input values;
rounding done before import cannot be recovered. Numerical tolerances are explicit.

| ID | Issue | Status | Required evidence |
|---|---|---|---|
| E1 | Welch cancellation with a large common baseline | Verified for the acceptance cases below | Decimal moments + SciPy tails and CI; offset/scale/order cases; actual import, analysis and exported replay |
| E2 | Refresh loses metadata, exclusions, source fidelity and rollback | Verified for the acceptance cases below | Reordered stable IDs, no-ID refusal, changed schema, replay failure rollback, latest-request handling, original CSV and project round-trip |
| E3 | PCA/factor score columns refit excluded data | Verified for the acceptance cases below | Same fitted parameters and eligible rows as displayed; scores and replay verified |
| E4 | Prediction recipes omit validation context; duplicate source headers fail replay | Verified for the acceptance cases below | Gap/filter preservation, original-header mapping and generated workflow execution |
| E5 | Sensitivity lost in append and derived columns | Verified for the acceptance cases below | Conservative metadata propagation, CSV exclusion and project persistence |
| E6 | Weighted agreement and ordinal interpretation mismatch | Verified for the acceptance cases below | Raw vs weighted agreement explicitly separated; headline uses selected primary statistic |
| E7 | Plan invalid input and lost settings | Verified for the acceptance cases below | Domain validation, no invalid result/write-up, project save/open and reload |
| E8 | Rare-class CV averages undefined folds | Pending | Validation uses a feasible split or refuses it explicitly; valid fold counts match headline |
| E9 | Premature rounding in cleaning, formulas and scale columns (found during this repair) | Pending | Stored transformations retain binary64 precision; each changed operation has an independent numerical case |

## E1 acceptance record

The implementation subtracts a shared finite origin before scaling the two samples.
This preserves small group differences on a large baseline while protecting against
scale overflow/underflow. The Welch–Satterthwaite definition is unchanged.

- `python3 tests/check_stats.py`: 117 fixed values plus 1,017 independent Welch cases
  (7,119 values). Decimal uses 100-digit moments of the exact represented inputs;
  SciPy supplies tails and confidence quantiles. No value failures or .05 decision
  disagreements after the fix. The prior implementation failed 5,994 values in this
  test and disagreed on 16 decisions (this test's generated set).
- Contract: p relative tolerance 5e-9 with 1e-300 absolute floor; other values within
  1e-10 times max(1, absolute reference). Effect/CI comparisons normalize measurement
  units before comparing scales. An unrepresentable interval is required to fail
  the browser result gate; it is not treated as a valid finite estimate.
- Maximum observed absolute p error: 7.4e-13. This is observed evidence for these cases,
  not a universal error bound.
- `node tests/check_welch_flow.js`: disk-opened HTML, actual CSV upload, analysis,
  report download and actual downloaded Python/Node replay at 1440px and 400px.
  Browser and replay summary numbers match exactly. Overflowing intervals are refused.
- Scope: Welch only. Other methods and the seven remaining ledger entries are not
  certified by this record. IEEE-754 representation limits remain.

## E2 acceptance record

Refresh builds and strictly replays an isolated candidate before committing any table,
original-source snapshot or undo history. It preserves confirmed metadata by column
name and refreshes the raw source copy together with the working table. It retains
valid no-op steps for future refreshes. A late response or edits during loading abort
publication. Truncated sources and failed schema/replay operations are refused.

New row-tag steps record a unique identifier and its typed values. Refresh refuses
legacy positional tags, absent/duplicate identifiers, or a missing tagged record;
it does not infer that a row position identifies the same person. Existing positional
recipes still replay on an unchanged source, but require review before source refresh.

- `node tests/check_refresh_integrity.js`: 16 groups at 1440px/400px, including actual
  source import/refresh/download controls, identity and project round-trip, atomic
  failure, races, ranges, import settings and no-op recipes.
- The same suite against commit 60fd20b fails its first metadata assertion (health tag lost).
- `node tests/check_tags_patterns.js`: 42 checks; `node tests/check_new_features.js`: 46
  checks including SQLite refresh and cleaning replay. `python3 tests/check_stats.py`
  also passes the fixed and strict Welch gates.
- Scope: loaded datasets, current tagged identifiers and matching source-column names.
  Source schema/identifier changes are refused where they prevent safe replay.

## E3 acceptance record

Score columns use the displayed fit's means, sample SDs, loadings, factor ordering
and signs. Correlated-factor regression uses the structure matrix L Phi, following
[FactorAnalyzer.transform](https://factor-analyzer.readthedocs.io/en/latest/_modules/factor_analyzer/factor_analyzer.html).
Factor correlations receive the same sign/order changes as the loadings. The fit
and eligibility selection are recorded in the score recipe and reused on replay or
refresh; refresh does not silently train a replacement model. Incomplete, excluded
and filtered-out rows get null scores. Scores retain full binary64 precision rather
than being truncated to six significant digits. Legacy recipes without a recorded
fit/scope refuse replay and require regeneration from the intended analysis.

- `node tests/check_score_integrity.js`: 14 cases at 1440px/400px, 2,054 score
  values. Sample moments, SciPy linear-solve weights and NumPy scores match within
  relative 1e-9 / absolute 1e-10. Maximum observed absolute score error: 4.4e-15.
- Includes missing observations, filtering, an excluded cohort offset by 100,
  changed exclusion settings (cache invalidation), PCA eigenvectors and unit sample
  variance, project round-trip and saved-fit replay under different ambient filters.
- Actual downloaded Python/Node workflow and original CSV execute successfully for
  the correlated factor case at both widths. 44/44 existing method groups pass.
- Scope: fitted-score integrity for the listed datasets and ordinary finite ranges.
  The displayed oblique-factor variance interpretation remains part of pending E6;
  this entry does not certify every factor-analysis narrative or extreme-scale fit.

## E4 acceptance record

New prediction recipes record an isolated copy of the complete model selection,
including gap, filters and exclusion policy; replay does not inherit ambient state.
Legacy recipes missing this context refuse replay. Model defaults are assigned before
first setup; exclusion settings are part of the model cache key. Prediction columns
retain the computed precision. Project restoration retains numeric/boolean selections
instead of turning false into a truthy string.

Workflow records retain original header order (including duplicates/blanks), source
column tags and import decimal/missing rules. Original-data downloads use the raw
source values/headers and explicitly identify themselves as unredacted.

- `node tests/check_prediction_replay.js`: 10 groups at 1440px/400px. Time gap 5,
  category/condition filters, exclusions, grouped and binary logistic prediction
  columns replay exactly within the browser under different ambient selections.
  Actual downloaded Python/Node workflows execute after project round-trip, including
  duplicate/blank headers and decimal-comma/missing-token imports. Changed source
  headers and source values are refused.
- Browser vs Node logistic probabilities differed by 1.1e-16 in four rows of this
  fixture. Original data and other working cells retain exact fingerprints. New
  computed numeric columns additionally have recorded references (14-digit transport)
  and cellwise comparison with relative tolerance 1e-12 + absolute 1e-300. Stored
  working values are never rounded for this comparison. FNV is an accidental-change
  detector, not a cryptographic identity certificate. Summary comparison remains
  relative/absolute 1e-9; successful replay is not independent proof of an estimator.
- Final `check_trust.js`: 26 groups pass, including all 17 analysis kinds in Node
  and actual Python model exports. An earlier run failed its UI range-message
  assertion; the next two runs passed without a range-code change. This is an
  unresolved intermittent test/interaction observation, not a repaired range defect.
- `check_score_integrity.js` also passes; `check_stats.py` passes its fixed and strict
  gates. R script execution has not been verified (Rscript is unavailable).

## E5 acceptance record

Sensitivity follows parsed formula dependencies and the inputs to transformations,
recodes, scale/factor scores, predictions, missing/outlier flags, imputation, anomaly
outputs and reshaping. Prediction/factor eligibility filters are included. Appending
uses the stronger classification from either source; conflicting roles/levels and
inconsistent units/labels/bounds/value labels are cleared. Joins preserve payload
metadata and merge shared-key sensitivity. Type conversion retains column metadata.

- `node tests/check_sensitivity_integrity.js`: 20 groups at 1440px/400px, including
  actual formula action, redacted working CSV download, explicitly unredacted original
  download, both append orders, project round-trip, AST/name collisions, constants,
  nested formulas, type conversion, KNN donors, filter-dependent predictions, joins,
  pivots, factor/scale/anomaly outputs and actual completed-imputation save.
- `check_tags_patterns.js`: 42 checks. `check_new_features.js`: 46 checks, including
  actual exported Python execution. `check_stats.py` passes its fixed and strict gates.
- Scope: column metadata propagation and default working-CSV exclusion for these paths.
  These labels do not anonymize data or redact analysis/report text. Full projects,
  originals and replay scripts intentionally retain data and require sharing review.

## E6 acceptance record

Cohen agreement now reports exact-match proportions separately from weighted credit
and their chance baselines. Linear/quadratic weights use distances between ordered
category positions, including nonconsecutive numeric labels. Fleiss agreement is
labelled mean pairwise agreement, not unanimous rows. Correlated factor rotations
no longer claim pattern-loading square sums are additive variance explained.

Ordinal or normality-flagged compare/relate/paired results promote the computed
rank test to the primary summary, headline, evidence, assistant facts and write-up;
parametric statistics remain explicitly secondary. An ordinal regression outcome
refuses unsupported linear interpretation. Rank-effect confidence intervals are
not implemented: the interface states this and reports the effect plus approximate
p-value, without substituting a Pearson/mean interval. Small/tied samples still need
exact/permutation verification. This repair does not introduce a new rank estimator.

- `check_primary_interpretation.js`: 14 groups at 1440px/400px, including actual
  weighted controls, zero exact matches / 50% partial credit, pairwise/unanimous
  distinction, Spearman vs SciPy, rank comparisons/pairs, unsupported ordinal
  regression refusal and correlated-factor wording.
- `check_stats.py`: 141 fixed values plus the strict Welch gate. New raw/weighted
  agreement references use SciPy expected frequencies. Additional strict-tail cases
  use relative 1e-8 + absolute 1e-300, including p=7.14e-41 and p=4.01e-165.
  Mann–Whitney and kappa/Fleiss tails use the negative normal tail directly to avoid
  subtracting from one. 44/44 method groups pass.
- The E1 financial fixture has a normality flag in one group (p≈.0294). Its primary
  display is consequently now Mann–Whitney; the accurate Welch result p≈.0489879
  and its mean interval remain available in the labelled secondary summary. The
  E1 flow regression checks that secondary calculation and the exported replay.
- The 80 interpretation/integrity checks also pass in disk and local-server modes.
- Scope: these computed-primary and wording cases. This does not certify all
  assumption selection or supply missing rank-effect confidence intervals.

## E7 acceptance record

Plan validates active inputs against the supported ranges, preserves blank drafts
without reusing an old value, and blocks result/curve/sensitivity/write-up output
when invalid. Fractional sample/group/cluster counts are rejected. Effect fields
are explicit magnitudes; one-sided smaller calculations use the negative direction.
Unequal allocation uses an actual integer second-group size in the power calculation
and text. Recruitment is rounded to whole clusters, with design-effect inflation
identified as an approximation. Helpers retain zero and computed precision; alpha
and small effects are not rounded to zero in the justification.

Projects preserve plan settings and finite invalid drafts; malformed schema rejects
before live state changes. Legacy files without a plan get defaults. Open helper
and dropout sections stay open through input changes. Follow-up planning does not
silently turn a primary rank effect into a Pearson/mean model; Cramer's V converts
to Cohen's w using the displayed table's dimensions and transfers its df.

- `check_plan_integrity.js`: 18 groups at 1440px/400px, including all seven designs
  in three solve modes, 23 invalid configurations per width, actual input changes,
  helpers, unequal allocation, whole clusters, project download/open, real reload,
  atomic schema rejection and legacy defaults.
- `check_stats.py`: 148 fixed values plus the strict Welch gate; seven new planning
  values use SciPy's noncentral t/normal references and published Fisher-z formula.
  Example: n1=65, ratio=1.5 uses n2=98; recruiting for 160 independent observations,
  m=10, ICC=.05, dropout=10% produces 260 recruits in 26 whole clusters.
- 46 new-feature checks and 10 prediction/source-replay groups also pass.
- Scope: supported input ranges and these power-model cases. Clustering inflation
  does not provide a mixed-model power guarantee; correlation/proportion models
  remain approximations. A finite invalid draft can be saved but cannot yield prose.
