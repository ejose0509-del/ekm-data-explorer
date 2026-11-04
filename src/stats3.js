// ---------- S3: study planning, repeated and grouped data, measurement, agreement, missing data ----------
// Every function follows a published definition and is checked in tests/check_methods.py against
// statsmodels, scikit-learn, pingouin or factor_analyzer.
var S3 = (function () {
  var LN_SQRT_PI = 0.5723649429247001, SQRT_2_PI = 0.7978845608028654;
  function lgamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    var y = x, t = x + 5.5, s = 1.000000000190015; t -= (x + 0.5) * Math.log(t);
    for (var j = 0; j < 6; j++) s += c[j] / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
  }
  var pnorm = function (z) { return S2.pnorm(z); }, qnorm = function (p) { return S2.qnorm(p); };
  // Central distributions
  function pt(t, df) { if (!isFinite(t)) return t > 0 ? 1 : 0; var x = df / (df + t * t), tail = 0.5 * S.ibeta(x, df / 2, 0.5); return t > 0 ? 1 - tail : tail; }
  function pf(f, d1, d2) { return f <= 0 ? 0 : S.ibeta(d1 * f / (d1 * f + d2), d1 / 2, d2 / 2); }
  function pchisq(x, k) { return x <= 0 ? 0 : 1 - S.gammaQ(k / 2, x / 2); }
  function invert(cdf, p, lo, hi) {
    while (cdf(hi) < p && hi < 1e12) { lo = hi; hi *= 2; }
    for (var i = 0; i < 200; i++) { var m = (lo + hi) / 2; if (cdf(m) < p) lo = m; else hi = m; if (hi - lo < 1e-13 * Math.max(1, Math.abs(m))) break; }
    return (lo + hi) / 2;
  }
  function qt(p, df) { if (p === 0.5) return 0; if (p < 0.5) return -qt(1 - p, df); return invert(function (t) { return pt(t, df); }, p, 0, 10); }
  function qf(p, d1, d2) { return invert(function (f) { return pf(f, d1, d2); }, p, 0, 10); }
  function qchisq(p, k) { return invert(function (x) { return pchisq(x, k); }, p, 0, Math.max(10, 2 * k)); }
  // Noncentral t CDF: Lenth (1989) AS 243, as in R's pnt.c
  function pnct(t, df, ncp) {
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    var negdel = false, tt = t, del = ncp;
    if (t < 0) { negdel = true; tt = -t; del = -ncp; }
    if (df > 4e5 || del * del > 2 * Math.LN2 * 1021) {
      var s0 = 1 / (4 * df), z = (tt * (1 - s0) - del) / Math.sqrt(1 + tt * tt * 2 * s0), p0 = pnorm(z);
      return negdel ? 1 - p0 : p0;
    }
    var x = tt * tt / (tt * tt + df), tnc = 0;
    if (x > 0) {
      var lambda = del * del, p = 0.5 * Math.exp(-0.5 * lambda), q = SQRT_2_PI * p * del, s = 0.5 - p;
      if (s < 1e-7) s = -0.5 * (Math.exp(-0.5 * lambda) - 1);
      var a = 0.5, b = 0.5 * df, rxb = Math.pow(1 - x, b), albeta = LN_SQRT_PI + lgamma(b) - lgamma(0.5 + b);
      var xodd = S.ibeta(x, a, b), godd = 2 * rxb * Math.exp(a * Math.log(x) - albeta), bx = b * x;
      var xeven = bx < 2.220446e-16 ? bx : 1 - rxb, geven = bx * rxb;
      tnc = p * xodd + q * xeven;
      for (var it = 1; it <= 2000; it++) {
        a += 1; xodd -= godd; xeven -= geven; godd *= x * (a + b - 1) / a; geven *= x * (a + b - 0.5) / (a + 0.5);
        p *= lambda / (2 * it); q *= lambda / (2 * it + 1); tnc += p * xodd + q * xeven; s -= p;
        if (s < -1e-10 || (s <= 0 && it > 1)) break;
        if (Math.abs(2 * s * (xodd - godd)) < 1e-14) break;
      }
    }
    tnc += pnorm(-del);
    tnc = Math.min(1, Math.max(0, tnc));
    return negdel ? 1 - tnc : tnc;
  }
  // Poisson-weighted mixtures for noncentral F and chi-square, summed outward from the mode
  function poissonMix(lam, term) {
    var h = lam / 2, mode = Math.floor(h), total = 0, lw0 = -h + mode * Math.log(h || 1) - lgamma(mode + 1);
    if (h === 0) return term(0);
    for (var j = mode, lw = lw0; j < mode + 5000; j++) { var w = Math.exp(lw), v = w * term(j); total += v; if (w < 1e-17 && j > mode + 10) break; lw += Math.log(h) - Math.log(j + 1); }
    for (j = mode - 1, lw = lw0 - Math.log(h) + Math.log(mode); j >= 0; j--) { var w2 = Math.exp(lw); total += w2 * term(j); if (w2 < 1e-17) break; lw += Math.log(j) - Math.log(h); }
    return Math.min(1, Math.max(0, total));
  }
  function pncf(f, d1, d2, lam) { if (f <= 0) return 0; var x = d1 * f / (d1 * f + d2); return poissonMix(lam, function (j) { return S.ibeta(x, d1 / 2 + j, d2 / 2); }); }
  function pncchisq(x, k, lam) { if (x <= 0) return 0; return poissonMix(lam, function (j) { return 1 - S.gammaQ(k / 2 + j, x / 2); }); }

  // ---- Power (conventions of statsmodels.stats.power and the pwr package) ----
  function tail(alt, alpha) { return alt === "two-sided" ? alpha / 2 : alpha; }
  function powerT(nc, df, alpha, alt) {
    var c = qt(1 - tail(alt, alpha), df), pw = 0;
    if (alt !== "smaller") pw += 1 - pnct(c, df, nc);
    if (alt !== "larger") pw += pnct(-c, df, nc);
    return pw;
  }
  var power = {
    tInd: function (d, n1, ratio, alpha, alt) { var n2 = n1 * ratio; return powerT(d * Math.sqrt(1 / (1 / n1 + 1 / n2)), n1 + n2 - 2, alpha, alt); },
    tOne: function (d, n, alpha, alt) { return powerT(d * Math.sqrt(n), n - 1, alpha, alt); },
    anova: function (f, n, k, alpha) { var c = qf(1 - alpha, k - 1, n - k); return 1 - pncf(c, k - 1, n - k, f * f * n); },
    chisq: function (w, n, df, alpha) { var c = qchisq(1 - alpha, df); return 1 - pncchisq(c, df, w * w * n); },
    prop: function (h, n1, ratio, alpha, alt) {
      var n = 1 / (1 / n1 + 1 / (n1 * ratio)), c = qnorm(1 - tail(alt, alpha)), m = h * Math.sqrt(n), pw = 0;
      if (alt !== "smaller") pw += 1 - pnorm(c - m);
      if (alt !== "larger") pw += pnorm(-c - m);
      return pw;
    },
    corr: function (r, n, alpha, alt) {   // pwr.r.test
      if (n <= 3) return NaN;
      var two = alt === "two-sided", ttt = qt(1 - (two ? alpha / 2 : alpha), n - 2), rc = Math.sqrt(ttt * ttt / (ttt * ttt + n - 2));
      var zr = Math.atanh(r) + r / (2 * (n - 1)), zrc = Math.atanh(rc), s = Math.sqrt(n - 3);
      if (two) return pnorm((zr - zrc) * s) + pnorm((-zr - zrc) * s);
      return alt === "larger" ? pnorm((zr - zrc) * s) : pnorm((-zr - zrc) * s);
    },
    regress: function (f2, n, k, alpha) { var d2 = n - k - 1; if (d2 < 1) return NaN; var c = qf(1 - alpha, k, d2); return 1 - pncf(c, k, d2, f2 * n); }
  };
  // Smallest whole n (per group where relevant) that reaches the target power
  function solveN(fn, target, lo) {
    lo = lo || 2; var hi = lo;
    while (!(fn(hi) >= target)) { lo = hi; hi = hi * 2; if (hi > 1e8) return NaN; }
    while (hi - lo > 1) { var m = Math.floor((lo + hi) / 2); if (fn(m) >= target) hi = m; else lo = m; }
    return fn(lo) >= target ? lo : hi;
  }
  // Smallest effect detectable with the given n and power
  function solveEffect(fn, target, hi) {
    var lo = 1e-6; hi = hi || 10; if (!(fn(hi) >= target)) return NaN;
    for (var i = 0; i < 100; i++) { var m = (lo + hi) / 2; if (fn(m) >= target) hi = m; else lo = m; }
    return hi;
  }

  // ---- small linear algebra ----
  function zeros(r, c) { var M = []; for (var i = 0; i < r; i++) { M.push(new Array(c).fill(0)); } return M; }
  function T(M) { return M[0].map(function (_, j) { return M.map(function (r) { return r[j]; }); }); }
  function mul(A2, B) { var n = A2.length, m = B[0].length, k = B.length, C = zeros(n, m); for (var i = 0; i < n; i++) for (var t = 0; t < k; t++) { var a = A2[i][t]; if (a) for (var j = 0; j < m; j++) C[i][j] += a * B[t][j]; } return C; }
  function inv(M) {   // Gauss–Jordan with partial pivoting; null if singular
    var n = M.length, X = M.map(function (r, i) { return r.concat(M.map(function (_, j) { return i === j ? 1 : 0; })); });
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(X[r][c]) > Math.abs(X[p][c])) p = r;
      if (Math.abs(X[p][c]) < 1e-12) return null;
      var tmp = X[c]; X[c] = X[p]; X[p] = tmp; var d = X[c][c];
      for (var j = 0; j < 2 * n; j++) X[c][j] /= d;
      for (r = 0; r < n; r++) if (r !== c) { var f = X[r][c]; if (f) for (j = 0; j < 2 * n; j++) X[r][j] -= f * X[c][j]; }
    }
    return X.map(function (r) { return r.slice(n); });
  }
  function logdet(M) {   // via LU; NaN if not positive
    var n = M.length, X = M.map(function (r) { return r.slice(); }), ld = 0;
    for (var c = 0; c < n; c++) {
      var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(X[r][c]) > Math.abs(X[p][c])) p = r;
      if (X[p][c] === 0) return -Infinity;
      if (p !== c) { var t = X[c]; X[c] = X[p]; X[p] = t; }
      ld += Math.log(Math.abs(X[c][c]));
      for (r = c + 1; r < n; r++) { var f = X[r][c] / X[c][c]; for (var j = c; j < n; j++) X[r][j] -= f * X[c][j]; }
    }
    return ld;
  }
  // Symmetric eigen-decomposition (cyclic Jacobi). Values descending, vectors in columns.
  function eigSym(M) {
    var n = M.length, a = M.map(function (r) { return r.slice(); }), V = zeros(n, n);
    for (var i = 0; i < n; i++) V[i][i] = 1;
    for (var sweep = 0; sweep < 100; sweep++) {
      var off = 0; for (i = 0; i < n; i++) for (var j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
      if (off < 1e-22) break;
      for (var p = 0; p < n; p++) for (var q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        var th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (var k = 0; k < n; k++) { var akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
        for (k = 0; k < n; k++) { var apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
        for (k = 0; k < n; k++) { var vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
      }
    }
    var idx = a.map(function (_, i) { return i; }).sort(function (x, y) { return a[y][y] - a[x][x]; });
    return {values: idx.map(function (i) { return a[i][i]; }), vectors: V.map(function (r) { return idx.map(function (i) { return r[i]; }); })};
  }
  function corrMatrix(X) {
    var n = X.length, p = X[0].length, m = new Array(p).fill(0), C = zeros(p, p);
    X.forEach(function (r) { for (var j = 0; j < p; j++) m[j] += r[j] / n; });
    X.forEach(function (r) { for (var i = 0; i < p; i++) { var di = r[i] - m[i]; for (var j = i; j < p; j++) C[i][j] += di * (r[j] - m[j]); } });
    for (var i = 0; i < p; i++) for (var j = i; j < p; j++) C[j][i] = C[i][j];
    var s = C.map(function (r, i) { return Math.sqrt(r[i]); });
    return {R: C.map(function (r, i) { return r.map(function (v, j) { return v / (s[i] * s[j]); }); }), cov: C.map(function (r) { return r.map(function (v) { return v / (n - 1); }); }), mean: m};
  }
  function nelderMead(f, x0, step, iters) {
    var n = x0.length, pts = [x0.slice()];
    for (var i = 0; i < n; i++) { var p = x0.slice(); p[i] += step; pts.push(p); }
    var vals = pts.map(f);
    for (var it = 0; it < (iters || 4000); it++) {
      var order = vals.map(function (_, i) { return i; }).sort(function (a, b) { return vals[a] - vals[b]; });
      pts = order.map(function (i) { return pts[i]; }); vals = order.map(function (i) { return vals[i]; });
      if (Math.abs(vals[n] - vals[0]) < 1e-12 * (Math.abs(vals[0]) + 1e-12) && it > 50) break;
      var c = new Array(n).fill(0); for (i = 0; i < n; i++) for (var j = 0; j < n; j++) c[j] += pts[i][j] / n;
      var mv = function (a, t) { return c.map(function (v, j) { return v + t * (a[j] - v); }); };
      var xr = mv(pts[n], -1), fr = f(xr);
      if (fr < vals[0]) { var xe = mv(pts[n], -2), fe = f(xe); if (fe < fr) { pts[n] = xe; vals[n] = fe; } else { pts[n] = xr; vals[n] = fr; } }
      else if (fr < vals[n - 1]) { pts[n] = xr; vals[n] = fr; }
      else { var xc = mv(pts[n], fr < vals[n] ? -0.5 : 0.5), fc = f(xc); if (fc < Math.min(fr, vals[n])) { pts[n] = xc; vals[n] = fc; } else { for (i = 1; i <= n; i++) { pts[i] = pts[i].map(function (v, j) { return pts[0][j] + 0.5 * (v - pts[0][j]); }); vals[i] = f(pts[i]); } } }
    }
    var b = vals.indexOf(amin(vals)); return {x: pts[b], f: vals[b]};
  }
  function holm(ps) { var o = ps.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return a[0] - b[0]; }), out = new Array(ps.length), run = 0; o.forEach(function (x, r) { run = Math.max(run, Math.min(1, x[0] * (ps.length - r))); out[x[1]] = run; }); return out; }
  function avgRanks(v) { var o = v.map(function (x, i) { return [x, i]; }).sort(function (a, b) { return a[0] - b[0]; }), r = new Array(v.length), ties = 0; for (var i = 0; i < o.length;) { var j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (var k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; var t = j - i + 1; ties += t * t * t - t; i = j + 1; } return {r: r, ties: ties}; }

  // ---- Repeated measures: one within-subject factor, complete cases (n subjects × k conditions) ----
  function rmAnova(Y) {
    // Normalize once: inference and eigenvalue rank must not depend on physical units.
    var offset = Y[0][0], scale = 0;
    Y.forEach(function (r) { r.forEach(function (v) { scale = Math.max(scale, Math.abs(v - offset)); }); });
    scale = scale || 1;
    Y = Y.map(function (r) { return r.map(function (v) { return (v - offset) / scale; }); });
    var n = Y.length, k = Y[0].length, G = 0, cm = new Array(k).fill(0), sm = Y.map(function (r) { return r.reduce(function (a, b) { return a + b; }, 0) / k; });
    Y.forEach(function (r) { r.forEach(function (v, j) { cm[j] += v / n; G += v / (n * k); }); });
    var sst = 0; Y.forEach(function (r) { r.forEach(function (v) { sst += (v - G) * (v - G); }); });
    var ssc = n * cm.reduce(function (a, m) { return a + (m - G) * (m - G); }, 0), sss = k * sm.reduce(function (a, m) { return a + (m - G) * (m - G); }, 0), sse = sst - ssc - sss;
    var df1 = k - 1, df2 = (k - 1) * (n - 1), F = (ssc / df1) / (sse / df2), p = 1 - pf(F, df1, df2);
    // Sphericity from the double-centred covariance matrix (Mauchly; Greenhouse–Geisser; Huynh–Feldt)
    var cov = corrMatrix(Y).cov, rm = cov.map(function (r) { return r.reduce(function (a, b) { return a + b; }, 0) / k; }), gm = rm.reduce(function (a, b) { return a + b; }, 0) / k;
    var Sp = cov.map(function (r, i) { return r.map(function (v, j) { return v - rm[i] - rm[j] + gm; }); });
    var tr = Sp.reduce(function (a, r, i) { return a + r[i]; }, 0), ss2 = Sp.reduce(function (a, r) { return a + r.reduce(function (b, v) { return b + v * v; }, 0); }, 0);
    var gg = tr * tr / ((k - 1) * ss2), hf = Math.min(1, (n * (k - 1) * gg - 2) / ((k - 1) * (n - 1 - (k - 1) * gg)));
    var eig = eigSym(Sp).values.filter(function (v) { return v > 1e-10 * Math.max(tr, 1e-300); }), d = k - 1, W = NaN, chi = NaN, pW = NaN, dfW = d * (d + 1) / 2 - 1;
    if (k > 2 && eig.length === d && n > k) {
      var se = eig.reduce(function (a, b) { return a + b; }, 0); W = eig.reduce(function (a, b) { return a * b; }, 1) / Math.pow(se / d, d);
      // Chi-square approximation with the second-order term used by R's mauchly.test (and pingouin)
      var fct = 1 - (2 * d * d + d + 2) / (6 * d * (n - 1)), w2 = (d + 2) * (d - 1) * (d - 2) * (2 * d * d * d + 6 * d * d + 3 * k + 2) / (288 * Math.pow((n - 1) * d * fct, 2));
      chi = -(n - 1) * fct * Math.log(W); var p1 = 1 - pchisq(chi, dfW); pW = p1 + w2 * ((1 - pchisq(chi, dfW + 4)) - p1);
    }
    if (k === 2) { gg = 1; hf = 1; }
    return {n: n, k: k, means: cm.map(function (v) { return offset + v * scale; }), ssCond: ssc * scale * scale, ssSubj: sss * scale * scale, ssErr: sse * scale * scale, df1: df1, df2: df2, F: F, p: p,
      eta2p: ssc / (ssc + sse), eta2g: ssc / (ssc + sss + sse), eps: {gg: gg, hf: Math.max(hf, gg), lb: 1 / (k - 1)},
      pGG: 1 - pf(F, df1 * gg, df2 * gg), pHF: 1 - pf(F, df1 * Math.max(hf, gg), df2 * Math.max(hf, gg)), mauchly: {W: W, chi2: chi, df: dfW, p: pW}};
  }
  function friedman(Y) {
    var n = Y.length, k = Y[0].length, R = new Array(k).fill(0), ties = 0;
    Y.forEach(function (r) { var a = avgRanks(r); ties += a.ties; a.r.forEach(function (v, j) { R[j] += v; }); });
    var Q = 12 / (n * k * (k + 1)) * R.reduce(function (a, b) { return a + b * b; }, 0) - 3 * n * (k + 1);
    Q /= 1 - ties / (k * (k * k - 1) * n);
    return {Q: Q, df: k - 1, p: 1 - pchisq(Q, k - 1), W: Q / (n * (k - 1)), meanRanks: R.map(function (v) { return v / n; })};
  }
  function pairedPosthoc(Y, names) {
    var out = [], k = Y[0].length;
    for (var i = 0; i < k; i++) for (var j = i + 1; j < k; j++) {
      var dif = Y.map(function (r) { return r[i] - r[j]; }), n = dif.length, m = dif.reduce(function (a, b) { return a + b; }, 0) / n, sd = Math.sqrt(dif.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n - 1));
      var t = m / (sd / Math.sqrt(n)), p = 2 * (1 - pt(Math.abs(t), n - 1)), h = qt(0.975, n - 1) * sd / Math.sqrt(n);
      out.push({a: names[i], b: names[j], diff: m, lo: m - h, hi: m + h, t: t, df: n - 1, p: p, dz: m / sd});
    }
    var adj = holm(out.map(function (o) { return o.p; })); out.forEach(function (o, i) { o.pHolm = adj[i]; });
    return out;
  }

  // ---- Linear mixed model (REML), random intercept and optional random slope per group ----
  // y = Xb + Zu + e, u ~ N(0, Psi), e ~ N(0, s2 I). Profiled REML over the relative Cholesky factor of Psi.
  function mixedRaw(y, X, Z, g, xnames) {
    var N = y.length, p = X[0].length, q = Z[0].length, groups = Object.create(null), keys = [];
    g.forEach(function (k, i) { if (!groups[k]) { groups[k] = []; keys.push(k); } groups[k].push(i); });
    var blocks = keys.map(function (k) {
      var idx = groups[k], b = {n: idx.length, XX: zeros(p, p), XZ: zeros(p, q), ZZ: zeros(q, q), Xy: new Array(p).fill(0), Zy: new Array(q).fill(0), yy: 0};
      idx.forEach(function (i) { var x = X[i], z = Z[i], yi = y[i];
        for (var a = 0; a < p; a++) { b.Xy[a] += x[a] * yi; for (var c = 0; c < p; c++) b.XX[a][c] += x[a] * x[c]; for (c = 0; c < q; c++) b.XZ[a][c] += x[a] * z[c]; }
        for (a = 0; a < q; a++) { b.Zy[a] += z[a] * yi; for (c = 0; c < q; c++) b.ZZ[a][c] += z[a] * z[c]; }
        b.yy += yi * yi; });
      return b;
    });
    function Lof(th) { return q === 1 ? [[th[0]]] : [[th[0], 0], [th[1], th[2]]]; }
    function parts(th) {
      var L = Lof(th), XVX = zeros(p, p), XVy = new Array(p).fill(0), yVy = 0, ld = 0;
      blocks.forEach(function (b) {
        var LtZZL = mul(mul(T(L), b.ZZ), L), M = LtZZL.map(function (r, i) { return r.map(function (v, j) { return v + (i === j ? 1 : 0); }); }), Mi = inv(M);
        ld += logdet(M);
        var XZL = mul(b.XZ, L), ZyL = mul([b.Zy], L)[0], A2 = mul(XZL, Mi);
        for (var a = 0; a < p; a++) { var s = 0; for (var c = 0; c < q; c++) s += A2[a][c] * ZyL[c]; XVy[a] += b.Xy[a] - s;
          for (var e = 0; e < p; e++) { var t = 0; for (c = 0; c < q; c++) t += A2[a][c] * XZL[e][c]; XVX[a][e] += b.XX[a][e] - t; } }
        var u = 0; for (var c2 = 0; c2 < q; c2++) for (var d2 = 0; d2 < q; d2++) u += ZyL[c2] * Mi[c2][d2] * ZyL[d2];
        yVy += b.yy - u;
      });
      var XVXi = inv(XVX); if (!XVXi) return null;
      var beta = XVXi.map(function (r) { return r.reduce(function (s, v, j) { return s + v * XVy[j]; }, 0); }), rVr = yVy - beta.reduce(function (s, v, j) { return s + v * XVy[j]; }, 0);
      return {L: L, beta: beta, XVXi: XVXi, rVr: rVr, ld: ld, ldX: logdet(XVX)};
    }
    function obj(th) { var P = parts(th); if (!P || !(P.rVr > 0)) return 1e300; return P.ld + P.ldX + (N - p) * Math.log(P.rVr); }
    var starts = q === 1 ? [[1], [0.3], [3], [0.05]] : [[1, 0, 0.5], [0.5, 0, 0.1], [2, 0.1, 1], [0.2, 0, 0.05]], best = null;
    starts.forEach(function (s0) { var r = nelderMead(obj, s0, 0.3, 6000); r = nelderMead(obj, r.x, 0.02, 6000); if (!best || r.f < best.f) best = r; });
    var P = parts(best.x), s2 = P.rVr / (N - p), L = P.L, Psi = mul(L, T(L)).map(function (r) { return r.map(function (v) { return v * s2; }); });
    var fe = P.beta.map(function (b, i) { var se = Math.sqrt(s2 * P.XVXi[i][i]), z = b / se; return {name: xnames[i], b: b, se: se, z: z, p: 2 * (1 - pnorm(Math.abs(z))), lo: b - 1.959963984540054 * se, hi: b + 1.959963984540054 * se}; });
    // REML deviance at the fitted values and with no random effects, for a boundary-corrected likelihood-ratio test
    var dev = best.f + (N - p) * (1 + Math.log(2 * Math.PI / (N - p))), dev0 = obj(q === 1 ? [0] : [0, 0, 0]) + (N - p) * (1 + Math.log(2 * Math.PI / (N - p)));
    var lr = Math.max(0, dev0 - dev), pLR = q === 1 ? 0.5 * (1 - pchisq(lr, 1)) : 0.5 * (1 - pchisq(lr, 2)) + 0.5 * (1 - pchisq(lr, 3));
    return {fe: fe, covariance: P.XVXi.map(function (r) { return r.map(function (v) { return v * s2; }); }), scale: s2, Psi: Psi, groups: keys.length, n: N, icc: q === 1 ? Psi[0][0] / (Psi[0][0] + s2) : null, devREML: dev, lr: lr, pLR: pLR};
  }
  // Work near zero and unit scale, then transform the entire covariance back.
  function centeredBasis(X) {
    var p = X[0].length, mu = new Array(p).fill(0), sd = new Array(p).fill(1);
    if (!X.every(function (r) { return r[0] === 1; })) throw new Error("An intercept is required for stable mixed-model fitting.");
    for (var j = 1; j < p; j++) {
      var base = X[0][j], d = X.map(function (r) { return r[j] - base; }), m = S.mean(d);
      mu[j] = base + m; sd[j] = Math.sqrt(S.mean(d.map(function (v) { return (v - m) * (v - m); }))) || 1;
    }
    var B = zeros(p, p); B[0][0] = 1;
    for (j = 1; j < p; j++) { B[j][j] = 1 / sd[j]; B[0][j] = -mu[j] / sd[j]; }
    return {X: X.map(function (r) { return r.map(function (v, j) { return j ? (v - mu[j]) / sd[j] : 1; }); }), B: B, sd: sd};
  }
  function mixed(y, X, Z, g, xnames) {
    var base = y[0], dy = y.map(function (v) { return v - base; }), dm = S.mean(dy), ym = base + dm;
    var ys = Math.sqrt(S.mean(dy.map(function (v) { return (v - dm) * (v - dm); }))) || 1;
    var xb = centeredBasis(X), zb = centeredBasis(Z);
    var r = mixedRaw(dy.map(function (v) { return (v - dm) / ys; }), xb.X, zb.X, g, xnames);
    var beta = mul(xb.B, r.fe.map(function (c) { return [c.b]; }));
    var V = mul(mul(xb.B, r.covariance), T(xb.B)).map(function (row) { return row.map(function (v) { return v * ys * ys; }); });
    r.fe = beta.map(function (row, i) { var b = row[0] * ys + (i ? 0 : ym), se = Math.sqrt(Math.max(0, V[i][i])), z = b / se;
      return {name: xnames[i], b: b, se: se, z: z, p: 2 * (1 - pnorm(Math.abs(z))), lo: b - 1.959963984540054 * se, hi: b + 1.959963984540054 * se}; });
    r.covariance = V; r.scale *= ys * ys;
    r.Psi = mul(mul(zb.B, r.Psi), T(zb.B)).map(function (row) { return row.map(function (v) { return v * ys * ys; }); });
    if (Z[0].length === 1) r.icc = r.Psi[0][0] / (r.Psi[0][0] + r.scale);
    r.devREML += 2 * (y.length - X[0].length) * Math.log(ys) + 2 * xb.sd.reduce(function (a, v) { return a + Math.log(v); }, 0);
    return r;
  }
  // OLS with cluster-robust (CR1) standard errors, t on G − 1 df (Stata/statsmodels use_t convention)
  function clusterOLSRaw(y, X, g, names) {
    var n = y.length, p = X[0].length, XtX = zeros(p, p), Xty = new Array(p).fill(0);
    X.forEach(function (x, i) { for (var a = 0; a < p; a++) { Xty[a] += x[a] * y[i]; for (var b = 0; b < p; b++) XtX[a][b] += x[a] * x[b]; } });
    var Bi = inv(XtX); if (!Bi) return null;
    var beta = Bi.map(function (r) { return r.reduce(function (s, v, j) { return s + v * Xty[j]; }, 0); }), sc = Object.create(null), G = 0;
    X.forEach(function (x, i) { var e = y[i] - x.reduce(function (s, v, j) { return s + v * beta[j]; }, 0); if (!sc[g[i]]) { sc[g[i]] = new Array(p).fill(0); G++; } for (var a = 0; a < p; a++) sc[g[i]][a] += x[a] * e; });
    var meat = zeros(p, p); Object.keys(sc).forEach(function (k) { var s = sc[k]; for (var a = 0; a < p; a++) for (var b = 0; b < p; b++) meat[a][b] += s[a] * s[b]; });
    var V = mul(mul(Bi, meat), Bi), adj = G / (G - 1) * (n - 1) / (n - p), tc = qt(0.975, G - 1);
    return {G: G, covariance: V.map(function (r) { return r.map(function (v) { return v * adj; }); }), coefs: beta.map(function (b, i) { var se = Math.sqrt(V[i][i] * adj), t = b / se; return {name: names[i], b: b, se: se, t: t, p: 2 * (1 - pt(Math.abs(t), G - 1)), lo: b - tc * se, hi: b + tc * se}; })};
  }

  function clusterOLS(y, X, g, names) {
    var base = y[0], d = y.map(function (v) { return v - base; }), dm = S.mean(d), ym = base + dm;
    var ys = Math.sqrt(S.mean(d.map(function (v) { return (v - dm) * (v - dm); }))) || 1, xb = centeredBasis(X);
    var r = clusterOLSRaw(d.map(function (v) { return (v - dm) / ys; }), xb.X, g, names); if (!r) return null;
    var b = mul(xb.B, r.coefs.map(function (c) { return [c.b]; })), V = mul(mul(xb.B, r.covariance), T(xb.B));
    var tc = qt(0.975, r.G - 1);
    r.coefs = b.map(function (row, i) { var v = row[0] * ys + (i ? 0 : ym), se = Math.sqrt(Math.max(0, V[i][i])) * ys, t = v / se;
      return {name: names[i], b: v, se: se, t: t, p: 2 * (1 - pt(Math.abs(t), r.G - 1)), lo: v - tc * se, hi: v + tc * se}; });
    return r;
  }
  // ---- Measurement: reliability, PCA, factor analysis ----
  function alpha(X) {
    var n = X.length, k = X[0].length, C = corrMatrix(X), cov = C.cov, vs = cov.map(function (r, i) { return r[i]; });
    var tot = cov.reduce(function (a, r) { return a + r.reduce(function (b, v) { return b + v; }, 0); }, 0), a = k / (k - 1) * (1 - vs.reduce(function (s, v) { return s + v; }, 0) / tot);
    var df1 = n - 1, df2 = df1 * (k - 1), lo = 1 - (1 - a) * qf(0.975, df1, df2), hi = 1 - (1 - a) * qf(0.025, df1, df2);
    var rbar = 0, cnt = 0; for (var i = 0; i < k; i++) for (var j = i + 1; j < k; j++) { rbar += C.R[i][j]; cnt++; } rbar /= cnt;
    var items = vs.map(function (_, i) {
      var rest = X.map(function (r) { return r.reduce(function (s, v, j) { return j === i ? s : s + v; }, 0); }), col = X.map(function (r) { return r[i]; });
      var keep = X.map(function (r) { return r.filter(function (_, j) { return j !== i; }); });
      return {itemRest: corrMatrix(col.map(function (v, t) { return [v, rest[t]]; })).R[0][1], alphaDrop: k > 2 ? alpha(keep).alpha : NaN, mean: C.mean[i], sd: Math.sqrt(vs[i])};
    });
    return {alpha: a, lo: lo, hi: hi, std: k * rbar / (1 + (k - 1) * rbar), rbar: rbar, n: n, k: k, items: items};
  }
  function pca(R) { var e = eigSym(R); return {values: e.values, loadings: e.vectors.map(function (r) { return r.map(function (v, j) { return v * Math.sqrt(Math.max(0, e.values[j])); }); })}; }
  function kmoBartlett(R, n) {
    var p = R.length, Ri = inv(R); if (!Ri) return null;
    var A2 = Ri.map(function (r, i) { return r.map(function (v, j) { return -v / Math.sqrt(Ri[i][i] * Ri[j][j]); }); }), r2 = 0, a2 = 0, item = [];
    for (var i = 0; i < p; i++) { var ri = 0, ai = 0; for (var j = 0; j < p; j++) if (i !== j) { ri += R[i][j] * R[i][j]; ai += A2[i][j] * A2[i][j]; } r2 += ri; a2 += ai; item.push(ri / (ri + ai)); }
    var chi = -(n - 1 - (2 * p + 5) / 6) * logdet(R), df = p * (p - 1) / 2;
    return {kmo: r2 / (r2 + a2), msa: item, chi2: chi, df: df, p: 1 - pchisq(chi, df)};
  }
  // Iterated principal-axis factoring (converges to the minimum-residual solution)
  function paf(R, m) {
    var p = R.length, Ri = inv(R), h = R.map(function (_, i) { return Ri ? Math.min(0.995, Math.max(0.005, 1 - 1 / Ri[i][i])) : 0.5; }), L, heywood = false, it;
    for (it = 0; it < 3000; it++) {
      var Rr = R.map(function (r, i) { return r.map(function (v, j) { return i === j ? h[i] : v; }); }), e = eigSym(Rr);
      L = R.map(function (_, i) { var row = []; for (var f = 0; f < m; f++) row.push(e.vectors[i][f] * Math.sqrt(Math.max(0, e.values[f]))); return row; });
      var hn = L.map(function (r) { return r.reduce(function (s, v) { return s + v * v; }, 0); }), dif = 0;
      hn.forEach(function (v, i) { dif = Math.max(dif, Math.abs(v - h[i])); if (v >= 1) { heywood = true; hn[i] = 0.995; } });
      h = hn; if (dif < 1e-9) break;
    }
    return {loadings: signFix(L), communalities: h, heywood: heywood, iterations: it};
  }
  function signFix(L) { var m = L[0].length; for (var f = 0; f < m; f++) { var s = L.reduce(function (a, r) { return a + r[f]; }, 0); if (s < 0) L.forEach(function (r) { r[f] = -r[f]; }); } return L; }
  function polar(M) {   // U V' of the SVD of a square matrix, and the sum of singular values
    var e = eigSym(mul(T(M), M)), k = M.length, half = zeros(k, k), ihalf = zeros(k, k);
    for (var a = 0; a < k; a++) for (var b = 0; b < k; b++) for (var c = 0; c < k; c++) { var v = e.vectors[a][c] * e.vectors[b][c], s = Math.sqrt(Math.max(e.values[c], 1e-300)); half[a][b] += v * s; ihalf[a][b] += v / s; }
    return {R: mul(M, ihalf), d: half.reduce(function (s, r, i) { return s + r[i]; }, 0)};
  }
  function varimax(L, normalize) {
    var n = L.length, m = L[0].length; if (m < 2) return {loadings: L, rot: [[1]]};
    var w = L.map(function (r) { return Math.sqrt(r.reduce(function (s, v) { return s + v * v; }, 0)); }), X = normalize ? L.map(function (r, i) { return r.map(function (v) { return v / w[i]; }); }) : L, Rm = zeros(m, m), d = 0;
    for (var i = 0; i < m; i++) Rm[i][i] = 1;
    for (var it = 0; it < 1000; it++) {
      var old = d, B = mul(X, Rm), cs = new Array(m).fill(0); B.forEach(function (r) { r.forEach(function (v, j) { cs[j] += v * v; }); });
      var Tm = mul(T(X), B.map(function (r) { return r.map(function (v, j) { return v * v * v - v * cs[j] / n; }); })), P = polar(Tm);
      Rm = P.R; d = P.d; if (d < old * (1 + 1e-5)) break;
    }
    var out = mul(X, Rm); if (normalize) out = out.map(function (r, i) { return r.map(function (v) { return v * w[i]; }); });
    return {loadings: out, rot: Rm};
  }
  function promax(L, power) {
    var m = L[0].length; if (m < 2) return {loadings: L, phi: [[1]]};
    var h = L.map(function (r) { return Math.sqrt(r.reduce(function (s, v) { return s + v * v; }, 0)); }), W = L.map(function (r, i) { return r.map(function (v) { return v / h[i]; }); });
    var X = varimax(W, true).loadings, Y = X.map(function (r) { return r.map(function (v) { return v * Math.pow(Math.abs(v), (power || 4) - 1); }); });
    var coef = mul(inv(mul(T(X), X)), mul(T(X), Y)), di = inv(mul(T(coef), coef)).map(function (r, i) { return Math.sqrt(r[i]); });
    coef = coef.map(function (r) { return r.map(function (v, j) { return v * di[j]; }); });
    var z = mul(X, coef).map(function (r, i) { return r.map(function (v) { return v * h[i]; }); }), ci = inv(coef);
    return {loadings: z, phi: mul(ci, T(ci))};
  }
  function omega(R, X) {   // McDonald's omega total from a one-factor solution on the covariance scale
    var f = paf(R, 1), lam = f.loadings.map(function (r) { return r[0]; }), sd = corrMatrix(X).cov.map(function (r, i) { return Math.sqrt(r[i]); });
    var sl = lam.reduce(function (s, v, i) { return s + v * sd[i]; }, 0), su = lam.reduce(function (s, v, i) { return s + (1 - v * v) * sd[i] * sd[i]; }, 0);
    return sl * sl / (sl * sl + su);
  }
  function parallel(n, p, sims, seed) {   // Horn's parallel analysis: 95th percentile of random-data eigenvalues
    var rnd = rngN(seed || 7), all = [];
    for (var s = 0; s < sims; s++) { var X = []; for (var i = 0; i < n; i++) { var r = []; for (var j = 0; j < p; j++) r.push(rnd.norm()); X.push(r); } all.push(eigSym(corrMatrix(X).R).values); }
    var out = []; for (var j2 = 0; j2 < p; j2++) { var v = all.map(function (e) { return e[j2]; }).sort(function (a, b) { return a - b; }); out.push(v[Math.min(v.length - 1, Math.floor(0.95 * v.length))]); }
    return out;
  }

  // ---- Agreement ----
  function kappa(a, b, weight) {   // Cohen's kappa with Fleiss–Cohen–Everitt asymptotic variance (as statsmodels)
    var cats = [], seen = Object.create(null); a.concat(b).forEach(function (v) { if (!seen[v]) { seen[v] = 1; cats.push(v); } });
    var numeric = cats.every(function (c) { return isFinite(+c); }); cats.sort(numeric ? function (x, y) { return +x - +y; } : undefined);
    var k = cats.length, at = Object.create(null); cats.forEach(function (c, i) { at[c] = i; });
    var tab = zeros(k, k); a.forEach(function (v, i) { tab[at[v]][at[b[i]]]++; });
    var n = a.length, pr = tab.map(function (r) { return r.map(function (v) { return v / n; }); }), fr = pr.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); }), fc = T(pr).map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); });
    var wts = zeros(k, k), sc = numeric ? cats.map(Number) : cats.map(function (_, i) { return i; }), span = sc[k - 1] - sc[0] || 1;
    for (var i = 0; i < k; i++) for (var j = 0; j < k; j++) wts[i][j] = !weight ? (i === j ? 0 : 1) : weight === "linear" ? Math.abs(sc[i] - sc[j]) / span : Math.pow(sc[i] - sc[j], 2) / (span * span);
    var w = wts.map(function (r) { return r.map(function (v) { return 1 - v; }); }), po = 0, pe = 0;
    for (i = 0; i < k; i++) for (j = 0; j < k; j++) { po += w[i][j] * pr[i][j]; pe += w[i][j] * fr[i] * fc[j]; }
    var kap = (po - pe) / (1 - pe), wr = fr.map(function (_, i) { return fc.reduce(function (s, c, j) { return s + c * w[i][j]; }, 0); }), wc = fc.map(function (_, j) { return fr.reduce(function (s, r, i) { return s + r * w[i][j]; }, 0); }), ta = 0;
    for (i = 0; i < k; i++) for (j = 0; j < k; j++) ta += pr[i][j] * Math.pow(w[i][j] - (wr[i] + wc[j]) * (1 - kap), 2);
    var se = Math.sqrt((ta - Math.pow(kap - pe * (1 - kap), 2)) / (Math.pow(1 - pe, 2) * n)), v0 = 0;
    for (i = 0; i < k; i++) for (j = 0; j < k; j++) v0 += fr[i] * fc[j] * Math.pow(w[i][j] - (wr[i] + wc[j]), 2);
    var se0 = Math.sqrt((v0 - pe * pe) / (Math.pow(1 - pe, 2) * n)), z = kap / se0;
    return {kappa: kap, se: se, lo: kap - 1.959963984540054 * se, hi: kap + 1.959963984540054 * se, z: z, p: 2 * (1 - pnorm(Math.abs(z))), po: po, pe: pe, n: n, cats: cats, table: tab};
  }
  function fleiss(ratings) {   // ratings: subjects × raters (category labels); Fleiss (1971) with Fleiss, Nee & Landis (1979) null SE
    var cats = [], seen = Object.create(null); ratings.forEach(function (r) { r.forEach(function (v) { if (!seen[v]) { seen[v] = 1; cats.push(v); } }); });
    var N = ratings.length, m = ratings[0].length, P = 0, pj = new Array(cats.length).fill(0);
    ratings.forEach(function (r) { var c = cats.map(function (k) { return r.filter(function (v) { return v === k; }).length; }); c.forEach(function (v, j) { pj[j] += v / (N * m); }); P += (c.reduce(function (s, v) { return s + v * v; }, 0) - m) / (m * (m - 1)); });
    P /= N; var Pe = pj.reduce(function (s, v) { return s + v * v; }, 0), kap = (P - Pe) / (1 - Pe), sq = pj.reduce(function (s, v) { return s + v * (1 - v); }, 0);
    var se0 = Math.sqrt(2) / (sq * Math.sqrt(N * m * (m - 1))) * Math.sqrt(sq * sq - pj.reduce(function (s, v) { return s + v * (1 - v) * (1 - 2 * v); }, 0)), z = kap / se0;
    return {kappa: kap, Po: P, Pe: Pe, se0: se0, z: z, p: 2 * (1 - pnorm(Math.abs(z))), n: N, raters: m, cats: cats, prop: pj};
  }
  function icc(Y) {   // Shrout & Fleiss forms with McGraw & Wong intervals, as pingouin
    var n = Y.length, k = Y[0].length, G = 0, rm = Y.map(function (r) { return r.reduce(function (a, b) { return a + b; }, 0) / k; }), cm = new Array(k).fill(0);
    Y.forEach(function (r) { r.forEach(function (v, j) { cm[j] += v / n; G += v / (n * k); }); });
    var sst = 0; Y.forEach(function (r) { r.forEach(function (v) { sst += (v - G) * (v - G); }); });
    var ssr = k * rm.reduce(function (a, m) { return a + (m - G) * (m - G); }, 0), ssc = n * cm.reduce(function (a, m) { return a + (m - G) * (m - G); }, 0), sse = sst - ssr - ssc;
    var msb = ssr / (n - 1), msj = ssc / (k - 1), mse = sse / ((n - 1) * (k - 1)), msw = (ssc + sse) / (n * (k - 1));
    var df1 = n - 1, df1kd = n * (k - 1), df2kd = (n - 1) * (k - 1), f1k = msb / msw, f3k = msb / mse;
    var i1 = (msb - msw) / (msb + (k - 1) * msw), i2 = (msb - mse) / (msb + (k - 1) * mse + k * (msj - mse) / n), i3 = (msb - mse) / (msb + (k - 1) * mse);
    var f1l = f1k / qf(0.975, df1, df1kd), f1u = f1k * qf(0.975, df1kd, df1), f3l = f3k / qf(0.975, df1, df2kd), f3u = f3k * qf(0.975, df2kd, df1);
    var fj = msj / mse, vn = df2kd * Math.pow(k * i2 * fj + n * (1 + (k - 1) * i2) - k * i2, 2), vd = df1 * k * k * i2 * i2 * fj * fj + Math.pow(n * (1 + (k - 1) * i2) - k * i2, 2), v = vn / vd;
    var f2u = qf(0.975, n - 1, v), f2l = qf(0.975, v, n - 1), den = k * msj + (k * n - k - n) * mse;
    var l2 = n * (msb - f2u * mse) / (f2u * den + n * msb), u2 = n * (f2l * msb - mse) / (den + n * f2l * msb);
    var p1 = 1 - pf(f1k, df1, df1kd), p3 = 1 - pf(f3k, df1, df2kd);
    return {n: n, k: k, forms: [
      {type: "ICC1", label: "Single rater, absolute (one-way)", icc: i1, F: f1k, df2: df1kd, p: p1, lo: (f1l - 1) / (f1l + k - 1), hi: (f1u - 1) / (f1u + k - 1)},
      {type: "ICC2", label: "Single rater, random raters (absolute agreement)", icc: i2, F: f3k, df2: df2kd, p: p3, lo: l2, hi: u2},
      {type: "ICC3", label: "Single rater, fixed raters (consistency)", icc: i3, F: f3k, df2: df2kd, p: p3, lo: (f3l - 1) / (f3l + k - 1), hi: (f3u - 1) / (f3u + k - 1)},
      {type: "ICC1k", label: "Average of raters, absolute (one-way)", icc: (msb - msw) / msb, F: f1k, df2: df1kd, p: p1, lo: 1 - 1 / f1l, hi: 1 - 1 / f1u},
      {type: "ICC2k", label: "Average of random raters", icc: (msb - mse) / (msb + (msj - mse) / n), F: f3k, df2: df2kd, p: p3, lo: l2 * k / (1 + l2 * (k - 1)), hi: u2 * k / (1 + u2 * (k - 1))},
      {type: "ICC3k", label: "Average of fixed raters", icc: (msb - mse) / msb, F: f3k, df2: df2kd, p: p3, lo: 1 - 1 / f3l, hi: 1 - 1 / f3u}], df1: df1};
  }

  // ---- Random numbers (seeded) ----
  function rngN(seed) {
    var s = seed >>> 0 || 1, spare = null;
    function u() { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    function norm() { if (spare != null) { var v = spare; spare = null; return v; } var a, b, r; do { a = 2 * u() - 1; b = 2 * u() - 1; r = a * a + b * b; } while (r >= 1 || r === 0); var f = Math.sqrt(-2 * Math.log(r) / r); spare = b * f; return a * f; }
    function gamma(k) { if (k < 1) return gamma(k + 1) * Math.pow(u(), 1 / k); var d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { var x, v; do { x = norm(); v = 1 + c * x; } while (v <= 0); v = v * v * v; var w = u(); if (w < 1 - 0.0331 * x * x * x * x || Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } }
    return {u: u, norm: norm, chisq: function (df) { return 2 * gamma(df / 2); }};
  }

  // ---- Missing data ----
  function patterns(M) {   // M: rows × cols of booleans (true = missing)
    var map = Object.create(null), list = [];
    M.forEach(function (r) { var key = r.map(function (v) { return v ? 1 : 0; }).join(""); if (!map[key]) { map[key] = {miss: r.slice(), count: 0}; list.push(map[key]); } map[key].count++; });
    list.forEach(function (p) { p.nMissing = p.miss.filter(Boolean).length; });
    return list.sort(function (a, b) { return a.nMissing - b.nMissing || b.count - a.count; });
  }
  // EM estimates of a multivariate normal mean and covariance with missing values
  function emMVN(X, iters) {
    var n = X.length, p = X[0].length, mu = new Array(p).fill(0), Sg = zeros(p, p), cnt = new Array(p).fill(0);
    X.forEach(function (r) { r.forEach(function (v, j) { if (v != null) { mu[j] += v; cnt[j]++; } }); }); mu = mu.map(function (s, j) { return s / cnt[j]; });
    for (var j = 0; j < p; j++) { var ss = 0; X.forEach(function (r) { if (r[j] != null) ss += Math.pow(r[j] - mu[j], 2); }); Sg[j][j] = ss / Math.max(1, cnt[j] - 1); }
    for (var it = 0; it < (iters || 500); it++) {
      var T1 = new Array(p).fill(0), T2 = zeros(p, p);
      X.forEach(function (r) {
        var o = [], m = []; r.forEach(function (v, j) { (v == null ? m : o).push(j); });
        var x = r.map(function (v, j) { return v == null ? mu[j] : v; }), C = zeros(p, p);
        if (m.length && o.length) {
          var Soo = o.map(function (a) { return o.map(function (b) { return Sg[a][b]; }); }), Si = inv(Soo), Smo = m.map(function (a) { return o.map(function (b) { return Sg[a][b]; }); }), B = mul(Smo, Si);
          m.forEach(function (a, ia) { x[a] = mu[a] + o.reduce(function (s, b, ib) { return s + B[ia][ib] * (r[b] - mu[b]); }, 0); });
          var cond = mul(B, T(Smo)); m.forEach(function (a, ia) { m.forEach(function (b, ib) { C[a][b] = Sg[a][b] - cond[ia][ib]; }); });
        } else if (m.length) m.forEach(function (a) { m.forEach(function (b) { C[a][b] = Sg[a][b]; }); });
        for (var a = 0; a < p; a++) { T1[a] += x[a]; for (var b = 0; b < p; b++) T2[a][b] += x[a] * x[b] + C[a][b]; }
      });
      var nmu = T1.map(function (v) { return v / n; }), nS = T2.map(function (r, a) { return r.map(function (v, b) { return v / n - nmu[a] * nmu[b]; }); });
      var dif = 0; for (a = 0; a < p; a++) { dif = Math.max(dif, Math.abs(nmu[a] - mu[a])); for (b = 0; b < p; b++) dif = Math.max(dif, Math.abs(nS[a][b] - Sg[a][b])); }
      mu = nmu; Sg = nS; if (dif < 1e-10) break;
    }
    return {mu: mu, sigma: Sg};
  }
  function littleMCAR(X) {   // Little (1988) chi-square test of MCAR for numeric columns
    var p = X[0].length, em = emMVN(X), groups = Object.create(null);
    X.forEach(function (r) { var k = r.map(function (v) { return v == null ? 1 : 0; }).join(""); (groups[k] = groups[k] || []).push(r); });
    var d2 = 0, df = 0;
    Object.keys(groups).forEach(function (k) {
      var rows = groups[k], o = []; k.split("").forEach(function (c, j) { if (c === "0") o.push(j); });
      if (!o.length) return;
      var mean = o.map(function (j) { return rows.reduce(function (s, r) { return s + r[j]; }, 0) / rows.length; }), d = mean.map(function (v, i) { return v - em.mu[o[i]]; });
      var Si = inv(o.map(function (a) { return o.map(function (b) { return em.sigma[a][b]; }); }));
      d2 += rows.length * d.reduce(function (s, v, i) { return s + v * d.reduce(function (t, w, j) { return t + Si[i][j] * w; }, 0); }, 0); df += o.length;
    });
    df -= p;
    return {chi2: d2, df: df, p: df > 0 ? 1 - pchisq(d2, df) : NaN, patterns: Object.keys(groups).length, mu: em.mu, sigma: em.sigma};
  }
  // Rubin's rules with the Barnard–Rubin (1999) small-sample degrees of freedom
  function pool(Q, U, dfCom) {
    var m = Q.length, qb = Q.reduce(function (a, b) { return a + b; }, 0) / m, ub = U.reduce(function (a, b) { return a + b; }, 0) / m;
    var B = Q.reduce(function (a, q) { return a + (q - qb) * (q - qb); }, 0) / (m - 1), Tt = ub + (1 + 1 / m) * B, lam = (1 + 1 / m) * B / Tt, riv = (1 + 1 / m) * B / ub;
    var dfOld = lam > 0 ? (m - 1) / (lam * lam) : Infinity, dfObs = (dfCom + 1) / (dfCom + 3) * dfCom * (1 - lam), df = isFinite(dfOld) ? dfOld * dfObs / (dfOld + dfObs) : dfObs;
    var se = Math.sqrt(Tt), t = qb / se, tc = qt(0.975, df);
    return {est: qb, se: se, t: t, df: df, p: 2 * (1 - pt(Math.abs(t), df)), lo: qb - tc * se, hi: qb + tc * se, B: B, W: ub, T: Tt, riv: riv, lambda: lam, fmi: (riv + 2 / (df + 3)) / (riv + 1)};
  }
  // Multiple imputation by chained equations with predictive mean matching (van Buuren; mice "pmm", type-1 matching)
  function mice(X, m, opts) {
    opts = opts || {}; var iters = opts.iters || 10, donors = opts.donors || 5, n = X.length, p = X[0].length, out = [];
    var missCols = []; for (var j = 0; j < p; j++) if (X.some(function (r) { return r[j] == null; })) missCols.push(j);
    for (var imp = 0; imp < m; imp++) {
      var rnd = rngN((opts.seed || 2024) + imp * 7919), D = X.map(function (r) { return r.slice(); });
      missCols.forEach(function (j) { var obs = X.filter(function (r) { return r[j] != null; }).map(function (r) { return r[j]; }); D.forEach(function (r, i) { if (X[i][j] == null) r[j] = obs[Math.floor(rnd.u() * obs.length)]; }); });
      for (var it = 0; it < iters; it++) missCols.forEach(function (j) {
        var preds = []; for (var c = 0; c < p; c++) if (c !== j) preds.push(c);
        var design = function (r) { return [1].concat(preds.map(function (c) { return r[c]; })); }, obsI = [], misI = [];
        X.forEach(function (r, i) { (r[j] == null ? misI : obsI).push(i); });
        var Xo = obsI.map(function (i) { return design(D[i]); }), yo = obsI.map(function (i) { return D[i][j]; }), q = Xo[0].length;
        var XtX = zeros(q, q), Xty = new Array(q).fill(0);
        Xo.forEach(function (x, t) { for (var a = 0; a < q; a++) { Xty[a] += x[a] * yo[t]; for (var b = 0; b < q; b++) XtX[a][b] += x[a] * x[b]; } });
        var tr = XtX.reduce(function (s, r, i) { return s + r[i]; }, 0); for (var a = 0; a < q; a++) XtX[a][a] += 1e-5 * tr / q;
        var Vi = inv(XtX), bh = Vi.map(function (r) { return r.reduce(function (s, v, k) { return s + v * Xty[k]; }, 0); });
        var rss = Xo.reduce(function (s, x, t) { var e = yo[t] - x.reduce(function (u, v, k) { return u + v * bh[k]; }, 0); return s + e * e; }, 0);
        var sig = Math.sqrt(rss / rnd.chisq(Math.max(1, obsI.length - q))), Lc = chol(Vi), z = Lc.map(function () { return rnd.norm(); });
        var bs = bh.map(function (v, a) { return v + sig * Lc[a].reduce(function (s, l, k) { return s + l * z[k]; }, 0); });
        var yhatO = Xo.map(function (x) { return x.reduce(function (s, v, k) { return s + v * bh[k]; }, 0); });
        misI.forEach(function (i) {
          var yh = design(D[i]).reduce(function (s, v, k) { return s + v * bs[k]; }, 0), best = [];
          yhatO.forEach(function (v, t) { var d = Math.abs(v - yh) + rnd.u() * 1e-9; if (best.length < donors || d < best[best.length - 1][0]) { best.push([d, t]); best.sort(function (x, y) { return x[0] - y[0]; }); if (best.length > donors) best.pop(); } });
          D[i][j] = yo[best[Math.floor(rnd.u() * best.length)][1]];
        });
      });
      out.push(D);
    }
    return out;
  }
  function chol(M) { var n = M.length, L = zeros(n, n); for (var i = 0; i < n; i++) for (var j = 0; j <= i; j++) { var s = M[i][j]; for (var k = 0; k < j; k++) s -= L[i][k] * L[j][k]; L[i][j] = i === j ? Math.sqrt(Math.max(s, 1e-300)) : s / L[j][j]; } return L; }

  return {lgamma: lgamma, pt: pt, pf: pf, pchisq: pchisq, qt: qt, qf: qf, qchisq: qchisq, pnct: pnct, pncf: pncf, pncchisq: pncchisq,
    power: power, solveN: solveN, solveEffect: solveEffect, rmAnova: rmAnova, friedman: friedman, pairedPosthoc: pairedPosthoc, mixed: mixed, clusterOLS: clusterOLS,
    alpha: alpha, omega: omega, pca: pca, kmoBartlett: kmoBartlett, paf: paf, varimax: varimax, promax: promax, parallel: parallel, kappa: kappa, fleiss: fleiss, icc: icc,
    patterns: patterns, emMVN: emMVN, littleMCAR: littleMCAR, pool: pool, mice: mice, corrMatrix: corrMatrix, eigSym: eigSym, inv: inv, mul: mul, T: T, zeros: zeros, holm: holm, rngN: rngN, chol: chol, avgRanks: avgRanks, nelderMead: nelderMead};
})();
