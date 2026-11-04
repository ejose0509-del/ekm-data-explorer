// ---------- Go deeper: worked steps, assumption plots, simulation, sampling, distributions, prediction, 3D ----------
var DP = {tab: null, sim: {}, lab: {n: null, res: null}, pred: {}, tt: {}};
var DEEP = [["steps", "Worked steps"], ["plots", "Assumption plots"], ["simulate", "Simulate the null"], ["sample", "Sampling lab"], ["fit", "Fit a distribution"], ["predict", "Predict"], ["space", "3D view"]];
function deepTabs(R) {
  var k = A.kind, num = R.summary.mean != null, two = Array.isArray(R.summary.groups), preds = (A.sel.preds || []).filter(function (p) { return p !== A.sel.y; }).length;
  return DEEP.filter(function (t) {
    var id = t[0];
    if (id === "steps") return (k === "describe" && num) || ["relate", "compare", "cross", "paired", "regress"].indexOf(k) >= 0;
    if (id === "plots") return (k === "describe" && num) || ["compare", "relate", "regress", "paired"].indexOf(k) >= 0;
    if (id === "simulate") return ["relate", "compare", "cross", "paired"].indexOf(k) >= 0;
    if (id === "sample") return k === "relate" || (k === "compare" && two);
    if (id === "fit") return k === "describe" && num;
    if (id === "predict") return ["relate", "regress", "logistic"].indexOf(k) >= 0;
    if (id === "space") return k === "regress" && preds >= 2;
    return false;
  });
}
function rowsXY(ds, xn, yn) { var rows = filterRows(ds), xi = idxOf(ds, xn), yi = idxOf(ds, yn), x = [], y = []; rows.forEach(function (r) { if (typeof r[xi] === "number" && typeof r[yi] === "number") { x.push(r[xi]); y.push(r[yi]); } }); return {x: x, y: y}; }
function groupArrays(ds) { var G = groupsOf(ds, filterRows(ds), A.sel.y, A.sel.g), names = Object.keys(G).filter(function (k) { return G[k].length >= 2; }).sort(function (a, b) { return S.mean(G[b]) - S.mean(G[a]); }); return {names: names, gs: names.map(function (k) { return G[k]; })}; }
function sum(a) { return a.reduce(function (s, v) { return s + v; }, 0); }
function step(label, expr, val) { return "<tr><th>" + label + '</th><td class="ws-expr">' + expr + '</td><td class="num ws-val">' + val + "</td></tr>"; }
function stepsTable(rows, note) { return '<div class="tablewrap"><table class="nosort worked">' + rows.join("") + "</table></div>" + (note ? '<p class="count">' + note + "</p>" : ""); }
var XB = "x̄", YB = "ȳ";

