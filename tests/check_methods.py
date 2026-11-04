"""Compare EKM's study-planning, repeated/grouped, measurement, agreement, missing-data and model methods
with statsmodels, scikit-learn, pingouin and factor_analyzer.

Run: python3 tests/check_methods.py
Needs node on PATH and: pip install numpy scipy pandas statsmodels scikit-learn pingouin factor_analyzer
"""
import json, math, os, subprocess, sys
import numpy as np, pandas as pd, scipy.stats as st
import statsmodels.api as sm, statsmodels.formula.api as smf
from statsmodels.stats import power as smp
from statsmodels.stats.inter_rater import cohens_kappa, fleiss_kappa, aggregate_raters
import pingouin as pg
from factor_analyzer import FactorAnalyzer, calculate_kmo, calculate_bartlett_sphericity
from factor_analyzer.rotator import Rotator
from sklearn.linear_model import ElasticNet, Ridge, LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeRegressor, DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import KFold, GroupKFold, TimeSeriesSplit
from sklearn import metrics as skm
from sklearn.calibration import calibration_curve

HERE = os.path.dirname(os.path.abspath(__file__))
rs = np.random.RandomState(20251103)
D, ref, tol = {}, {}, {}

D["pnct"] = [[1.5, 10, 0.8], [-0.7, 4, 1.2], [2.2, 30, 2.5], [0.3, 7, -1.1], [3.1, 60, 4.0]]
ref["pnct"] = [st.nct.cdf(t, df, nc) for t, df, nc in D["pnct"]]
D["pncf"] = [[2.0, 3, 20, 4.0], [1.1, 2, 50, 10.0], [3.5, 4, 12, 0.5], [0.8, 1, 9, 2.0]]
ref["pncf"] = [st.ncf.cdf(f, a, b, l) for f, a, b, l in D["pncf"]]
D["pncx"] = [[3.0, 2, 1.5], [10.0, 4, 6.0], [25.0, 9, 12.0]]
ref["pncx"] = [st.ncx2.cdf(x, k, l) for x, k, l in D["pncx"]]
D["qt"] = [[0.975, 5], [0.9, 30], [0.995, 2.5], [0.6, 100]]
ref["qt"] = [st.t.ppf(p, df) for p, df in D["qt"]]
D["pow_tind"] = [[0.5, 64, 1, 0.05, "two-sided"], [0.3, 40, 2, 0.05, "larger"], [0.8, 12, 1.5, 0.01, "two-sided"], [-0.4, 50, 1, 0.05, "smaller"]]
ref["pow_tind"] = [smp.TTestIndPower().power(effect_size=d, nobs1=n, alpha=a, ratio=r, alternative=alt) for d, n, r, a, alt in D["pow_tind"]]
D["pow_tone"] = [[0.5, 34, 0.05, "two-sided"], [0.2, 100, 0.05, "larger"]]
ref["pow_tone"] = [smp.TTestPower().power(effect_size=d, nobs=n, alpha=a, alternative=alt) for d, n, a, alt in D["pow_tone"]]
D["pow_anova"] = [[0.25, 120, 3, 0.05], [0.4, 60, 4, 0.01]]
# statsmodels' FTestAnovaPower formula, evaluated with SciPy's exact noncentral F (statsmodels' ncf_sf wrapper is less precise)
ref["pow_anova"] = [st.ncf.sf(st.f.isf(a, k - 1, n - k), k - 1, n - k, f * f * n) for f, n, k, a in D["pow_anova"]]
D["pow_chisq"] = [[0.3, 88, 2, 0.05], [0.1, 500, 4, 0.05]]
ref["pow_chisq"] = [smp.GofChisquarePower().power(effect_size=w, nobs=n, alpha=a, n_bins=df + 1) for w, n, df, a in D["pow_chisq"]]
D["pow_prop"] = [[0.3, 100, 1, 0.05, "two-sided"], [0.5, 40, 2, 0.05, "larger"]]
ref["pow_prop"] = [smp.NormalIndPower().power(effect_size=h, nobs1=n, alpha=a, ratio=r, alternative=alt) for h, n, r, a, alt in D["pow_prop"]]
D["pow_reg"] = [[0.15, 80, 3, 0.05], [0.02, 400, 5, 0.05]]
ref["pow_reg"] = [st.ncf.sf(st.f.isf(a, k, n - k - 1), k, n - k - 1, f2 * n) for f2, n, k, a in D["pow_reg"]]
D["n_tind"] = [[0.5, 0.8], [0.2, 0.9], [1.0, 0.95]]
ref["n_tind"] = [math.ceil(smp.TTestIndPower().solve_power(effect_size=d, power=pw, alpha=0.05)) for d, pw in D["n_tind"]]
D["n_anova"] = [[0.25, 3, 0.8], [0.4, 5, 0.9]]
ref["n_anova"] = [math.ceil(smp.FTestAnovaPower().solve_power(effect_size=f, k_groups=k, power=pw, alpha=0.05)) for f, k, pw in D["n_anova"]]

