// ---------- Predict an outcome: regularized regression, trees and forests, honest validation, calibration ----------
KINDS.push(["model", "Predict an outcome"]);
KIND_HELP.model = "How well can the other columns predict this one on rows the model has not seen? (cross-validated linear, penalized, tree and forest models)";
var MOD = {res: null, key: "", busy: "", compare: null, compareKey: ""};
var MODELS = {
  reg: [["linear", "Linear regression"], ["ridge", "Ridge (L2 penalty)"], ["lasso", "Lasso (L1 penalty)"], ["enet", "Elastic net"], ["tree", "Decision tree"], ["forest", "Random forest"]],
  cls: [["logistic", "Logistic regression"], ["tree", "Decision tree"], ["forest", "Random forest"]],
  multi: [["tree", "Decision tree"], ["forest", "Random forest"]]
};
var SCHEMES = [["k2", "2-fold cross-validation"], ["k5", "5-fold cross-validation"], ["k10", "10-fold cross-validation"], ["group", "Grouped folds (keep each group together)"], ["time", "Time-ordered (train on past, test on future)"], ["holdout", "Single holdout (approximately 80/20)"]];

function modelSetup(ds) {
  var s = A.sel, rows = filterRows(ds), ti = idxOf(ds, s.mt), tc = ds.cols[ti];
  var preds = (s.mp || []).filter(function (n) { var j = idxOf(ds, n); return j >= 0 && n !== s.mt && ds.cols[j].type !== "text" && ds.cols[j].type !== "empty"; });
  var parts = preds.map(function (n) { var j = idxOf(ds, n), c = ds.cols[j]; if (isNum(c)) return {name: n, j: j, num: true}; var u = Object.create(null); rows.forEach(function (r) { if (r[j] != null) u[r[j]] = 1; }); return {name: n, j: j, num: false, levels: Object.keys(u).sort()}; });
  var names = [], group = []; parts.forEach(function (p, pi) { if (p.num) { names.push(p.name); group.push(pi); } else p.levels.slice(1).forEach(function (l) { names.push(p.name + " = " + l); group.push(pi); }); });
  var task = isNum(tc) ? "reg" : "cls", classes = [], X = [], y = [], keep = [], dropped = 0, gi = idxOf(ds, s.mvg), oi = idxOf(ds, s.mvt);
  if (task === "cls") { var u = Object.create(null); rows.forEach(function (r) { if (r[ti] != null) u[r[ti]] = (u[r[ti]] || 0) + 1; }); classes = Object.keys(u).sort(function (a, b) { return u[b] - u[a]; }); if (classes.length > 2) task = "multi"; }
  if (task === "cls") { if (!s.mpos || classes.indexOf(s.mpos) < 0) s.mpos = classes.filter(function (c) { return /^(yes|y|true|1|positive|pos|pass(ed)?|success|event|case|died|death|sick|ill)$/i.test(c); })[0] || classes[classes.length - 1]; classes = [classes.filter(function (c) { return c !== s.mpos; })[0], s.mpos]; }
  rows.forEach(function (r, i) {
    var t = r[ti]; if (t == null || (task !== "reg" && classes.indexOf(String(t)) < 0)) { dropped++; return; }
    var x = [], ok = true;
    parts.forEach(function (p) { var v = r[p.j]; if (p.num) { if (typeof v !== "number") ok = false; x.push(v); } else { if (v == null) ok = false; p.levels.slice(1).forEach(function (l) { x.push(String(v) === l ? 1 : 0); }); } });
    if (s.mv === "group" && (gi < 0 || r[gi] == null)) ok = false;
    if (s.mv === "time" && (oi < 0 || r[oi] == null)) ok = false;
    if (!ok) { dropped++; return; }
    X.push(x); y.push(task === "reg" ? t : classes.indexOf(String(t))); keep.push(i);
  });
  var orderError = "";
  var groups = s.mv === "group" ? keep.map(function (i) { return String(rows[i][gi]); }) : null, order = null;
  if (s.mv === "time") {   // sort rows by the time column so folds run past → future
    order = keep.map(function (i) { var v = rows[i][oi];
      if (typeof v === "number" && isFinite(v)) return v;
      var t = String(v), valid = typeof validDateValue === "function" && validDateValue(t);
      // ISO timestamps require an explicit timezone and a real calendar date.
      if (!valid && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(t)) valid = validDateValue(t.slice(0, 10)) && isFinite(Date.parse(t));
      if (!valid) { orderError = "Time order needs valid ISO dates/timestamps or finite numbers. Correct invalid or missing order values first."; return NaN; }
      return Date.parse(t.length === 7 ? t + "-01" : t);
    });
    if (oi < 0 || rows.some(function (r) { return r[oi] == null; })) orderError = "Choose a time column with valid ordering values for every row.";
    var tk = order.map(function (v, i) { return [v, i]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; }).map(function (p) { return p[1]; });
    X = tk.map(function (t) { return X[t]; }); y = tk.map(function (t) { return y[t]; }); keep = tk.map(function (t) { return keep[t]; }); order = tk.map(function (t) { return order[t]; });
  }
  return {settings: JSON.parse(JSON.stringify(s)), order: order, gap: Math.max(0, Math.floor(+s.mgap || 0)), err: orderError, task: task, X: X, y: y, names: names, group: group, parts: parts, classes: classes, groups: groups, keep: keep, dropped: dropped, rows: rows};
}
function foldsFor(st, scheme, seed) {
  var n = st.y.length, rnd = ML.rng(seed || 31);
  if (scheme === "group") return ML.groupKFold(st.groups, Math.min(5, Object.keys(st.groups.reduce(function (o, g) { o[g] = 1; return o; }, Object.create(null))).length));
  if (scheme === "time") {
    if (st.err || !st.order) return [];
    var times = [], buckets = []; st.order.forEach(function (v, i) { if (!times.length || times[times.length - 1] !== v) { times.push(v); buckets.push([]); } buckets[buckets.length - 1].push(i); });
    var kTime = Math.min(5, times.length - 1);
    if (kTime < 1) return [];
    return ML.timeSplit(times.length, kTime).map(function (f) {
      var last = f.test[0] - st.gap, train = [], test = [];
      f.train.forEach(function (j) { if (j < last) train = train.concat(buckets[j]); });
      f.test.forEach(function (j) { test = test.concat(buckets[j]); });
      return {train: train, test: test};
    });
  }
  if (scheme === "holdout") {
    if (st.task === "reg") return [ML.kfold(n, 5, rnd)[0]];
    var test = [], train = [];
    st.classes.forEach(function (_, c) { var indices = []; st.y.forEach(function (v, i) { if (v === c) indices.push(i); });
      for (var q = indices.length - 1; q > 0; q--) { var j = Math.floor(rnd() * (q + 1)), tmp = indices[q]; indices[q] = indices[j]; indices[j] = tmp; }
      var take = Math.max(1, Math.min(indices.length - 1, Math.round(indices.length * .2))); test = test.concat(indices.slice(0, take)); train = train.concat(indices.slice(take));
    });
    return [{train: train.sort(function (a, b) { return a - b; }), test: test.sort(function (a, b) { return a - b; })}];
  }
  var k = scheme === "k10" ? 10 : scheme === "k2" ? 2 : 5;
  return st.task === "reg" ? ML.kfold(n, k, rnd) : ML.stratified(st.y, k, rnd);
}
function pickRows(M, idx) { return idx.map(function (i) { return M[i]; }); }
function tune(model, X, y, task) {   // inner 3-fold CV over a grid of penalties; returns the best
  var innerK = 3;
  if (task !== "reg") { var counts = [0, 0]; y.forEach(function (v) { counts[v]++; }); innerK = Math.min(3, counts[0], counts[1]); if (innerK < 2) throw new Error("Logistic penalty tuning needs at least two observations of each class inside every training fold."); }
  var grid, rnd = ML.rng(97), folds = task === "reg" ? ML.kfold(y.length, innerK, rnd) : ML.stratified(y, innerK, rnd), rho = model === "lasso" ? 1 : model === "enet" ? 0.5 : 0;
  if (task === "reg") { var penaltyMax = rho ? ML.alphaMax(X, y, rho) : 100, penaltyMin = rho ? penaltyMax * 1e-3 : 1e-4; if (!(penaltyMax > 0 && isFinite(penaltyMax))) throw new Error("Penalty grid is outside the numerical range; rescale the outcome."); grid = []; for (var i = 0; i < 12; i++) grid.push(penaltyMax * Math.pow(penaltyMin / penaltyMax, i / 11)); }
  else grid = [1e-4, 0.01, 0.1, 1, 10];
  var best = null, lossScale = task === "reg" ? amax(y.map(Math.abs)) || 1 : 1;
  grid.forEach(function (a) {
    var loss = 0, failed = false;
    folds.forEach(function (f) {
      if (failed) return;
      var Xt = pickRows(X, f.train), yt = pickRows(y, f.train), Xs = pickRows(X, f.test), ys = pickRows(y, f.test);
      if (task === "reg") { var m = ML.enet(Xt, yt, a, rho); if (!m.converged) { failed = true; return; } var rmse = ML.regMetrics(ys, Xs.map(m.predict)).rmse / lossScale; loss += rmse * rmse * ys.length; }
      else { var lg = ML.logit(Xt, yt, a); if (!lg.converged) { failed = true; return; } Xs.forEach(function (x, t) { var p = Math.min(1 - 2.220446049250313e-16, Math.max(2.220446049250313e-16, lg.predict(x))); loss -= ys[t] ? Math.log(p) : Math.log1p(-p); }); }
    });
    if (failed || !isFinite(loss)) return;
    if (!best || loss < best.loss) best = {a: a, loss: loss};
  });
  if (!best) throw new Error("No converged finite inner-validation fit is available. Rescale inputs or change the model.");
  return best.a;
}
function fitModel(model, X, y, st, seed) {
  var K = st.task === "reg" ? 0 : st.task === "cls" ? 2 : st.classes.length, rnd = ML.rng(seed || 7), p = X[0].length;
  if (model === "linear") { var m0 = ML.enet(X, y, 0, 0); if (!m0.converged || m0.coef.some(function (v) { return !isFinite(v); })) throw new Error("Linear fitting did not converge or coefficients exceed the numerical range. Rescale the variables."); return {predict: m0.predict, coef: m0.coef, intercept: m0.intercept, std: m0.std}; }
  if (model === "ridge" || model === "lasso" || model === "enet") { var a = tune(model, X, y, "reg"), m = ML.enet(X, y, a, model === "lasso" ? 1 : model === "enet" ? 0.5 : 0); if (!m.converged || m.coef.some(function (v) { return !isFinite(v); })) throw new Error("Penalized fitting did not converge or coefficients exceed the numerical range. Rescale the variables."); return {predict: m.predict, coef: m.coef, intercept: m.intercept, std: m.std, alpha: a}; }
  if (model === "logistic") { var lam = tune(model, X, y, "cls"), lg = ML.logit(X, y, lam); if (!lg.converged || lg.coef.some(function (v) { return !isFinite(v); })) throw new Error("Logistic fitting did not converge or coefficients exceed the numerical range. Rescale the variables."); return {predict: lg.predict, coef: lg.coef, intercept: lg.intercept, std: lg.std, alpha: lam}; }
  var depth = +(st.settings || A.sel).mdepth || (model === "tree" ? 4 : 0);
  if (model === "tree") { var t = ML.tree(X, y, {classes: K, maxDepth: depth, minLeaf: 5}); return {predict: function (x) { var v = ML.treePredict(t, x); return K === 2 ? v[1] : v; }, tree: t, importance: t.importance}; }
  var F = ML.forest(X, y, {trees: X.length > 4000 ? 60 : 100, classes: K, maxDepth: depth || undefined, minLeaf: 2, maxFeatures: K ? Math.max(1, Math.round(Math.sqrt(p))) : p, rnd: rnd});
  return {predict: function (x) { var v = ML.forestPredict(F, x); return K === 2 ? v[1] : v; }, forest: F, importance: F.importance, oob: F.oob};
}
function scoreOf(st, y, pred) {
  if (st.task === "reg") return ML.regMetrics(y, pred);
  if (st.task === "cls") return ML.clsMetrics(y, pred);
  return ML.multiMetrics(y, pred);
}
function mainMetric(st) { return st.task === "reg" ? ["r2", "R² (out of sample)"] : st.task === "cls" ? ["auc", "AUC"] : ["accuracy", "Accuracy"]; }
// Cross-validate one model, a fold at a time so the page stays responsive
function crossValidate(st, model, scheme, done, progress) {
  if (st.err) { done({err: st.err}); return; }
  var folds = foldsFor(st, scheme), oof = new Array(st.y.length), baseline = new Array(st.y.length), out = [], baselineFolds = [], fi = 0, imp = null, rnd = ML.rng(5);
  if (!folds || !folds.length) { done({err: scheme === "group" ? "Grouped folds need at least two groups." : "Not enough rows to validate."}); return; }
  // Validate every requested fold before fitting; no undefined fold is omitted.
  for (var q = 0; q < folds.length; q++) {
    var split = folds[q], label = "Fold " + (q + 1) + ": ";
    if (split.train.length < 3 || split.test.length < (st.task === "reg" ? 2 : 1)) { done({err: label + "too few training/test rows after the split and gap. Adjust the validation scheme or gap."}); return; }
    if (st.task !== "reg") {
      var trainCounts = st.classes.map(function () { return 0; }), testCounts = st.classes.map(function () { return 0; });
      split.train.forEach(function (i) { trainCounts[st.y[i]]++; }); split.test.forEach(function (i) { testCounts[st.y[i]]++; });
      if (trainCounts.some(function (n) { return !n; }) || testCounts.some(function (n) { return !n; })) { done({err: label + "every class must occur in training and testing. Train counts: " + trainCounts.join("/") + "; test counts: " + testCounts.join("/") + ". The requested folds are infeasible for these class counts/groups/times; choose fewer folds or collect more observations."}); return; }
      if (model === "logistic" && amin(trainCounts) < 2) { done({err: label + "logistic inner tuning needs at least two observations per class in training. Use more observations or an untuned tree model."}); return; }
    } else { var values = pickRows(st.y, split.test); if (values.every(function (v) { return v === values[0]; })) { done({err: label + "R² is undefined because test outcomes are constant. Change the split or collect varied outcomes."}); return; } }
  }
  function step() {
    if (st.active && !st.active()) { done({cancelled: true, err: "Inputs changed; validation discarded."}); return; }
    try {
      var f = folds[fi], Xt = pickRows(st.X, f.train), yt = pickRows(st.y, f.train), Xs = pickRows(st.X, f.test), ys = pickRows(st.y, f.test);
      if (st.task !== "reg" && Object.keys(yt.reduce(function (o, v) { o[v] = 1; return o; }, {})).length < 2) throw new Error("A training fold contains only one class. Use fewer folds or more rows.");
      var m = fitModel(model, Xt, yt, st, 11 + fi), pr = Xs.map(m.predict);
      var finitePrediction = function (v) { return typeof v === "number" && isFinite(v) && (st.task === "reg" || v >= 0 && v <= 1); };
      if (pr.some(function (v) { return st.task === "multi" ? !Array.isArray(v) || v.length !== st.classes.length || !v.every(finitePrediction) || Math.abs(v.reduce(function (a, x) { return a + x; }, 0) - 1) > 1e-8 : !finitePrediction(v); })) throw new Error("A fold produced invalid predictions. Rescale inputs or change the model.");
      var prior = st.task === "reg" ? ML.mean(yt) : st.classes.map(function (_, c) { return yt.filter(function (v) { return v === c; }).length / yt.length; });
      var bp = Xs.map(function () { return st.task === "reg" ? prior : st.task === "cls" ? prior[1] : prior.slice(); });
      f.test.forEach(function (i, t) { baseline[i] = bp[t]; }); baselineFolds.push(scoreOf(st, ys, bp));
      f.test.forEach(function (i, t) { oof[i] = pr[t]; });
      var sc = scoreOf(st, ys, pr); if (typeof sc[mainMetric(st)[0]] !== "number" || !isFinite(sc[mainMetric(st)[0]])) throw new Error("Fold " + (fi + 1) + " has an undefined " + mainMetric(st)[1] + ". No fold average is reported."); out.push(sc);
      // Permutation importance on the held-out fold: shuffle one predictor's columns together
      var base = sc[mainMetric(st)[0]], gN = st.parts.length; imp = imp || new Array(gN).fill(0);
      for (var g = 0; g < gN; g++) {
        var cols = st.group.map(function (pi, j) { return pi === g ? j : -1; }).filter(function (j) { return j >= 0; }), drop = 0;
        for (var rep = 0; rep < 3; rep++) {
          var perm = Xs.map(function (_, i) { return i; }); for (var i = perm.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp; }
          var Xp = Xs.map(function (x, i) { var x2 = x.slice(); cols.forEach(function (c) { x2[c] = Xs[perm[i]][c]; }); return x2; });
          var v = scoreOf(st, ys, Xp.map(m.predict))[mainMetric(st)[0]]; if (typeof v !== "number" || !isFinite(v)) throw new Error("Permutation validation produced an undefined score; rescale inputs or change the model."); drop += (base - v) / 3;
        }
        imp[g] += drop / folds.length;
      }
      fi++;
      if (fi < folds.length) { if (progress) progress(fi, folds.length); setTimeout(step, 0); }
      else {
        var idx = oof.map(function (v, i) { return v === undefined ? -1 : i; }).filter(function (i) { return i >= 0; });
        done({folds: out, nFolds: folds.length, oof: oof, oofIdx: idx, overall: scoreOf(st, pickRows(st.y, idx), pickRows(oof, idx)), importance: imp, baseline: {folds: baselineFolds, overall: scoreOf(st, pickRows(st.y, idx), pickRows(baseline, idx))}, model: model, scheme: scheme, sizes: folds.map(function (f) { return [f.train.length, f.test.length]; })});
      }
    } catch (e) { done({err: e.message || "This model could not be validated."}); }
  }
  step();
}
function syncCV(st, model, scheme) { var r = null; var _st = setTimeout; try { window.setTimeout = function (f) { f(); }; crossValidate(st, model, scheme, function (x) { r = x; }); } finally { window.setTimeout = _st; } return r; }
function modelCacheKey(ds, extra) { var s = A.sel; return JSON.stringify([ds.id, ds.rows.length, s.mt, s.mp, s.mm, s.mv, s.mvg, s.mvt, s.mpos, s.mdepth, s.mgap, !!s.keepExcluded, dataVersion(ds), s.f, s.fv, A.sel.where || null, extra || ""]); }
function costOf(st, model) { var cells = st.y.length * Math.max(1, st.X[0] ? st.X[0].length : 1); return model === "forest" ? cells * 40 : model === "tree" ? cells * 2 : ["ridge", "lasso", "enet", "logistic"].indexOf(model) >= 0 ? cells * 3 : cells; }

