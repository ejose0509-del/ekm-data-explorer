"""Build EKM into one self-contained page: python3 build.py  ->  dist/index.html

The modules are concatenated into a single <script> in this order. Order matters:
later modules extend earlier ones by wrapping functions (runAnalysis, render,
formula, caption, toolsBar, VIEWS.*). Add new modules at the end unless they must
run before something that wraps them.
"""
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
MODULES = [
    "core.js",       # router, esc(), render(), nav(), tabs
    "stats.js",      # S: describe, t-test, ANOVA, chi-square, correlation, OLS
    "stats2.js",     # S2: Shapiro-Wilk, Levene, rank tests, paired, logistic, power, Bayes
    "stats3.js",     # S3: exact power, repeated measures, mixed models, reliability, factors, agreement, missing data
    "ml.js",         # ML: trees, forests, penalized regression, validation schemes, metrics
    "analyzer.js",   # datasets, parsing, private storage, Your data / Analyze / Charts views
    "enhancer.js",   # Clean & enhance: health checks, fixes, history, Isolation Forest
    "empty.js",      # first-run previews for every tab
    "features.js",   # assumption checks, post-hoc, paired/logistic/pivot, APA, next steps, Ask
    "datatools.js",  # formula columns, join, wide/long, replay steps
    "export.js",     # downloads (SVG/PNG/report/CSV/steps) and team sharing
    "deep.js",       # Go deeper: worked steps, plots, simulation, sampling, fits, predict, correlation map
    "space.js",      # 3D view and 3D chart type
    "writeup.js",    # Write-up tab
    "assistant.js",  # Offline questions, explanations, and write-up review
    "local-model.js", # Opt-in loopback Python/Ollama evidence selection
    "methods.js",     # Repeated measures, grouped data, reliability, factor analysis, agreement, missing data
    "modeling.js",    # Predict an outcome: cross-validated models, importance, calibration
    "reliability.js", # Validity gate for interpretable results
    "project.js",     # Browser downloads, project files and local persistence
    "input-integrity.js", # Source-preserving import and type settings
    "responsive-checks.js", # Cancellable relationship scans and focus retention
    "editing.js",     # Editable grid, filter conditions, labels and units, recoding, appending, join types
    "plan.js",        # Plan tab: sample size, power and sensitivity
    "workflow.js",    # Reproducible workflow, Python/R scripts, audit trail, project metadata
    "publish.js",     # Large files, Parquet, cached column work, Word/PDF export, figure options
    "connect.js",     # Import from links and SQLite, scheduled refresh, team workspace
    "trust.js",       # Versioned results and explicit data-quality rules
    "verified-export.js", # Exact model replay and score checks in Python/R
    "layout.js",      # Analysis menu grouped by purpose
    "tags.js",        # Column roles, levels, sensitivity and topics; row tags; dataset tags
    "explain.js",     # Plain headline, everyday effect sizes, how sure, reading level, glossary, data overview
    "discover.js",    # Discover tab: pattern scan with held-out confirmation
    "websearch.js",   # External web context through local mode
    "aoport.js",      # Exact ports of Auto Ontology's PII rules and date-format inference (Apache-2.0)
    "ontology.js",    # Glossary tab: catalog, join inference, terms, certification, formulas, coverage, model YAML
    "aolocal.js",     # Local mode: AI glossary drafts, AI PII review, AI-written answers and SQL, more databases
    "welcome.js",     # Home tab, everyday analysis names and plainer page copy, ID columns never defaults
    "settings.js",    # Settings (top right): local AI model, reading level, chart defaults, privacy and storage
    "autosave.js",    # Private autosave: browser, IndexedDB for large projects, and the person's own Claude storage
    "polish.js",      # Real-data test fixes: report wording, plain-word assistant, coded columns, page order, long-format hint
]
VENDOR = ["vendor/parquet.js"]  # third-party bundles, each in its own <script> (licences in src/vendor)


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()


def build():
    page = read("index.template.html")
    js = "\n".join("// ===== %s =====\n%s" % (m, read(m)) for m in MODULES)
    js = "var EKM_STATS_SOURCE = " + json.dumps(read("stats.js")) + ";\n" + js
    js = "var EKM_METHOD_SOURCE = " + json.dumps("\n".join(read(f) for f in ["stats.js", "stats2.js", "stats3.js", "ml.js"])) + ";\n" + js
    replay = "\n".join(read(m) for m in MODULES if m not in ["verified-export.js", "layout.js"])
    js = "var EKM_REPLAY_SOURCE = " + json.dumps(replay) + ";\n" + js
    vendor = "\n".join(read(v).replace("</script", "<\\/script") for v in VENDOR)
    page = page.replace("/*@CSS@*/", read("theme.css")).replace("/*@VENDOR@*/", vendor).replace("/*@JS@*/", js)
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    out = os.path.join(ROOT, "dist", "index.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print("wrote %s (%d bytes)" % (os.path.relpath(out, ROOT), len(page)))


if __name__ == "__main__":
    build()