# repeated measures: 18 subjects x 4 conditions with unequal variances (sphericity violated)
subj = rs.normal(0, 2, 18)[:, None]
Y = subj + np.array([0, 0.6, 1.1, 1.3]) + rs.normal(0, [0.5, 1.0, 1.6, 2.4], (18, 4))
D["rm"] = Y.round(4).tolist(); Y = np.array(D["rm"])
long = pd.DataFrame([(i, f"c{j}", Y[i, j]) for i in range(18) for j in range(4)], columns=["s", "c", "v"])
a1 = pg.rm_anova(long, dv="v", within="c", subject="s", correction=True, effsize="np2")
a2 = pg.rm_anova(long, dv="v", within="c", subject="s", effsize="ng2")
hf = pg.epsilon(long, dv="v", within="c", subject="s", correction="hf")
ref["rm"] = [a1["F"][0], a1["p-unc"][0], a1["np2"][0], a2["ng2"][0], a1["eps"][0], hf, a1["p-GG-corr"][0], a1["W-spher"][0], a1["p-spher"][0]]
fr = st.friedmanchisquare(*Y.T); ref["friedman"] = [fr.statistic, fr.pvalue]

# grouped data: 25 clusters, random intercepts and slopes
G, rows = 25, []
for g in range(G):
    u0, u1 = rs.normal(0, 1.2), rs.normal(0, 0.4)
    for _ in range(rs.randint(4, 12)):
        x = rs.normal(0, 1); rows.append((g, x, 2 + 0.7 * x + u0 + u1 * x + rs.normal(0, 1)))
mm = pd.DataFrame(rows, columns=["g", "x", "y"]).round(5)
D["mm"] = {"y": mm.y.tolist(), "X": [[1.0, v] for v in mm.x], "g": mm.g.tolist()}
f1 = smf.mixedlm("y ~ x", mm, groups=mm["g"]).fit(reml=True)
ref["mixed"] = [f1.fe_params[0], f1.fe_params[1], f1.bse_fe[0], f1.bse_fe[1], f1.cov_re.iloc[0, 0], f1.scale]
f2 = smf.mixedlm("y ~ x", mm, groups=mm["g"], re_formula="~x").fit(reml=True, method=["lbfgs"])
ref["mixed_slope"] = [f2.fe_params[1], f2.bse_fe[1], f2.cov_re.iloc[0, 0], f2.cov_re.iloc[1, 1], f2.cov_re.iloc[0, 1], f2.scale]
tol["mixed"] = 2e-4; tol["mixed_slope"] = 5e-3
co = sm.OLS(mm.y, sm.add_constant(mm.x)).fit(cov_type="cluster", cov_kwds={"groups": mm.g}, use_t=True)
ref["cluster"] = [co.params.iloc[1], co.bse.iloc[1], co.pvalues.iloc[1]]

