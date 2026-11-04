// Runs EKM's newer methods (S3, ML) on data from check_methods.py (JSON on stdin) and prints JSON results.
const fs = require("fs"), path = require("path");
const src = (f) => fs.readFileSync(path.join(__dirname, "..", "src", f), "utf8");
eval(src("core.js").split("\n").filter((l) => /^function am(in|ax)\(/.test(l)).join("\n") + src("stats.js") + src("stats2.js") + src("stats3.js") + src("ml.js") + ";globalThis.S=S;globalThis.S2=S2;globalThis.S3=S3;globalThis.ML=ML;");
const D = JSON.parse(fs.readFileSync(0, "utf8")), out = {};
const P = S3.power;
// distributions and power
out.pnct = D.pnct.map(([t, df, nc]) => S3.pnct(t, df, nc));
out.pncf = D.pncf.map(([f, a, b, l]) => S3.pncf(f, a, b, l));
out.pncx = D.pncx.map(([x, k, l]) => S3.pncchisq(x, k, l));
out.qt = D.qt.map(([p, df]) => S3.qt(p, df));
out.pow_tind = D.pow_tind.map(([d, n, r, a, alt]) => P.tInd(d, n, r, a, alt));
out.pow_tone = D.pow_tone.map(([d, n, a, alt]) => P.tOne(d, n, a, alt));
out.pow_anova = D.pow_anova.map(([f, n, k, a]) => P.anova(f, n, k, a));
out.pow_chisq = D.pow_chisq.map(([w, n, df, a]) => P.chisq(w, n, df, a));
out.pow_prop = D.pow_prop.map(([h, n, r, a, alt]) => P.prop(h, n, r, a, alt));
out.pow_reg = D.pow_reg.map(([f2, n, k, a]) => P.regress(f2, n, k, a));
out.n_tind = D.n_tind.map(([d, pw]) => S3.solveN((n) => P.tInd(d, n, 1, 0.05, "two-sided"), pw));
out.n_anova = D.n_anova.map(([f, k, pw]) => S3.solveN((n) => P.anova(f, n, k, 0.05), pw, k + 1));
// repeated measures
const rm = S3.rmAnova(D.rm), fr = S3.friedman(D.rm);
out.rm = [rm.F, rm.p, rm.eta2p, rm.eta2g, rm.eps.gg, rm.eps.hf, rm.pGG, rm.mauchly.W, rm.mauchly.p];
out.friedman = [fr.Q, fr.p];
// mixed models and cluster-robust OLS
const mx = S3.mixed(D.mm.y, D.mm.X, D.mm.X.map(() => [1]), D.mm.g, ["Intercept", "x"]);
out.mixed = [mx.fe[0].b, mx.fe[1].b, mx.fe[0].se, mx.fe[1].se, mx.Psi[0][0], mx.scale];
const ms = S3.mixed(D.mm.y, D.mm.X, D.mm.X, D.mm.g, ["Intercept", "x"]);
out.mixed_slope = [ms.fe[1].b, ms.fe[1].se, ms.Psi[0][0], ms.Psi[1][1], ms.Psi[0][1], ms.scale];
const cl = S3.clusterOLS(D.mm.y, D.mm.X, D.mm.g, ["Intercept", "x"]);
out.cluster = [cl.coefs[1].b, cl.coefs[1].se, cl.coefs[1].p];
// measurement
const al = S3.alpha(D.items);
out.alpha = [al.alpha, al.lo, al.hi];
const C = S3.corrMatrix(D.items).R, pc = S3.pca(C), kb = S3.kmoBartlett(C, D.items.length);
out.pca = pc.values; out.kmo = [kb.kmo, kb.chi2, kb.p];
const fa = S3.paf(C, 2);
out.paf = fa.loadings.map((r) => r.map(Math.abs));
out.varimax = S3.varimax(fa.loadings, true).loadings.map((r) => r.map(Math.abs));
out.promax = S3.promax(fa.loadings, 4).loadings.map((r) => r.map(Math.abs));
// agreement
out.kappa = [null, "linear", "quadratic"].map((w) => { const k = S3.kappa(D.r1, D.r2, w); return [k.kappa, k.se]; });
out.fleiss = S3.fleiss(D.fl).kappa;
out.icc = S3.icc(D.ic).forms.map((f) => [f.icc, f.F, f.p, f.lo, f.hi]);
// missing data
const lm = S3.littleMCAR(D.miss);
out.little = [lm.chi2, lm.df, lm.p];
out.em_mu = lm.mu;
out.pool = (() => { const r = S3.pool(D.pool.Q, D.pool.U, D.pool.dfc); return [r.est, r.se, r.df, r.p, r.fmi]; })();
// mice recovers a known slope on MAR data
const imps = S3.mice(D.mice, 20, {seed: 11});
const fits = imps.map((d) => { const o = S.ols(d.map((r) => r[0]), d.map((r) => [r[1]]), ["x"]); return [o.coefs[1].b, o.coefs[1].se * o.coefs[1].se]; });
const pm = S3.pool(fits.map((f) => f[0]), fits.map((f) => f[1]), D.mice.length - 2);
out.mice = [pm.est, pm.lo, pm.hi];
// models
out.enet = D.enet.map(([a, r]) => ML.enet(D.Xr, D.yr, a, r).std);
out.logit = ML.logit(D.Xc, D.yc, 1).std;
const tr = ML.tree(D.Xr, D.yr, {maxDepth: 3});
out.tree_reg = D.Xr.map((x) => ML.treePredict(tr, x));
const tc = ML.tree(D.Xc, D.yc, {maxDepth: 3, classes: 2});
out.tree_cls = D.Xc.map((x) => ML.treePredict(tc, x)[1]);
const rf = ML.forest(D.Xc, D.yc, {trees: 200, classes: 2, maxFeatures: 1, rnd: ML.rng(5)});
out.rf_oob_acc = rf.oob.filter(Boolean).reduce((s, p, i, a) => s, 0);
{ let hit = 0, n = 0; rf.oob.forEach((p, i) => { if (p) { n++; if ((p[1] >= 0.5 ? 1 : 0) === D.yc[i]) hit++; } }); out.rf_oob_acc = hit / n; }
out.kfold = ML.kfold(D.n_cv, 5).map((f) => f.test);
out.gkf = ML.groupKFold(D.groups, 3).map((f) => f.test);
out.tss = ML.timeSplit(D.n_cv, 4).map((f) => [f.train.length, f.test[0], f.test.length]);
const cm = ML.clsMetrics(D.yt, D.ps);
out.metrics = [cm.auc, cm.f1, cm.precision, cm.recall, cm.logloss, cm.brier, cm.balanced];
out.calib = ML.calibration(D.yt, D.ps, 5).bins.map((b) => [b.obs, b.pred]);
const rmm = ML.regMetrics(D.yr, D.yr.map((v, i) => v + D.noise[i]));
out.regm = [rmm.r2, rmm.rmse, rmm.mae];
console.log(JSON.stringify(out));