// 1. Worked steps: the arithmetic, with this dataset's numbers
function workedSteps(ds, R) {
  var s = A.sel, k = A.kind, g = function (n) { return S.nums(getCol(ds, filterRows(ds), n)); };
  if (k === "describe") { var x = g(s.y), n = x.length, sx = sum(x), m = sx / n, ss = sum(x.map(function (v) { return (v - m) * (v - m); }));
    return stepsTable([step("n", "rows with a value", n), step("Σ<i>x</i>", "add every value", f3(sx)), step(XB, "Σ<i>x</i> / <i>n</i> = " + f3(sx) + " / " + n, f3(m)), step("Σ(<i>x</i> − " + XB + ")²", "squared distances from the average", f3(ss)), step("<i>s</i>²", f3(ss) + " / (" + n + " − 1)", f3(ss / (n - 1))), step("<i>s</i>", "√" + f3(ss / (n - 1)), f3(Math.sqrt(ss / (n - 1))))]); }
  if (k === "relate") { var p = rowsXY(ds, s.x, s.y), n2 = p.x.length, mx = S.mean(p.x), my = S.mean(p.y), sxy = 0, sxx = 0, syy = 0; for (var i = 0; i < n2; i++) { sxy += (p.x[i] - mx) * (p.y[i] - my); sxx += (p.x[i] - mx) * (p.x[i] - mx); syy += (p.y[i] - my) * (p.y[i] - my); }
    var r = sxy / Math.sqrt(sxx * syy), b = sxy / sxx, t = r * Math.sqrt((n2 - 2) / (1 - r * r));
    return stepsTable([step("n", "rows with both values", n2), step(XB + ", " + YB, "averages of " + esc(s.x) + " and " + esc(s.y), f3(mx) + ", " + f3(my)), step("<i>S<sub>xy</sub></i>", "Σ(<i>x</i> − " + XB + ")(<i>y</i> − " + YB + ")", f3(sxy)), step("<i>S<sub>xx</sub></i>, <i>S<sub>yy</sub></i>", "Σ(<i>x</i> − " + XB + ")², Σ(<i>y</i> − " + YB + ")²", f3(sxx) + ", " + f3(syy)),
      step("<i>r</i>", f3(sxy) + " / √(" + f3(sxx) + " × " + f3(syy) + ")", f3(r)), step("slope <i>b</i>", "<i>S<sub>xy</sub></i> / <i>S<sub>xx</sub></i>", f3(b)), step("intercept <i>a</i>", YB + " − <i>b</i>·" + XB + " = " + f3(my) + " − " + f3(b) + " × " + f3(mx), f3(my - b * mx)), step("<i>t</i>", "<i>r</i>√(<i>n</i> − 2) / √(1 − <i>r</i>²)", f3(t) + " on " + (n2 - 2) + " df")], "Fitted line: " + esc(s.y) + " = " + f3(my - b * mx) + " + " + f3(b) + " × " + esc(s.x) + "."); }
  if (k === "compare") { var G = groupArrays(ds);
    if (G.names.length === 2) { var a = S.describe(G.gs[0]), c = S.describe(G.gs[1]), va = a.sd * a.sd / a.n, vc = c.sd * c.sd / c.n, se = Math.sqrt(va + vc), df = (va + vc) * (va + vc) / (va * va / (a.n - 1) + vc * vc / (c.n - 1));
      return stepsTable([step(XB + "<sub>1</sub>, " + XB + "<sub>2</sub>", "averages of " + esc(G.names[0]) + " and " + esc(G.names[1]), f3(a.mean) + ", " + f3(c.mean)), step("<i>s</i><sub>1</sub>², <i>s</i><sub>2</sub>²", "variances", f3(a.sd * a.sd) + ", " + f3(c.sd * c.sd)), step("<i>n</i><sub>1</sub>, <i>n</i><sub>2</sub>", "group sizes", a.n + ", " + c.n),
        step("SE", "√(" + f3(a.sd * a.sd) + "/" + a.n + " + " + f3(c.sd * c.sd) + "/" + c.n + ")", f3(se)), step("<i>t</i>", "(" + f3(a.mean) + " − " + f3(c.mean) + ") / " + f3(se), f3((a.mean - c.mean) / se)), step("df", "Welch–Satterthwaite", f3(df))]); }
    var all = [].concat.apply([], G.gs), gm = S.mean(all), ssb = 0, ssw = 0; G.gs.forEach(function (q) { var m2 = S.mean(q); ssb += q.length * (m2 - gm) * (m2 - gm); q.forEach(function (v) { ssw += (v - m2) * (v - m2); }); });
    var d1 = G.gs.length - 1, d2 = all.length - G.gs.length;
    return stepsTable([step("grand mean", "average of all " + all.length + " values", f3(gm)), step("SS<sub>between</sub>", "Σ <i>n<sub>j</sub></i>(" + XB + "<sub>j</sub> − grand mean)²", f3(ssb)), step("SS<sub>within</sub>", "Σ(<i>x</i> − " + XB + "<sub>j</sub>)²", f3(ssw)), step("MS<sub>between</sub>", f3(ssb) + " / " + d1, f3(ssb / d1)), step("MS<sub>within</sub>", f3(ssw) + " / " + d2, f3(ssw / d2)), step("<i>F</i>", f3(ssb / d1) + " / " + f3(ssw / d2), f3((ssb / d1) / (ssw / d2))), step("η²", "SS<sub>between</sub> / (SS<sub>between</sub> + SS<sub>within</sub>)", f3(ssb / (ssb + ssw)))]); }
  if (k === "paired") { var xb = getCol(ds, filterRows(ds), s.x), ya = getCol(ds, filterRows(ds), s.y), d = []; xb.forEach(function (v, i) { if (typeof v === "number" && typeof ya[i] === "number") d.push(ya[i] - v); }); var D = S.describe(d);
    return stepsTable([step("<i>d</i>", esc(s.y) + " − " + esc(s.x) + " for each row", d.length + " differences"), step("<i>d̄</i>", "average difference", f3(D.mean)), step("<i>s<sub>d</sub></i>", "standard deviation of the differences", f3(D.sd)), step("SE", f3(D.sd) + " / √" + D.n, f3(D.se)), step("<i>t</i>", f3(D.mean) + " / " + f3(D.se), f3(D.mean / D.se) + " on " + (D.n - 1) + " df")]); }
  if (k === "cross") { var gi = idxOf(ds, s.g), hi = idxOf(ds, s.g2), rows = filterRows(ds), cell = Object.create(null), ra = Object.create(null), cb = Object.create(null), N = 0; rows.forEach(function (r) { if (r[gi] == null || r[hi] == null) return; N++; ra[r[gi]] = (ra[r[gi]] || 0) + 1; cb[r[hi]] = (cb[r[hi]] || 0) + 1; var kk = JSON.stringify([String(r[gi]), String(r[hi])]); cell[kk] = (cell[kk] || 0) + 1; });
    var out = [], tot = 0, shown = 0; Object.keys(ra).forEach(function (a2) { Object.keys(cb).forEach(function (b2) { var O = cell[JSON.stringify([String(a2), String(b2)])] || 0, Ex = ra[a2] * cb[b2] / N, part = (O - Ex) * (O - Ex) / Ex; tot += part; if (shown++ < 6) out.push(step(esc(a2) + " × " + esc(b2), "(" + O + " − " + f3(Ex) + ")² / " + f3(Ex) + "&nbsp;&nbsp;<span class=\"count\">E = " + ra[a2] + " × " + cb[b2] + " / " + N + "</span>", f3(part))); }); });
    out.push(step("χ²", "sum over all " + Object.keys(ra).length * Object.keys(cb).length + " cells", f3(tot))); return stepsTable(out, shown > 6 ? "First six cells shown." : ""); }
  if (k === "regress") { var sm = R.summary; return stepsTable([step("β", "(<i>X</i>ᵀ<i>X</i>)<sup>−1</sup><i>X</i>ᵀ<i>y</i>, solved for " + sm.coefficients.length + " terms", sm.coefficients.map(function (c) { return esc(c.name) + " " + f3(c.b); }).join("<br>")), step("<i>R</i>²", "1 − SS<sub>residual</sub> / SS<sub>total</sub>", f3(sm.r2)), step("adjusted <i>R</i>²", "1 − (1 − <i>R</i>²)(<i>n</i> − 1)/(<i>n</i> − <i>k</i> − 1)", f3(sm.adj_r2))]); }
  return "";
}