# questionnaire: 6 items, two latent factors
n = 240; f_a, f_b = rs.normal(size=n), rs.normal(size=n)
items = np.column_stack([0.8 * f_a, 0.7 * f_a, 0.6 * f_a + 0.2 * f_b, 0.75 * f_b, 0.65 * f_b, 0.5 * f_b + 0.3 * f_a]) + rs.normal(0, 0.6, (n, 6))
items = np.round(items * 1.5 + 4, 3); D["items"] = items.tolist()
ca = pg.cronbach_alpha(pd.DataFrame(items)); ref["alpha"] = [ca[0], ca[1][0], ca[1][1]]; tol["alpha"] = 6e-4
R = np.corrcoef(items.T); ref["pca"] = sorted(np.linalg.eigvalsh(R))[::-1]
kmo = calculate_kmo(pd.DataFrame(items)); bt = calculate_bartlett_sphericity(pd.DataFrame(items)); ref["kmo"] = [kmo[1], bt[0], bt[1]]
fa = FactorAnalyzer(n_factors=2, rotation=None, method="minres").fit(items)
ref["paf"] = np.abs(fa.loadings_).tolist(); tol["paf"] = 2e-3
ref["varimax"] = np.abs(Rotator(method="varimax").fit_transform(fa.loadings_)).tolist(); tol["varimax"] = 3e-3
ref["promax"] = np.abs(Rotator(method="promax").fit_transform(fa.loadings_)).tolist(); tol["promax"] = 3e-3

# agreement
truth = rs.randint(1, 6, 150)
D["r1"] = [int(min(5, max(1, t + rs.choice([-1, 0, 0, 0, 1])))) for t in truth]
D["r2"] = [int(min(5, max(1, t + rs.choice([-1, 0, 0, 1, 2])))) for t in truth]
tab = pd.crosstab(pd.Categorical(D["r1"], categories=range(1, 6)), pd.Categorical(D["r2"], categories=range(1, 6)), dropna=False).values
ref["kappa"] = [[k.kappa, k.std_kappa] for k in (cohens_kappa(tab), cohens_kappa(tab, wt="linear"), cohens_kappa(tab, wt="quadratic"))]
fl = np.array([[min(4, max(0, t + rs.choice([-1, 0, 0, 1]))) for _ in range(4)] for t in rs.randint(0, 5, 60)])
D["fl"] = fl.tolist(); ref["fleiss"] = fleiss_kappa(aggregate_raters(fl)[0])
ic = rs.normal(10, 3, (30, 1)) + rs.normal(0, 1, (30, 4)) + np.array([0, 0.5, -0.3, 1.0]); ic = ic.round(3); D["ic"] = ic.tolist()
icl = pd.DataFrame([(i, j, ic[i, j]) for i in range(30) for j in range(4)], columns=["t", "r", "v"])
pi = pg.intraclass_corr(icl, targets="t", raters="r", ratings="v")
ref["icc"] = [[row.ICC, row.F, row.pval, row["CI95%"][0], row["CI95%"][1]] for _, row in pi.iterrows()]; tol["icc"] = 6e-3

