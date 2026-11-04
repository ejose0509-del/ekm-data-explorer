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

edge_x = np.array([1.,2.,3.,4.,5.]); edge_y = np.array([1.,3.,2.,5.,4.])
for name, scale in [('large',1e150),('tiny',1e-150),('huge',1e300),('subnormal',1e-300)]:
    corr = st.pearsonr(edge_x*scale,edge_y*scale); ci=corr.confidence_interval()
    for key, value in zip(['r','p','ciLo','ciHi'], [corr.statistic,corr.pvalue,ci.low,ci.high]): ref[name+'_'+key]=value
    ref[name+'_sd_unit']=np.std(edge_x,ddof=1); ref[name+'_screen']=corr.statistic
for name, xx, yy in [('three',[1.,2.,3.],[1.,3.,2.]),('offset',edge_x+1e12,edge_y+1e12),('perfect',edge_x,edge_x),('negative',edge_x,-edge_x)]:
    corr=st.pearsonr(xx,yy);ci=corr.confidence_interval()
    for key,value in zip(['r','p','ciLo','ciHi'],[corr.statistic,corr.pvalue,ci.low,ci.high]):ref[name+'_'+key]=value
for name in ['large','tiny']:
    for key,value in [('t',t.statistic),('df',t.df),('p',t.pvalue),('diff_unit',np.mean(a)-np.mean(b)),('lo_unit',t.confidence_interval().low),('hi_unit',t.confidence_interval().high)]:ref[name+'_welch_'+key]=value
    ref[name+'_anova_F']=f.statistic;ref[name+'_anova_p']=f.pvalue
ref['mean_huge_unit']=np.mean([1.,1.,1.]);ref['mean_smallest_unit']=np.mean([np.nextafter(0.,1.)]*3)/np.nextafter(0.,1.)
for name in ['large','tiny']:
    ref[name+'_shapiro_W']=st.shapiro(a).statistic;ref[name+'_shapiro_p']=st.shapiro(a).pvalue
independent = st.chi2_contingency([[12,12],[12,12],[12,12]], correction=False)
ref['chi2_independent']=independent.statistic;ref['chi2_independent_p']=independent.pvalue;ref['chi2_independent_n']=np.sum([[12,12],[12,12],[12,12]])
critical=1.959964
for name,d,n1,n2 in [('zero',0,20,20),('small',.05,24,48),('medium',.5,20,30),('negative',-.5,20,30)]:
    delta=abs(d)/np.sqrt(1/n1+1/n2);ref['power_d_'+name]=st.norm.sf(critical-delta)+st.norm.cdf(-critical-delta)
for name,r,n in [('zero',0,30),('medium',.3,30),('negative',-.3,30)]:
    delta=abs(np.arctanh(r))*np.sqrt(n-3);ref['power_r_'+name]=st.norm.sf(critical-delta)+st.norm.cdf(-critical-delta)
# Standard silhouette uses mean pairwise within/nearest-cluster distances.
from scipy.spatial.distance import cdist
points = np.array([[0.,0.],[0.,1.],[1.,0.],[8.,8.],[8.,9.],[9.,8.]])
def silhouette(points, labels):
    labels = np.array(labels); distances = cdist(points, points)
    values = []
    for i in range(len(points)):
        same = np.flatnonzero(labels == labels[i]); same = same[same != i]
        if not len(same): values.append(0.); continue
        a = distances[i, same].mean()
        b = min(distances[i, labels == label].mean() for label in set(labels) if label != labels[i])
        values.append((b-a)/max(a,b) if max(a,b) else 0.)
    return np.mean(values)
ref['discover_silhouette'] = silhouette(points, [0,0,0,1,1,1])
ref['discover_singleton_silhouette'] = silhouette(np.vstack([points,[20.,20.]]), [0,0,0,1,1,1,2])
r = st.pearsonr([1,2,3,4,5,6,7,8], [2,1,4,3,6,5,8,7])
for name in ['huge','tiny']:
    ref['discover_'+name+'_r'] = r.statistic; ref['discover_'+name+'_p'] = r.pvalue
missing_x = np.array([1.,2.,np.nan,4.,5.,6.,7.,8.,9.,10.,11.,12.]); missing_y = np.array([3.,np.nan,4.,1.,7.,6.,np.nan,9.,8.,10.,11.,12.])
mask = np.isfinite(missing_x) & np.isfinite(missing_y); missing_rank = st.spearmanr(missing_x[mask], missing_y[mask])
ref['discover_missing_r'] = missing_rank.statistic; ref['discover_missing_p'] = missing_rank.pvalue
bad = 0
for k, v in ref.items():
    actual=ekm.get(k)
    ok = actual is not None and abs(actual - float(v)) <= 1e-6 * max(1.0, abs(float(v)))
    bad += not ok
    print(('PASS ' if ok else 'FAIL ') + k.ljust(24), str(actual) if actual is None else '%.10g' % actual, '%.10g' % float(v))
print('\n%d of %d match SciPy' % (len(ref) - bad, len(ref)))
sys.exit(1 if bad else 0)