// 2. Assumption plots: Q-Q and residuals against fitted values
function qqPlot(v, label) {
  var x = S.nums(v).slice().sort(function (a, b) { return a - b; }), n = x.length; if (n < 3) return "";
  var m = S.mean(x), sd = Math.sqrt(sum(x.map(function (q) { return (q - m) * (q - m); })) / (n - 1)), th = x.map(function (_, i) { return S2.qnorm((i + 0.5) / n); }), z = x.map(function (q) { return (q - m) / sd; });
  var lo = Math.min(th[0], z[0]), hi = Math.max(th[n - 1], z[n - 1]);
  return scatter(th, z, "Expected if normal (z)", "Observed (z) · " + label, {slope: 1, intercept: 0, x: [lo, hi]});
}
function residPlot(fit, res) { return scatter(fit, res, "Fitted value", "Residual", {slope: 0, intercept: 0}); }
function assumptionPlots(ds, R) {
  var s = A.sel, k = A.kind, out = "";
  if (k === "describe") out = qqPlot(getCol(ds, filterRows(ds), s.y), s.y);
  if (k === "paired") { var xb = getCol(ds, filterRows(ds), s.x), ya = getCol(ds, filterRows(ds), s.y), d = []; xb.forEach(function (v, i) { if (typeof v === "number" && typeof ya[i] === "number") d.push(ya[i] - v); }); out = qqPlot(d, "changes"); }
  if (k === "compare") { var G = groupArrays(ds), res = [], fit = []; G.gs.forEach(function (q) { var m = S.mean(q); q.forEach(function (v) { res.push(v - m); fit.push(m); }); }); out = qqPlot(res, "residuals") + residPlot(fit, res); }
  if (k === "relate" || k === "regress") { var preds = k === "relate" ? [s.x] : (s.preds || []).filter(function (p) { return p !== s.y; }), m2 = fitOLS(ds, s.y, preds); if (m2) out = qqPlot(m2.res, "residuals") + residPlot(m2.fit, m2.res); }
  return out ? '<div class="plots2">' + out + '</div><p class="count">Q-Q: points near the line mean the values are close to normal; curves at the ends mean heavy or light tails. Residuals: a shapeless band around zero is good; a funnel or curve means the model misses something.</p>' : "";
}
// Ordinary least squares with everything prediction needs
function fitOLS(ds, yn, preds, rowsIn) {
  var rows = rowsIn || filterRows(ds), yi = idxOf(ds, yn), pi = preds.map(function (p) { return idxOf(ds, p); }), X = [], Y = [];
  rows.forEach(function (r) { if (typeof r[yi] !== "number") return; var xs = pi.map(function (j) { return r[j]; }); if (xs.some(function (v) { return typeof v !== "number"; })) return; X.push([1].concat(xs)); Y.push(r[yi]); });
  var n = X.length, k = preds.length + 1; if (n <= k + 1) return null;
  var XtX = [], Xty = []; for (var a = 0; a < k; a++) { XtX.push([]); var sy = 0; for (var b = 0; b < k; b++) { var sv = 0; for (var i = 0; i < n; i++) sv += X[i][a] * X[i][b]; XtX[a].push(sv); } for (var i2 = 0; i2 < n; i2++) sy += X[i2][a] * Y[i2]; Xty.push(sy); }
  var inv = invertM(XtX); if (!inv) return null;
  var beta = inv.map(function (row) { return sum(row.map(function (v, j) { return v * Xty[j]; })); }), fit = X.map(function (x) { return sum(x.map(function (v, j) { return v * beta[j]; })); }), res = Y.map(function (y, i) { return y - fit[i]; });
  var sse = sum(res.map(function (e) { return e * e; })), df = n - k;
  return {beta: beta, inv: inv, s2: sse / df, df: df, n: n, fit: fit, res: res, preds: preds, Y: Y};
}
function invertM(M) { var n = M.length, A2 = M.map(function (r, i) { return r.concat(M.map(function (_, j) { return i === j ? 1 : 0; })); }); for (var c = 0; c < n; c++) { var p = c; for (var r = c + 1; r < n; r++) if (Math.abs(A2[r][c]) > Math.abs(A2[p][c])) p = r; if (Math.abs(A2[p][c]) < 1e-12) return null; var t = A2[c]; A2[c] = A2[p]; A2[p] = t; var d = A2[c][c]; for (var k = 0; k < 2 * n; k++) A2[c][k] /= d; for (var r2 = 0; r2 < n; r2++) if (r2 !== c) { var f = A2[r2][c]; for (var k2 = 0; k2 < 2 * n; k2++) A2[r2][k2] -= f * A2[c][k2]; } } return A2.map(function (r) { return r.slice(n); }); }
function tq(df) { var lo = 0, hi = 50; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (S.pT(m, df) > 0.05) lo = m; else hi = m; } return (lo + hi) / 2; }