# missing data: MAR missingness in two of three columns
n = 300; z = rs.normal(size=(n, 3)) @ np.array([[1, 0.5, 0.3], [0, 1, 0.4], [0, 0, 1]])
miss = z.copy(); miss[rs.rand(n) < 1 / (1 + np.exp(-z[:, 0])) * 0.35, 1] = np.nan; miss[rs.rand(n) < 0.15, 2] = np.nan
D["miss"] = [[None if np.isnan(v) else round(float(v), 5) for v in r] for r in miss]
Xm = np.array([[np.nan if v is None else v for v in r] for r in D["miss"]])
def little(X):
    n, p = X.shape; mu = np.nanmean(X, 0); S = np.diag(np.nanvar(X, 0, ddof=1))
    for _ in range(500):
        T1 = np.zeros(p); T2 = np.zeros((p, p))
        for r in X:
            m = np.isnan(r); o = ~m; x = r.copy(); C = np.zeros((p, p))
            if m.any():
                B = S[np.ix_(m, o)] @ np.linalg.inv(S[np.ix_(o, o)])
                x[m] = mu[m] + B @ (r[o] - mu[o]); C[np.ix_(m, m)] = S[np.ix_(m, m)] - B @ S[np.ix_(o, m)]
            T1 += x; T2 += np.outer(x, x) + C
        mu2 = T1 / n; S2 = T2 / n - np.outer(mu2, mu2); done = max(abs(mu2 - mu).max(), abs(S2 - S).max()) < 1e-10; mu, S = mu2, S2
        if done: break
    d2 = 0; df = 0
    for key in set(map(tuple, np.isnan(X))):
        rows = X[(np.isnan(X) == np.array(key)).all(1)]; o = ~np.array(key)
        if not o.any(): continue
        d = rows[:, o].mean(0) - mu[o]; d2 += len(rows) * d @ np.linalg.inv(S[np.ix_(o, o)]) @ d; df += o.sum()
    df -= p
    return [d2, df, st.chi2.sf(d2, df)], mu
lt, mu = little(Xm); ref["little"] = lt; ref["em_mu"] = mu.tolist()
Q, U = [1.02, 0.95, 1.10, 0.99, 1.05], [0.010, 0.012, 0.011, 0.009, 0.010]; D["pool"] = {"Q": Q, "U": U, "dfc": 96}
m = 5; qb = np.mean(Q); ub = np.mean(U); B = np.var(Q, ddof=1); T = ub + (1 + 1 / m) * B; lam = (1 + 1 / m) * B / T; r = (1 + 1 / m) * B / ub
dfo = (m - 1) / lam ** 2; dfb = (96 + 1) / (96 + 3) * 96 * (1 - lam); dfr = dfo * dfb / (dfo + dfb)
ref["pool"] = [qb, math.sqrt(T), dfr, 2 * st.t.sf(abs(qb / math.sqrt(T)), dfr), (r + 2 / (dfr + 3)) / (r + 1)]
xm = rs.normal(size=400); ym = 1 + 0.8 * xm + rs.normal(0, 1, 400); mice_d = np.column_stack([ym, xm])
mice_d[rs.rand(400) < 1 / (1 + np.exp(-(ym - 1))) * 0.5, 1] = np.nan
D["mice"] = [[round(float(a), 5), None if np.isnan(b) else round(float(b), 5)] for a, b in mice_d]