function runModel(ds) {
  var R = mkR("model"), s = A.sel, cand = ds.cols.filter(function (c) { return c.type !== "empty" && c.type !== "text"; });
  if (cand.length < 2) return need(R, "an outcome column and at least one predictor");
  if (idxOf(ds, s.mt) < 0) s.mt = (ds.cols.filter(function (c) { return isNum(c) && !likelyId(ds, c); })[0] || cand[0]).name;
  if (!Array.isArray(s.mp)) s.mp = cand.filter(function (c) { return c.name !== s.mt && !likelyId(ds, c); }).slice(0, 6).map(function (c) { return c.name; });
  s.mv = s.mv || "k5";
  var orderCols = ds.cols.filter(function (c) { return c.type !== "empty"; }), grpCols = ds.cols.filter(function (c) { return c.type === "category" || c.type === "text" || c.type === "year"; });
  if (s.mv === "group" && !s.mvg && grpCols.length) s.mvg = grpCols[0].name;
  if (s.mv === "time" && !s.mvt && orderCols.length) s.mvt = (ds.cols.filter(function (c) { return c.type === "date" || c.type === "year"; })[0] || orderCols[0]).name;
  var st = modelSetup(ds), list = MODELS[st.task];
  if (!s.mm || !list.some(function (m) { return m[0] === s.mm; })) s.mm = list[0][0];
  R.controls = pick("mt", "Predict", cand, s.mt) + choice("mm", "Model", list, s.mm) + choice("mv", "Validation", SCHEMES, s.mv) +
    (s.mv === "group" && grpCols.length ? pick("mvg", "Groups", grpCols, s.mvg || (s.mvg = grpCols[0].name)) : "") + (s.mv === "time" && orderCols.length ? pick("mvt", "Time order", orderCols, s.mvt || (s.mvt = (ds.cols.filter(function (c) { return c.type === "date" || c.type === "year"; })[0] || orderCols[0]).name)) : "") +
    (st.task === "cls" ? choice("mpos", "Positive class", st.classes.slice().reverse().map(function (c) { return [c, c]; }), s.mpos) : "") +
    (s.mm === "tree" || s.mm === "forest" ? choice("mdepth", "Maximum depth", [["", s.mm === "tree" ? "4 (default)" : "Unlimited"], ["2", "2"], ["3", "3"], ["5", "5"], ["8", "8"], ["12", "12"]], s.mdepth || "") : "") +
    (s.mv === "time" ? choice("mgap", "Gap before testing (distinct time periods)", [["0", "None"], ["1", "1 period"], ["2", "2 periods"], ["5", "5 periods"], ["10", "10 periods"]], s.mgap || "0") : "") +
    mselList("mp", cand.filter(function (c) { return c.name !== s.mt; }), "Predictors", 1);
  if (st.err) return need(R, st.err);
  if (!st.parts.length) return need(R, "at least one predictor");
  if (st.y.length < 20) return need(R, "at least 20 complete rows");
  if (st.task === "multi" && st.classes.length > 10) return need(R, "an outcome with at most 10 categories (or a number)");
  if (s.mv === "group" && !st.groups) return need(R, "a group column for grouped folds");
  var key = modelCacheKey(ds), res = MOD.key === key ? MOD.res : null;
  if (!res && !MOD.busy && (MOD.force || costOf(st, s.mm) * (s.mv === "k10" ? 10 : 5) < 4e6)) { res = syncCV(st, s.mm, s.mv); MOD.key = key; MOD.res = res; }
  var run = '<div class="slot"><button type="button" class="btn btn-primary" data-mtrain="1"' + (MOD.busy ? " disabled" : "") + ">" + (res ? "Retrain" : "Train and validate") + '</button><button type="button" class="btn" data-mcompare="1"' + (MOD.busy ? " disabled" : "") + ">Compare all models</button>" + (MOD.busy ? '<span class="count" role="status">' + esc(MOD.busy) + "</span>" : "") + "</div>";
  if (!res) { R.head = '<p class="count">' + st.y.length + " complete rows, " + st.names.length + " predictor columns after encoding categories. This model takes a few seconds to validate.</p>" + run; R.reading = []; return R; }
  if (res.err) { R.valid = false; R.reason = res.err; R.head = '<p class="warn">' + esc(res.err) + "</p>" + run; return R; }
  var mm = mainMetric(st), vals = res.folds.map(function (f) { return f[mm[0]]; });
  if (vals.length !== res.nFolds || vals.some(function (v) { return typeof v !== "number" || !isFinite(v); })) return need(R, "a defined primary metric in every requested fold; no undefined folds can be averaged away");
  var mean = S.mean(vals), sd = vals.length > 1 ? Math.sqrt(vals.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / (vals.length - 1)) : NaN;
  var full = memo(ds, ["fullfit", key], function () { return fitModel(s.mm, st.X, st.y, st, 3); }), ov = res.overall, label = (list.filter(function (m) { return m[0] === s.mm; })[0] || [0, s.mm])[1], scheme = (SCHEMES.filter(function (x) { return x[0] === s.mv; })[0] || [0, ""])[1];
  var maj = st.task !== "reg" ? res.baseline.overall.accuracy : 0;
  R.summary = {test: label + ", " + scheme, n: st.y.length, task: st.task === "reg" ? "regression" : "classification", metric: mm[1], cv_mean: mean, folds: res.nFolds, evaluated_folds: vals.length, evaluated_rows: res.oofIdx.length};
  if (st.task === "reg") { R.summary.baseline_rmse = res.baseline.overall.rmse; R.summary.pooled_rmse = ov.rmse; R.summary.pooled_mae = ov.mae; } else { R.summary.baseline_accuracy = res.baseline.overall.accuracy; R.summary.pooled_accuracy = ov.accuracy; R.summary.class_counts = st.classes.map(function (label, c) { return {label: label, n: st.y.filter(function (v) { return v === c; }).length}; }); }
  if (st.task === "cls") { R.summary.baseline_brier = res.baseline.overall.brier; R.summary.pooled_brier = ov.brier; R.summary.pooled_auc = ov.auc; }
  if (isFinite(sd)) R.summary.cv_sd = sd;
  var figsList = [[mm[1] + (isFinite(sd) ? " · fold mean ± SD" : " · holdout"), f3(mean) + (isFinite(sd) ? " ± " + f3(sd) : "")]];
  if (st.task === "reg") figsList.push(["RMSE", f3(ov.rmse)], ["MAE", f3(ov.mae)], ["Held-out rows", res.oofIdx.length + " of " + st.y.length + " eligible"]);
  else if (st.task === "cls") figsList.push(["Accuracy", Math.round(ov.accuracy * 1000) / 10 + "%"], ["Balanced accuracy", Math.round(ov.balanced * 1000) / 10 + "%"], ["Brier score", f3(ov.brier)], ["Held-out rows", res.oofIdx.length + " of " + st.y.length + " eligible"]);
  else figsList.push(["Balanced accuracy", Math.round(ov.balanced * 1000) / 10 + "%"], ["Log loss", f3(ov.logloss)], ["Held-out rows", res.oofIdx.length + " of " + st.y.length + " eligible"]);
  var foldHead = st.task === "reg" ? ["Fold", "Train / test rows", "R²", "RMSE", "MAE"] : st.task === "cls" ? ["Fold", "Train / test rows", "AUC", "Accuracy", "F1", "Brier"] : ["Fold", "Train / test rows", "Accuracy", "Balanced", "Log loss"];
  R.head = figs(figsList, true) + table(foldHead, res.folds.map(function (f, i) { var sz = res.sizes[i][0] + " / " + res.sizes[i][1]; return st.task === "reg" ? [String(i + 1), sz, f3(f.r2), f3(f.rmse), f3(f.mae)] : st.task === "cls" ? [String(i + 1), sz, f3(f.auc), f3(f.accuracy), f3(f.f1), f3(f.brier)] : [String(i + 1), sz, f3(f.accuracy), f3(f.balanced), f3(f.logloss)]; })) + run;
  var ys = pickRows(st.y, res.oofIdx), ps = pickRows(res.oof, res.oofIdx);
  if (st.task === "reg") R.chart = scatter(ps, ys, "Predicted " + s.mt + " (out of fold)", "Actual " + s.mt, {slope: 1, intercept: 0});
  else if (st.task === "cls") { var roc = ML.rocCurve(ys, ps); R.chart = xyLines([{name: "ROC curve, all folds pooled (AUC " + fz(ov.auc) + ")", pts: roc}, {name: "Chance", pts: [[0, 0], [1, 1]], dash: true}], "False-positive rate", "True-positive rate", [0, 1]); }
  // Extra: importance, calibration, model details, comparison
  var ex = "", gimp = st.parts.map(function (p, g) { return [p.name, res.importance ? res.importance[g] : 0]; }).sort(function (a, b) { return b[1] - a[1]; });
  ex += '<h3 class="sub-h">What the predictions rely on</h3><p class="count">Permutation importance: how much ' + mm[1] + " drops on held-out rows when one predictor is shuffled. Near zero means the model does not use it.</p>" + bars(gimp.map(function (g) { return [g[0], Math.max(0, g[1])]; }), "Drop in " + mm[1]);
  if (st.task === "cls") {
    var cal = ML.calibration(ys, ps, 10);
    ex += '<h3 class="sub-h">Calibration</h3><p class="count">Do predicted probabilities match how often “' + esc(s.mpos) + "” actually happens? Points on the diagonal are well calibrated.</p>" +
      xyLines([{name: "Model", pts: cal.bins.map(function (b) { return [b.pred, b.obs]; })}, {name: "Perfect calibration", pts: [[0, 0], [1, 1]], dash: true}], "Predicted probability", "Observed share", [0, 1]) +
      figs([["Expected calibration error", f3(cal.ece)], ["Calibration slope", f3(cal.slope)], ["Calibration intercept", f3(cal.intercept)], ["Brier score (training-prior baseline " + f3(res.baseline.overall.brier) + ")", f3(ov.brier)]]) +
      '<h3 class="sub-h">Confusion matrix at probability 0.5</h3>' + table(["", "Predicted " + esc(st.classes[0]), "Predicted " + esc(st.classes[1])], [["Actual " + esc(st.classes[0]), String(ov.cm[0][0]), String(ov.cm[0][1])], ["Actual " + esc(st.classes[1]), String(ov.cm[1][0]), String(ov.cm[1][1])]]);
    if (isFinite(cal.slope)) R.summary.calibration_slope = cal.slope; else R.caveats.push("Calibration slope is not estimable: the unpenalized calibration fit did not converge. This does not establish calibrated probabilities."); R.summary.brier = ov.brier;
  }
  if (full.coef) ex += '<h3 class="sub-h">Coefficients (fit on all rows)</h3>' + (full.alpha != null ? '<p class="count">Penalty chosen by inner cross-validation (up to 3 feasible folds): ' + f3(full.alpha) + ".</p>" : "") + table(["Predictor", st.task === "reg" ? "Change in " + esc(s.mt) + " per unit" : "Log-odds per unit", "Per SD (standardized)"], st.names.map(function (n, j) { return [esc(n), f3(full.coef[j]), full.std[j] === 0 ? '<span class="nd">0 (dropped)</span>' : f3(full.std[j])]; }));
  if (full.tree) ex += '<h3 class="sub-h">The tree (fit on all rows)</h3><pre class="rules">' + esc(ML.treeRules(full.tree, st.names, f3, st.classes, 40).join("\n")) + "</pre>";
  if (full.oob) { var oi = full.oob.map(function (v, i) { return v == null ? -1 : i; }).filter(function (i) { return i >= 0; }), om = scoreOf(st, pickRows(st.y, oi), pickRows(full.oob, oi)); ex += '<p class="count">Out-of-bag ' + mm[1] + " on all rows: " + f3(om[mm[0]]) + " (" + full.forest.trees.length + " trees).</p>"; }
  var cmpKey = modelCacheKey(ds, "compare");
  if (MOD.compare && MOD.compareKey === cmpKey) ex += '<h3 class="sub-h">All models, same folds</h3>' + table(["Model", mm[1] + " (mean ± SD)", st.task === "reg" ? "RMSE" : st.task === "cls" ? "Brier" : "Balanced accuracy"], MOD.compare.map(function (c) { return c.err ? [esc(c.label), '<span class="nd">' + esc(c.err) + "</span>", ""] : [esc(c.label) + (c.model === s.mm ? " (shown)" : ""), f3(c.mean) + " ± " + f3(c.sd), f3(st.task === "reg" ? c.overall.rmse : st.task === "cls" ? c.overall.brier : c.overall.balanced)]; }));
  ex += '<div class="slot"><button type="button" class="btn" data-mpredcol="1">Add out-of-fold predictions as a column</button><span class="count">Each row is predicted by a model that never saw it.</span></div>';
  R.extra = ex;
  // Reading
  if (st.task === "reg") R.reading.push("Mean held-out R² = " + fz(mean) + (isFinite(sd) ? " ± " + fz(sd) + " across folds" : "") + ". Negative R² is worse than each test fold's own mean, the metric's reference. Training-mean baseline RMSE = " + f3(res.baseline.overall.rmse) + "; model MAE = " + f3(ov.mae) + ".");
  else if (st.task === "cls") R.reading.push("Pooling the held-out rows, the model ranks a random “" + esc(s.mpos) + "” above a random “" + esc(st.classes[0]) + "” " + Math.round(ov.auc * 100) + "% of the time (AUC = " + fz(ov.auc) + "; 0.5 is chance). Accuracy is " + Math.round(ov.accuracy * 100) + "% against " + Math.round(maj * 100) + "% for a baseline using each training fold's class frequencies.");
  else R.reading.push("On held-out rows, the model picks the right category " + Math.round(ov.accuracy * 100) + "% of the time, against " + Math.round(maj * 100) + "% for a baseline using each training fold's class frequencies.");
  if (gimp[0] && gimp[0][1] > 0) R.reading.push("Predictions rely most on " + esc(gimp[0][0]) + (gimp[1] && gimp[1][1] > 0 ? ", then " + esc(gimp[1][0]) : "") + ". Importance shows what the model uses, not what causes the outcome.");
  if (st.task === "cls") { var cal2 = ML.calibration(ys, ps, 10); if (isFinite(cal2.slope)) R.reading.push("Estimated calibration slope = " + fz(cal2.slope) + ". This point estimate alone does not establish calibration; its uncertainty is not estimated here."); }
  if (s.mv === "k2" || s.mv === "k5" || s.mv === "k10") R.caveats.push(st.groups == null && ds.cols.some(function (c) { return /id|subject|patient|participant|school|site/i.test(c.name); }) ? "If several rows come from the same person or site, ordinary folds leak information between training and testing. Choose grouped folds." : "Rows are assumed independent. Use grouped or time-ordered folds when rows share a person, site or period.");
  if (st.task !== "reg" && st.classes.some(function (_, c) { return st.y.filter(function (v) { return v === c; }).length < 10; })) R.caveats.push("Fewer than ten observations in at least one class: performance estimates are unstable. Across-fold SD is not a confidence interval.");
  if (s.mv === "holdout") R.caveats.push("A single holdout split gives a noisy estimate; cross-validation averages over several splits.");
  if (st.dropped) R.caveats.push(st.dropped + " rows with a missing value in the outcome or a predictor were skipped. Impute first (Missing data) if many are missing.");
  R.caveats.push("Cross-validated scores estimate performance on new data like these rows; they do not guarantee performance in a different population or period.");
  R.apa = mm[1] + " = " + fz(mean) + (isFinite(sd) ? " (<i>SD</i> = " + fz(sd) + ")" : "") + " across " + res.nFolds + " " + (s.mv === "holdout" ? "holdout split" : "folds") + " (" + label.toLowerCase() + ")";
  return R;
}
function trainAsync(ds, compare) {
  var st = modelSetup(ds), s = A.sel, list = compare ? MODELS[st.task] : [[s.mm, ""]], outs = [], i = 0;
  var job = {ds: ds, key: modelCacheKey(ds), kind: A.kind}; MOD.job = job;
  st.active = function () { return MOD.job === job && cur() === ds && A.kind === job.kind && modelCacheKey(ds) === job.key; };
  MOD.busy = "Training…"; render();
  (function next() {
    if (!st.active()) { if (MOD.job === job) { MOD.job = null; MOD.busy = ""; } return; }
    if (i >= list.length) {
      MOD.busy = ""; MOD.job = null;
      if (compare) { MOD.compare = outs; MOD.compareKey = modelCacheKey(ds, "compare"); var mine = outs.filter(function (o) { return o.model === s.mm; })[0]; if (mine && mine.raw) { MOD.res = mine.raw; MOD.key = modelCacheKey(ds); } }
      else { MOD.res = outs[0].raw; MOD.key = modelCacheKey(ds); }
      render(); refocus(compare ? "[data-mcompare]" : "[data-mtrain]"); return;
    }
    var m = list[i];
    crossValidate(st, m[0], s.mv, function (r) {
      if (!st.active() || r.cancelled) return;
      var mmk = mainMetric(st)[0], v = r.err ? [] : r.folds.map(function (f) { return f[mmk]; }), mean = v.length ? S.mean(v) : NaN, sd = v.length > 1 ? Math.sqrt(v.reduce(function (a, x) { return a + (x - mean) * (x - mean); }, 0) / (v.length - 1)) : 0;
      outs.push({model: m[0], label: m[1] || m[0], err: r.err, mean: mean, sd: sd, overall: r.overall, raw: r}); i++; setTimeout(next, 0);
    }, function (f, n) { MOD.busy = (compare ? m[1] + ": " : "") + "fold " + f + " of " + n + "…"; var el = view.querySelector('[role="status"]'); if (el) el.textContent = MOD.busy; });
  })();
}
var _runA5 = runAnalysis;
runAnalysis = function (ds) { if (A.kind !== "model") return _runA5(ds); var R = runModel(ds); LAST_R = R; return R; };
var _formula4 = formula;
formula = function (R) {
  if (A.kind !== "model") return _formula4(R);
  if (A.sel.mm === "logistic") return '<div class="math"><math display="block">' + mr(munder(mi("min"), mi("β")), mo("−"), mo("∑"), mr(mo("["), sb(mi("y"), mi("i")), mi("ln"), sb(mover(mi("p"), "^"), mi("i")), mo("+"), mr(mo("("), mn(1), mo("−"), sb(mi("y"), mi("i")), mo(")")), mi("ln"), mr(mo("("), mn(1), mo("−"), sb(mover(mi("p"), "^"), mi("i")), mo(")")), mo("]")), mo("+"), fr(mi("λ"), mn(2)), sp(mr(mo("‖"), mi("β"), mo("‖")), mn(2))) + "</math></div>";
  var cls = R && R.summary && R.summary.task === "classification";
  if (cls && A.sel.mm !== "logistic") return '<div class="math"><math display="block">' + mr(mi("AUC"), mo("="), mi("P"), mr(mo("("), sb(mover(mi("p"), "^"), mi("i")), mo(">"), sb(mover(mi("p"), "^"), mi("j")), mo("∣"), sb(mi("y"), mi("i")), mo("="), mn(1), mo(","), sb(mi("y"), mi("j")), mo("="), mn(0), mo(")"))) + "</math></div>";
  var f = A.sel.mm === "lasso" || A.sel.mm === "enet" || A.sel.mm === "ridge" ? mr(munder(mi("min"), mi("β")), fr(mn(1), mr(mn(2), mi("n"))), sp(mr(mo("‖"), mi("y"), mo("−"), mi("X"), mi("β"), mo("‖")), mn(2)), mo("+"), mi("α"), mr(mo("("), mi("ρ"), sb(mr(mo("‖"), mi("β"), mo("‖")), mn(1)), mo("+"), fr(mr(mn(1), mo("−"), mi("ρ")), mn(2)), sp(mr(mo("‖"), mi("β"), mo("‖")), mn(2)), mo(")")))
    : mr(sp(sb(mi("R"), mi("CV")), mn(2)), mo("="), mn(1), mo("−"), fr(mr(mo("∑"), sp(mr(mo("("), sb(mi("y"), mi("i")), mo("−"), sb(mover(mi("y"), "^"), mr(mo("−"), mi("k"), mo("("), mi("i"), mo(")"))), mo(")")), mn(2))), mr(mo("∑"), sp(mr(mo("("), sb(mi("y"), mi("i")), mo("−"), bar("y"), mo(")")), mn(2)))));
  return '<div class="math"><math display="block">' + f + "</math></div>";
};
function munder(a, b) { return "<munder>" + a + b + "</munder>"; }
var _caption4 = caption;
caption = function (ds) { if (A.kind !== "model") return _caption4(ds); var st = LAST_R && LAST_R.summary || {}; return st.task === "classification" ? "ROC curve from out-of-fold predictions" : "Out-of-fold predictions against actual values; the line marks perfect prediction"; };
var _localFacts2 = localFacts;
localFacts = function (R) { var b = _localFacts2(R), s = R.summary || {}; if (R.kind === "model") { if (localNumber(s.cv_mean)) { b.facts.push("Cross-validated " + s.metric + ": " + f3(s.cv_mean) + "."); b.effects.push(s.metric); b.effectFacts.push(s.metric + ": " + f3(s.cv_mean) + "."); } if (localNumber(s.cv_sd)) b.facts.push("Standard deviation across folds: " + f3(s.cv_sd) + "."); if (localNumber(s.calibration_slope)) b.facts.push("Calibration slope: " + f3(s.calibration_slope) + "."); } return b; };
function opPredict(ds, spec) {
  var save = A.sel; A.sel = clone(spec.sel);
  try {
    var st = modelSetup(ds), r = syncCV(st, spec.sel.mm, spec.sel.mv); if (!r || r.err) throw new Error((r && r.err) || "Predictions could not be made.");
    var col = new Array(ds.rows.length).fill(null), at = new Map(); ds.rows.forEach(function (rw, i) { at.set(rw, i); });
    r.oofIdx.forEach(function (t) { var v = r.oof[t], i = at.get(st.rows[st.keep[t]]); if (i != null) col[i] = st.task === "multi" ? st.classes[v.indexOf(amax(v))] : v; });
    var name = uniqueColumnName(spec.name, ds.cols.map(function (c) { return c.name; })), n = col.filter(function (v) { return v != null; }).length;
    return {rows: ds.rows.map(function (rw, i) { return rw.concat([col[i]]); }), cols: ds.cols.concat([{name: name, type: st.task === "multi" ? "category" : "number"}]), changed: n};
  } finally { A.sel = save; }
}
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset, ds = cur(); if (!ds || A.kind !== "model") return;
  if (d.mtrain) { MOD.key = ""; trainAsync(ds, false); return; }
  if (d.mcompare) { trainAsync(ds, true); return; }
  if (d.mpredcol) { var st = modelSetup(ds), sel = clone(A.sel), nm = "Predicted " + A.sel.mt + (st.task === "cls" ? " (P = " + A.sel.mpos + ")" : "");
    sel.mgap = sel.mgap || "0"; sel.keepExcluded = !!sel.keepExcluded; sel.f = sel.f || ""; sel.fv = sel.fv || ""; sel.where = sel.where || null;
    applyStep(ds, {op: "predict", contextVersion: 1, sel: sel, name: nm, text: "Added out-of-fold predictions of " + A.sel.mt, unit: "rows predicted"}, function () { return opPredict(ds, {sel: sel, name: nm}); }); }

});
var _replayStep3 = replayStep;
replayStep = function (ds, st2) { if (st2.op === "predict") { if (st2.contextVersion !== 1) throw new Error("Legacy prediction steps omit validation context. Regenerate them with the intended filters and time gap."); return opPredict(ds, {sel: st2.sel, name: st2.name}); } return _replayStep3(ds, st2); };
