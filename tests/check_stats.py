"""Compare EKM's in-browser statistics with SciPy.  Run: python3 tests/check_stats.py
Needs node on PATH and numpy + scipy installed (pip install numpy scipy)."""
import json, os, subprocess, sys
import numpy as np, scipy.stats as st

HERE = os.path.dirname(os.path.abspath(__file__))
ekm = json.loads(subprocess.check_output(["node", os.path.join(HERE, "stats_harness.js")]))

a = [5.1,4.9,6.2,5.8,6.0,5.5,5.3,7.1,6.6,5.9,5.5,6.0]; b = [4.1,4.5,5.0,4.8,5.2,4.4,4.9,4.7,4.9]; c = [6.5,7.0,6.8,7.4,6.9,7.7,7.0]
x = [1.2,2.3,2.1,3.8,4.0,4.4,5.9,6.1,7.3,8.8,9.1,10.5,11.2,12.0,30.0]; y = [1.0,2.6,2.0,3.5,4.6,4.1,6.3,5.8,7.9,8.1,9.8,10.0,11.9,12.2,15.0]
t = st.ttest_ind(a, b, equal_var=False); f = st.f_oneway(a, b, c); ch = st.chi2_contingency([[20,15,5],[10,25,25]], correction=False)
p = st.pearsonr(x, y); s = st.spearmanr(x, y)
X = np.column_stack([np.ones(15), x, [(i * 7) % 5 for i in range(15)]]); bb = np.linalg.lstsq(X, y, rcond=None)[0]; res = y - X @ bb
se = np.sqrt(np.diag(res @ res / 12 * np.linalg.inv(X.T @ X)))
yy = np.array([0,0,0,1,0,1,0,1,1,1,0,1,1,1,0,1.]); XL = np.column_stack([np.ones(16), [1,2,3,4,5,6,7,8,9,10,11,12,13,14,3.5,2.5]]); bl = np.zeros(2)
for _ in range(60):
    pr = 1 / (1 + np.exp(-XL @ bl)); H = XL.T @ (XL * (pr * (1 - pr))[:, None]); bl += np.linalg.solve(H, XL.T @ (yy - pr))
sel = np.sqrt(np.diag(np.linalg.inv(H)))
ref = {
  "welch_t": t.statistic, "welch_df": t.df, "welch_p": t.pvalue, "anova_F": f.statistic, "anova_p": f.pvalue, "chi2": ch.statistic, "chi2_p": ch.pvalue,
  "pearson_r": p.statistic, "pearson_p": p.pvalue, "spearman": s.statistic, "spearman_p": s.pvalue,
  "ols_b1": bb[1], "ols_se1": se[1], "ols_r2": 1 - res @ res / ((y - np.mean(y)) @ (y - np.mean(y))),
  "shapiro_W": st.shapiro(a).statistic, "shapiro_p": st.shapiro(a).pvalue, "shapiro_skew_p": st.shapiro(x).pvalue,
  "levene_F": st.levene(a, b, c, center="median").statistic, "levene_p": st.levene(a, b, c, center="median").pvalue,
  "mannwhitney_U": st.mannwhitneyu(a, b, method="asymptotic").statistic, "mannwhitney_p": st.mannwhitneyu(a, b, method="asymptotic").pvalue,
  "kruskal_H": st.kruskal(a, b, c).statistic, "kruskal_p": st.kruskal(a, b, c).pvalue,
  "wilcoxon_T": st.wilcoxon(x, y, method="approx").statistic, "wilcoxon_p": st.wilcoxon(x, y, method="approx").pvalue,
  "paired_t": st.ttest_rel(x, y).statistic, "paired_p": st.ttest_rel(x, y).pvalue,
  "logit_b1": bl[1], "logit_se1": sel[1], "logit_p1": 2 * st.norm.sf(abs(bl[1] / sel[1])),
}
bad = 0
for k, v in ref.items():
    ok = abs(ekm[k] - float(v)) <= 1e-6 * max(1.0, abs(float(v)))
    bad += not ok
    print(("PASS " if ok else "FAIL ") + k.ljust(16), "%.10g" % ekm[k], "%.10g" % float(v))
print("\n%d of %d match SciPy" % (len(ref) - bad, len(ref)))
sys.exit(1 if bad else 0)