# models
n = 120; Xr = rs.normal(size=(n, 4)); Xr[:, 1] += 0.5 * Xr[:, 0]; yr = 1.5 * Xr[:, 0] - 2 * Xr[:, 1] + 0.3 * Xr[:, 2] + rs.normal(0, 1, n)
D["Xr"] = Xr.round(5).tolist(); D["yr"] = yr.round(5).tolist(); Xr = np.array(D["Xr"]); yr = np.array(D["yr"])
Zr = StandardScaler().fit_transform(Xr); D["enet"] = [[0.1, 1.0], [0.05, 0.5], [0.2, 0.0]]
ref["enet"] = [ElasticNet(alpha=a, l1_ratio=r, tol=1e-14, max_iter=10 ** 6).fit(Zr, yr).coef_.tolist() if r > 0 else Ridge(alpha=a * n).fit(Zr, yr).coef_.tolist() for a, r in D["enet"]]
tol["enet"] = 1e-6
Xc = rs.normal(size=(n, 3)); yc = (Xc[:, 0] - Xc[:, 1] + rs.normal(0, 1, n) > 0).astype(int)
D["Xc"] = Xc.round(5).tolist(); D["yc"] = yc.tolist(); Xc = np.array(D["Xc"])
ref["logit"] = LogisticRegression(C=1.0, tol=1e-12, max_iter=10 ** 5).fit(StandardScaler().fit_transform(Xc), yc).coef_[0].tolist(); tol["logit"] = 1e-5
ref["tree_reg"] = DecisionTreeRegressor(max_depth=3, random_state=0).fit(Xr, yr).predict(Xr).tolist()
ref["tree_cls"] = DecisionTreeClassifier(max_depth=3, random_state=0).fit(Xc, yc).predict_proba(Xc)[:, 1].tolist()
ref["rf_oob_acc"] = RandomForestClassifier(200, max_features=1, oob_score=True, random_state=0).fit(Xc, yc).oob_score_; tol["rf_oob_acc"] = 0.06
D["n_cv"] = 23; ref["kfold"] = [t.tolist() for _, t in KFold(5).split(np.zeros(23))]
D["groups"] = sum([[g] * s for g, s in zip("abcdefg", [7, 1, 5, 2, 6, 3, 4])], []); ref["gkf"] = [t.tolist() for _, t in GroupKFold(3).split(np.zeros(28), groups=D["groups"])]
ref["tss"] = [[len(a), int(b[0]), len(b)] for a, b in TimeSeriesSplit(4).split(np.zeros(23))]
yt = rs.randint(0, 2, 200); ps = np.clip(0.3 * yt + rs.uniform(0, 0.7, 200), 0, 1).round(4); D["yt"] = yt.tolist(); D["ps"] = ps.tolist()
pred = (ps >= 0.5).astype(int)
ref["metrics"] = [skm.roc_auc_score(yt, ps), skm.f1_score(yt, pred), skm.precision_score(yt, pred), skm.recall_score(yt, pred), skm.log_loss(yt, ps), skm.brier_score_loss(yt, ps), skm.balanced_accuracy_score(yt, pred)]
pt_, pp_ = calibration_curve(yt, ps, n_bins=5); ref["calib"] = [[a, b] for a, b in zip(pt_, pp_)]
D["noise"] = rs.normal(0, 0.5, n).round(5).tolist(); yp = yr + np.array(D["noise"])
ref["regm"] = [skm.r2_score(yr, yp), math.sqrt(skm.mean_squared_error(yr, yp)), skm.mean_absolute_error(yr, yp)]

ekm = json.loads(subprocess.run(["node", os.path.join(HERE, "methods_harness.js")], input=json.dumps(D), capture_output=True, text=True, check=True).stdout)

def flat(v): return [x for y in v for x in flat(y)] if isinstance(v, (list, tuple, np.ndarray)) else [float(v)]
def match_cols(a, b):   # factor columns can come out in a different order
    a, b = np.array(a), np.array(b)
    if a.shape[1] == 2 and np.abs(a - b[:, ::-1]).max() < np.abs(a - b).max(): b = b[:, ::-1]
    return a.tolist(), b.tolist()
fails = 0; total = 0
for key in ref:
    got, want = ekm[key], ref[key]
    if key in ("paf", "varimax", "promax"): got, want = match_cols(got, want)
    g, w = flat(got), flat(want); t = tol.get(key, 1e-6)
    ok = len(g) == len(w) and all(abs(a - b) <= t * max(1, abs(b)) for a, b in zip(g, w))
    if key == "kfold" or key == "gkf": ok = got == want
    total += 1; fails += not ok
    print(("PASS" if ok else "FAIL").ljust(5), key.ljust(12), " ".join("%.6g" % v for v in g[:6]), "| ref", " ".join("%.6g" % v for v in w[:6]))
    if not ok: print("      all:", g, "\n      ref:", w)
lo, hi = ekm["mice"][1], ekm["mice"][2]; ok = lo < 0.8 < hi and abs(ekm["mice"][0] - 0.8) < 0.15
total += 1; fails += not ok
print(("PASS" if ok else "FAIL").ljust(5), "mice".ljust(12), "pooled slope %.3f, 95%% CI %.3f to %.3f covers the true 0.8" % tuple(ekm["mice"]))
print(f"\n{total - fails} of {total} method groups match the reference libraries")
sys.exit(1 if fails else 0)