// 3. Simulate the null: shuffle away the link 1,000 times and see how often chance alone matches the result
function rng2(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function shuffle(a, rnd) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function nullSim(ds, R, N) {
  var s = A.sel, k = A.kind, rnd = rng2(7), obs, stat, sims = [], label;
  if (k === "relate") { var p = rowsXY(ds, s.x, s.y); obs = S.correlate(p.x, p.y).r; label = "r"; for (var i = 0; i < N; i++) sims.push(S.correlate(p.x, shuffle(p.y, rnd)).r); }
  else if (k === "compare") { var G = groupArrays(ds), all = [].concat.apply([], G.gs), sizes = G.gs.map(function (q) { return q.length; }), cut = function (arr) { var out = [], o = 0; sizes.forEach(function (n) { out.push(arr.slice(o, o + n)); o += n; }); return out; };
    if (G.gs.length === 2) { stat = function (gs) { return S.mean(gs[0]) - S.mean(gs[1]); }; label = "difference in averages"; } else { stat = function (gs) { return S.anova(gs).F; }; label = "F"; }
    obs = stat(G.gs); for (var i2 = 0; i2 < N; i2++) sims.push(stat(cut(shuffle(all, rnd)))); }
  else if (k === "cross") { var gi = idxOf(ds, s.g), hi = idxOf(ds, s.g2), pr = filterRows(ds).filter(function (r) { return r[gi] != null && r[hi] != null; }), a = pr.map(function (r) { return r[gi]; }), b = pr.map(function (r) { return r[hi]; }), chi = function (bb) { var ra = Object.create(null), cb = Object.create(null), cell = Object.create(null); a.forEach(function (v, i) { ra[v] = (ra[v] || 0) + 1; cb[bb[i]] = (cb[bb[i]] || 0) + 1; cell[JSON.stringify([String(v), String(bb[i])])] = (cell[JSON.stringify([String(v), String(bb[i])])] || 0) + 1; }); var x2 = 0, N0 = a.length; Object.keys(ra).forEach(function (r) { Object.keys(cb).forEach(function (c) { var e = ra[r] * cb[c] / N0, o = cell[JSON.stringify([String(r), String(c)])] || 0; x2 += (o - e) * (o - e) / e; }); }); return x2; };
    obs = chi(b); label = "χ²"; for (var i3 = 0; i3 < N; i3++) sims.push(chi(shuffle(b, rnd))); }
  else if (k === "paired") { var xb = getCol(ds, filterRows(ds), s.x), ya = getCol(ds, filterRows(ds), s.y), d = []; xb.forEach(function (v, i) { if (typeof v === "number" && typeof ya[i] === "number") d.push(ya[i] - v); }); obs = S.mean(d); label = "average change"; for (var i4 = 0; i4 < N; i4++) sims.push(S.mean(d.map(function (v) { return rnd() < 0.5 ? -v : v; }))); }
  var two = k !== "cross" && !(k === "compare" && label === "F"), ext = sims.filter(function (v) { return two ? Math.abs(v) >= Math.abs(obs) - 1e-12 : v >= obs - 1e-12; }).length;
  return {obs: obs, sims: sims, label: label, p: (ext + 1) / (N + 1), ext: ext, N: N, two: two};
}
function simChart(r) {
  var v = r.sims, lo = Math.min.apply(null, v.concat([r.obs, r.two ? -Math.abs(r.obs) : r.obs])), hi = Math.max.apply(null, v.concat([r.obs, r.two ? Math.abs(r.obs) : r.obs])), svg = histogram(v.concat([]), "Simulated " + r.label + " when there is no real effect");
  var W = CW(), x = function (t) { return 56 + (t - Math.min.apply(null, v)) / ((Math.max.apply(null, v) - Math.min.apply(null, v)) || 1) * (W - 68); };
  if (r.obs >= Math.min.apply(null, v) && r.obs <= Math.max.apply(null, v)) svg = svg.replace("</svg>", '<line x1="' + x(r.obs) + '" x2="' + x(r.obs) + '" y1="10" y2="260" stroke="var(--yellow)" stroke-width="2.5"/><text x="' + (x(r.obs) + 4) + '" y="22" class="tk" fill="var(--yellow)">yours</text></svg>');
  return {svg: svg, off: r.obs < Math.min.apply(null, v) || r.obs > Math.max.apply(null, v)};
}
function simulatePanel(ds, R) {
  var key = A.kind + JSON.stringify(A.sel), r = DP.sim[key];
  if (!r) return '<p class="method-note">Shuffle the data 1,000 times under the null and compare the resulting statistics with yours. This requires exchangeable observations under the null; paired sign flips also require symmetric differences. Simulation does not remove study-design assumptions.</p><button type="button" class="btn btn-primary" data-dsim="1">Run 1,000 simulations</button>';
  var c = simChart(r), formulaP = R.summary.p, same = typeof formulaP === 'number' && isFinite(formulaP) && (formulaP < .05) === (r.p < .05);
  var comparison = typeof formulaP !== 'number' || !isFinite(formulaP) ? 'No formula p-value is available for comparison.' : same ? 'Both methods give the same decision at the conventional .05 threshold. Their p-values need not be identical.' : 'The simulation and formula test differ at the conventional .05 threshold. They use different assumptions; check exchangeability, group distributions and sample size before choosing an interpretation.';
  return '<div class="chartwrap">' + c.svg + '</div>' + figs([['Your ' + r.label, f3(r.obs)], ['Simulations as extreme', r.ext + ' of ' + r.N], ['Simulated p-value', fp(r.p)]]) +
    '<ul class="plain reading"><li>' + r.ext + ' of ' + r.N + ' simulated statistics were at least as extreme as the observed statistic' + (c.off ? ' (outside the displayed simulation range)' : '') + '. The Monte Carlo p-value uses (extreme + 1) / (simulations + 1); zero extreme simulations do not imply a zero p-value.</li><li>Formula p-value: ' + fp(formulaP) + '. ' + comparison + '</li><li>This is an approximate randomization result. Exchangeability and the study design still matter; do not automatically prefer it to the formula test.</li></ul>';
}
// 4. Sampling lab: how stable is the result at a smaller sample size?
function boundedLabSize(R, n) {
  var N = R.summary.n || 0, minimum = A.kind === 'compare' ? 4 : 3;
  return Math.max(minimum, Math.min(N, Math.floor(+n || Math.max(minimum, Math.round(N / 4)))));
}
function samplingLab(ds, R) {
  var N = R.summary.n || 0, minimum = A.kind === 'compare' ? 4 : 3;
  if (N < minimum) return '<p class="nd">Not enough complete observations for subset analysis.</p>';
  var n = boundedLabSize(R, DP.lab.n); DP.lab.n = n;
  var r = DP.lab.res && DP.lab.res.key === A.kind + JSON.stringify(A.sel) + n ? DP.lab.res : null;
  var body = '<p class="method-note">Draw 300 random subsets of the available rows and redo the analysis. These overlapping subsets describe sensitivity within this dataset; they do not estimate prospective study power.</p>' +
    '<div class="slot"><label class="field" for="labn">Subset size<input type="range" id="labn" min="' + minimum + '" max="' + N + '" value="' + n + '" data-dlab="1"></label><b class="num">' + n + ' rows</b><button type="button" class="btn btn-primary" data-dlabrun="1">Draw 300 subsets</button></div>';
  if (!r) return body;
  if (!r.vals.length) return body + '<p class="warn">None of the subsets had enough usable variation and observations in each group. Increase the subset size or check the selected columns.</p>';
  return body + '<div class="chartwrap">' + histogram(r.vals, (A.kind === 'relate' ? 'r' : 'difference in averages') + ' in subsets of ' + n + ' rows') + '</div>' +
    figs([['Middle 90% of subset estimates', f3(r.lo) + ' to ' + f3(r.hi)], ['Usable subsets with p < .05', Math.round(r.sig * 100) + '%'], ['Full-data estimate', f3(r.full)]]) +
    '<ul class="plain reading"><li>' + r.vals.length + ' of 300 subsets yielded usable estimates. Of those subsets, ' + Math.round(r.sig * 100) + '% crossed the .05 threshold; this is a descriptive resampling rate, not prospective power.</li><li>The middle 90% of subset estimates ranges from ' + f3(r.lo) + ' to ' + f3(r.hi) + (r.lo * r.hi < 0 ? ', including both directions.' : '.') + ' This is an empirical subset range, not a population confidence interval.</li></ul>';
}

function runLab(ds, R, n) {
  n = boundedLabSize(R, n); DP.lab.n = n;
  var rnd = rng2(11), vals = [], sig = 0, full;
  if (A.kind === "relate") { var p = rowsXY(ds, A.sel.x, A.sel.y), idx = p.x.map(function (_, i) { return i; }); full = R.summary.r;
    for (var t = 0; t < 300; t++) { var pick = shuffle(idx, rnd).slice(0, n), c = S.correlate(pick.map(function (i) { return p.x[i]; }), pick.map(function (i) { return p.y[i]; })); if (c.r != null && isFinite(c.r)) { vals.push(c.r); if (c.p < 0.05) sig++; } } }
  else { var G = groupArrays(ds), lab = [], all = []; G.gs.forEach(function (q, gi) { q.forEach(function (v) { all.push(v); lab.push(gi); }); }); full = R.summary.diff; var id2 = all.map(function (_, i) { return i; });
    for (var t2 = 0; t2 < 300; t2++) { var pk = shuffle(id2, rnd).slice(0, n), a = [], b = []; pk.forEach(function (i) { (lab[i] ? b : a).push(all[i]); }); if (a.length >= 2 && b.length >= 2) { var tt = S.ttest(a, b); if (isFinite(tt.diff) && isFinite(tt.t) && isFinite(tt.p)) { vals.push(tt.diff); if (tt.p < 0.05) sig++; } } } }
  var sv = vals.slice().sort(function (a, b) { return a - b; });
  DP.lab.res = {key: A.kind + JSON.stringify(A.sel) + n, vals: vals, lo: S.quantile(sv, 0.05), hi: S.quantile(sv, 0.95), sig: sig / Math.max(1, vals.length), full: full};
}
// 5. Fit a distribution: normal, log-normal, exponential, gamma and Poisson, ranked by AIC
function lgam(z) {   // log-gamma in log space (Lanczos), safe for large z
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgam(1 - z);
  var c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1; var x = c[0]; for (var i = 1; i < 9; i++) x += c[i] / (z + i); var t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function gammaFn(z) { if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z)); z -= 1; var g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7], a = c[0], t = z + g + 0.5; for (var i = 1; i < 9; i++) a += c[i] / (z + i); return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * a; }
