// ---------- ML: predictive models, validation schemes and metrics (scikit-learn conventions) ----------
var ML = (function () {
  // ---- CART decision trees: squared error (regression) or Gini (classification), midpoint thresholds ----
  function tree(X, y, o) {
    var p = X[0].length, K = o.classes || 0, rnd = o.rnd, maxF = o.maxFeatures || p, minLeaf = o.minLeaf || 1, minSplit = Math.max(2, o.minSplit || 2), maxDepth = o.maxDepth == null ? Infinity : o.maxDepth;
    var nAll = X.length, C = o.cols || colsOf(X), yv = Float64Array.from(y), imp = new Array(p).fill(0), goLeft = new Uint8Array(nAll), cnt = new Float64Array(K || 1), Lc = new Float64Array(K || 1), Rc = new Float64Array(K || 1);
    function stats(idx) {
      var m = idx.length;
      if (!K) { var s = 0, s2 = 0; for (var t = 0; t < m; t++) { var v = yv[idx[t]]; s += v; s2 += v * v; } var mu = s / m; return {value: mu, impurity: Math.max(0, s2 / m - mu * mu)}; }
      cnt.fill(0); for (t = 0; t < m; t++) cnt[yv[idx[t]]]++; var pr = [], g = 1; for (var c = 0; c < K; c++) { pr.push(cnt[c] / m); g -= pr[c] * pr[c]; }
      return {value: pr, impurity: g};
    }
    // Each node holds its rows sorted by every feature; a split partitions those lists, so nothing is re-sorted.
    function build(sorted, depth) {
      var idx = sorted[0], node = stats(idx), n = idx.length; node.n = n;
      if (depth >= maxDepth || n < minSplit || n < 2 * minLeaf || node.impurity <= 1e-12) return node;
      var feats = []; for (var f = 0; f < p; f++) feats.push(f);
      if (rnd) for (f = p - 1; f > 0; f--) { var r = Math.floor(rnd() * (f + 1)), t = feats[f]; feats[f] = feats[r]; feats[r] = t; }
      var best = null, bScore = Infinity, bF = -1, bThr = 0, tried = 0;
      for (var fi = 0; fi < feats.length && (tried < maxF || bF < 0); fi++) {
        var j = feats[fi], ord = sorted[j], col = C[j];
        if (col[ord[0]] === col[ord[n - 1]]) continue;
        tried++;
        var k, nl, nr, sc;
        if (!K) {
          var tot = 0, tot2 = 0; for (k = 0; k < n; k++) { var v = yv[ord[k]]; tot += v; tot2 += v * v; }
          var ls = 0, ls2 = 0;
          for (k = 0; k < n - 1; k++) {
            var yi = yv[ord[k]]; ls += yi; ls2 += yi * yi;
            if (k + 1 < minLeaf || n - k - 1 < minLeaf || col[ord[k]] === col[ord[k + 1]]) continue;
            nl = k + 1; nr = n - nl; var rs = tot - ls; sc = (ls2 - ls * ls / nl) + (tot2 - ls2 - rs * rs / nr);
            if (bF < 0 || sc < bScore - 1e-12 * Math.abs(bScore)) { bScore = sc; bF = j; bThr = (col[ord[k]] + col[ord[k + 1]]) / 2; }
          }
        } else {
          Lc.fill(0); Rc.fill(0); for (k = 0; k < n; k++) Rc[yv[ord[k]]]++;
          var gl = 0, gr = 0; for (var q = 0; q < K; q++) gr += Rc[q] * Rc[q];
          for (k = 0; k < n - 1; k++) {
            var c = yv[ord[k]]; gl += 2 * Lc[c] + 1; gr -= 2 * Rc[c] - 1; Lc[c]++; Rc[c]--;
            if (k + 1 < minLeaf || n - k - 1 < minLeaf || col[ord[k]] === col[ord[k + 1]]) continue;
            nl = k + 1; nr = n - nl; sc = nl - gl / nl + nr - gr / nr;   // n × weighted Gini
            if (bF < 0 || sc < bScore - 1e-12 * Math.abs(bScore)) { bScore = sc; bF = j; bThr = (col[ord[k]] + col[ord[k + 1]]) / 2; }
          }
        }
      }
      if (bF < 0) return node;
      imp[bF] += node.impurity * n - bScore;
      node.f = bF; node.thr = bThr;
      var cf = C[bF], nL = 0; for (var t2 = 0; t2 < n; t2++) { var g2 = cf[idx[t2]] <= bThr ? 1 : 0; goLeft[idx[t2]] = g2; nL += g2; }
      var L2 = [], R2 = [];
      for (var q2 = 0; q2 < p; q2++) { var a = new Int32Array(nL), b = new Int32Array(n - nL), src = sorted[q2], ia = 0, ib = 0; for (t2 = 0; t2 < n; t2++) { var ii = src[t2]; if (goLeft[ii]) a[ia++] = ii; else b[ib++] = ii; } L2.push(a); R2.push(b); }
      sorted = null;
      node.left = build(L2, depth + 1); node.right = build(R2, depth + 1);
      return node;
    }
    var base = o.idx || X.map(function (_, i) { return i; }), pre = [];
    if (o.order) {   // bootstrap sample: walk the global sort order, emitting each row as often as it was drawn
      var times = new Int32Array(nAll); base.forEach(function (i) { times[i]++; });
      for (var f1 = 0; f1 < p; f1++) { var arr = new Int32Array(base.length), w = 0, g = o.order[f1]; for (var t3 = 0; t3 < nAll; t3++) { var i3 = g[t3]; for (var c3 = times[i3]; c3 > 0; c3--) arr[w++] = i3; } pre.push(arr); }
    } else for (var f0 = 0; f0 < p; f0++) pre.push(Int32Array.from(base.slice().sort((function (col) { return function (a, b) { return col[a] - col[b]; }; })(C[f0]))));
    var root = build(pre, 0), tot = imp.reduce(function (a, b) { return a + b; }, 0);
    return {root: root, importance: imp.map(function (v) { return tot ? v / tot : 0; }), K: K, n: base.length};
  }
  function colsOf(X) { var p = X[0].length, n = X.length, C = []; for (var j = 0; j < p; j++) { var c = new Float64Array(n); for (var i = 0; i < n; i++) c[i] = X[i][j]; C.push(c); } return C; }
  function treePredict(t, x) { var nd = t.root; while (nd.left) nd = x[nd.f] <= nd.thr ? nd.left : nd.right; return nd.value; }
  function treeRules(t, names, fmt, classes, maxLines) {
    var out = [];
    (function walk(nd, depth) {
      if (out.length >= (maxLines || 40)) return;
      var pad = new Array(depth + 1).join("  ");
      if (!nd.left) { out.push(pad + "→ " + (t.K ? classes[nd.value.indexOf(amax(nd.value))] + " (" + Math.round(100 * amax(nd.value)) + "%)" : fmt(nd.value)) + "  · n = " + nd.n); return; }
      out.push(pad + names[nd.f] + " ≤ " + fmt(nd.thr)); walk(nd.left, depth + 1);
      out.push(pad + names[nd.f] + " > " + fmt(nd.thr)); walk(nd.right, depth + 1);
    })(t.root, 0);
    return out;
  }
  // Random forest: bootstrap samples, random feature subsets at each split, out-of-bag estimates
  function forest(X, y, o) {
    var rnd = o.rnd, n = X.length, cols = colsOf(X), order = cols.map(function (col) { var a = []; for (var i = 0; i < n; i++) a.push(i); return Int32Array.from(a.sort(function (x, y) { return col[x] - col[y]; })); }), trees = [], oobSum = X.map(function () { return o.classes ? new Array(o.classes).fill(0) : 0; }), oobN = new Array(n).fill(0), imp = new Array(X[0].length).fill(0);
    for (var b = 0; b < (o.trees || 100); b++) {
      var idx = [], inBag = new Uint8Array(n); for (var i = 0; i < n; i++) { var k = Math.floor(rnd() * n); idx.push(k); inBag[k] = 1; }
      var t = tree(X, y, {classes: o.classes, maxDepth: o.maxDepth, minLeaf: o.minLeaf, maxFeatures: o.maxFeatures, rnd: rnd, idx: idx, cols: cols, order: order});
      trees.push(t); t.importance.forEach(function (v, j) { imp[j] += v; });
      for (i = 0; i < n; i++) if (!inBag[i]) { var pr = treePredict(t, X[i]); if (o.classes) pr.forEach(function (v, c) { oobSum[i][c] += v; }); else oobSum[i] += pr; oobN[i]++; }
    }
    return {trees: trees, K: o.classes, importance: imp.map(function (v) { return v / trees.length; }), oob: oobSum.map(function (s, i) { return oobN[i] ? (o.classes ? s.map(function (v) { return v / oobN[i]; }) : s / oobN[i]) : null; })};
  }
  function forestPredict(F, x) {
    var preds = F.trees.map(function (t) { return treePredict(t, x); });
    if (!F.K) return preds.reduce(function (a, b) { return a + b; }, 0) / preds.length;
    return preds[0].map(function (_, c) { return preds.reduce(function (s, p) { return s + p[c]; }, 0) / preds.length; });
  }

  // ---- Linear models on standardized predictors ----
  function standardize(X) {
    var n = X.length, p = X[0].length, mu = new Array(p).fill(0), sd = new Array(p).fill(0);
    X.forEach(function (r) { r.forEach(function (v, j) { mu[j] += v / n; }); });
    X.forEach(function (r) { r.forEach(function (v, j) { sd[j] += (v - mu[j]) * (v - mu[j]) / n; }); });
    sd = sd.map(function (v) { return Math.sqrt(v) || 1; });
    return {mu: mu, sd: sd, Z: X.map(function (r) { return r.map(function (v, j) { return (v - mu[j]) / sd[j]; }); })};
  }
  // Elastic net by coordinate descent: (1/2n)||y − Zb||² + α·ρ·||b||₁ + α(1 − ρ)/2·||b||² (ρ = 1 lasso, ρ = 0 ridge)
  function enet(X, y, alpha, rho, warm) {
    var st = standardize(X), Z = st.Z, n = Z.length, p = Z[0].length, ym = y.reduce(function (a, b) { return a + b; }, 0) / n;
    var b = warm ? warm.slice() : new Array(p).fill(0), r = y.map(function (v, i) { return v - ym - Z[i].reduce(function (s, z, j) { return s + z * b[j]; }, 0); });
    var zz = new Array(p).fill(0); Z.forEach(function (row) { row.forEach(function (v, j) { zz[j] += v * v / n; }); });
    for (var it = 0; it < 20000; it++) {
      var mx = 0;
      for (var j = 0; j < p; j++) {
        if (!zz[j]) continue;
        var g = 0; for (var i = 0; i < n; i++) g += Z[i][j] * r[i]; g = g / n + zz[j] * b[j];
        var nb = Math.sign(g) * Math.max(Math.abs(g) - alpha * rho, 0) / (zz[j] + alpha * (1 - rho)), d = nb - b[j];
        if (d) { for (i = 0; i < n; i++) r[i] -= d * Z[i][j]; b[j] = nb; mx = Math.max(mx, Math.abs(d)); }
      }
      if (mx < 1e-11) break;
    }
    return linModel(b, st, ym);
  }
  function linModel(b, st, ym) {
    var coef = b.map(function (v, j) { return v / st.sd[j]; }), icpt = ym - coef.reduce(function (s, c, j) { return s + c * st.mu[j]; }, 0);
    return {std: b, coef: coef, intercept: icpt, predict: function (x) { return icpt + x.reduce(function (s, v, j) { return s + v * coef[j]; }, 0); }};
  }
  function alphaMax(X, y, rho) { var st = standardize(X), n = X.length, ym = y.reduce(function (a, b) { return a + b; }, 0) / n, m = 0; for (var j = 0; j < X[0].length; j++) { var g = 0; st.Z.forEach(function (r, i) { g += r[j] * (y[i] - ym); }); m = Math.max(m, Math.abs(g) / n); } return m / Math.max(rho, 1e-3); }
  // Binary logistic regression with an L2 penalty (λ/2)||b||² on standardized predictors; intercept unpenalized (sklearn C = 1/λ)
  function logit(X, y, lambda) {
    var st = standardize(X), Z = st.Z, n = Z.length, p = Z[0].length + 1, w = new Array(p).fill(0);
    for (var it = 0; it < 100; it++) {
      var g = new Array(p).fill(0), H = S3.zeros(p, p);
      Z.forEach(function (z, i) { var x = [1].concat(z), e = x.reduce(function (s, v, j) { return s + v * w[j]; }, 0), pr = 1 / (1 + Math.exp(-e)), wt = pr * (1 - pr);
        for (var a = 0; a < p; a++) { g[a] += (y[i] - pr) * x[a]; for (var c = 0; c < p; c++) H[a][c] += wt * x[a] * x[c]; } });
      for (var a = 1; a < p; a++) { g[a] -= lambda * w[a]; H[a][a] += lambda; }
      var Hi = S3.inv(H); if (!Hi) break;
      var step = Hi.map(function (r) { return r.reduce(function (s, v, j) { return s + v * g[j]; }, 0); }), mx = 0;
      step.forEach(function (v, j) { w[j] += v; mx = Math.max(mx, Math.abs(v)); }); if (mx < 1e-12) break;
    }
    var coef = w.slice(1).map(function (v, j) { return v / st.sd[j]; }), icpt = w[0] - coef.reduce(function (s, c, j) { return s + c * st.mu[j]; }, 0);
    return {coef: coef, intercept: icpt, std: w.slice(1), predict: function (x) { var e = icpt + x.reduce(function (s, v, j) { return s + v * coef[j]; }, 0); return 1 / (1 + Math.exp(-e)); }};
  }

  // ---- Validation schemes (index lists) ----
  function kfold(n, k, rnd) {
    var idx = []; for (var i = 0; i < n; i++) idx.push(i);
    if (rnd) for (i = n - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    var out = [], start = 0;
    for (var f = 0; f < k; f++) { var size = Math.floor(n / k) + (f < n % k ? 1 : 0), test = idx.slice(start, start + size); out.push({test: test, train: idx.slice(0, start).concat(idx.slice(start + size))}); start += size; }
    return out;
  }
  function stratified(y, k, rnd) {   // each class dealt round-robin into folds after a seeded shuffle
    var by = Object.create(null); y.forEach(function (c, i) { (by[c] = by[c] || []).push(i); });
    var folds = []; for (var f = 0; f < k; f++) folds.push([]);
    var pos = 0; Object.keys(by).sort().forEach(function (c) { var a = by[c]; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } a.forEach(function (ix) { folds[pos++ % k].push(ix); }); });
    return folds.map(function (test, f) { var s = Object.create(null); test.forEach(function (i) { s[i] = 1; }); return {test: test, train: y.map(function (_, i) { return i; }).filter(function (i) { return !s[i]; })}; });
  }
  function groupKFold(groups, k) {   // largest groups first, each to the fold with the fewest rows (sklearn GroupKFold)
    var uniq = [], at = Object.create(null), size = []; groups.forEach(function (g) { if (at[g] == null) { at[g] = uniq.length; uniq.push(g); size.push(0); } size[at[g]]++; });
    if (uniq.length < k) return null;
    var order = size.map(function (_, i) { return i; }).sort(function (a, b) { return size[b] - size[a] || a - b; }), load = new Array(k).fill(0), foldOf = new Array(uniq.length);
    order.forEach(function (g) { var f = load.indexOf(amin(load)); foldOf[g] = f; load[f] += size[g]; });
    var out = []; for (var f = 0; f < k; f++) out.push({test: [], train: []});
    groups.forEach(function (g, i) { var fo = foldOf[at[g]]; out.forEach(function (o, f) { (f === fo ? o.test : o.train).push(i); }); });
    return out;
  }
  function timeSplit(n, k) {   // expanding window (sklearn TimeSeriesSplit); rows must already be in time order
    var ts = Math.floor(n / (k + 1)), out = [];
    for (var f = 0; f < k; f++) { var s = n - (k - f) * ts, train = [], test = []; for (var i = 0; i < s; i++) train.push(i); for (i = s; i < s + ts; i++) test.push(i); out.push({train: train, test: test}); }
    return out;
  }

  // ---- Metrics ----
  function regMetrics(y, p) {
    var n = y.length, m = y.reduce(function (a, b) { return a + b; }, 0) / n, sse = 0, sst = 0, ae = 0;
    y.forEach(function (v, i) { var e = v - p[i]; sse += e * e; sst += (v - m) * (v - m); ae += Math.abs(e); });
    return {r2: 1 - sse / sst, rmse: Math.sqrt(sse / n), mae: ae / n};
  }
  function auc(y, s) {   // Mann–Whitney form with average ranks for ties
    var r = S3.avgRanks(s).r, n1 = 0, rs = 0; y.forEach(function (v, i) { if (v === 1) { n1++; rs += r[i]; } }); var n0 = y.length - n1;
    return n1 && n0 ? (rs - n1 * (n1 + 1) / 2) / (n1 * n0) : NaN;
  }
  function rocCurve(y, s) {
    var o = s.map(function (v, i) { return [v, y[i]]; }).sort(function (a, b) { return b[0] - a[0]; }), P = y.filter(function (v) { return v === 1; }).length, N = y.length - P, tp = 0, fp = 0, pts = [[0, 0]];
    for (var i = 0; i < o.length; i++) { if (o[i][1] === 1) tp++; else fp++; if (i === o.length - 1 || o[i + 1][0] !== o[i][0]) pts.push([fp / N, tp / P]); }
    return pts;
  }
  function clsMetrics(y, prob, thr) {   // binary: y in {0,1}, prob = P(class 1)
    thr = thr == null ? 0.5 : thr; var tp = 0, tn = 0, fp = 0, fn = 0, ll = 0, br = 0, eps = 2.220446049250313e-16;
    y.forEach(function (v, i) { var pr = prob[i], h = pr >= thr ? 1 : 0; if (h && v) tp++; else if (h) fp++; else if (v) fn++; else tn++; var c = Math.min(1 - eps, Math.max(eps, pr)); ll -= v ? Math.log(c) : Math.log(1 - c); br += (pr - v) * (pr - v); });
    var n = y.length, prec = tp / (tp + fp), rec = tp / (tp + fn), spec = tn / (tn + fp);
    return {accuracy: (tp + tn) / n, balanced: (rec + spec) / 2, precision: tp + fp ? prec : 0, recall: rec, specificity: spec, f1: tp ? 2 * prec * rec / (prec + rec) : 0, auc: auc(y, prob), logloss: ll / n, brier: br / n, cm: [[tn, fp], [fn, tp]]};
  }
  function multiMetrics(y, P) {   // multiclass: y = class index, P = probability rows
    var n = y.length, hit = 0, ll = 0, K = P[0].length, rec = new Array(K).fill(0), cnt = new Array(K).fill(0);
    y.forEach(function (c, i) { var h = P[i].indexOf(amax(P[i])); if (h === c) { hit++; rec[c]++; } cnt[c]++; ll -= Math.log(Math.min(1 - 1e-15, Math.max(1e-15, P[i][c]))); });
    var bal = rec.map(function (v, c) { return cnt[c] ? v / cnt[c] : null; }).filter(function (v) { return v != null; });
    return {accuracy: hit / n, balanced: bal.reduce(function (a, b) { return a + b; }, 0) / bal.length, logloss: ll / n};
  }
  function calibration(y, prob, bins) {   // sklearn calibration_curve, strategy "uniform"; empty bins dropped
    bins = bins || 10; var tot = new Array(bins).fill(0), tru = new Array(bins).fill(0), sum = new Array(bins).fill(0);
    prob.forEach(function (p, i) { var b = 0; while (b < bins - 1 && p > (b + 1) / bins) b++; tot[b]++; tru[b] += y[i]; sum[b] += p; });
    var out = []; tot.forEach(function (t, b) { if (t) out.push({pred: sum[b] / t, obs: tru[b] / t, n: t}); });
    var n = prob.length, ece = out.reduce(function (s, c) { return s + c.n / n * Math.abs(c.obs - c.pred); }, 0);
    // Calibration intercept and slope: logistic regression of the outcome on logit(prob)
    var lg = prob.map(function (p) { var c = Math.min(1 - 1e-9, Math.max(1e-9, p)); return [Math.log(c / (1 - c))]; }), fit = null;
    try { fit = logit(lg, y, 0); } catch (e) {}
    return {bins: out, ece: ece, slope: fit ? fit.coef[0] : NaN, intercept: fit ? fit.intercept : NaN};
  }
  function rng(seed) { var r = S3.rngN(seed); return r.u; }
  return {tree: tree, treePredict: treePredict, treeRules: treeRules, forest: forest, forestPredict: forestPredict, standardize: standardize, enet: enet, alphaMax: alphaMax, logit: logit,
    kfold: kfold, stratified: stratified, groupKFold: groupKFold, timeSplit: timeSplit, regMetrics: regMetrics, clsMetrics: clsMetrics, multiMetrics: multiMetrics, auc: auc, rocCurve: rocCurve, calibration: calibration, rng: rng};
})();
