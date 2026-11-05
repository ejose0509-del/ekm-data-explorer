// ---------- New analysis kinds: repeated measures, grouped data, reliability, factor analysis, agreement, missing data ----------
KINDS.push(["rmanova", "Repeated measures"], ["mixed", "Grouped data"], ["reliability", "Scale reliability"], ["factor", "Factor analysis"], ["agree", "Rater agreement"], ["missing", "Missing data"]);
KIND_HELP.rmanova = "Did the same people change across three or more conditions or time points? (repeated-measures ANOVA, sphericity checks, Friedman test)";
KIND_HELP.mixed = "An outcome measured several times per person, class or site. (linear mixed model with cluster-robust comparison)";
KIND_HELP.reliability = "Do questionnaire items measure one thing consistently? (Cronbach's alpha, McDonald's omega, item analysis)";
KIND_HELP.factor = "Which items group together into underlying factors? (PCA or principal-axis factoring, parallel analysis, rotation)";
KIND_HELP.agree = "Do raters or instruments agree? (Cohen's or Fleiss' kappa for categories, intraclass correlation for scores)";
KIND_HELP.missing = "Where values are missing, whether that looks random, and estimates that account for it. (Little's MCAR test, multiple imputation)";

// Expensive results are cached per data version and settings
var MEMO = typeof WeakMap === "function" ? new WeakMap() : null;
function memo(ds, key, fn) {
  if (!MEMO) return fn();
  var m = MEMO.get(ds.rows); if (!m) { m = Object.create(null); MEMO.set(ds.rows, m); }
  var k = JSON.stringify([key, A.sel.f || "", A.sel.fv || "", A.sel.where || null]);
  if (!(k in m)) m[k] = fn();
  return m[k];
}
function mselList(key, cols, label, min) {
  var cur2 = Array.isArray(A.sel[key]) ? A.sel[key] : [];
  return '<fieldset class="field preds"><legend>' + label + (min ? ' <span class="count">(choose ' + min + " or more)</span>" : "") + "</legend>" + cols.map(function (c) {
    return '<label class="chk"><input type="checkbox" data-msel="' + key + '" value="' + esc(c.name) + '"' + (cur2.indexOf(c.name) >= 0 ? " checked" : "") + "> " + esc(c.name) + "</label>";
  }).join("") + "</fieldset>";
}
function choice(id, label, opts, cur2) {
  return '<label class="field" for="' + id + '">' + label + '<select id="' + id + '" data-asel="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(cur2) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>";
}
// Columns that identify rows (ids, unique keys) are poor defaults for analyses
function likelyId(ds, c) {
  if (/(^|[^a-z])(id|uuid|key|code)$|^(id|row|record|#)/i.test(c.name)) return true;
  var j = idxOf(ds, c.name), u = Object.create(null), n = 0, all = true;
  ds.rows.forEach(function (r) { var v = r[j]; if (v == null) return; n++; if (u[v]) all = false; u[v] = 1; });
  return n > 20 && all && (c.type === "category" || c.type === "text");
}
function initCols(ds, key, defs, ok) { if (!Array.isArray(A.sel[key])) A.sel[key] = defs.map(function (c) { return c.name || c; }); return selCols(ds, key, ok); }
function selCols(ds, key, ok) { A.sel[key] = (Array.isArray(A.sel[key]) ? A.sel[key] : []).filter(function (n) { var j = idxOf(ds, n); return j >= 0 && (!ok || ok(ds.cols[j])); }); return A.sel[key]; }
function completeMatrix(ds, rows, names) {
  var idx = names.map(function (n) { return idxOf(ds, n); }), X = [], dropped = 0;
  rows.forEach(function (r) { var v = idx.map(function (j) { return r[j]; }); if (v.every(function (x) { return typeof x === "number" && isFinite(x); })) X.push(v); else dropped++; });
  return {X: X, dropped: dropped};
}
function table(head, body, cls) { return '<div class="tablewrap"><table class="nosort' + (cls ? " " + cls : "") + '"><thead><tr>' + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + body.map(function (r) { return "<tr>" + r.map(function (c, i) { return i ? '<td class="num">' + c + "</td>" : "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"; }
function pAPA(p) { return p < 0.001 ? "< .001" : "= " + fz(p, 3); }
function pTxt(p) { return p < 0.001 ? "< 0.001" : "= " + fp(p); }
function mkR(kind) { return {kind: kind, controls: "", head: "", chart: "", extra: "", reading: [], caveats: [], summary: {}, apa: "", next: []}; }
// Means with 95% intervals for categories along the x axis
function profileChart(names, means, lo, hi, yl) {
  var W = CW(), H = 300, k = names.length, all = means.concat(lo, hi).filter(isFinite), yt = ticks(amin(all), amax(all), 5);
  var y0 = yt[0], y1 = yt[yt.length - 1], x = function (i) { return 72 + i * (W - 110) / Math.max(1, k - 1); }, y = function (v) { return H - 40 - (v - y0) / ((y1 - y0) || 1) * (H - 60); };
  var body = '<polyline fill="none" stroke="var(--accent)" stroke-width="2" points="' + means.map(function (m, i) { return x(i) + "," + y(m); }).join(" ") + '"/>' +
    means.map(function (m, i) { return '<line x1="' + x(i) + '" x2="' + x(i) + '" y1="' + y(lo[i]) + '" y2="' + y(hi[i]) + '" stroke="var(--chalk-2)" stroke-width="1.5"/><circle cx="' + x(i) + '" cy="' + y(m) + '" r="4.5" fill="var(--accent)"><title>' + esc(names[i]) + ": " + f3(m) + " (" + f3(lo[i]) + " to " + f3(hi[i]) + ")</title></circle>"; }).join("");
  var xt = names.map(function (_, i) { return i; });
  return frame(W, H, x, y, xt, yt, "Condition", yl, body, function (i) { return esc(String(names[Math.round(i)] || "").slice(0, W < 400 ? 6 : 12)); }) + '<p class="count">Dots = means; lines = 95% confidence intervals.</p>';
}

// Lines on continuous axes (ROC, calibration); dashed series are references
function xyLines(lines, xl, yl, yr) {
  var W = CW(), H = 320, xs = [], ys = []; lines.forEach(function (l) { l.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); });
  var xt = ticks(amin(xs), amax(xs), W < 400 ? 4 : 5), yt = yr ? ticks(yr[0], yr[1], 5) : ticks(amin(ys), amax(ys), 5), x0 = xt[0], x1 = xt[xt.length - 1], y0 = yt[0], y1 = yt[yt.length - 1];
  var x = function (v) { return 56 + (v - x0) / ((x1 - x0) || 1) * (W - 68); }, y = function (v) { return H - 40 - (v - y0) / ((y1 - y0) || 1) * (H - 56); };
  var body = lines.map(function (l, i) { var col = l.dash ? "var(--chalk-3)" : PAL[i % PAL.length]; return '<polyline fill="none" stroke="' + col + '" stroke-width="' + (l.dash ? 1.5 : 2.2) + '"' + (l.dash ? ' stroke-dasharray="5 4"' : "") + ' points="' + l.pts.map(function (p) { return x(p[0]) + "," + y(p[1]); }).join(" ") + '"/>' + (l.dash || l.pts.length > 40 ? "" : l.pts.map(function (p) { return '<circle cx="' + x(p[0]) + '" cy="' + y(p[1]) + '" r="3" fill="' + col + '"/>'; }).join("")); }).join("");
  return frame(W, H, x, y, xt, yt, xl, yl, body) + '<div class="legend">' + lines.map(function (l, i) { return '<span><i style="background:' + (l.dash ? "var(--chalk-3)" : PAL[i % PAL.length]) + '"></i>' + esc(l.name) + "</span>"; }).join("") + "</div>";
}

// ---- Repeated measures ----
function runRM(ds) {
  var R = mkR("rmanova"), s = A.sel, nums = ds.cols.filter(isNum), rows = filterRows(ds);
  s.rmfmt = s.rmfmt || "wide";
  var fmt = choice("rmfmt", "Data layout", [["wide", "One column per condition"], ["long", "One row per measurement"]], s.rmfmt), names, Y, dropped = 0;
  if (s.rmfmt === "wide") {
    var sel = initCols(ds, "rm", nums.filter(function (c) { return !likelyId(ds, c); }).slice(0, 3), isNum);
    R.controls = fmt + mselList("rm", nums, "Conditions, in order", 2);
    if (sel.length < 2) return need(R, "two or more number columns, one per condition");
    var M = completeMatrix(ds, rows, sel); names = sel; Y = M.X; dropped = M.dropped;
  } else {
    var any = ds.cols.filter(function (c) { return c.type !== "empty"; }), cats = ds.cols.filter(function (c) { return c.type === "category" || c.type === "year" || c.type === "date"; });
    if (!nums.length || !cats.length) return need(R, "a subject column, a condition column and a number column");
    if (idxOf(ds, s.rmsub) < 0) s.rmsub = (any.filter(function (c) { return /id|subject|participant|person|student/i.test(c.name); })[0] || any[0]).name;
    if (idxOf(ds, s.rmcond) < 0) s.rmcond = (cats.filter(function (c) { return c.name !== s.rmsub; })[0] || cats[0]).name;
    if (idxOf(ds, s.y) < 0 || !isNum(ds.cols[idxOf(ds, s.y)])) s.y = nums[0].name;
    R.controls = fmt + choice("rmdup", "Repeated subject–condition pairs", [["", "Stop and ask me"], ["mean", "Average repeated trials"], ["last", "Use the last observation"]], s.rmdup || "") + pick("rmsub", "Subject", any, s.rmsub) + pick("rmcond", "Condition", cats, s.rmcond) + pick("y", "Measure", nums, s.y);
    var si = idxOf(ds, s.rmsub), ci = idxOf(ds, s.rmcond), yi = idxOf(ds, s.y), cell = Object.create(null), counts = Object.create(null), conds = [], subs = [], dup = 0;
    rows.forEach(function (r) { if (r[si] == null || r[ci] == null || typeof r[yi] !== "number") return; var a = String(r[si]), c = String(r[ci]); if (conds.indexOf(c) < 0) conds.push(c); if (!cell[a]) { cell[a] = Object.create(null); counts[a] = Object.create(null); subs.push(a); } if (cell[a][c] != null) { dup++; if (s.rmdup === "mean") cell[a][c] += (r[yi] - cell[a][c]) / (++counts[a][c]); else cell[a][c] = r[yi]; } else { cell[a][c] = r[yi]; counts[a][c] = 1; } });
    conds.sort(function (a, b) { return isFinite(+a) && isFinite(+b) ? +a - +b : a < b ? -1 : 1; });
    names = conds; Y = []; subs.forEach(function (a) { var v = conds.map(function (c) { return cell[a][c]; }); if (v.every(function (x) { return x != null; })) Y.push(v); else dropped++; });
    if (dup && !s.rmdup) return need(R, "an explicit choice for " + dup + " repeated subject–condition pairs: average repeated trials or use the last observation");
    if (dup) R.caveats.push(dup + " repeated subject–condition pairs: " + (s.rmdup === "mean" ? "averaged repeated trials" : "last observation selected") + " by your explicit choice.");
  }
  if (names.length < 2 || Y.length < 3) return need(R, "at least three subjects measured in every condition");
  if (names.length > 12) return need(R, "at most 12 conditions");
  var a = S3.rmAnova(Y), fr = S3.friedman(Y), ph = S3.pairedPosthoc(Y, names), n = a.n, k = a.k;
  var sphOk = !(a.mauchly.p < 0.05), useGG = k > 2 && !sphOk, pUse = useGG ? (a.eps.gg > 0.75 ? a.pHF : a.pGG) : a.p, corr = useGG ? (a.eps.gg > 0.75 ? "Huynh–Feldt" : "Greenhouse–Geisser") : "", eps = useGG ? (a.eps.gg > 0.75 ? a.eps.hf : a.eps.gg) : 1;
  var sds = names.map(function (_, j) { var v = Y.map(function (r) { return r[j]; }), m = a.means[j]; return Math.sqrt(v.reduce(function (s2, x) { return s2 + (x - m) * (x - m); }, 0) / (n - 1)); });
  var tc = S3.qt(0.975, n - 1), lo = a.means.map(function (m, j) { return m - tc * sds[j] / Math.sqrt(n); }), hi = a.means.map(function (m, j) { return m + tc * sds[j] / Math.sqrt(n); });
  R.summary = {test: "Repeated-measures ANOVA" + (corr ? " (" + corr + " corrected)" : ""), n: n, conditions: names.length, F: a.F, df1: a.df1 * eps, df2: a.df2 * eps, p: pUse, partial_eta2: a.eta2p, generalized_eta2: a.eta2g, epsilon_gg: a.eps.gg, friedman_Q: fr.Q, friedman_p: fr.p, kendall_W: fr.W};
  R.head = figs([["F(" + f3(a.df1 * eps) + ", " + f3(a.df2 * eps) + ")", f3(a.F)], ["p-value" + (corr ? " (corrected)" : ""), fp(pUse)], ["Partial η²", f3(a.eta2p)], ["Generalized η²", f3(a.eta2g)], ["Subjects", n + (dropped ? " · " + dropped + " incomplete" : "")]], true) +
    table(["Condition", "Mean", "SD", "95% CI"], names.map(function (nm, j) { return [esc(nm), f3(a.means[j]), f3(sds[j]), f3(lo[j]) + " to " + f3(hi[j])]; }));
  R.chart = profileChart(names, a.means, lo, hi, s.rmfmt === "long" ? s.y : "Value");
  R.extra = '<h3 class="sub-h">Sphericity</h3>' + (k > 2 ? table(["Check", "Value", "p", ""], [
      ["Mauchly's W", isFinite(a.mauchly.W) ? f3(a.mauchly.W) : "—", isFinite(a.mauchly.p) ? fp(a.mauchly.p) : "—", isFinite(a.mauchly.p) ? chipYes(sphOk, "Sphericity holds", "Violated") : ""],
      ["Greenhouse–Geisser ε", f3(a.eps.gg), fp(a.pGG), ""], ["Huynh–Feldt ε", f3(a.eps.hf), fp(a.pHF), ""], ["Lower bound ε", f3(a.eps.lb), "", ""]]) +
      '<p class="count">When sphericity is violated, the F test is corrected: Greenhouse–Geisser if ε ≤ 0.75, otherwise Huynh–Feldt (Girden, 1992).</p>' : '<p class="count">With two conditions sphericity always holds; this test equals a paired t-test (F = t²).</p>') +
    '<h3 class="sub-h">Rank-based check (Friedman)</h3>' + figs([["χ²(" + fr.df + ")", f3(fr.Q)], ["p-value", fp(fr.p)], ["Kendall's W", f3(fr.W)]]) +
    (ph.length > 1 ? '<h3 class="sub-h">Which conditions differ (paired t, Holm-adjusted)</h3>' + table(["Pair", "Mean difference", "95% CI", "t", "p (Holm)", "d<sub>z</sub>"], ph.map(function (c) { return [esc(c.a) + " − " + esc(c.b), f3(c.diff), f3(c.lo) + " to " + f3(c.hi), f3(c.t), fp(c.pHolm), f3(c.dz)]; })) : "");
  var hiC = names[a.means.indexOf(amax(a.means))], loC = names[a.means.indexOf(amin(a.means))];
  R.reading.push("Across " + n + " subjects, the average ranges from " + f3(amin(a.means)) + " (“" + esc(loC) + "”) to " + f3(amax(a.means)) + " (“" + esc(hiC) + "”). The differences between conditions are " + pWord(pUse) + ".");
  R.reading.push("Condition explains " + Math.round(a.eta2p * 100) + "% of the within-subject variation (partial η² = " + fz(a.eta2p) + "); generalized η² = " + fz(a.eta2g) + ", which is comparable across designs.");
  if (k > 2) R.reading.push(sphOk ? "Mauchly's test does not flag a sphericity problem, so the uncorrected F test is used." : "Sphericity is violated (Mauchly p " + pTxt(a.mauchly.p) + "), so degrees of freedom are multiplied by ε = " + f3(eps) + " (" + corr + ").");
  R.reading.push((fr.p < 0.05) === (pUse < 0.05) ? "The rank-based Friedman test agrees at the .05 threshold (χ² = " + f3(fr.Q) + ", p " + pTxt(fr.p) + ")." : "The rank-based Friedman test reaches a different decision (χ² = " + f3(fr.Q) + ", p " + pTxt(fr.p) + "); with non-normal differences, prefer it.");
  var sig = ph.filter(function (c) { return c.pHolm < 0.05; });
  if (ph.length > 1) R.reading.push(sig.length ? sig.length + " of " + ph.length + " pairs differ after Holm adjustment, largest: “" + esc(sig.sort(function (x, y) { return Math.abs(y.dz) - Math.abs(x.dz); })[0].a) + "” vs “" + esc(sig[0].b) + "”." : "No pair of conditions differs after Holm adjustment.");
  if (dropped) R.caveats.push(dropped + " subject" + (dropped > 1 ? "s were" : " was") + " left out for missing a condition. If many are missing, a mixed model (Grouped data) uses every measurement.");
  if (n < 15) R.caveats.push("With " + n + " subjects, the sphericity test has little power; consider reporting the corrected result regardless.");
  R.caveats.push("Repeated-measures ANOVA assumes the differences between conditions are roughly normal. Order effects (practice, fatigue) are not handled by the test itself.");
  R.apa = "<i>F</i>(" + f3(a.df1 * eps) + ", " + f3(a.df2 * eps) + ") = " + fz(a.F) + ", <i>p</i> " + pAPA(pUse) + ", η²<sub>p</sub> = " + fz(a.eta2p) + (corr ? " (" + corr + " corrected, ε = " + fz(eps) + ")" : "");
  if (s.rmfmt === "long") R.next.push({label: "Fit a mixed model that keeps incomplete subjects", kind: "mixed", sel: {y: s.y, mg: s.rmsub, mx: [s.rmcond]}});
  return R;
}

// ---- Grouped data: linear mixed model ----
function designMatrix(ds, rows, yName, preds) {
  var yi = idxOf(ds, yName), parts = preds.map(function (n) { var j = idxOf(ds, n), c = ds.cols[j]; if (isNum(c)) return {name: n, j: j, num: true}; var u = Object.create(null); rows.forEach(function (r) { if (r[j] != null) u[r[j]] = (u[r[j]] || 0) + 1; }); var lv = Object.keys(u).sort(); return {name: n, j: j, num: false, levels: lv}; });
  var names = ["Intercept"]; parts.forEach(function (p) { if (p.num) names.push(p.name); else p.levels.slice(1).forEach(function (l) { names.push(p.name + " = " + l); }); });
  var X = [], y = [], keep = [];
  rows.forEach(function (r, i) {
    if (typeof r[yi] !== "number") return; var x = [1], ok = true;
    parts.forEach(function (p) { var v = r[p.j]; if (p.num) { if (typeof v !== "number") ok = false; x.push(v); } else { if (v == null) ok = false; p.levels.slice(1).forEach(function (l) { x.push(String(v) === l ? 1 : 0); }); } });
    if (ok) { X.push(x); y.push(r[yi]); keep.push(i); }
  });
  return {X: X, y: y, names: names, keep: keep, parts: parts};
}
function runMixed(ds) {
  var R = mkR("mixed"), s = A.sel, nums = ds.cols.filter(isNum), cand = ds.cols.filter(function (c) { return c.type !== "empty" && c.type !== "text"; }), rows = filterRows(ds);
  if (!nums.length) return need(R, "a number column to explain");
  if (idxOf(ds, s.y) < 0 || !isNum(ds.cols[idxOf(ds, s.y)]) || (!s.myInit && likelyId(ds, ds.cols[idxOf(ds, s.y)]))) s.y = (nums.filter(function (c) { return !likelyId(ds, c); })[0] || nums[0]).name;
  s.myInit = true;
  var groupable = ds.cols.filter(function (c) { if (c.type === "empty") return false; var u = Object.create(null), j = idxOf(ds, c.name), n = 0; rows.forEach(function (r) { if (r[j] != null) { u[r[j]] = 1; n++; } }); var g = Object.keys(u).length; if (c.type === "number" && !/id|subject|participant|patient|school|class|site|clinic|cluster|person|hospital|ward|centre|center/i.test(c.name) && !likelyId(ds, c) && (g > 20 || /age|weight|height|bmi|pressure|bp$|score|level|count|dose|time|days|years/i.test(c.name) || Object.keys(u).some(function (v) { return +v !== Math.round(+v); }))) return false; return g >= 3 && g < n; });   // measurements such as BMI are not groups
  if (!groupable.length) return need(R, "a column that identifies groups (a person, class or site that appears on several rows)");
  if (idxOf(ds, s.mg) < 0) s.mg = (groupable.filter(function (c) { return /id|subject|participant|school|class|site|clinic|group|cluster|person/i.test(c.name); })[0] || groupable[0]).name;
  var preds = initCols(ds, "mx", [], function (c) { return c.name !== s.y && c.name !== s.mg && c.type !== "text"; });
  var numPreds = preds.filter(function (n) { return isNum(ds.cols[idxOf(ds, n)]); });
  if (s.mslope && numPreds.indexOf(s.mslope) < 0) s.mslope = "";
  R.controls = pick("y", "Outcome", nums, s.y) + pick("mg", "Grouped by", groupable, s.mg) + choice("mslope", "Let this effect vary by group", [["", "None (random intercept)"]].concat(numPreds.map(function (n) { return [n, n]; })), s.mslope || "") +
    mselList("mx", cand.filter(function (c) { return c.name !== s.y && c.name !== s.mg; }), "Predictors");
  var res = memo(ds, ["mixed", s.y, s.mg, preds, s.mslope], function () {
    var D = designMatrix(ds, rows, s.y, preds), gi = idxOf(ds, s.mg), g = [], X = [], y = [];
    D.keep.forEach(function (i, t) { var gv = rows[i][gi]; if (gv == null) return; g.push(String(gv)); X.push(D.X[t]); y.push(D.y[t]); });
    if (y.length < 10) return {err: "at least ten complete rows"};
    var nG = Object.keys(g.reduce(function (o, v) { o[v] = 1; return o; }, Object.create(null))).length; if (nG < 3) return {err: "at least three groups with complete rows"};
    var si = s.mslope ? D.names.indexOf(s.mslope) : -1, Z = X.map(function (x) { return si > 0 ? [1, x[si]] : [1]; });
    var m = S3.mixed(y, X, Z, g, D.names), cl = S3.clusterOLS(y, X, g, D.names), ols = S.ols(y, X.map(function (x) { return x.slice(1); }), D.names.slice(1));
    return {m: m, cl: cl, ols: ols, n: y.length, G: nG, names: D.names, sizes: g.reduce(function (o, v) { o[v] = (o[v] || 0) + 1; return o; }, Object.create(null))};
  });
  if (res.err) return need(R, res.err);
  var m = res.m; if (m.Psi[0][0] < 1e-10 * m.scale) { m.Psi[0][0] = 0; if (m.icc != null) m.icc = 0; }
  var tau = Math.sqrt(m.Psi[0][0]), sig = Math.sqrt(m.scale), mbar = res.n / res.G, deff = m.icc != null ? 1 + (mbar - 1) * m.icc : null;
  R.summary = {test: "Linear mixed model (REML), random " + (s.mslope ? "intercept and slope for " + s.mslope : "intercept") + " by " + s.mg, n: res.n, groups: res.G, between_sd: tau, within_sd: sig, icc: m.icc != null ? m.icc : undefined, lr: m.lr, p_lr: m.pLR,
    coefficients: m.fe.slice(1).map(function (c) { return {name: c.name, b: c.b, se: c.se, p: c.p, ci95: [c.lo, c.hi]}; })};
  if (m.icc == null) delete R.summary.icc;
  if (!m.fe[1]) { R.summary.p = m.pLR; }
  R.head = figs([["Groups", res.G + " · " + f3(mbar) + " rows each"], ["Between-group SD", f3(tau)], ["Within-group SD", f3(sig)], m.icc != null ? ["ICC", f3(m.icc)] : ["Slope SD", f3(Math.sqrt(m.Psi[1][1]))], ["Rows used", res.n]], true) +
    table(["Fixed effect", "Estimate", "SE", "95% CI", "z", "p"], m.fe.map(function (c) { return [esc(c.name), f3(c.b), f3(c.se), f3(c.lo) + " to " + f3(c.hi), f3(c.z), fp(c.p)]; }));
  R.chart = m.fe.length > 1 ? coefChart(m.fe.slice(1).map(function (c) { return {name: c.name, b: c.b, lo: c.lo, hi: c.hi, p: c.p}; })) : "";
  var olsSE = Object.create(null); (res.ols.coefs || []).forEach(function (c) { olsSE[c.name] = c.se; });
  R.extra = '<h3 class="sub-h">Why the grouping matters</h3><p class="count">Standard errors for each effect under three treatments of the grouping. Ordinary regression ignores it; cluster-robust errors (CR1, t on ' + (res.cl ? res.cl.G - 1 : "—") + " df) correct the uncertainty only; the mixed model also separates within- and between-group variation.</p>" +
    table(["Effect", "Ordinary SE", "Cluster-robust SE", "Mixed-model SE", "Cluster-robust p"], m.fe.slice(1).map(function (c, i) { var cr = res.cl ? res.cl.coefs[i + 1] : null; return [esc(c.name), f3(olsSE[c.name]), cr ? f3(cr.se) : "—", f3(c.se), cr ? fp(cr.p) : "—"]; })) +
    '<p class="count">Likelihood-ratio test for the group variation: χ² = ' + f3(m.lr) + ", p " + pTxt(m.pLR) + " (boundary-corrected mixture). " + (deff ? "Design effect = " + f3(deff) + ": the data carry about as much information as " + Math.round(res.n / deff) + " independent rows." : "") + "</p>";
  var main = m.fe.slice(1);
  if (m.icc != null) R.reading.push(Math.round(m.icc * 100) + "% of the variation in " + esc(s.y) + " lies between groups of " + esc(s.mg) + " (ICC = " + fz(m.icc) + "). " + (m.pLR < 0.05 ? "That grouping is clearly present (p " + pTxt(m.pLR) + "), so treating rows as independent would understate uncertainty." : "The grouping is not clearly present (p " + pTxt(m.pLR) + "), but the mixed model remains a safe choice."));
  else R.reading.push("The effect of " + esc(s.mslope) + " varies between groups with SD " + f3(Math.sqrt(m.Psi[1][1])) + " around its average.");
  main.slice(0, 4).forEach(function (c) { R.reading.push("Holding the other predictors constant, a one-unit rise in " + esc(c.name) + " is associated with a change of " + f3(c.b) + " in " + esc(s.y) + " (95% CI " + f3(c.lo) + " to " + f3(c.hi) + "); this is " + pWord(c.p) + "."); });
  if (!main.length) R.reading.push("Add predictors to estimate their effects while accounting for " + esc(s.mg) + ".");
  if (res.G < 10) R.caveats.push("Only " + res.G + " groups: variance estimates are imprecise and Wald z tests are optimistic. With few groups, prefer the cluster-robust t results or collect more groups.");
  R.caveats.push("Fixed-effect p-values use Wald z tests (as statsmodels); standard errors use the GLS formula σ²(X′V⁻¹X)⁻¹ (as lme4). Estimates use REML.");
  if (preds.some(function (n) { return !isNum(ds.cols[idxOf(ds, n)]); })) R.caveats.push("Categories are compared with their first level (alphabetical) as the reference.");
  R.apa = main[0] ? "<i>b</i> = " + fz(main[0].b) + ", <i>SE</i> = " + fz(main[0].se) + ", 95% CI [" + fz(main[0].lo) + ", " + fz(main[0].hi) + "], <i>z</i> = " + fz(main[0].z) + ", <i>p</i> " + pAPA(main[0].p) + (m.icc != null ? "; ICC = " + fz(m.icc) : "") : "";
  return R;
}

// ---- Scale reliability ----
function runReliability(ds) {
  var R = mkR("reliability"), s = A.sel, nums = ds.cols.filter(isNum), rows = filterRows(ds);
  var itemLike = nums.filter(function (c) { return !likelyId(ds, c) && /item|^q\d|question|scale|_\d+$/i.test(c.name); });
  var items = initCols(ds, "items", (itemLike.length >= 3 ? itemLike : nums.filter(function (c) { return !likelyId(ds, c); })).slice(0, 12), isNum);
  var rev = selCols(ds, "rev", function (c) { return items.indexOf(c.name) >= 0; });
  R.controls = mselList("items", nums, "Items in the scale", 3) + (items.length ? mselList("rev", items.map(function (n) { return {name: n}; }), "Reverse-scored items") : "");
  if (items.length < 2) return need(R, "two or more number columns (questionnaire items)");
  var M = completeMatrix(ds, rows, items), X = M.X;
  if (X.length < 5) return need(R, "at least five rows answered on every item");
  var lo = Infinity, hi = -Infinity; X.forEach(function (r) { r.forEach(function (v) { lo = Math.min(lo, v); hi = Math.max(hi, v); }); });
  X = X.map(function (r) { return r.map(function (v, j) { return rev.indexOf(items[j]) >= 0 ? reverseInRange(v, lo, hi) : v; }); });
  if (X[0].some(function (_, j) { return X.every(function (r) { return r[j] === X[0][j]; }); })) return need(R, "items that vary (one item has the same answer in every row)");
  var a = S3.alpha(X), om = items.length >= 3 ? S3.omega(S3.corrMatrix(X).R, X) : NaN;
  var band = a.alpha >= 0.9 ? "excellent" : a.alpha >= 0.8 ? "good" : a.alpha >= 0.7 ? "acceptable" : a.alpha >= 0.6 ? "questionable" : "poor";
  R.summary = {test: "Cronbach's alpha with Feldt 95% CI", n: X.length, items: items.length, alpha: a.alpha, ci95: [a.lo, a.hi], standardized_alpha: a.std, mean_inter_item_r: a.rbar};
  if (isFinite(om)) R.summary.omega_total = om;
  R.head = figs([["Cronbach's α", f3(a.alpha)], ["95% CI", f3(a.lo) + " to " + f3(a.hi)], ["McDonald's ω", isFinite(om) ? f3(om) : "—"], ["Mean inter-item r", f3(a.rbar)], ["Rows", X.length + (M.dropped ? " · " + M.dropped + " incomplete" : "")]], true) +
    table(["Item", "Mean", "SD", "Item–rest r", "α if dropped", ""], items.map(function (nm, j) { var it = a.items[j]; return [esc(nm) + (rev.indexOf(nm) >= 0 ? " (reversed)" : ""), f3(it.mean), f3(it.sd), f3(it.itemRest), isFinite(it.alphaDrop) ? f3(it.alphaDrop) : "—", it.itemRest < 0 ? '<span class="chip q-excluded">Reverse?</span>' : it.itemRest < 0.3 ? '<span class="chip q-estimated">Weak</span>' : isFinite(it.alphaDrop) && it.alphaDrop > a.alpha + 0.02 ? '<span class="chip q-estimated">Lowers α</span>' : ""]; }));
  R.chart = bars(items.map(function (nm, j) { return [nm, Math.max(0, a.items[j].itemRest)]; }), "Item–rest correlation");
  R.extra = '<div class="slot"><button type="button" class="btn" data-mscale="1">Add the scale score as a column</button><span class="count">Mean of the items' + (rev.length ? ", reversed where marked" : "") + ", for rows that answered all of them.</span></div>";
  R.reading.push("Cronbach's α = " + fz(a.alpha) + " (95% CI " + fz(a.lo) + " to " + fz(a.hi) + "), conventionally " + band + " internal consistency for " + items.length + " items." + (isFinite(om) ? " McDonald's ω = " + fz(om) + ", which does not assume every item loads equally." : ""));
  var neg = items.filter(function (_, j) { return a.items[j].itemRest < 0; }), weak = items.filter(function (_, j) { return a.items[j].itemRest >= 0 && a.items[j].itemRest < 0.3; });
  if (neg.length) R.reading.push(neg.map(function (n) { return "“" + esc(n) + "”"; }).join(", ") + " run" + (neg.length === 1 ? "s" : "") + " opposite to the rest. If " + (neg.length === 1 ? "it is" : "they are") + " worded negatively, mark " + (neg.length === 1 ? "it" : "them") + " as reverse-scored.");
  if (weak.length) R.reading.push(weak.map(function (n) { return "“" + esc(n) + "”"; }).join(", ") + " correlate" + (weak.length === 1 ? "s" : "") + " weakly with the rest (item–rest r < .30).");
  R.caveats.push("Alpha rises with the number of items and assumes one underlying dimension. Check the structure with Factor analysis before trusting a single score.");
  if (a.alpha > 0.95) R.caveats.push("α above .95 can mean items are near-duplicates rather than a better scale.");
  if (X.length < 50) R.caveats.push("With " + X.length + " complete rows the interval for α is wide.");
  R.apa = "Cronbach's α = " + fz(a.alpha) + ", 95% CI [" + fz(a.lo) + ", " + fz(a.hi) + "]" + (isFinite(om) ? ", ω = " + fz(om) : "");
  R.next.push({label: "Check the structure with factor analysis", kind: "factor", sel: {fitems: items.slice()}});
  return R;
}
function reverseInRange(value, lo, hi) { var out = lo + (hi - value); return isFinite(out) ? out : (lo / 2 + hi / 2 - value / 2) * 2; }
function opScale(ds, items, rev, name, selection) {
  var idx = items.map(function (n) { return idxOf(ds, n); }); if (idx.some(function (j) { return j < 0; })) throw new Error("A scale item is missing from this dataset.");
  var rows = selection ? scoreRows(ds, selection) : ds.rows, complete = rows.filter(function (r) { return idx.every(function (j) { return typeof r[j] === "number" && isFinite(r[j]); }); }), eligible = new Set(complete);
  if (!complete.length) throw new Error("Scale scoring needs complete eligible observations.");
  var lo = Infinity, hi = -Infinity; complete.forEach(function (r) { idx.forEach(function (j) { lo = Math.min(lo, r[j]); hi = Math.max(hi, r[j]); }); });
  var n = 0, scored = ds.rows.map(function (r) { if (!eligible.has(r)) return r.concat([null]); var values = idx.map(function (j, q) { return rev.indexOf(items[q]) >= 0 ? reverseInRange(r[j], lo, hi) : r[j]; }); n++; return r.concat([S.mean(values)]); });
  return {rows: scored, cols: ds.cols.concat([{name: uniqueColumnName(name, ds.cols.map(function (c) { return c.name; })), type: "number"}]), changed: n};
}
function fitFactor(X, items, s) {
    var moments = S3.corrMatrix(X), C = moments.R; if (C.some(function (r) { return r.some(function (v) { return !isFinite(v); }); })) return {err: "items that vary"};
    var kb = S3.kmoBartlett(C, X.length); if (!kb) return {err: "items that are not exact combinations of each other (the correlation matrix is singular)"};
    var ev = S3.eigSym(C).values, par = S3.parallel(X.length, items.length, 40, 17), sugg = 0; while (sugg < ev.length && ev[sugg] > par[sugg]) sugg++; sugg = Math.max(1, sugg);
    var k = s.fk === "auto" ? Math.min(sugg, items.length - 1) : Math.min(+s.fk, items.length - 1), L, comm, hey = false;
    if (s.fmeth === "pca") { var pc = S3.pca(C); L = pc.loadings.map(function (r) { return r.slice(0, k); }); comm = L.map(function (r) { return r.reduce(function (a, v) { return a + v * v; }, 0); }); }
    else { var f = S3.paf(C, k); L = f.loadings; comm = f.communalities; hey = f.heywood; }
    var phi = null;
    if (k > 1 && s.frot === "varimax") L = S3.varimax(L, true).loadings;
    else if (k > 1 && s.frot === "promax") { var pr = S3.promax(L, 4); L = pr.loadings; phi = pr.phi; }
    var order = L[0].map(function (_, j) { return j; }), ssl = order.map(function (j) { return L.reduce(function (a, r) { return a + r[j] * r[j]; }, 0); });
    order.sort(function (a, b) { return ssl[b] - ssl[a]; }); L = L.map(function (r) { return order.map(function (j) { return r[j]; }); }); ssl = order.map(function (j) { return ssl[j]; });
    var signs = L[0].map(function (_, j) { return L.reduce(function (a, r) { return a + r[j]; }, 0) < 0 ? -1 : 1; });
    L = L.map(function (r) { return r.map(function (v, j) { return v * signs[j]; }); });
    if (phi) phi = order.map(function (a, i) { return order.map(function (b, j) { return phi[a][b] * signs[i] * signs[j]; }); });
    var inverse = S3.inv(C); if (!inverse) return {err: "an invertible item correlation matrix"};
    var structure = phi ? S3.mul(L, phi) : L, weights = S3.mul(inverse, structure);
    if (weights.some(function (r) { return r.some(function (v) { return !isFinite(v); }); })) return {err: "a finite score solution"};
    var fit = {version: 1, items: items.slice(), mean: moments.mean, sd: moments.cov.map(function (r, i) { return Math.sqrt(r[i]); }), weights: weights, loadings: L, phi: phi, method: s.fmeth, rotation: s.frot, trainingN: X.length};
    return {kb: kb, ev: ev, par: par, sugg: sugg, k: k, L: L, comm: comm, ssl: ssl, phi: phi, hey: hey, fit: fit};
}
function runFactor(ds) {
  var R = mkR("factor"), s = A.sel, nums = ds.cols.filter(isNum), rows = filterRows(ds);
  var fLike = nums.filter(function (c) { return !likelyId(ds, c) && /item|^q\d|question|scale|_\d+$/i.test(c.name); });
  var items = initCols(ds, "fitems", (fLike.length >= 3 ? fLike : nums.filter(function (c) { return !likelyId(ds, c); })).slice(0, 20), isNum);
  s.fmeth = s.fmeth || "paf"; s.frot = s.frot || "promax"; s.fk = s.fk || "auto";
  R.controls = choice("fmeth", "Method", [["paf", "Factor analysis (principal axis)"], ["pca", "Principal components"]], s.fmeth) + choice("fk", "Number of factors", [["auto", "Suggested (parallel analysis)"]].concat([1, 2, 3, 4, 5, 6, 7, 8].filter(function (k) { return k < items.length; }).map(function (k) { return [k, String(k)]; })), s.fk) +
    choice("frot", "Rotation", [["promax", "Promax (factors may correlate)"], ["varimax", "Varimax (independent factors)"], ["none", "None"]], s.frot) + mselList("fitems", nums, "Items", 3);
  if (items.length < 3) return need(R, "three or more number columns");
  var M = completeMatrix(ds, rows, items), X = M.X;
  if (X.length < items.length + 3) return need(R, "more complete rows than items");
  var res = memo(ds, ["factor", items, s.fmeth, s.fk, s.frot, dataVersion(ds), !!s.keepExcluded], function () { return fitFactor(X, items, s); });
  if (res.err) return need(R, res.err);
  R.scoreFit = clone(res.fit);
  var kb = res.kb, k = res.k, p = items.length, label = s.fmeth === "pca" ? "Component" : "Factor";
  R.summary = {test: (s.fmeth === "pca" ? "Principal component analysis" : "Principal-axis factor analysis") + (k > 1 && s.frot !== "none" ? ", " + s.frot + " rotation" : ""), n: X.length, items: p, factors: k, suggested_by_parallel_analysis: res.sugg, kmo: kb.kmo, bartlett_chi2: kb.chi2, p: kb.p,
    method: s.fmeth, rotation: s.frot, oblique: !!res.phi, pattern_loading_sums: res.ssl, variance_explained: res.phi ? null : res.ssl.map(function (v) { return v / p; })};
  R.head = figs([[label + "s kept", k + (s.fk === "auto" ? " (suggested)" : "")], [res.phi ? "Rotation" : "Variance explained", res.phi ? "Correlated dimensions" : Math.round(res.ssl.reduce(function (a, b) { return a + b; }, 0) / p * 100) + "%"], ["KMO", f3(kb.kmo)], ["Bartlett χ²(" + kb.df + ")", f3(kb.chi2) + " · p " + pTxt(kb.p)], ["Rows", X.length + (M.dropped ? " · " + M.dropped + " incomplete" : "")]], true) +
    table(["Item"].concat(res.L[0].map(function (_, j) { return label.slice(0, 1) + (j + 1); })).concat(["Communality", "MSA"]), items.map(function (nm, i) {
      var main = res.L[i].map(Math.abs).indexOf(amax(res.L[i].map(Math.abs)));
      return [esc(nm)].concat(res.L[i].map(function (v, j) { return Math.abs(v) >= 0.4 ? "<b" + (j === main ? ' class="hi"' : "") + ">" + fz(v) + "</b>" : '<span class="nd">' + fz(v) + "</span>"; })).concat([fz(res.comm[i]), fz(kb.msa[i])]);
    }).concat([["<i>Sum of squared loadings</i>"].concat(res.ssl.map(function (v) { return f3(v); })).concat(["", ""])]));
  R.chart = lineChart([{name: "Your data", pts: res.ev.map(function (v, i) { return [i + 1, v]; })}, {name: "Random data (95th percentile)", pts: res.par.map(function (v, i) { return [i + 1, v]; })}], "Component number", "Eigenvalue");
  R.extra = (res.phi ? '<h3 class="sub-h">Factor correlations</h3>' + table([""].concat(res.phi.map(function (_, j) { return "F" + (j + 1); })), res.phi.map(function (r, i) { return ["F" + (i + 1)].concat(r.map(function (v) { return fz(v); })); })) : "") +
    '<p class="count">Loadings of 0.40 or more are shown in bold; MSA is each item\'s sampling adequacy (below 0.50 suggests dropping the item).</p>' +
    '<div class="slot"><button type="button" class="btn" data-mscores="1">Add ' + label.toLowerCase() + ' scores as columns</button><span class="count">' + (s.fmeth === "pca" ? "Standardized component scores." : "Regression (Thurstone) factor scores.") + " The displayed fit and current eligible rows are recorded and reused on replay or refresh.</span></div>";
  R.reading.push("Parallel analysis suggests " + res.sugg + " " + label.toLowerCase() + (res.sugg > 1 ? "s" : "") + ": " + (res.sugg > 1 ? "that many" : "only the first") + " beat what random data of the same size would give. " + (k !== res.sugg ? "You chose " + k + "." : ""));
  res.L[0].forEach(function (_, j) { var top = items.filter(function (_, i) { var row = res.L[i].map(Math.abs); return row[j] >= 0.4 && row.indexOf(amax(row)) === j; }); if (top.length) R.reading.push(label + " " + (j + 1) + (res.phi ? " is defined by " : " (" + Math.round(res.ssl[j] / p * 100) + "% of variance) is defined by ") + top.map(function (n) { return "“" + esc(n) + "”"; }).join(", ") + "."); });
  var cross = items.filter(function (_, i) { return res.L[i].filter(function (v) { return Math.abs(v) >= 0.4; }).length > 1; }), none = items.filter(function (_, i) { return res.L[i].every(function (v) { return Math.abs(v) < 0.4; }); });
  if (cross.length) R.reading.push(cross.map(function (n) { return "“" + esc(n) + "”"; }).join(", ") + " load" + (cross.length === 1 ? "s" : "") + " on more than one " + label.toLowerCase() + ".");
  if (none.length) R.caveats.push(none.map(function (n) { return "“" + esc(n) + "”"; }).join(", ") + " load" + (none.length === 1 ? "s" : "") + " weakly everywhere; consider dropping " + (none.length === 1 ? "it" : "them") + ".");
  R.caveats.push(kb.kmo < 0.6 ? "KMO = " + fz(kb.kmo) + " is low (below .60): these items share too little variance for a reliable factor solution." : "KMO = " + fz(kb.kmo) + " indicates the items share enough variance to factor.");
  if (res.hey) R.caveats.push("A communality reached 1 (Heywood case): too many factors or too few rows. Try one factor fewer.");
  if (X.length < 5 * p) R.caveats.push("Fewer than five complete rows per item; factor solutions this small are unstable.");
  if (s.fmeth === "pca") R.caveats.push("Principal components summarize total variance; they are not a model of latent factors. Use factor analysis to study constructs.");
  R.apa = (s.fmeth === "pca" ? "PCA" : "Principal-axis factoring") + (k > 1 && s.frot !== "none" ? " with " + s.frot + " rotation" : "") + " retained " + k + " " + label.toLowerCase() + (k > 1 ? "s" : "") + (res.phi ? "; correlated dimensions, so pattern square sums are not additive variance explained; KMO = " : " explaining " + Math.round(res.ssl.reduce(function (a, b) { return a + b; }, 0) / p * 100) + "% of variance; KMO = ") + fz(kb.kmo) + ", Bartlett's χ²(" + kb.df + ") = " + fz(kb.chi2) + ", <i>p</i> " + pAPA(kb.p);
  return R;
}
function scoreSelection(s) { return {f: s.f || "", fv: s.fv || "", where: clone(s.where || null), keepExcluded: !!s.keepExcluded}; }
function scoreRows(ds, selection) { var before = A.sel; try { A.sel = selection; return filterRows(ds); } finally { A.sel = before; } }
function opScores(ds, items, meth, k, rot, prefix, spec) {
  var selection = spec && spec.selection || scoreSelection(A.sel), rows = scoreRows(ds, selection), idx = items.map(function (n) { return idxOf(ds, n); });
  if (idx.some(function (j) { return j < 0; })) throw new Error("A fitted score input column is missing.");
  var fit = spec && spec.fit;
  if (!fit) {
    var X = completeMatrix(ds, rows, items).X, result = fitFactor(X, items, {fmeth: meth, fk: String(k), frot: rot});
    if (result.err) throw new Error(result.err); fit = result.fit;
  }
  if (fit.version !== 1 || JSON.stringify(fit.items) !== JSON.stringify(items) || fit.weights.length !== items.length || fit.mean.length !== items.length || fit.sd.length !== items.length || fit.weights.some(function (r) { return r.length !== k || r.some(function (v) { return typeof v !== "number" || !isFinite(v); }); }) || fit.mean.some(function (v) { return typeof v !== "number" || !isFinite(v); }) || fit.sd.some(function (v) { return typeof v !== "number" || !(v > 0 && isFinite(v)); })) throw new Error("The recorded score fit is invalid. Regenerate scores from a valid analysis.");
  var eligible = new Set(rows), names = ds.cols.map(function (c) { return c.name; }), newCols = [], count = 0;
  for (var j = 0; j < k; j++) { var name = uniqueColumnName(prefix + " " + (j + 1), names.concat(newCols.map(function (c) { return c.name; }))); newCols.push({name: name, type: "number"}); }
  var scored = ds.rows.map(function (r) {
    var values = idx.map(function (j) { return r[j]; }), out = new Array(k).fill(null);
    if (eligible.has(r) && values.every(function (v) { return typeof v === "number" && isFinite(v); })) {
      var z = values.map(function (v, j) { return (v - fit.mean[j]) / fit.sd[j]; });
      out = S3.mul([z], fit.weights)[0];
      if (out.some(function (v) { return !isFinite(v); })) throw new Error("Scores exceed the numerical range. Rescale the input before scoring.");
      count++;
    }
    return r.concat(out);
  });
  return {rows: scored, cols: ds.cols.concat(newCols), changed: count};
}

// ---- Rater agreement ----
function runAgree(ds) {
  var R = mkR("agree"), s = A.sel, cand = ds.cols.filter(function (c) { return c.type !== "empty" && c.type !== "text"; }), rows = filterRows(ds);
  var raters = initCols(ds, "raters", cand.filter(function (c) { return !likelyId(ds, c) && /rat|judge|coder|observer|reader|score|rev/i.test(c.name); }).slice(0, 2), function (c) { return c.type !== "empty"; });
  var allNum = raters.length && raters.every(function (n) { return isNum(ds.cols[idxOf(ds, n)]); });
  if (!s.agmode || s.agKey !== raters.join("\u0001")) { s.agmode = allNum ? "icc" : "kappa"; s.agKey = raters.join("\u0001"); }
  if (!allNum && s.agmode === "icc") s.agmode = "kappa";
  s.agw = s.agw || "none";
  R.controls = mselList("raters", cand, "One column per rater or instrument", 2) + (allNum ? choice("agmode", "Ratings are", [["icc", "Scores (intraclass correlation)"], ["kappa", "Categories (kappa)"]], s.agmode) : "") + (s.agmode === "kappa" && raters.length === 2 ? choice("agw", "Partial credit for near misses", [["none", "None (unweighted)"], ["linear", "Linear weights"], ["quadratic", "Quadratic weights"]], s.agw) : "");
  if (raters.length < 2) return need(R, "two or more columns, one per rater");
  var idx = raters.map(function (n) { return idxOf(ds, n); }), data = [], dropped = 0;
  rows.forEach(function (r) { var v = idx.map(function (j) { return r[j]; }); if (v.every(function (x) { return x != null; })) data.push(v); else dropped++; });
  if (data.length < 5) return need(R, "at least five rows rated by every rater");
  if (s.agmode === "icc") {
    var ic = S3.icc(data), f2 = ic.forms[1], f3_ = ic.forms[2];
    var kooLi = function (v) { return v < 0.5 ? "poor" : v < 0.75 ? "moderate" : v < 0.9 ? "good" : "excellent"; };
    R.summary = {test: "Intraclass correlation (Shrout & Fleiss)", n: ic.n, raters: ic.k, icc2: f2.icc, ci95: [f2.lo, f2.hi], icc3: f3_.icc, p: f2.p};
    R.head = figs([["ICC(2,1) absolute agreement", f3(f2.icc)], ["95% CI", f3(f2.lo) + " to " + f3(f2.hi)], ["ICC(3,1) consistency", f3(f3_.icc)], ["Targets × raters", ic.n + " × " + ic.k]], true) +
      table(["Form", "ICC", "95% CI", "F(" + ic.df1 + ", df2)", "p"], ic.forms.map(function (f) { return [f.type + " · " + f.label, f3(f.icc), f3(f.lo) + " to " + f3(f.hi), f3(f.F) + " (df2 " + f.df2 + ")", fp(f.p)]; }));
    var ms = raters.map(function (_, j) { var v = data.map(function (r) { return r[j]; }); return S.describe(v); });
    R.chart = boxplot(raters, ms, "Rating");
    R.reading.push("Single-rater absolute agreement is " + kooLi(f2.icc) + ": ICC(2,1) = " + fz(f2.icc) + ", 95% CI " + fz(f2.lo) + " to " + fz(f2.hi) + " (Koo & Li, 2016 bands use the interval, so the true reliability could be " + kooLi(f2.lo) + " to " + kooLi(f2.hi) + ").");
    if (f3_.icc - f2.icc > 0.05) R.reading.push("Consistency (ICC3 = " + fz(f3_.icc) + ") is higher than absolute agreement, so raters rank targets similarly but some rate systematically higher or lower.");
    R.reading.push("Averaging the " + ic.k + " raters gives ICC(2," + ic.k + ") = " + fz(ic.forms[4].icc) + "; report this if the average score is what you will use.");
    R.caveats.push("Report ICC2 when raters are a sample of possible raters, ICC3 when these specific raters are the only ones of interest, and the k forms when using the average of raters.");
    R.apa = "ICC(2,1) = " + fz(f2.icc) + ", 95% CI [" + fz(f2.lo) + ", " + fz(f2.hi) + "], <i>F</i>(" + ic.df1 + ", " + f2.df2 + ") = " + fz(f2.F) + ", <i>p</i> " + pAPA(f2.p);
  } else {
    var lk = function (v) { return v < 0 ? "worse than chance" : v < 0.2 ? "slight" : v < 0.4 ? "fair" : v < 0.6 ? "moderate" : v < 0.8 ? "substantial" : "almost perfect"; };
    var dataS = data.map(function (r) { return r.map(String); });
    if (raters.length === 2) {
      var kp = S3.kappa(dataS.map(function (r) { return r[0]; }), dataS.map(function (r) { return r[1]; }), s.agw === "none" ? null : s.agw);
      if (!isFinite(kp.kappa) || !isFinite(kp.p)) return need(R, "ratings that use more than one category");
      R.summary = {test: (s.agw === "none" ? "Cohen's kappa" : "Weighted kappa (" + s.agw + ")"), n: kp.n, kappa: kp.kappa, ci95: [kp.lo, kp.hi], p: kp.p, observed_agreement: kp.rawPo, chance_agreement: kp.rawPe, weighted_agreement: kp.po, weighted_chance_agreement: kp.pe, weights: s.agw};
      R.head = figs([["κ", f3(kp.kappa)], ["95% CI", f3(kp.lo) + " to " + f3(kp.hi)], ["Exact matches", Math.round(kp.rawPo * 100) + "%"], ["Exact matches by chance", Math.round(kp.rawPe * 100) + "%"], ["Rows", kp.n]], true);
      R.extra = kp.cats.length <= 12 ? '<h3 class="sub-h">' + esc(raters[0]) + " (rows) by " + esc(raters[1]) + " (columns)</h3>" + table([""].concat(kp.cats.map(esc)), kp.table.map(function (r, i) { return [esc(kp.cats[i])].concat(r.map(function (v, j) { return i === j ? "<b>" + v + "</b>" : String(v); })); })) : "";
      R.reading.push("The raters exactly match on " + Math.round(kp.rawPo * 100) + "% of rows. " + (s.agw === "none" ? "Unweighted agreement" : "Weighted agreement credit (not exact matches)") + " is " + Math.round(kp.po * 100) + "%, against " + Math.round(kp.pe * 100) + "% under its chance model: κ = " + fz(kp.kappa) + " (95% CI " + fz(kp.lo) + " to " + fz(kp.hi) + "), " + lk(kp.kappa) + " agreement by Landis & Koch's labels.");
      if (s.agw !== "none") R.reading.push("Weights give partial credit for near misses; categories were ordered " + (kp.cats.every(function (c) { return isFinite(+c); }) ? "numerically" : "alphabetically — check that this matches their real order") + ".");
      R.chart = bars(kp.cats.slice(0, 15).map(function (c, i) { return [c, kp.table[i][i] / Math.max(1, kp.table[i].reduce(function (a, b) { return a + b; }, 0))]; }), "Share of rater 1's category matched");
      R.apa = "κ = " + fz(kp.kappa) + ", 95% CI [" + fz(kp.lo) + ", " + fz(kp.hi) + "], <i>z</i> = " + fz(kp.z) + ", <i>p</i> " + pAPA(kp.p);
    } else {
      var fl = S3.fleiss(dataS);
      if (!isFinite(fl.kappa) || !isFinite(fl.p)) return need(R, "ratings that use more than one category");
      R.summary = {test: "Fleiss' kappa", n: fl.n, raters: fl.raters, agreement_basis: "pairwise", kappa: fl.kappa, p: fl.p, observed_agreement: fl.Po, chance_agreement: fl.Pe};
      R.head = figs([["Fleiss' κ", f3(fl.kappa)], ["z (vs no agreement)", f3(fl.z)], ["p-value", fp(fl.p)], ["Rows × raters", fl.n + " × " + fl.raters]], true);
      R.chart = bars(fl.cats.slice(0, 15).map(function (c, i) { return [c, fl.prop[i]]; }), "Share of all ratings");
      R.reading.push(fl.raters + " raters: Fleiss' κ = " + fz(fl.kappa) + ", " + lk(fl.kappa) + " agreement beyond chance (z = " + f3(fl.z) + ", p " + pTxt(fl.p) + ").");
      R.apa = "Fleiss' κ = " + fz(fl.kappa) + ", <i>z</i> = " + fz(fl.z) + ", <i>p</i> " + pAPA(fl.p);
    }
    R.caveats.push("Kappa depends on how common each category is: with one dominant category it can be low even when raw agreement is high. Report observed agreement alongside it.");
  }
  if (dropped) R.caveats.push(dropped + " row" + (dropped > 1 ? "s" : "") + " missing a rating " + (dropped > 1 ? "were" : "was") + " left out.");
  return R;
}

// ---- Missing data ----
function miInputKey(ds) { var s = A.sel; return JSON.stringify([ds.id, ds.rows.length, s.miy, s.mix || [], s.miaux || [], s.mim, s.f, s.fv, s.where || null, dataVersion(ds)]); }
var MI = {res: null, key: ""};
function runMissing(ds) {
  var R = mkR("missing"), s = A.sel, all = ds.cols.filter(function (c) { return c.type !== "empty"; }), rows = filterRows(ds);
  var cols = initCols(ds, "mcols", all.slice(0, 20));
  R.controls = mselList("mcols", all, "Columns to inspect", 1);
  if (!cols.length) return need(R, "at least one column");
  var idx = cols.map(function (n) { return idxOf(ds, n); }), Mx = rows.map(function (r) { return idx.map(function (j) { return r[j] == null; }); });
  var per = cols.map(function (_, q) { return Mx.filter(function (r) { return r[q]; }).length; }), n = rows.length, cells = n * cols.length, miss = per.reduce(function (a, b) { return a + b; }, 0), complete = Mx.filter(function (r) { return !r.some(Boolean); }).length;
  var pats = S3.patterns(Mx);
  R.summary = {test: "Missing-data patterns" , n: n, missing_cells: miss, complete_rows: complete, patterns: pats.length};
  R.head = figs([["Missing cells", miss + " of " + cells + " (" + (cells ? Math.round(miss / cells * 1000) / 10 : 0) + "%)"], ["Complete rows", complete + " of " + n], ["Patterns", pats.length], ["Columns with gaps", per.filter(Boolean).length]], true);
  R.chart = patternChart(cols, pats, n);
  var numMiss = cols.filter(function (nm, q) { return isNum(ds.cols[idx[q]]); }), lt = null;
  if (numMiss.length >= 2 && miss) {
    lt = memo(ds, ["little", numMiss], function () { var X = rows.map(function (r) { return numMiss.map(function (nm) { var v = r[idxOf(ds, nm)]; return typeof v === "number" ? v : null; }); }).filter(function (r) { return r.some(function (v) { return v != null; }); }); try { return S3.littleMCAR(X); } catch (e) { return null; } });
  }
  // Does missingness in one column relate to the values of others?
  var mar = [];
  cols.forEach(function (nm, q) { if (!per[q] || per[q] === n) return; numMiss.forEach(function (o) { if (o === nm) return; var oj = idxOf(ds, o), a = [], b = []; rows.forEach(function (r, i) { var v = r[oj]; if (typeof v !== "number") return; (Mx[i][q] ? a : b).push(v); }); if (a.length >= 3 && b.length >= 3) { var t = S.ttest(a, b); if (isFinite(t.p)) mar.push({miss: nm, other: o, diff: t.diff, d: t.d, p: t.p}); } }); });
  var adj = S3.holm(mar.map(function (m) { return m.p; })); mar.forEach(function (m, i) { m.pHolm = adj[i]; }); mar.sort(function (a, b) { return a.p - b.p; });
  R.extra = table(["Column", "Missing", "Share"], cols.map(function (nm, q) { return [esc(nm), String(per[q]), n ? Math.round(per[q] / n * 1000) / 10 + "%" : "—"]; })) +
    (lt && isFinite(lt.p) ? '<h3 class="sub-h">Little\'s MCAR test</h3>' + figs([["χ²(" + lt.df + ")", f3(lt.chi2)], ["p-value", fp(lt.p)], ["Columns tested", numMiss.length]]) : "") +
    (mar.length ? '<h3 class="sub-h">Is missingness linked to other columns?</h3><p class="count">Rows missing the first column compared with the rest on each number column (Welch t, Holm-adjusted).</p>' + table(["Missing in", "Compared on", "Difference (missing − present)", "d", "p (Holm)"], mar.slice(0, 10).map(function (m) { return [esc(m.miss), esc(m.other), f3(m.diff), f3(m.d), fp(m.pHolm)]; })) : "") +
    miPanel(ds, rows);
  if (!miss) { R.reading.push("No values are missing in the selected columns."); return R; }
  var worst = cols[per.indexOf(amax(per))];
  R.reading.push(Math.round(miss / cells * 1000) / 10 + "% of the selected cells are missing; " + complete + " of " + n + " rows (" + Math.round(complete / n * 100) + "%) are complete. “" + esc(worst) + "” has the most gaps (" + amax(per) + ").");
  if (lt && isFinite(lt.p)) R.reading.push(lt.p < 0.05 ? "Little's test rejects “missing completely at random” (χ² = " + f3(lt.chi2) + ", p " + pTxt(lt.p) + "): dropping incomplete rows could bias results. Multiple imputation below is safer." : "Little's test does not reject “missing completely at random” (p " + pTxt(lt.p) + "). That does not prove randomness, but complete-case analysis is less likely to be badly biased.");
  var link = mar.filter(function (m) { return m.pHolm < 0.05; });
  if (link.length) R.reading.push("Rows missing “" + esc(link[0].miss) + "” differ on “" + esc(link[0].other) + "” (d = " + f3(link[0].d) + "). Include “" + esc(link[0].other) + "” in imputation models so the missingness is explained (missing at random).");
  R.caveats.push("No test can show data are missing at random rather than missing for reasons tied to the missing values themselves. Think about why values are missing.");
  return R;
}
function patternChart(cols, pats, n) {
  var show = pats.slice(0, 14), lab = CW() < 400 ? 70 : 110, cw = Math.max(18, Math.min(36, (CW() - lab - 50) / cols.length)), W = Math.max(CW(), lab + cols.length * cw + 40), top = 124, H = top + 12 + show.length * 20, g = '<svg viewBox="0 0 ' + W + " " + H + '" class="achart" role="img" aria-label="Missing-data patterns">';
  cols.forEach(function (c, j) { g += '<text transform="translate(' + (lab + j * cw + cw / 2 + 5) + ',' + (top - 6) + ') rotate(-90)" class="tk">' + esc(String(c).slice(0, 13)) + "</text>"; });
  show.forEach(function (p, i) { var y = top + i * 20; g += '<text x="' + (lab - 8) + '" y="' + (y + 13) + '" text-anchor="end" class="tk">' + p.count + " rows</text>"; p.miss.forEach(function (m, j) { g += '<rect x="' + (lab + j * cw + 1) + '" y="' + (y + 1) + '" width="' + (cw - 2) + '" height="16" fill="' + (m ? "var(--pink)" : "var(--blue)") + '" opacity="' + (m ? 0.9 : 0.35) + '"><title>' + esc(cols[j]) + (m ? " missing" : " present") + "</title></rect>"; }); g += '<text x="' + (lab + cols.length * cw + 6) + '" y="' + (y + 13) + '" class="tk">' + p.nMissing + "</text>"; });
  return g + "</svg>" + '<p class="count">Each row is a pattern: pink = missing, blue = present; the number on the right counts missing columns.' + (pats.length > show.length ? " " + (pats.length - show.length) + " rarer patterns not drawn." : "") + "</p>";
}
function miPanel(ds, rows) {
  var s = A.sel, nums = ds.cols.filter(isNum);
  if (nums.length < 2) return "";
  if (idxOf(ds, s.miy) < 0 || !isNum(ds.cols[idxOf(ds, s.miy)])) s.miy = nums[0].name;
  var preds = initCols(ds, "mix", nums.filter(function (c) { return c.name !== s.miy && !likelyId(ds, c); }).slice(0, 2), function (c) { return isNum(c) && c.name !== s.miy; });
  var aux = selCols(ds, "miaux", function (c) { return isNum(c) && c.name !== s.miy && preds.indexOf(c.name) < 0; });
  s.mim = s.mim || "20";
  var key = miInputKey(ds), r = MI.key === key && MI.ds === ds.rows ? MI.res : null;
  var out = '<h3 class="sub-h">Multiple imputation</h3><p class="count">Fills each gap many times with plausible values (chained equations, predictive mean matching), fits the regression on each completed dataset, and pools the results with Rubin\'s rules.</p><div class="toolbar">' +
    pick("miy", "Outcome", nums, s.miy) + choice("mim", "Imputations", [["5", "5"], ["20", "20"], ["50", "50"]], s.mim) + "</div>" + mselList("mix", nums.filter(function (c) { return c.name !== s.miy; }), "Predictors") +
    (nums.length > preds.length + 1 ? mselList("miaux", nums.filter(function (c) { return c.name !== s.miy && preds.indexOf(c.name) < 0; }), "Extra columns that help predict the gaps (not in the model)") : "") +
    '<div class="slot"><button type="button" class="btn btn-primary" data-mirun="1">Run multiple imputation</button>' + (r ? '<button type="button" class="btn" data-misave="1">Add the completed datasets</button>' : "") + "</div>";
  if (!r) return out;
  if (r.err) return out + '<p class="warn">' + esc(r.err) + "</p>";
  return out + table(["Effect", "Pooled estimate", "95% CI", "p", "FMI", "Complete-case estimate", "Complete-case p"], r.pooled.map(function (c, i) { var cc = r.cc[i]; return [esc(c.name), f3(c.est), f3(c.lo) + " to " + f3(c.hi), fp(c.p), fz(c.fmi), cc ? f3(cc.b) : "—", cc ? fp(cc.p) : "—"]; })) +
    '<p class="count">' + r.m + " imputations of " + r.n + " rows (" + r.nComplete + " complete). FMI = fraction of missing information: how much of each estimate's uncertainty comes from the gaps. Degrees of freedom follow Barnard & Rubin (1999).</p>";
}
function runMI(ds) {
  var s = A.sel, rows = filterRows(ds), cols = [s.miy].concat(A.sel.mix || [], A.sel.miaux || []), idx = cols.map(function (n) { return idxOf(ds, n); }), m = +s.mim || 20;
  var key = miInputKey(ds);
  var X = rows.map(function (r) { return idx.map(function (j) { return typeof r[j] === "number" ? r[j] : null; }); }).filter(function (r) { return r.some(function (v) { return v != null; }); });
  var res;
  try {
    if (!(A.sel.mix || []).length) throw new Error("Choose at least one predictor.");
    if (X.length < 20) throw new Error("Multiple imputation needs at least 20 rows with some values.");
    if (!X.some(function (r) { return r.some(function (v) { return v == null; }); })) throw new Error("No values are missing in these columns; an ordinary regression gives the answer.");
    if (cols.some(function (_, j) { return X.filter(function (r) { return r[j] != null; }).length < 10; })) throw new Error("Each column needs at least 10 observed values to impute from.");
    var imps = S3.mice(X, m, {seed: 4242}), k = (A.sel.mix || []).length, fits = imps.map(function (D) { return S.ols(D.map(function (r) { return r[0]; }), D.map(function (r) { return r.slice(1, 1 + k); }), A.sel.mix); });
    var names = ["Intercept"].concat(A.sel.mix), pooled = names.map(function (nm, i) { var p = S3.pool(fits.map(function (f) { return f.coefs[i].b; }), fits.map(function (f) { return f.coefs[i].se * f.coefs[i].se; }), X.length - k - 1); p.name = nm; return p; });
    var cc = X.filter(function (r) { return r.slice(0, 1 + k).every(function (v) { return v != null; }); }), ccFit = cc.length > k + 2 ? S.ols(cc.map(function (r) { return r[0]; }), cc.map(function (r) { return r.slice(1, 1 + k); }), A.sel.mix) : null;
    res = {pooled: pooled, cc: names.map(function (_, i) { return ccFit ? ccFit.coefs[i] : null; }), m: m, n: X.length, nComplete: cc.length, imps: imps, cols: cols};
  } catch (e) { res = {err: e.message}; }
  MI = {res: res, key: key, ds: ds.rows};
}

// ---- Routing, formulas, captions, assistant facts ----
var _runA4 = runAnalysis;
runAnalysis = function (ds) {
  var fn = {rmanova: runRM, mixed: runMixed, reliability: runReliability, factor: runFactor, agree: runAgree, missing: runMissing}[A.kind];
  if (!fn) return _runA4(ds);
  var R = fn(ds); R.extra = R.extra || ""; R.apa = R.apa || ""; R.next = R.next || [];
  LAST_R = R; return R;
};
var _formula3 = formula;
formula = function (R) {
  var f = "";
  if (A.kind === "rmanova") f = mr(mi("F"), mo("="), fr(sb(mi("MS"), mi("condition")), sb(mi("MS"), mi("error"))), mo(","), mspace(), sb(mi("SS"), mi("error")), mo("="), sb(mi("SS"), mi("total")), mo("−"), sb(mi("SS"), mi("condition")), mo("−"), sb(mi("SS"), mi("subjects")));
  else if (A.kind === "mixed") f = mr(sb(mi("y"), mr(mi("i"), mi("j"))), mo("="), sb(mi("β"), mn(0)), mo("+"), sb(mi("β"), mn(1)), sb(mi("x"), mr(mi("i"), mi("j"))), mo("+"), sb(mi("u"), mi("j")), mo("+"), sb(mi("ε"), mr(mi("i"), mi("j"))));
  else if (A.kind === "reliability") f = mr(mi("α"), mo("="), fr(mi("k"), mr(mi("k"), mo("−"), mn(1))), mr(mo("("), mn(1), mo("−"), fr(mr(mo("∑"), sp(sb(mi("σ"), mi("i")), mn(2))), sp(sb(mi("σ"), mi("total")), mn(2))), mo(")")));
  else if (A.kind === "factor") f = mr(mi("R"), mo("≈"), mi("Λ"), mi("Φ"), sp(mi("Λ"), mo("⊤")), mo("+"), mi("Ψ"));
  else if (A.kind === "agree") f = A.sel.agmode === "icc" ? mr(mi("ICC"), mo("="), fr(mr(sb(mi("MS"), mi("R")), mo("−"), sb(mi("MS"), mi("E"))), mr(sb(mi("MS"), mi("R")), mo("+"), mr(mo("("), mi("k"), mo("−"), mn(1), mo(")")), sb(mi("MS"), mi("E")), mo("+"), fr(mi("k"), mi("n")), mr(mo("("), sb(mi("MS"), mi("C")), mo("−"), sb(mi("MS"), mi("E")), mo(")"))))) : mr(mi("κ"), mo("="), fr(mr(sb(mi("p"), mi("o")), mo("−"), sb(mi("p"), mi("e"))), mr(mn(1), mo("−"), sb(mi("p"), mi("e")))));
  else if (A.kind === "missing") f = mr(mover(mi("Q")), mo("="), fr(mn(1), mi("m")), mo("∑"), sb(mover(mi("Q"), "^"), mi("l")), mo(","), mspace(), mi("T"), mo("="), mover(mi("U")), mo("+"), mr(mo("("), mn(1), mo("+"), fr(mn(1), mi("m")), mo(")")), mi("B"));
  else return _formula3(R);
  return '<div class="math"><math display="block">' + f + "</math></div>";
};
function mspace() { return '<mspace width="1em"/>'; }
function mover(b, acc) { return '<mover accent="true">' + b + mo(acc || "¯") + "</mover>"; }
var _caption3 = caption;
caption = function (ds) {
  var s = A.sel;
  return {rmanova: "Mean in each condition with 95% intervals", mixed: "Fixed effects on " + s.y + " with 95% ranges, accounting for " + s.mg, reliability: "How strongly each item tracks the rest of the scale", factor: "Scree plot with parallel analysis", agree: s.agmode === "icc" ? "Ratings from each rater" : "Agreement by category", missing: "Missing-data patterns"}[A.kind] || _caption3(ds);
};
var _localFacts = localFacts;
localFacts = function (R) {
  var base = _localFacts(R), s = R.summary || {}, add = function (label, v, eff) { if (localNumber(v)) { base.facts.push(label + ": " + f3(v) + "."); if (eff) { base.effects.push(label); base.effectFacts.push(label + ": " + f3(v) + "."); } } }, ci = function (label, v) { if (localCI(v)) base.intervals.push(label + ": " + f3(v[0]) + " to " + f3(v[1]) + "."); };
  if (R.kind === "rmanova") { add("F", s.F); add("Partial eta squared", s.partial_eta2, true); add("Generalized eta squared", s.generalized_eta2, true); add("Greenhouse–Geisser epsilon", s.epsilon_gg); add("Kendall's W (Friedman)", s.kendall_W, true); }
  if (R.kind === "mixed") { add("Groups", s.groups); add("Intraclass correlation", s.icc, true); add("Between-group SD", s.between_sd); add("Within-group SD", s.within_sd); (s.coefficients || []).forEach(function (c) { add("Fixed effect for “" + c.name + "”", c.b, true); ci("95% confidence interval for “" + c.name + "”", c.ci95); }); }
  if (R.kind === "reliability") { add("Cronbach's alpha", s.alpha, true); ci("95% confidence interval for alpha", s.ci95); add("McDonald's omega", s.omega_total, true); add("Mean inter-item correlation", s.mean_inter_item_r); }
  if (R.kind === "factor") { add("Factors kept", s.factors); add("Suggested by parallel analysis", s.suggested_by_parallel_analysis); add("KMO", s.kmo); add("Bartlett chi-square", s.bartlett_chi2); }
  if (R.kind === "agree") { add("Kappa", s.kappa, true); add("ICC(2,1)", s.icc2, true); add("ICC(3,1)", s.icc3, true); ci("95% confidence interval", s.ci95); add("Observed agreement", s.observed_agreement); add("Chance agreement", s.chance_agreement); }
  if (R.kind === "missing") { add("Missing cells", s.missing_cells); add("Complete rows", s.complete_rows); add("Missing-data patterns", s.patterns); }
  return base;
};

// ---- Events for the new controls ----
view.addEventListener("change", function (e) {
  var t = e.target, key = t.dataset && t.dataset.msel; if (!key) return;
  var list = Array.isArray(A.sel[key]) ? A.sel[key].slice() : [];
  if (t.checked && list.indexOf(t.value) < 0) list.push(t.value); if (!t.checked) list = list.filter(function (v) { return v !== t.value; });
  if (key === "items" || key === "rev") { /* keep order of selection */ }
  A.sel[key] = list; render(); refocus('[data-msel="' + key + '"][value="' + (window.CSS && CSS.escape ? CSS.escape(t.value) : t.value) + '"]');
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset, ds = cur(); if (!ds) return;
  if (d.mscale) { if (!LAST_R || LAST_R.valid === false || LAST_R.kind !== "reliability") return; var items = A.sel.items || [], rev = A.sel.rev || [], selection = scoreSelection(A.sel); applyStep(ds, {op: "scale", items: items.slice(), rev: rev.slice(), selection: selection, name: "Scale score", text: "Added the scale score (mean of " + items.length + " items, complete eligible rows)", unit: "rows scored"}, function () { return opScale(ds, items, rev, "Scale score", selection); }); return; }
  if (d.mscores) {
    if (!LAST_R || LAST_R.valid === false || !LAST_R.scoreFit) return;
    var r = LAST_R.summary, it = A.sel.fitems || [], meth = A.sel.fmeth, k = r.factors, rot = A.sel.frot, pre = meth === "pca" ? "Component" : "Factor", spec = {fit: clone(LAST_R.scoreFit), selection: scoreSelection(A.sel)};
    applyStep(ds, {op: "scores", items: it.slice(), meth: meth, k: k, rot: rot, prefix: pre, fit: spec.fit, selection: spec.selection, text: "Added " + k + " " + pre.toLowerCase() + " score column" + (k > 1 ? "s" : "") + " using the displayed fit and eligible rows", unit: "rows scored"}, function () { return opScores(ds, it, meth, k, rot, pre, spec); }); return;
  }
  if (d.mirun) { var inputRows = ds.rows, inputCols = ds.cols, inputSel = JSON.stringify(A.sel); b.disabled = true; b.textContent = "Imputing…"; setTimeout(function () { if (cur() !== ds || ds.rows !== inputRows || ds.cols !== inputCols || A.kind !== "missing" || JSON.stringify(A.sel) !== inputSel) return; runMI(ds); render(); refocus("[data-mirun]"); }, 20); return; }
  if (d.misave && MI.res && MI.res.imps) {
    var cols = MI.res.cols.map(function (n) { return inheritedColumn(Object.assign({}, colMeta(ds, n), {name: n, type: "number"}), dependencyColumns(ds, MI.res.cols)); }).concat([{name: ".imp", type: "category"}]), rows2 = [];
    MI.res.imps.forEach(function (D, l) { D.forEach(function (r) { rows2.push(r.concat([String(l + 1)])); }); });
    addDerived(ds.name + " · " + MI.res.m + " imputations", cols, rows2, "Stacked completed datasets from multiple imputation (column .imp numbers each one). Analyse each and pool with Rubin's rules."); render(); return;
  }
});
// Replay support for the new recorded steps
var _replayStep2 = replayStep;
replayStep = function (ds, st2) {
  if (st2.op === "scale") return opScale(ds, st2.items, st2.rev || [], st2.name || "Scale score", st2.selection);
  if (st2.op === "scores") { if (!st2.fit || !st2.selection) throw new Error("Legacy score steps have no recorded fit or row scope. Regenerate them from the intended analysis."); return opScores(ds, st2.items, st2.meth, st2.k, st2.rot, st2.prefix, st2); }
  return _replayStep2(ds, st2);
};
