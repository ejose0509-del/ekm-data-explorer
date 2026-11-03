"""Build EKM into one self-contained page: python3 build.py  ->  dist/index.html

The modules are concatenated into a single <script> in this order. Order matters:
later modules extend earlier ones by wrapping functions (runAnalysis, render,
formula, caption, toolsBar, VIEWS.*). Add new modules at the end unless they must
run before something that wraps them.
"""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
MODULES = [
    "core.js",       # router, esc(), render(), nav(), tabs
    "stats.js",      # S: describe, t-test, ANOVA, chi-square, correlation, OLS
    "stats2.js",     # S2: Shapiro-Wilk, Levene, rank tests, paired, logistic, power, Bayes
    "analyzer.js",   # datasets, parsing, private storage, Your data / Analyze / Charts views
    "enhancer.js",   # Clean & enhance: health checks, fixes, history, Isolation Forest
    "empty.js",      # first-run previews for every tab
    "features.js",   # assumption checks, post-hoc, paired/logistic/pivot, APA, next steps, Ask
    "datatools.js",  # formula columns, join, wide/long, replay steps
    "export.js",     # downloads (SVG/PNG/report/CSV/steps) and team sharing
    "deep.js",       # Go deeper: worked steps, plots, simulation, sampling, fits, predict, correlation map
    "space.js",      # 3D view and 3D chart type
    "writeup.js",    # Write-up tab and Reviewer 2
]


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()


def build():
    page = read("index.template.html")
    js = "\n".join("// ===== %s =====\n%s" % (m, read(m)) for m in MODULES)
    page = page.replace("/*@CSS@*/", read("theme.css")).replace("/*@JS@*/", js)
    os.makedirs(os.path.join(ROOT, "dist"), exist_ok=True)
    out = os.path.join(ROOT, "dist", "index.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print("wrote %s (%d bytes)" % (os.path.relpath(out, ROOT), len(page)))


if __name__ == "__main__":
    build()