function digamma(x) { var r = 0; while (x < 6) { r -= 1 / x; x++; } return r + Math.log(x) - 1 / (2 * x) - 1 / (12 * x * x) + 1 / (120 * Math.pow(x, 4)) - 1 / (252 * Math.pow(x, 6)); }
function fitDists(v) {
  var x = S.nums(v), n = x.length, m = S.mean(x), out = [], pos = x.every(function (q) { return q > 0; }), ints = x.every(function (q) { return q >= 0 && q === Math.round(q); });
  var sd = Math.sqrt(sum(x.map(function (q) { return (q - m) * (q - m); })) / n);
  var nll = function (pdf) { return -sum(x.map(function (q) { return Math.log(Math.max(pdf(q), 1e-300)); })); };
  out.push({name: "Normal", k: 2, par: "μ = " + f3(m) + ", σ = " + f3(sd), pdf: function (q) { return Math.exp(-(q - m) * (q - m) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI)); }, cdf: function (q) { return S2.pnorm((q - m) / sd); }});
  if (pos) { var lx = x.map(Math.log), lm = S.mean(lx), ls = Math.sqrt(sum(lx.map(function (q) { return (q - lm) * (q - lm); })) / n);
    out.push({name: "Log-normal", k: 2, par: "μ = " + f3(lm) + ", σ = " + f3(ls) + " (of log)", pdf: function (q) { return Math.exp(-(Math.log(q) - lm) * (Math.log(q) - lm) / (2 * ls * ls)) / (q * ls * Math.sqrt(2 * Math.PI)); }, cdf: function (q) { return S2.pnorm((Math.log(q) - lm) / ls); }});
    out.push({name: "Exponential", k: 1, par: "rate = " + f3(1 / m), pdf: function (q) { return Math.exp(-q / m) / m; }, cdf: function (q) { return 1 - Math.exp(-q / m); }});
    var sl = Math.log(m) - S.mean(lx), sh = (3 - sl + Math.sqrt((sl - 3) * (sl - 3) + 24 * sl)) / (12 * sl); for (var it = 0; it < 50; it++) { var nw = sh - (Math.log(sh) - digamma(sh) - sl) / (1 / sh - (digamma(sh + 1e-6) - digamma(sh - 1e-6)) / 2e-6); if (!isFinite(nw) || nw <= 0) break; if (Math.abs(nw - sh) < 1e-10) { sh = nw; break; } sh = nw; }
    var sc = m / sh, lg = lgam(sh);
    out.push({name: "Gamma", k: 2, par: "shape = " + f3(sh) + ", scale = " + f3(sc), pdf: function (q) { return Math.exp((sh - 1) * Math.log(q) - q / sc - lg - sh * Math.log(sc)); }, cdf: function (q) { return 1 - S.gammaQ(sh, q / sc); }}); }
  if (ints && m > 0) out.push({name: "Poisson", k: 1, discrete: true, par: "λ = " + f3(m), pdf: function (q) { return Math.exp(q * Math.log(m) - m - lgam(q + 1)); }, cdf: function (q) { return S.gammaQ(q + 1, m); }});
  var sorted = x.slice().sort(function (a, b) { return a - b; });
  out.forEach(function (d) { d.ll = -nll(d.pdf); d.aic = 2 * d.k - 2 * d.ll; var D = 0; sorted.forEach(function (q, i) { var F = d.cdf(q); D = Math.max(D, Math.abs((i + 1) / n - F), Math.abs(F - i / n)); }); d.ks = D; });
  out.sort(function (a, b) { return a.aic - b.aic; }); out.forEach(function (d) { d.daic = d.aic - out[0].aic; });
  return {fits: out, x: x};
}
function fitPanel(ds) {
  var F = fitDists(getCol(ds, filterRows(ds), A.sel.y)); if (F.x.length < 8) return '<p class="nd">At least 8 values are needed to compare distributions.</p>';
  var best = F.fits[0], svg = histogram(F.x, A.sel.y), lo = Math.min.apply(null, F.x), hi = Math.max.apply(null, F.x), W = CW(), H = 300, k = Math.max(5, Math.min(30, Math.ceil(Math.log2(F.x.length) + 1))), w = (hi - lo) / k || 1;
  var bins = new Array(k).fill(0); F.x.forEach(function (q) { bins[Math.min(k - 1, Math.floor((q - lo) / w))]++; }); var yt = ticks(0, Math.max.apply(null, bins), 4), ytop = yt[yt.length - 1];
  var X = function (t) { return 56 + (t - lo) / ((hi - lo) || 1) * (W - 68); }, Y = function (c) { return H - 40 - c / ytop * (H - 60); };
  var curves = F.fits.slice(0, 3).map(function (d, i) { var pts = []; for (var j = 0; j <= 80; j++) { var q = lo + (hi - lo) * j / 80; if (q <= 0 && d.name !== "Normal") continue; pts.push(X(q) + "," + Y(d.pdf(q) * F.x.length * w)); } return '<polyline fill="none" stroke="' + ["var(--yellow)", "var(--pink)", "var(--green)"][i] + '" stroke-width="' + (i ? 1.5 : 2.5) + '"' + (i ? ' stroke-dasharray="5 4"' : "") + ' points="' + pts.join(" ") + '"/>'; }).join("");
  svg = svg.replace("</svg>", curves + "</svg>");
  return '<div class="chartwrap">' + svg + '</div><div class="legend">' + F.fits.slice(0, 3).map(function (d, i) { return '<span><i style="background:' + ["var(--yellow)", "var(--pink)", "var(--green)"][i] + '"></i>' + d.name + "</span>"; }).join("") + "</div>" +
    '<div class="tablewrap"><table class="nosort"><thead><tr><th>Distribution</th><th>Parameters</th><th>AIC</th><th>ΔAIC</th><th>KS distance</th></tr></thead><tbody>' + F.fits.map(function (d) { return "<tr><td>" + d.name + "</td><td>" + d.par + '</td><td class="num">' + f3(d.aic) + '</td><td class="num">' + f3(d.daic) + '</td><td class="num">' + d.ks.toFixed(3) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
    '<ul class="plain reading"><li>' + best.name + " fits best (lowest AIC)" + (F.fits[1] ? ", " + (F.fits[1].daic > 10 ? "clearly ahead of " : F.fits[1].daic > 2 ? "ahead of " : "nearly tied with ") + F.fits[1].name + " (ΔAIC " + f3(F.fits[1].daic) + ")." : ".") + "</li><li>The largest gap between the data and the " + best.name.toLowerCase() + " curve is " + Math.round(best.ks * 100) + " percentage points of the cumulative share (KS distance)." + "</li>" +
    (best.name !== "Normal" ? "<li>Because the data is not best described as normal, rank-based tests or a " + (best.name === "Log-normal" || best.name === "Gamma" ? "log transform" : "count model") + " suit it better than tests that assume normality.</li>" : "") + "</ul>";
}
// 6. Predict: a value with both ranges, plus a held-out check
function predictPanel(ds, R) {
  var s = A.sel, k = A.kind, preds = k === "relate" ? [s.x] : k === "logistic" ? (s.lp || []) : (s.preds || []).filter(function (p) { return p !== s.y; }); if (!preds.length) return "";
  var key = k + (k === "logistic" ? s.o : s.y) + preds.join("|"); if (DP.pred.key !== key) DP.pred = {key: key, vals: Object.create(null)};
  var inputs = preds.map(function (p) { var d = S.describe(getCol(ds, filterRows(ds), p)), v = DP.pred.vals[p] != null ? DP.pred.vals[p] : +d.mean.toPrecision(4); DP.pred.vals[p] = v; return '<label class="field" for="pv-' + esc(p) + '">' + esc(p) + '<input id="pv-' + esc(p) + '" type="number" step="any" value="' + v + '" data-dpv="' + esc(p) + '"></label>'; }).join("");
  var res = "";
  if (k === "logistic") { var X = filterRows(ds).map(function (r) { return preds.map(function (p) { return r[idxOf(ds, p)]; }); }), yv = filterRows(ds).map(function (r) { var v = r[idxOf(ds, s.o)]; return v == null ? null : String(v) === s.ov ? 1 : 0; }), o = S2.logistic(yv, X, preds); if (o.error) return '<p class="nd">' + esc(o.error) + "</p>";
    var eta = o.coefs[0].b + preds.reduce(function (a2, p, i) { return a2 + o.coefs[i + 1].b * DP.pred.vals[p]; }, 0), pr = 1 / (1 + Math.exp(-eta));
    res = figs([["Chance of “" + esc(s.ov) + "”", Math.round(pr * 100) + "%"]], true) + holdoutLogistic(ds, preds); }
  else { var m = fitOLS(ds, s.y, preds); if (!m) return '<p class="nd">Not enough complete rows to predict.</p>';
    var x0 = [1].concat(preds.map(function (p) { return DP.pred.vals[p]; })), yh = sum(x0.map(function (v, j) { return v * m.beta[j]; })), h = sum(x0.map(function (a, i) { return a * sum(x0.map(function (b2, j) { return b2 * m.inv[i][j]; })); })), t = tq(m.df), seM = Math.sqrt(m.s2 * h), seP = Math.sqrt(m.s2 * (1 + h));
    var outside = preds.some(function (p) { var d = S.describe(getCol(ds, filterRows(ds), p)); return DP.pred.vals[p] < d.min || DP.pred.vals[p] > d.max; });
    res = figs([["Predicted " + esc(s.y), f3(yh)], ["Average for rows like this", f3(yh - t * seM) + " to " + f3(yh + t * seM)], ["A single new row", f3(yh - t * seP) + " to " + f3(yh + t * seP)]], true) +
      '<ul class="plain reading"><li>For rows with these values, the average ' + esc(s.y) + " is most plausibly between " + f3(yh - t * seM) + " and " + f3(yh + t * seM) + ". One new row could fall anywhere from " + f3(yh - t * seP) + " to " + f3(yh + t * seP) + " (95% ranges).</li>" + (outside ? '<li class="warn">At least one value is outside the range in your data, so this is an extrapolation and may be badly wrong.</li>' : "") + "</ul>" + holdoutOLS(ds, s.y, preds); }
  return '<p class="method-note">Enter values to get a prediction from the fitted model.</p><div class="toolbar">' + inputs + "</div>" + res;
}
function splitRows(ds) { var rows = filterRows(ds), rnd = rng2(23), idx = shuffle(rows.map(function (_, i) { return i; }), rnd), cut = Math.round(rows.length * 0.8); return {train: idx.slice(0, cut).map(function (i) { return rows[i]; }), test: idx.slice(cut).map(function (i) { return rows[i]; })}; }
function holdoutOLS(ds, yn, preds) {
  var sp = splitRows(ds), m = fitOLS(ds, yn, preds, sp.train); if (!m) return "";
  var yi = idxOf(ds, yn), pi = preds.map(function (p) { return idxOf(ds, p); }), e = [], yt = [];
  sp.test.forEach(function (r) { if (typeof r[yi] !== "number" || pi.some(function (j) { return typeof r[j] !== "number"; })) return; var f = m.beta[0] + sum(pi.map(function (j, q) { return m.beta[q + 1] * r[j]; })); e.push(r[yi] - f); yt.push(r[yi]); });
  if (e.length < 5) return "";
  var my = S.mean(yt), r2t = 1 - sum(e.map(function (v) { return v * v; })) / sum(yt.map(function (v) { return (v - my) * (v - my); })), r2r = 1 - sum(m.res.map(function (v) { return v * v; })) / sum(m.Y.map(function (v) { return (v - S.mean(m.Y)) * (v - S.mean(m.Y)); }));
  var rm = function (a) { return Math.sqrt(sum(a.map(function (v) { return v * v; })) / a.length); };
  return '<h3 class="sub-h">Does it hold up on unseen rows?</h3>' + figs([["R² on 80% used to fit", fz(r2r)], ["R² on 20% held back", fz(r2t)], ["Typical error, held back", f3(rm(e))]]) +
    '<p class="count">' + (r2t < r2r - 0.1 ? '<span class="warn">The model predicts noticeably worse on rows it has not seen: it may be overfitting. Try fewer predictors.</span>' : "The model predicts unseen rows about as well as the rows it learned from, a good sign it generalizes.") + " Split fixed at random, 80/20.</p>";
}
function holdoutLogistic(ds, preds) {
  var s = A.sel, sp = splitRows(ds), oi = idxOf(ds, s.o), pi = preds.map(function (p) { return idxOf(ds, p); }), mk = function (rows) { return {y: rows.map(function (r) { return r[oi] == null ? null : String(r[oi]) === s.ov ? 1 : 0; }), X: rows.map(function (r) { return pi.map(function (j) { return r[j]; }); })}; };
  var tr = mk(sp.train), o = S2.logistic(tr.y, tr.X, preds); if (o.error) return "";
  var te = mk(sp.test), hit = 0, n = 0; te.y.forEach(function (y, i) { if (y == null || te.X[i].some(function (v) { return typeof v !== "number"; })) return; var eta = o.coefs[0].b + sum(te.X[i].map(function (v, q) { return o.coefs[q + 1].b * v; })); if ((eta >= 0 ? 1 : 0) === y) hit++; n++; });
  if (n < 5) return ""; var base = Math.max(o.base, 1 - o.base);
  return '<h3 class="sub-h">Does it hold up on unseen rows?</h3>' + figs([["Correct on 20% held back", Math.round(hit / n * 100) + "%"], ["Guessing the commoner outcome", Math.round(base * 100) + "%"]]) + '<p class="count">' + (hit / n > base + 0.05 ? "The model beats simple guessing on rows it has not seen." : '<span class="warn">The model barely beats guessing the commoner outcome on unseen rows.</span>') + "</p>";
}

// The panel under the poster
function syncDeepContext(ds) {
  var previous = DP.context;
  if (!previous || previous.id !== ds.id || previous.rows !== ds.rows || previous.cols !== ds.cols) {
    DP.sim = Object.create(null); DP.lab = {n:null,res:null}; DP.pred = Object.create(null);
    DP.context = {id:ds.id, rows:ds.rows, cols:ds.cols};
  }
}
function deepPanel(ds, R) {
  syncDeepContext(ds);
  var tabs = deepTabs(R); if (!tabs.length) return "";
  if (!tabs.some(function (t) { return t[0] === DP.tab; })) DP.tab = tabs[0][0];
  var body = "";
  try {
    if (DP.tab === "steps") body = '<p class="method-note">The calculation behind the result, with your numbers.</p>' + workedSteps(ds, R);
    else if (DP.tab === "plots") body = assumptionPlots(ds, R);
    else if (DP.tab === "simulate") body = simulatePanel(ds, R);
    else if (DP.tab === "sample") body = samplingLab(ds, R);
    else if (DP.tab === "fit") body = fitPanel(ds);
    else if (DP.tab === "predict") body = predictPanel(ds, R);
    else if (DP.tab === "space") body = spacePanel(ds, R);
  } catch (e) { body = '<p class="nd">This view could not be drawn for these columns.</p>'; }
  return '<section class="card deep" aria-labelledby="deep-h"><h2 id="deep-h">Go deeper</h2><div class="pills" role="tablist">' + tabs.map(function (t) { return '<button type="button" role="tab" class="pill' + (DP.tab === t[0] ? " on" : "") + '" aria-selected="' + (DP.tab === t[0]) + '" data-deep="' + t[0] + '">' + t[1] + "</button>"; }).join("") + '</div><div class="deep-body">' + (body || '<p class="nd">Nothing to show for these columns.</p>') + "</div></section>";
}

// Correlation map: every pair of number columns at once
KINDS.push(["matrix", "Correlation map"]); KIND_HELP.matrix = "How every pair of number columns moves together, at a glance.";
var _runA3 = runAnalysis;
runAnalysis = function (ds) {
  if (A.kind !== "matrix") return _runA3(ds);
  var nums = ds.cols.filter(function (c) { return c.type === "number"; }).slice(0, 14), R = {kind: "matrix", controls: "", head: "", chart: "", reading: [], caveats: [], summary: {}, extra: "", apa: "", next: []};
  if (nums.length < 3) return need(R, "at least three number columns");
  var rows = filterRows(ds), M = nums.map(function (a) { return nums.map(function (b) { return a === b ? {r: 1, n: rows.length} : S.correlate(getCol(ds, rows, a.name), getCol(ds, rows, b.name)); }); }), pairs = [];
  for (var i = 0; i < nums.length; i++) for (var j = i + 1; j < nums.length; j++) if (M[i][j].r != null) pairs.push([nums[i].name, nums[j].name, M[i][j].r, M[i][j].p]);
  pairs.sort(function (a, b) { return Math.abs(b[2]) - Math.abs(a[2]); });
  var n = nums.length, W = Math.max(360, 120 + n * 44), cell = (W - 130) / n, H = 130 + n * cell, g = '<svg viewBox="0 0 ' + W + " " + H + '" class="achart matrix" role="img" aria-label="Correlation map">';
  nums.forEach(function (c, i) { g += '<text x="124" y="' + (130 + i * cell + cell / 2 + 4) + '" text-anchor="end" class="tk">' + esc(c.name.slice(0, 16)) + '</text><text transform="translate(' + (130 + i * cell + cell / 2) + ',122) rotate(-55)" class="tk">' + esc(c.name.slice(0, 16)) + "</text>"; });
  M.forEach(function (row, i) { row.forEach(function (c, j) { var r = c.r == null ? 0 : c.r, col = r >= 0 ? "147,200,242" : "243,166,190"; g += '<rect x="' + (130 + j * cell) + '" y="' + (130 + i * cell) + '" width="' + (cell - 2) + '" height="' + (cell - 2) + '" fill="rgba(' + col + "," + (0.1 + 0.85 * Math.abs(r)).toFixed(2) + ')"><title>' + esc(nums[i].name) + " × " + esc(nums[j].name) + ": r = " + f3(r) + "</title></rect>" + (cell > 30 ? '<text x="' + (130 + j * cell + cell / 2 - 1) + '" y="' + (130 + i * cell + cell / 2 + 4) + '" text-anchor="middle" class="tk mval">' + fz(r) + "</text>" : ""); }); });
  R.chart = g + "</svg>";
  R.summary = {test: "Pearson correlation for every pair", n: rows.length, strongest: pairs.slice(0, 3).map(function (p) { return {pair: p[0] + " × " + p[1], r: p[2]}; })};
  R.head = '<p class="count">Blue = move together, pink = move opposite; stronger colour = stronger link. Pick a pair below to analyse it.</p><ul class="plain">' + pairs.slice(0, 6).map(function (p, i) { return '<li><button type="button" class="linkbtn" data-mpair="' + i + '">' + esc(p[0]) + " × " + esc(p[1]) + '</button> <span class="num">r = ' + fz(p[2]) + "</span></li>"; }).join("") + "</ul>";
  DP.pairs = pairs;
  if (pairs[0]) R.reading.push("The strongest link is " + esc(pairs[0][0]) + " with " + esc(pairs[0][1]) + " (r = " + fz(pairs[0][2]) + ")" + (pairs[1] ? ", then " + esc(pairs[1][0]) + " with " + esc(pairs[1][1]) + " (r = " + fz(pairs[1][2]) + ")." : "."));
  var weak = pairs.filter(function (p) { return Math.abs(p[2]) < 0.1; }).length; if (weak) R.reading.push(weak + " of " + pairs.length + " pairs show almost no link.");
  R.caveats.push("With " + pairs.length + " pairs tested, a few will look strong by chance; confirm any pair you care about with its own analysis.");
  R.caveats.push("Correlation is not causation, and Pearson's r only sees straight-line links.");
  R.next = pairs[0] ? [{label: "Analyse " + pairs[0][0] + " × " + pairs[0][1], kind: "relate", sel: {x: pairs[0][1], y: pairs[0][0]}}] : [];
  return R;
};
var _formula2 = formula; formula = function (R) { return A.kind === "matrix" ? '<div class="math"><math display="block"><mrow><msub><mi>r</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub><mo>=</mo><mi>corr</mi><mo>(</mo><msub><mi>x</mi><mi>i</mi></msub><mo>,</mo><msub><mi>x</mi><mi>j</mi></msub><mo>)</mo></mrow></math></div>' : _formula2(R); };
var _caption2 = caption; caption = function (ds) { return A.kind === "matrix" ? "Correlation map of the number columns" : _caption2(ds); };

view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b || st.tab !== "analyze") return; var d = b.dataset, ds = cur();
  if (d.deep) { DP.tab = d.deep; render(); refocus('[data-deep="' + d.deep + '"]'); return; }
  if (d.dsim || d.dlabrun) {
    var kind = A.kind, selection = JSON.stringify(A.sel), rows = ds.rows, cols = ds.cols, R = LAST_R, n = boundedLabSize(R, DP.lab.n);
    if (d.dlabrun) DP.lab.n = n;
    b.disabled = true; b.textContent = d.dsim ? 'Simulating…' : 'Drawing…';
    setTimeout(function () {
      if (cur() !== ds || ds.rows !== rows || ds.cols !== cols || A.kind !== kind || JSON.stringify(A.sel) !== selection || st.tab !== 'analyze') return;
      if (d.dsim) DP.sim[kind + selection] = nullSim(ds, R, 1000); else runLab(ds, R, n);
      render();
    }, 20);
    return;
  }
  if (d.mpair != null) { var p = DP.pairs[+d.mpair]; A.kind = "relate"; A.sel = {x: p[1], y: p[0]}; A.ai = Object.create(null); render(); refocus('[data-akind="relate"]'); return; }
});
view.addEventListener("input", function (e) { if (e.target.dataset && e.target.dataset.dlab) { DP.lab.n = +e.target.value; var b = e.target.closest(".slot").querySelector("b.num"); if (b) b.textContent = e.target.value + " rows"; } });
view.addEventListener("change", function (e) { var d = e.target.dataset || {}; if (d.dpv != null) { var v = parseFloat(e.target.value); if (isFinite(v)) { DP.pred.vals[d.dpv] = v; render(); refocus('[data-dpv="' + d.dpv + '"]'); } } });
