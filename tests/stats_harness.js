// Runs EKM's statistics on fixed data and prints JSON. Used by check_stats.py.
const fs = require("fs"), path = require("path");
const src = (f) => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8");
eval(src("stats.js") + src("stats2.js") + ";globalThis.S=S;globalThis.S2=S2;");
const a = [5.1,4.9,6.2,5.8,6.0,5.5,5.3,7.1,6.6,5.9,5.5,6.0], b = [4.1,4.5,5.0,4.8,5.2,4.4,4.9,4.7,4.9], c = [6.5,7.0,6.8,7.4,6.9,7.7,7.0];
const x = [1.2,2.3,2.1,3.8,4.0,4.4,5.9,6.1,7.3,8.8,9.1,10.5,11.2,12.0,30.0], y = [1.0,2.6,2.0,3.5,4.6,4.1,6.3,5.8,7.9,8.1,9.8,10.0,11.9,12.2,15.0];
const t = S.ttest(a, b), an = S.anova([a, b, c]), ch = S.chisq([[20,15,5],[10,25,25]]), co = S.correlate(x, y);
const o = S.ols(y, x.map((v, i) => [v, (i * 7) % 5]), ["x1", "x2"]);
const lg = S2.logistic([0,0,0,1,0,1,0,1,1,1,0,1,1,1,0,1], [[1],[2],[3],[4],[5],[6],[7],[8],[9],[10],[11],[12],[13],[14],[3.5],[2.5]], ["x"]);
console.log(JSON.stringify({
  welch_t: t.t, welch_df: t.df, welch_p: t.p, anova_F: an.F, anova_p: an.p, chi2: ch.x2, chi2_p: ch.p,
  pearson_r: co.r, pearson_p: co.p, spearman: co.rho, spearman_p: co.prho,
  ols_b1: o.coefs[1].b, ols_se1: o.coefs[1].se, ols_r2: o.r2,
  shapiro_W: S2.shapiro(a).W, shapiro_p: S2.shapiro(a).p, shapiro_skew_p: S2.shapiro(x).p,
  levene_F: S2.levene([a, b, c]).F, levene_p: S2.levene([a, b, c]).p,
  mannwhitney_U: S2.mannWhitney(a, b).U, mannwhitney_p: S2.mannWhitney(a, b).p,
  kruskal_H: S2.kruskal([a, b, c]).H, kruskal_p: S2.kruskal([a, b, c]).p,
  wilcoxon_T: S2.wilcoxon(x, y).T, wilcoxon_p: S2.wilcoxon(x, y).p,
  paired_t: S2.pairedT(x, y).t, paired_p: S2.pairedT(x, y).p,
  logit_b1: lg.coefs[1].b, logit_se1: lg.coefs[1].se, logit_p1: lg.coefs[1].p,
}));
