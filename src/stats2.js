// ---------- More statistics: assumption checks, rank tests, post-hoc, paired, logistic, power, Bayes ----------
// Each follows its published definition; results are checked against SciPy.
var S2 = (function () {
  function pnorm(z) { if (z === Infinity) return 1; if (z === -Infinity) return 0; var q = 0.5 * S.gammaQ(0.5, z * z / 2); return z >= 0 ? 1 - q : q; }   // standard normal CDF via erfc
  function qnorm(p) {   // Acklam's inverse normal
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239],
      b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
      c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783],
      d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], q, r;
    if (p < 0.02425) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); return S.quantile(s, 0.5); }
  function rankAll(vals) {   // average ranks plus the tie term sum(t^3 - t)
    var idx = vals.map(function (v, i) { return [v, i]; }).sort(function (p, q) { return p[0] - q[0]; }), r = new Array(vals.length), ties = 0;
    for (var i = 0; i < idx.length;) { var j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; var t = j - i + 1, avg = (i + j) / 2 + 1; for (var k = i; k <= j; k++) r[idx[k][1]] = avg; ties += t * t * t - t; i = j + 1; }
    return {r: r, ties: ties};
  }

  // Shapiro-Wilk, Royston (1995) approximation as in AS R94
  function shapiro(x) {
    x = S.nums(x).slice().sort(function (p, q) { return p - q; }); var n = x.length;
    if (n < 3 || n > 5000) return null;
    x = S.normalize(x);
    var m = [], mm = 0, a = new Array(n);
    for (var i = 1; i <= n; i++) { var v = qnorm((i - 0.375) / (n + 0.25)); m.push(v); mm += v * v; }
    if (n === 3) { a = [-Math.SQRT1_2, 0, Math.SQRT1_2]; }
    else {
      var u = 1 / Math.sqrt(n), an = m[n - 1] / Math.sqrt(mm) + 0.221157 * u - 0.147981 * u * u - 2.07119 * Math.pow(u, 3) + 4.434685 * Math.pow(u, 4) - 2.706056 * Math.pow(u, 5), phi, an1;
      if (n > 5) { an1 = m[n - 2] / Math.sqrt(mm) + 0.042981 * u - 0.293762 * u * u - 1.752461 * Math.pow(u, 3) + 5.682633 * Math.pow(u, 4) - 3.582633 * Math.pow(u, 5); phi = (mm - 2 * m[n - 1] * m[n - 1] - 2 * m[n - 2] * m[n - 2]) / (1 - 2 * an * an - 2 * an1 * an1); }
      else phi = (mm - 2 * m[n - 1] * m[n - 1]) / (1 - 2 * an * an);
      for (var j = 0; j < n; j++) a[j] = m[j] / Math.sqrt(phi);
      a[n - 1] = an; a[0] = -an; if (n > 5) { a[n - 2] = an1; a[1] = -an1; }
    }
    var mean = S.mean(x), ss = 0, num = 0; for (var k = 0; k < n; k++) { ss += (x[k] - mean) * (x[k] - mean); num += a[k] * x[k]; }
    if (ss === 0) return null;
    var W = Math.min(1, num * num / ss), p;
    if (n === 3) p = Math.max(0, Math.min(1, 6 / Math.PI * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75)))));
    else if (n <= 11) { var g = -2.273 + 0.459 * n, mu = 0.544 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n * n * n, sg = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n * n * n); p = 1 - pnorm((-Math.log(g - Math.log(1 - W)) - mu) / sg); }
    else { var L = Math.log(n), mu2 = -1.5861 - 0.31082 * L - 0.083751 * L * L + 0.0038915 * L * L * L, sg2 = Math.exp(-0.4803 - 0.082676 * L + 0.0030302 * L * L); p = 1 - pnorm((Math.log(1 - W) - mu2) / sg2); }
    return {W: W, p: p, n: n};
  }
  // Levene's test, median-centred (Brown-Forsythe)
  function levene(groups) { return S.anova(groups.map(function (g) { var md = median(g); return g.map(function (v) { return Math.abs(v - md); }); })); }
  // Mann-Whitney U, normal approximation with tie and continuity corrections
  function mannWhitney(a, b) {
    var n1 = a.length, n2 = b.length, N = n1 + n2, rk = rankAll(a.concat(b)), R1 = 0;
    for (var i = 0; i < n1; i++) R1 += rk.r[i];
    var U1 = R1 - n1 * (n1 + 1) / 2, mu = n1 * n2 / 2, sd = Math.sqrt(n1 * n2 / 12 * ((N + 1) - rk.ties / (N * (N - 1))));
    var z = (U1 - mu - (U1 > mu ? 0.5 : U1 < mu ? -0.5 : 0)) / sd;
    return {U: U1, z: z, p: Math.min(1, 2 * (1 - pnorm(Math.abs(z)))), r: 2 * U1 / (n1 * n2) - 1, n1: n1, n2: n2};
  }
  // Kruskal-Wallis H with tie correction
  function kruskal(groups) {
    var all = [].concat.apply([], groups), N = all.length, rk = rankAll(all), off = 0, H = 0;
    groups.forEach(function (g) { var R = 0; for (var i = 0; i < g.length; i++) R += rk.r[off + i]; off += g.length; H += R * R / g.length; });
    H = 12 / (N * (N + 1)) * H - 3 * (N + 1); H /= 1 - rk.ties / (N * N * N - N);
    var df = groups.length - 1; return {H: H, df: df, p: S.pChi(H, df), eps2: H / (N - 1), n: N};
  }
  // Wilcoxon signed-rank (zeros dropped), normal approximation with tie correction
  function wilcoxon(x, y) {
    var d = []; for (var i = 0; i < x.length; i++) if (typeof x[i] === "number" && typeof y[i] === "number" && x[i] !== y[i]) d.push(x[i] - y[i]);
    var n = d.length; if (n < 2) return null;
    var rk = rankAll(d.map(Math.abs)), wp = 0; d.forEach(function (v, i) { if (v > 0) wp += rk.r[i]; });
    var T = Math.min(wp, n * (n + 1) / 2 - wp), mu = n * (n + 1) / 4, sd = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - rk.ties / 48), z = (T - mu) / sd;
    return {T: T, Wplus: wp, z: z, p: Math.min(1, 2 * pnorm(-Math.abs(z))), n: n, r: Math.abs(z) / Math.sqrt(n)};
  }
  function pairedT(x, y) {
    var d = []; for (var i = 0; i < x.length; i++) if (typeof x[i] === "number" && typeof y[i] === "number") d.push(x[i] - y[i]);
    var D = S.describe(d), t = D.mean / D.se, df = D.n - 1, tc = tcrit(df);
    return {t: t, df: df, p: S.pT(t, df), mean: D.mean, ciLo: D.mean - tc * D.se, ciHi: D.mean + tc * D.se, dz: D.mean / D.sd, n: D.n};
  }
  function tcrit(df) { var lo = 0, hi = 50; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (S.pT(m, df) > 0.05) lo = m; else hi = m; } return (lo + hi) / 2; }
  // Holm-adjusted pairwise Welch t-tests (post-hoc)
  function pairwise(names, groups) {
    var out = [];
    for (var i = 0; i < names.length; i++) for (var j = i + 1; j < names.length; j++) { var t = S.ttest(groups[i], groups[j]); out.push({a: names[i], b: names[j], diff: t.diff, p: t.p, d: t.d}); }
    var order = out.map(function (_, k) { return k; }).sort(function (p, q) { return out[p].p - out[q].p; }), m = out.length, run = 0;
    order.forEach(function (k, r) { run = Math.max(run, Math.min(1, (m - r) * out[k].p)); out[k].padj = run; });
    return out;
  }
  // Logistic regression by iteratively reweighted least squares
  function logistic(y, X, names) {
    var rows = []; for (var i = 0; i < y.length; i++) if ((y[i] === 0 || y[i] === 1) && X[i].every(function (v) { return typeof v === "number" && isFinite(v); })) rows.push(i);
    var n = rows.length, k = names.length + 1; if (n <= k + 2) return {error: "Too few complete rows for this many predictors."};
    var Xm = rows.map(function (i) { return [1].concat(X[i]); }), Y = rows.map(function (i) { return y[i]; }), b = new Array(k).fill(0), inv = null, ll = 0; var conv = false;
    for (var it = 0; it < 50; it++) {
      var H = [], g = new Array(k).fill(0); for (var a = 0; a < k; a++) H.push(new Array(k).fill(0)); ll = 0;
      for (var r = 0; r < n; r++) { var eta = 0; for (var c = 0; c < k; c++) eta += Xm[r][c] * b[c]; var p = 1 / (1 + Math.exp(-eta)), w = p * (1 - p); ll += Y[r] ? Math.log(Math.max(p, 1e-300)) : Math.log(Math.max(1 - p, 1e-300));
        for (var a2 = 0; a2 < k; a2++) { g[a2] += Xm[r][a2] * (Y[r] - p); for (var b2 = 0; b2 < k; b2++) H[a2][b2] += w * Xm[r][a2] * Xm[r][b2]; } }
      inv = invert(H); if (!inv) return {error: "The outcome is perfectly predicted by these columns (complete separation), so no finite effect can be estimated."};
      var step = inv.map(function (row) { return row.reduce(function (s, v, j) { return s + v * g[j]; }, 0); }), mx = 0;
      step.forEach(function (s, j) { b[j] += s; mx = Math.max(mx, Math.abs(s)); });
      if (mx < 1e-8 * (1 + b.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 0))) { conv = true; break; }
    }
    if (!conv) return {error: "The model does not converge: one predictor almost perfectly separates the outcome."};
    var p0 = S.mean(Y), ll0 = 0; Y.forEach(function (v) { ll0 += v ? Math.log(p0) : Math.log(1 - p0); });
    var coefs = b.map(function (bj, j) { var se = Math.sqrt(inv[j][j]), z = bj / se; return {name: j ? names[j - 1] : "(baseline)", b: bj, se: se, z: z, p: 2 * pnorm(-Math.abs(z)), or: Math.exp(bj), lo: Math.exp(bj - 1.959964 * se), hi: Math.exp(bj + 1.959964 * se)}; });
    var lr = 2 * (ll - ll0);
    return {n: n, coefs: coefs, r2: 1 - ll / ll0, lr: lr, df: k - 1, p: S.pChi(lr, k - 1), base: p0};
  }
  function invert(M) {
    var n = M.length, A = M.map(function (r, i) { return r.concat(M.map(function (_, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) { var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (Math.abs(A[p][c]) < 1e-12) return null; var t = A[c]; A[c] = A[p]; A[p] = t; var d = A[c][c]; for (var k = 0; k < 2 * n; k++) A[c][k] /= d; for (var r2 = 0; r2 < n; r2++) if (r2 !== c) { var f = A[r2][c]; for (var k2 = 0; k2 < 2 * n; k2++) A[r2][k2] -= f * A[c][k2]; } }
    return A.map(function (r) { return r.slice(n); });
  }
  // Power and sample size (normal approximation), alpha .05 two-sided, target 80%
  var ZA = 1.959964, ZB = 0.841621;
  function powerD(d, n1, n2) { var nh = 2 / (1 / n1 + 1 / n2); var delta = Math.abs(d) * Math.sqrt(nh / 2); return {power: pnorm(delta - ZA) + pnorm(-delta - ZA), need: Math.ceil(2 * Math.pow((ZA + ZB) / Math.abs(d), 2))}; }
  function powerR(r, n) { var z = Math.abs(Math.atanh(Math.max(-0.999, Math.min(0.999, r)))); var delta = z * Math.sqrt(n - 3); return {power: n > 3 ? pnorm(delta - ZA) + pnorm(-delta - ZA) : NaN, need: Math.ceil(Math.pow((ZA + ZB) / z, 2) + 3)}; }
  // Approximate Bayes factor from BIC (Wagenmakers 2007): evidence for an effect against none
  function bfR2(r2, n, extra) { return Math.exp(-(n * Math.log(Math.max(1e-12, 1 - r2)) + (extra || 1) * Math.log(n)) / 2); }
  function bfWord(bf) { var b = bf >= 1 ? bf : 1 / bf, w = b > 100 ? "extreme" : b > 30 ? "very strong" : b > 10 ? "strong" : b > 3 ? "moderate" : "weak (anecdotal)"; return w + " evidence " + (bf >= 1 ? "for an effect" : "for no effect"); }
  return {pnorm: pnorm, qnorm: qnorm, shapiro: shapiro, levene: levene, mannWhitney: mannWhitney, kruskal: kruskal, wilcoxon: wilcoxon, pairedT: pairedT, pairwise: pairwise, logistic: logistic, powerD: powerD, powerR: powerR, bfR2: bfR2, bfWord: bfWord, median: median};
})();
