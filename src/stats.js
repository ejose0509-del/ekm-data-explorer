// ---------- Statistics engine (runs in the browser; same formulas as SciPy) ----------
var S = (function () {
  function lgamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    var s = 1.000000000190015; for (var j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  function betacf(a, b, x) {
    var qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; var h = d;
    for (var m = 1; m <= 300; m++) {
      var m2 = 2 * m, aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d;
      var del = d * c; h *= del; if (Math.abs(del - 1) < 3e-14) break;
    }
    return h;
  }
  function ibeta(x, a, b) {   // regularized incomplete beta I_x(a, b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    var bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function gammaQ(a, x) {     // regularized upper incomplete gamma Q(a, x)
    if (x <= 0) return 1;
    var gln = lgamma(a);
    if (x < a + 1) { var ap = a, sum = 1 / a, del = sum; for (var n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 3e-14) break; } return 1 - sum * Math.exp(-x + a * Math.log(x) - gln); }
    var b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (var i = 1; i <= 500; i++) { var an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; var dl = d * c; h *= dl; if (Math.abs(dl - 1) < 3e-14) break; }
    return Math.exp(-x + a * Math.log(x) - gln) * h;
  }
  var pT = function (t, df) { return ibeta(df / (df + t * t), df / 2, 0.5); };            // two-sided
  var pF = function (f, d1, d2) { return f <= 0 ? 1 : ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2); };   // upper tail
  var pChi = function (x, k) { return gammaQ(k / 2, x / 2); };
  function tCrit(df) { var lo = 0, hi = 50; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (pT(m, df) > 0.05) lo = m; else hi = m; } return (lo + hi) / 2; }

  function nums(a) { return a.filter(function (v) { return typeof v === "number" && isFinite(v); }); }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : NaN; }
  function variance(a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length > 1 ? s / (a.length - 1) : NaN; }
  function quantile(sorted, p) { if (!sorted.length) return NaN; var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
  function describe(a) {
    var x = nums(a), s = x.slice().sort(function (p, q) { return p - q; }), n = x.length, m = mean(x), sd = Math.sqrt(variance(x));
    var q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1, skew = 0;
    for (var i = 0; i < n; i++) skew += Math.pow((x[i] - m) / sd, 3);
    skew = n > 2 && sd > 0 ? skew * n / ((n - 1) * (n - 2)) : 0;
    var out = x.filter(function (v) { return v < q1 - 1.5 * iqr || v > q3 + 1.5 * iqr; }).length;
    return {n: n, mean: m, sd: sd, min: s[0], q1: q1, median: quantile(s, 0.5), q3: q3, max: s[n - 1], skew: skew, outliers: out, se: sd / Math.sqrt(n)};
  }
  function ranks(a) {
    var idx = a.map(function (v, i) { return [v, i]; }).sort(function (p, q) { return p[0] - q[0]; }), r = new Array(a.length);
    for (var i = 0; i < idx.length;) { var j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; var avg = (i + j) / 2 + 1; for (var k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; }
    return r;
  }
  function pairs(xs, ys) { var x = [], y = []; for (var i = 0; i < xs.length; i++) if (typeof xs[i] === "number" && isFinite(xs[i]) && typeof ys[i] === "number" && isFinite(ys[i])) { x.push(xs[i]); y.push(ys[i]); } return [x, y]; }
  function pearsonRaw(x, y) { var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0; for (var i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); } return sxy / Math.sqrt(sxx * syy); }
  function correlate(xs, ys) {
    var p = pairs(xs, ys), x = p[0], y = p[1], n = x.length;
    if (n < 3) return {n: n};
    var r = pearsonRaw(x, y), t = r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r)), rho = pearsonRaw(ranks(x), ranks(y)), ts = rho * Math.sqrt((n - 2) / Math.max(1e-12, 1 - rho * rho));
    var mx = mean(x), my = mean(y), sxx = 0, sxy = 0; for (var i = 0; i < n; i++) { sxx += (x[i] - mx) * (x[i] - mx); sxy += (x[i] - mx) * (y[i] - my); }
    var slope = sxy / sxx, icpt = my - slope * mx, z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))), zs = 1.959964 / Math.sqrt(Math.max(1, n - 3));
    return {n: n, r: r, p: pT(t, n - 2), rho: rho, prho: pT(ts, n - 2), slope: slope, intercept: icpt, r2: r * r, ciLo: Math.tanh(z - zs), ciHi: Math.tanh(z + zs), x: x, y: y};
  }
  function ttest(a, b) {   // Welch
    var A = describe(a), B = describe(b), va = A.sd * A.sd / A.n, vb = B.sd * B.sd / B.n, t = (A.mean - B.mean) / Math.sqrt(va + vb);
    var df = (va + vb) * (va + vb) / (va * va / (A.n - 1) + vb * vb / (B.n - 1)), sp = Math.sqrt(((A.n - 1) * A.sd * A.sd + (B.n - 1) * B.sd * B.sd) / (A.n + B.n - 2));
    var tc = tCrit(df), diff = A.mean - B.mean, se = Math.sqrt(va + vb);
    return {t: t, df: df, p: pT(t, df), d: diff / sp, diff: diff, ciLo: diff - tc * se, ciHi: diff + tc * se, A: A, B: B};
  }
  function anova(groups) {   // groups: [[values]]
    var all = [].concat.apply([], groups), gm = mean(all), ssb = 0, ssw = 0, k = groups.length, n = all.length;
    groups.forEach(function (g) { var m = mean(g); ssb += g.length * (m - gm) * (m - gm); g.forEach(function (v) { ssw += (v - m) * (v - m); }); });
    var df1 = k - 1, df2 = n - k, F = (ssb / df1) / (ssw / df2);
    return {F: F, df1: df1, df2: df2, p: pF(F, df1, df2), eta2: ssb / (ssb + ssw), n: n, k: k};
  }
  function chisq(table) {   // table: rows of counts
    var R = table.length, C = table[0].length, rt = table.map(sum), ct = [], N = sum(rt), x2 = 0, low = 0;
    for (var j = 0; j < C; j++) { var s = 0; for (var i = 0; i < R; i++) s += table[i][j]; ct.push(s); }
    for (var i2 = 0; i2 < R; i2++) for (var j2 = 0; j2 < C; j2++) { var e = rt[i2] * ct[j2] / N; if (e < 5) low++; if (e > 0) x2 += (table[i2][j2] - e) * (table[i2][j2] - e) / e; }
    var df = (R - 1) * (C - 1);
    return {x2: x2, df: df, p: pChi(x2, df), v: Math.sqrt(x2 / (N * Math.max(1, Math.min(R, C) - 1))), n: N, lowExpected: low / (R * C)};
  }
  function invert(M) {
    var n = M.length, A = M.map(function (r, i) { return r.concat(M.map(function (_, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      var tmp = A[c]; A[c] = A[p]; A[p] = tmp;
      var d = A[c][c]; for (var k = 0; k < 2 * n; k++) A[c][k] /= d;
      for (var r2 = 0; r2 < n; r2++) if (r2 !== c) { var f = A[r2][c]; for (var k2 = 0; k2 < 2 * n; k2++) A[r2][k2] -= f * A[c][k2]; }
    }
    return A.map(function (r) { return r.slice(n); });
  }
  function ols(y, X, names) {   // X: rows of predictor values (no intercept column)
    var rows = []; for (var i = 0; i < y.length; i++) { var ok = typeof y[i] === "number" && isFinite(y[i]) && X[i].every(function (v) { return typeof v === "number" && isFinite(v); }); if (ok) rows.push(i); }
    var n = rows.length, k = names.length + 1;
    if (n <= k + 1) return {n: n, error: "Too few complete rows for this many predictors."};
    var Xm = rows.map(function (i) { return [1].concat(X[i]); }), Y = rows.map(function (i) { return y[i]; });
    var XtX = []; for (var a = 0; a < k; a++) { XtX.push([]); for (var b = 0; b < k; b++) { var s = 0; for (var r = 0; r < n; r++) s += Xm[r][a] * Xm[r][b]; XtX[a].push(s); } }
    var inv = invert(XtX); if (!inv) return {n: n, error: "Two or more predictors carry the same information (perfectly collinear). Remove one."};
    var Xty = []; for (var a2 = 0; a2 < k; a2++) { var s2 = 0; for (var r2 = 0; r2 < n; r2++) s2 += Xm[r2][a2] * Y[r2]; Xty.push(s2); }
    var beta = inv.map(function (row) { return sum(row.map(function (v, j) { return v * Xty[j]; })); });
    var my = mean(Y), sse = 0, sst = 0; for (var r3 = 0; r3 < n; r3++) { var fit = sum(Xm[r3].map(function (v, j) { return v * beta[j]; })); sse += (Y[r3] - fit) * (Y[r3] - fit); sst += (Y[r3] - my) * (Y[r3] - my); }
    var df = n - k, s2e = sse / df, tc = tCrit(df);
    var coefs = beta.map(function (b, j) { var se = Math.sqrt(inv[j][j] * s2e), t = b / se; return {name: j ? names[j - 1] : "(baseline)", b: b, se: se, t: t, p: pT(t, df), lo: b - tc * se, hi: b + tc * se}; });
    var r2 = 1 - sse / sst, adj = 1 - (1 - r2) * (n - 1) / df, F = ((sst - sse) / (k - 1)) / s2e;
    return {n: n, coefs: coefs, r2: r2, adj: adj, F: F, pF: pF(F, k - 1, df), df: df};
  }
  return {describe: describe, correlate: correlate, ttest: ttest, anova: anova, chisq: chisq, ols: ols, mean: mean, quantile: quantile, nums: nums, pT: pT, pF: pF, pChi: pChi, ibeta: ibeta, gammaQ: gammaQ};
})();
