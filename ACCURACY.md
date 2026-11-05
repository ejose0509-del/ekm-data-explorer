# Accuracy repair ledger

Each entry is a separate repair. Passing one entry does not certify another.
No design changes are part of these repairs. Cases use represented input values;
rounding done before import cannot be recovered. Numerical tolerances are explicit.

| ID | Issue | Status | Required evidence |
|---|---|---|---|
| E1 | Welch cancellation with a large common baseline | Verified for the acceptance cases below | Decimal moments + SciPy tails and CI; offset/scale/order cases; actual import, analysis and exported replay |
| E2 | Refresh loses metadata, exclusions, source fidelity and rollback | Verified for the acceptance cases below | Reordered stable IDs, no-ID refusal, changed schema, replay failure rollback, latest-request handling, original CSV and project round-trip |
| E3 | PCA/factor score columns refit excluded data | Pending | Same fitted parameters and eligible rows as displayed; scores and replay verified |
| E4 | Prediction recipes omit validation context; duplicate source headers fail replay | Pending | Gap/filter preservation, original-header mapping and generated workflow execution |
| E5 | Sensitivity lost in append and derived columns | Pending | Conservative metadata propagation, CSV exclusion and project persistence |
| E6 | Weighted agreement and ordinal interpretation mismatch | Pending | Raw vs weighted agreement explicitly separated; headline uses selected primary statistic |
| E7 | Plan invalid input and lost settings | Pending | Domain validation, no invalid result/write-up, project save/open and reload |
| E8 | Rare-class CV averages undefined folds | Pending | Validation uses a feasible split or refuses it explicitly; valid fold counts match headline |

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
