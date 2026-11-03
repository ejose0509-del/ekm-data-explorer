// ---------- Analyze, extended: assumption checks, alternatives, post-hoc, power, Bayes, APA, next steps ----------
KINDS.push(["paired", "Before and after"], ["logistic", "Yes/no outcome"], ["pivot", "Pivot table"]);
KIND_HELP.paired = "Did the same rows change between two measurements? (paired t-test and Wilcoxon signed-rank)";
KIND_HELP.logistic = "What predicts a yes/no outcome? (logistic regression, odds ratios)";
KIND_HELP.pivot = "A number summarized for every combination of categories.";

function fz(v, d) { d = d == null ? 2 : d; var s = (+v).toFixed(d); return Math.abs(v) < 1 ? s.replace(/^(-?)0\./, "$1.") : s; }   // APA: no leading zero for bounded statistics
function apaP(p) { return p < 0.001 ? "<i>p</i> < .001" : "<i>p</i> = " + fz(p, 3); }
function chipYes(ok, yes, no) { return '<span class="chip ' + (ok ? "q-verified" : "q-estimated") + '">' + (ok ? yes : no) + "</span>"; }
function getCol(ds, rows, n) { var j = idxOf(ds, n); return rows.map(function (r) { return r[j]; }); }
function groupsOf(ds, rows, y, g) { var yv = getCol(ds, rows, y), gv = getCol(ds, rows, g), m = {}; yv.forEach(function (v, i) { if (typeof v === "number" && gv[i] != null) (m[gv[i]] = m[gv[i]] || []).push(v); }); return m; }
function swRow(name, v) { var s = S2.shapiro(v); return s ? "<tr><td>" + esc(name) + '</td><td class="num">' + s.n + '</td><td class="num">' + s.W.toFixed(3) + '</td><td class="num">' + fp(s.p) + "</td><td>" + chipYes(s.p >= 0.05, "Looks normal", "Not normal") + "</td></tr>" : ""; }
function swTable(rows) { return '<h3 class="sub-h">Assumption checks</h3><div class="tablewrap"><table class="nosort"><thead><tr><th>Shapiro–Wilk</th><th>Rows</th><th>W</th><th>p</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>"; }
function bfLine(bf) { return "Approximate Bayes factor BF<sub>10</sub> = " + (bf > 1000 ? "> 1000" : bf < 0.001 ? "< 0.001" : f3(bf)) + ": " + S2.bfWord(bf) + " (BIC method, Wagenmakers 2007)."; }

var _runAnalysis = runAnalysis;
runAnalysis = function (ds) {
  var R = A.kind === "paired" ? runPaired(ds) : A.kind === "logistic" ? runLogistic(ds) : A.kind === "pivot" ? runPivot(ds) : _runAnalysis(ds);
  R.extra = R.extra || ""; R.apa = R.apa || ""; R.next = R.next || [];
  if (["paired", "logistic", "pivot"].indexOf(A.kind) < 0) { try { enrich(R, ds); } catch (e) { /* the core result still stands */ } }
  try { suggest(R, ds); } catch (e) {}
  return R;
};

function enrich(R, ds) {
  var s = A.sel, rows = filterRows(ds), sm = R.summary;
  if (A.kind === "describe" && sm.mean != null) {
    var sw = S2.shapiro(getCol(ds, rows, s.y));
    if (sw) { R.extra += swTable(swRow(s.y, getCol(ds, rows, s.y))); R.reading.push("Shapiro–Wilk W = " + sw.W.toFixed(3) + ", p " + (sw.p < 0.001 ? "< 0.001" : "= " + fp(sw.p)) + ": the values " + (sw.p < 0.05 ? "are not normally distributed, so prefer rank-based tests (Mann–Whitney, Kruskal–Wallis, Spearman) with this column." : "are consistent with a normal distribution.")); }
    R.apa = "<i>M</i> = " + f3(sm.mean) + ", <i>SD</i> = " + f3(sm.sd) + ", <i>Mdn</i> = " + f3(sm.median) + ", <i>n</i> = " + sm.n;
  }
  if (A.kind === "compare" && sm.groups) {
    var G = groupsOf(ds, rows, s.y, s.g), names = Array.isArray(sm.groups) ? sm.groups : Object.keys(G).filter(function (k) { return G[k].length >= 2; }).sort(function (a, b) { return S.mean(G[b]) - S.mean(G[a]); }), gs = names.map(function (k) { return G[k]; });
    var sws = names.map(function (k) { return S2.shapiro(G[k]); }), nonNormal = sws.some(function (w) { return w && w.p < 0.05; }), lev = S2.levene(gs);
    R.extra += swTable(names.slice(0, 12).map(function (k) { return swRow(k, G[k]); }).join("")) + '<p class="count">Levene (equal spreads): F(' + lev.df1 + ", " + lev.df2 + ") = " + lev.F.toFixed(2) + ", p " + (lev.p < 0.001 ? "< 0.001" : "= " + fp(lev.p)) + " " + chipYes(lev.p >= 0.05, "Spreads similar", "Spreads differ") + "</p>";
    var n = gs.reduce(function (a, g) { return a + g.length; }, 0), an = S.anova(gs);
    if (names.length === 2) {
      var mw = S2.mannWhitney(gs[0], gs[1]), pw = S2.powerD(sm.cohen_d, gs[0].length, gs[1].length), bf = S2.bfR2(an.eta2, n, 1);
      R.extra += '<h3 class="sub-h">Rank-based check</h3>' + figs([["Mann–Whitney U", f3(mw.U)], ["p-value", fp(mw.p)], ["Rank effect (r)", f3(mw.r)]]);
      R.reading.push((nonNormal ? "At least one group is not normally distributed, so the rank-based Mann–Whitney test is the safer read: " : "The rank-based Mann–Whitney test agrees as a check: ") + "U = " + f3(mw.U) + ", p " + (mw.p < 0.001 ? "< 0.001" : "= " + fp(mw.p)) + ".");
      R.reading.push(bfLine(bf));
      R.caveats.push("Power: with these group sizes there is about a " + Math.round(pw.power * 100) + "% chance of detecting an effect this size. About " + pw.need + " rows per group would give 80% power (normal approximation).");
      if (lev.p < 0.05) R.caveats.push("The groups' spreads differ (Levene), which Welch's t-test already allows for.");
      R.apa = "Welch's <i>t</i>(" + sm.df.toFixed(1) + ") = " + sm.t.toFixed(2) + ", " + apaP(sm.p) + ", <i>d</i> = " + fz(sm.cohen_d) + "; Mann–Whitney <i>U</i> = " + f3(mw.U) + ", " + apaP(mw.p);
    } else {
      var kw = S2.kruskal(gs), pairs = S2.pairwise(names, gs), bf2 = S2.bfR2(an.eta2, n, names.length - 1);
      R.extra += '<h3 class="sub-h">Rank-based check</h3>' + figs([["Kruskal–Wallis H", f3(kw.H)], ["p-value", fp(kw.p)], ["Effect (ε²)", f3(kw.eps2)]]) +
        '<h3 class="sub-h">Which groups differ (post-hoc)</h3><div class="tablewrap"><table class="nosort"><thead><tr><th>Pair</th><th>Difference</th><th>d</th><th>p (Holm-adjusted)</th></tr></thead><tbody>' +
        pairs.slice(0, 45).map(function (q) { return "<tr><td>" + esc(q.a) + " vs " + esc(q.b) + '</td><td class="num">' + f3(q.diff) + '</td><td class="num">' + f3(q.d) + '</td><td class="num">' + fp(q.padj) + " " + (q.padj < 0.05 ? '<span class="chip q-verified">differs</span>' : "") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
        '<p class="count">Pairwise Welch t-tests with Holm correction for the number of comparisons.</p>';
      var sig = pairs.filter(function (q) { return q.padj < 0.05; });
      R.reading.push(sig.length ? sig.length + " of " + pairs.length + " pairs differ after correcting for multiple comparisons, for example " + esc(sig[0].a) + " vs " + esc(sig[0].b) + " (difference " + f3(sig[0].diff) + ")." : "No pair of groups differs clearly once the comparisons are corrected for multiple testing.");
      R.reading.push((nonNormal || lev.p < 0.05 ? "Because " + (nonNormal ? "some groups are not normal" : "the spreads differ") + ", the Kruskal–Wallis test is the safer overall read: " : "The rank-based Kruskal–Wallis test agrees as a check: ") + "H(" + kw.df + ") = " + f3(kw.H) + ", p " + (kw.p < 0.001 ? "< 0.001" : "= " + fp(kw.p)) + ".");
      R.reading.push(bfLine(bf2));
      R.caveats = R.caveats.filter(function (c) { return !/says some groups differ, not which/.test(c); });
      R.apa = "<i>F</i>(" + an.df1 + ", " + an.df2 + ") = " + an.F.toFixed(2) + ", " + apaP(an.p) + ", η² = " + fz(an.eta2) + "; Kruskal–Wallis <i>H</i>(" + kw.df + ") = " + kw.H.toFixed(2) + ", " + apaP(kw.p);
    }
  }
  if (A.kind === "relate" && sm.r != null) {
    var xs = getCol(ds, rows, s.x), ys = getCol(ds, rows, s.y), swx = S2.shapiro(xs), swy = S2.shapiro(ys), pr = S2.powerR(sm.r, sm.n), bf3 = S2.bfR2(sm.r * sm.r, sm.n, 1);
    R.extra += swTable(swRow(s.x, xs) + swRow(s.y, ys));
    if ((swx && swx.p < 0.05) || (swy && swy.p < 0.05)) R.reading.push("At least one column is not normally distributed, so the rank-based Spearman ρ = " + f3(sm.spearman) + " is the safer measure of the link.");
    R.reading.push(bfLine(bf3));
    R.caveats.push("Power: about " + Math.round(pr.power * 100) + "% to detect a correlation this size with " + sm.n + " rows; " + pr.need + " rows would give 80%.");
    R.apa = "<i>r</i>(" + (sm.n - 2) + ") = " + fz(sm.r) + ", " + apaP(sm.p) + ", 95% CI [" + fz(sm.ci95[0]) + ", " + fz(sm.ci95[1]) + "]; Spearman's ρ = " + fz(sm.spearman);
  }
  if (A.kind === "cross" && sm.x2 != null) R.apa = "χ²(" + sm.df + ", <i>N</i> = " + sm.n + ") = " + sm.x2.toFixed(2) + ", " + apaP(sm.p) + ", Cramér's <i>V</i> = " + fz(sm.cramers_v);
  if (A.kind === "regress" && sm.r2 != null) {
    var k = sm.coefficients.length - 1, bf4 = S2.bfR2(sm.r2, sm.n, k);
    R.reading.push(bfLine(bf4));
    R.apa = "<i>R</i>² = " + fz(sm.r2) + ", adjusted <i>R</i>² = " + fz(sm.adj_r2) + ", " + apaP(sm.p_model) + "; " + sm.coefficients.slice(1).map(function (c) { return esc(c.name) + ": <i>b</i> = " + f3(c.b) + ", " + apaP(c.p); }).join("; ");
  }
  if (A.kind === "trend" && sm.series) R.apa = sm.series.slice(0, 3).map(function (x) { return esc(x.name) + ": " + (x.slope_per_year >= 0 ? "+" : "") + f3(x.slope_per_year) + " per year, " + apaP(x.p); }).join("; ");
}

function runPaired(ds) {
  var nums = ds.cols.filter(function (c) { return c.type === "number"; }), s = A.sel, R = {kind: "paired", controls: "", head: "", chart: "", reading: [], caveats: [], summary: {}};
  if (nums.length < 2) return need(R, "two number columns measured on the same rows (for example before and after)");
  if (idxOf(ds, s.x) < 0) s.x = nums[0].name; if (idxOf(ds, s.y) < 0 || s.y === s.x) s.y = (nums[1] || nums[0]).name;
  R.controls = pick("x", "Before", nums, s.x) + pick("y", "After", nums, s.y);
  var rows = filterRows(ds), xb = getCol(ds, rows, s.x), ya = getCol(ds, rows, s.y), t = S2.pairedT(ya, xb), w = S2.wilcoxon(ya, xb), diffs = [];
  xb.forEach(function (v, i) { if (typeof v === "number" && typeof ya[i] === "number") diffs.push(ya[i] - v); });
  if (!t || t.n < 3) return need(R, "at least three rows with both values");
  var sw = S2.shapiro(diffs), need80 = Math.ceil(Math.pow((1.959964 + 0.841621) / Math.abs(t.dz || 1e-9), 2));
  R.summary = {test: "Paired t-test and Wilcoxon signed-rank", before: s.x, after: s.y, n: t.n, mean_change: t.mean, ci95: [t.ciLo, t.ciHi], t: t.t, df: t.df, p: t.p, dz: t.dz, wilcoxon_p: w ? w.p : null};
  R.head = figs([["Average change", f3(t.mean)], ["95% range", f3(t.ciLo) + " to " + f3(t.ciHi)], ["p-value", fp(t.p)], ["Pairs", t.n]], true);
  R.chart = histogram(diffs, "Change (" + s.y + " − " + s.x + ")");
  R.extra = swTable(swRow("Changes", diffs)) + (w ? '<h3 class="sub-h">Rank-based check</h3>' + figs([["Wilcoxon T", f3(w.T)], ["p-value", fp(w.p)], ["Effect (r)", f3(w.r)]]) : "");
  R.reading.push("On average " + esc(s.y) + " is " + f3(Math.abs(t.mean)) + (t.mean >= 0 ? " higher" : " lower") + " than " + esc(s.x) + " for the same row. That change " + pWord(t.p) + ".");
  if (sw && sw.p < 0.05 && w) R.reading.push("The changes are not normally distributed, so the Wilcoxon signed-rank test is the safer read: p " + (w.p < 0.001 ? "< 0.001" : "= " + fp(w.p)) + ".");
  R.caveats.push("About " + need80 + " pairs would give 80% power for a change this size (normal approximation).");
  R.caveats.push("Both columns must describe the same thing measured twice on each row; otherwise use Compare groups.");
  R.apa = "Paired <i>t</i>(" + t.df + ") = " + t.t.toFixed(2) + ", " + apaP(t.p) + ", <i>d<sub>z</sub></i> = " + fz(t.dz) + (w ? "; Wilcoxon " + apaP(w.p) : "");
  return R;
}

function binaryCols(ds) { return ds.cols.filter(function (c, j) { if (c.type === "empty") return false; var u = {}; ds.rows.forEach(function (r) { if (r[j] != null) u[r[j]] = 1; }); return Object.keys(u).length === 2; }); }
function runLogistic(ds) {
  var bins = binaryCols(ds), nums = ds.cols.filter(function (c) { return c.type === "number"; }), s = A.sel, R = {kind: "logistic", controls: "", head: "", chart: "", reading: [], caveats: [], summary: {}};
  if (!bins.length || !nums.length) return need(R, "a column with exactly two values (yes/no) and at least one number column");
  if (!bins.some(function (c) { return c.name === s.o; })) s.o = bins[0].name;
  var j = idxOf(ds, s.o), lv = Object.keys(ds.rows.reduce(function (m, r) { if (r[j] != null) m[r[j]] = 1; return m; }, {})).sort();
  if (lv.indexOf(s.ov) < 0) s.ov = lv[1];
  var preds = nums.filter(function (c) { return c.name !== s.o; }); s.lp = (s.lp || preds.slice(0, 3).map(function (c) { return c.name; })).filter(function (p) { return idxOf(ds, p) >= 0 && p !== s.o; });
  R.controls = pick("o", "Outcome", bins, s.o) + '<label class="field" for="ov">Counts as yes<select id="ov" data-asel="ov">' + lv.map(function (v) { return "<option" + (v === s.ov ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("") + "</select></label>" +
    '<fieldset class="field preds"><legend>Predictors</legend>' + preds.map(function (c) { return '<label class="chk"><input type="checkbox" data-lpred="' + esc(c.name) + '"' + (s.lp.indexOf(c.name) >= 0 ? " checked" : "") + "> " + esc(c.name) + "</label>"; }).join("") + "</fieldset>";
  if (!s.lp.length) return need(R, "at least one predictor ticked");
  var rows = filterRows(ds), y = rows.map(function (r) { return r[j] == null ? null : String(r[j]) === s.ov ? 1 : 0; }), X = rows.map(function (r) { return s.lp.map(function (p) { return r[idxOf(ds, p)]; }); }), o = S2.logistic(y, X, s.lp);
  if (o.error) { R.head = '<p class="nd">' + esc(o.error) + "</p>"; return R; }
  var events = Math.round(o.base * o.n), fewer = Math.min(events, o.n - events);
  R.summary = {test: "Logistic regression", outcome: s.o + " = " + s.ov, n: o.n, mcfadden_r2: o.r2, lr_chi2: o.lr, p: o.p, odds_ratios: o.coefs.slice(1).map(function (c) { return {name: c.name, or: c.or, ci95: [c.lo, c.hi], p: c.p}; })};
  R.head = figs([["Model p-value", fp(o.p)], ["Pseudo R² (McFadden)", fz(o.r2)], ["Rows", o.n], ["Share “" + esc(s.ov) + "”", Math.round(o.base * 100) + "%"]], true) +
    '<div class="tablewrap"><table class="nosort"><thead><tr><th>Predictor</th><th>Odds ratio</th><th>95% range</th><th>p-value</th></tr></thead><tbody>' + o.coefs.slice(1).map(function (c) { return "<tr><td>" + esc(c.name) + '</td><td class="num">' + f3(c.or) + '</td><td class="num">' + f3(c.lo) + " to " + f3(c.hi) + '</td><td class="num">' + fp(c.p) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  R.chart = coefChart(o.coefs.slice(1).map(function (c) { return {name: c.name, b: c.b, lo: c.b - 1.959964 * c.se, hi: c.b + 1.959964 * c.se, p: c.p}; }));
  R.reading.push("Together the predictors " + (o.p < 0.05 ? "clearly" : "do not clearly") + " help predict whether " + esc(s.o) + " is “" + esc(s.ov) + "” (likelihood-ratio χ²(" + o.df + ") = " + o.lr.toFixed(2) + ", p " + (o.p < 0.001 ? "< 0.001" : "= " + fp(o.p)) + ").");
  o.coefs.slice(1).forEach(function (c) { R.reading.push("Each 1-unit rise in " + esc(c.name) + " multiplies the odds of “" + esc(s.ov) + "” by " + f3(c.or) + (c.p < 0.05 ? " (a clear effect)." : " (not clearly different from 1).")); });
  if (fewer < 10 * s.lp.length) R.caveats.push("Only " + fewer + " rows fall in the rarer outcome; about 10 per predictor are needed for stable estimates.");
  R.caveats.push("Odds ratios describe association after adjusting for the listed predictors only.");
  R.apa = "χ²(" + o.df + ") = " + o.lr.toFixed(2) + ", " + apaP(o.p) + ", McFadden <i>R</i>² = " + fz(o.r2) + "; " + o.coefs.slice(1).map(function (c) { return esc(c.name) + ": <i>OR</i> = " + f3(c.or) + ", 95% CI [" + f3(c.lo) + ", " + f3(c.hi) + "], " + apaP(c.p); }).join("; ");
  return R;
}

function runPivot(ds) {
  var cats = ds.cols.filter(function (c) { return c.type === "category"; }), nums = ds.cols.filter(function (c) { return c.type === "number"; }), s = A.sel, R = {kind: "pivot", controls: "", head: "", chart: "", reading: [], caveats: [], summary: {}};
  if (!cats.length) return need(R, "at least one category column");
  if (idxOf(ds, s.g) < 0) s.g = cats[0].name; if (s.g2 && idxOf(ds, s.g2) < 0) s.g2 = ""; s.agg = s.agg || (nums.length ? "mean" : "count"); if (s.agg !== "count" && idxOf(ds, s.y) < 0) s.y = (nums[0] || {}).name;
  R.controls = pick("g", "Rows", cats, s.g) + pick("g2", "Columns", cats, s.g2, true) + '<label class="field" for="pagg">Show<select id="pagg" data-asel="agg">' + [["count", "Number of rows"], ["mean", "Average"], ["median", "Median"], ["sum", "Total"]].map(function (o) { return '<option value="' + o[0] + '"' + (s.agg === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" + (s.agg !== "count" && nums.length ? pick("y", "Of", nums, s.y) : "");
  var rows = filterRows(ds), gi = idxOf(ds, s.g), ci = s.g2 ? idxOf(ds, s.g2) : -1, yi = s.agg === "count" ? -1 : idxOf(ds, s.y), cell = {}, rk = {}, ck = {};
  rows.forEach(function (r) { var a = r[gi], b = ci >= 0 ? r[ci] : "All"; if (a == null || b == null) return; rk[a] = 1; ck[b] = 1; var k = a + "\u0000" + b; (cell[k] = cell[k] || []).push(yi >= 0 ? r[yi] : 1); });
  var agg = function (v) { if (!v) return null; if (s.agg === "count") return v.length; var x = S.nums(v); if (!x.length) return null; return s.agg === "sum" ? x.reduce(function (p, q) { return p + q; }, 0) : s.agg === "mean" ? S.mean(x) : S.quantile(x.sort(function (p, q) { return p - q; }), 0.5); };
  var R1 = Object.keys(rk).sort().slice(0, 40), C1 = Object.keys(ck).sort().slice(0, 12), vals = [];
  var grid = R1.map(function (a) { return C1.map(function (b) { var v = agg(cell[a + "\u0000" + b]); if (v != null) vals.push([v, a, b]); return v; }); });
  var mx = Math.max.apply(null, vals.map(function (v) { return Math.abs(v[0]); }).concat([1e-9]));
  R.head = '<div class="tablewrap"><table class="nosort pivot"><thead><tr><th>' + esc(s.g) + (s.g2 ? " \\ " + esc(s.g2) : "") + "</th>" + C1.map(function (b) { return '<th class="num">' + esc(b) + "</th>"; }).join("") + "</tr></thead><tbody>" +
    R1.map(function (a, i) { return "<tr><td>" + esc(a) + "</td>" + grid[i].map(function (v) { return v == null ? '<td class="nd">—</td>' : '<td class="num" style="background:rgba(147,200,242,' + (0.06 + 0.32 * Math.abs(v) / mx).toFixed(2) + ')">' + f3(v) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  vals.sort(function (p, q) { return q[0] - p[0]; });
  var what = s.agg === "count" ? "rows" : {mean: "average", median: "median", sum: "total"}[s.agg] + " " + esc(s.y);
  R.summary = {table: "pivot", rows: s.g, columns: s.g2 || null, value: what, n: rows.length, highest: vals[0], lowest: vals[vals.length - 1]};
  if (vals.length) { R.reading.push("Highest " + what + ": " + esc(vals[0][1]) + (s.g2 ? " × " + esc(vals[0][2]) : "") + " (" + f3(vals[0][0]) + "). Lowest: " + esc(vals[vals.length - 1][1]) + (s.g2 ? " × " + esc(vals[vals.length - 1][2]) : "") + " (" + f3(vals[vals.length - 1][0]) + ")."); }
  if (Object.keys(rk).length > 40 || Object.keys(ck).length > 12) R.caveats.push("Only the first 40 rows and 12 columns of the table are shown.");
  R.caveats.push("A pivot table describes; to test whether the differences are real, use Compare groups or Two categories.");
  return R;
}

// Next steps: what a careful analyst would look at after this result
function suggest(R, ds) {
  var s = A.sel, cats = ds.cols.filter(function (c) { return c.type === "category"; }), nums = ds.cols.filter(function (c) { return c.type === "number"; }), out = [];
  var add = function (label, kind, sel, tab) { out.push({label: label, kind: kind, sel: sel, tab: tab}); };
  if (A.kind === "relate" && cats[0]) add("Compare " + s.y + " by " + cats[0].name, "compare", {y: s.y, g: cats[0].name});
  if (A.kind === "relate" && nums.length > 2) add("Predict " + s.y + " from several columns", "regress", {y: s.y});
  if (A.kind === "relate" && cats[0]) add("Check the link within one " + cats[0].name + " only", "relate", {x: s.x, y: s.y, f: cats[0].name});
  if (A.kind === "compare" && nums.length > 1) add("See how " + s.y + " relates to " + nums.filter(function (c) { return c.name !== s.y; })[0].name, "relate", {x: nums.filter(function (c) { return c.name !== s.y; })[0].name, y: s.y});
  if (A.kind === "compare") add("Pivot " + s.y + " by " + s.g, "pivot", {g: s.g, y: s.y, agg: "mean"});
  if (A.kind === "describe" && R.summary.skew != null && Math.abs(R.summary.skew) > 1) add("Add a log column for " + s.y, null, null, "enhance");
  if (A.kind === "describe" && cats[0] && R.summary.mean != null) add("Compare " + s.y + " by " + cats[0].name, "compare", {y: s.y, g: cats[0].name});
  if (A.kind === "cross" && nums[0]) add("Compare " + nums[0].name + " across " + s.g, "compare", {y: nums[0].name, g: s.g});
  if (A.kind === "regress") add("Check each predictor on its own", "relate", {x: (s.preds || [])[0], y: s.y});
  if (binaryCols(ds).length && nums.length && A.kind !== "logistic" && (A.kind === "compare" || A.kind === "cross")) add("Predict " + binaryCols(ds)[0].name + " (yes/no)", "logistic", {o: binaryCols(ds)[0].name});
  R.next = out.slice(0, 3);
}

// Plain-English question → analysis (on device), with Claude as an optional fallback
function mentioned(ds, q) { q = q.toLowerCase(); return ds.cols.map(function (c) { var n = c.name.toLowerCase(), alt = n.replace(/[_\-.]+/g, " "); var i = Math.max(q.indexOf(n), q.indexOf(alt)); return [c, i]; }).filter(function (x) { return x[1] >= 0; }).sort(function (a, b) { return a[1] - b[1]; }).map(function (x) { return x[0]; }); }
function routeQuestion(ds, q) {
  var cols = mentioned(ds, q), nm = cols.filter(isNum), ct = cols.filter(function (c) { return c.type === "category"; }), tm = cols.filter(function (c) { return c.type === "year" || c.type === "date"; }), w = q.toLowerCase();
  if (/before|after|pre|post|change between/.test(w) && nm.length >= 2) return {kind: "paired", sel: {x: nm[0].name, y: nm[1].name}};
  if (/predict|odds|chance|likely|probability/.test(w) && binaryCols(ds).some(function (b) { return cols.indexOf(b) >= 0; })) return {kind: "logistic", sel: {o: binaryCols(ds).filter(function (b) { return cols.indexOf(b) >= 0; })[0].name}};
  if (/over time|trend|per year|each year|changed|growth/.test(w) && nm.length) return {kind: "trend", sel: {y: nm[0].name, t: (tm[0] || {}).name, g: (ct[0] || {}).name}};
  if (nm.length && ct.length && /differ|compare|between|higher|lower|by |across|vs|versus/.test(w)) return {kind: "compare", sel: {y: nm[0].name, g: ct[0].name}};
  if (nm.length >= 3 || (/predict|explain|model|drivers?/.test(w) && nm.length >= 2)) return {kind: "regress", sel: {y: nm[0].name, preds: nm.slice(1).map(function (c) { return c.name; })}};
  if (nm.length >= 2) return {kind: "relate", sel: {x: nm[1].name, y: nm[0].name}};
  if (ct.length >= 2) return {kind: /table|pivot|count/.test(w) ? "pivot" : "cross", sel: {g: ct[0].name, g2: ct[1].name}};
  if (nm.length === 1 && ct.length === 1) return {kind: "compare", sel: {y: nm[0].name, g: ct[0].name}};
  if (cols.length === 1) return {kind: "describe", sel: {y: cols[0].name}};
  return null;
}
function askAnswer(ds) {
  var q = ((document.getElementById("askq") || {}).value || "").trim(); if (!q) return;
  A.askq = q; var r = routeQuestion(ds, q);
  if (r) { A.kind = r.kind; A.sel = r.sel; A.ai = {}; A.askmsg = "Answering with: " + KIND_HELP[r.kind]; render(); return; }
  A.askmsg = "Thinking about which analysis fits…"; render();
  if (!window.claude || !window.claude.use) { A.askmsg = "Name one or two columns in the question, for example “Does body_mass_g differ by species?”"; render(); return; }
  window.claude.use("sample").then(function (sample) {
    if (!sample) throw {code: "off"};
    return sample.json("Pick the statistical analysis that answers the question. Reply with JSON only: {\"kind\": one of describe, compare, relate, cross, trend, regress, paired, logistic, pivot, \"x\": column or null, \"y\": column or null, \"g\": column or null, \"g2\": column or null, \"t\": column or null, \"o\": column or null}. Use only these exact column names: " +
      ds.cols.map(function (c) { return c.name + " [" + c.type + "]"; }).join(", ") + ". Question: " + q, {modelTier: "quick"});
  }).then(function (v) {
    if (!v || KINDS.map(function (k) { return k[0]; }).indexOf(v.kind) < 0) throw {code: "bad"};
    var sel = {}; ["x", "y", "g", "g2", "t", "o"].forEach(function (k) { if (v[k] && idxOf(ds, v[k]) >= 0) sel[k] = v[k]; });
    A.kind = v.kind; A.sel = sel; A.ai = {}; A.askmsg = "Claude chose: " + KIND_HELP[v.kind]; render();
  }).catch(function () { A.askmsg = "Could not pick an analysis from that. Name one or two columns, for example “Does body_mass_g differ by species?”"; render(); });
}

// Formula, caption and view hooks for the new kinds
var _formula = formula;
formula = function (R) {
  var f = "";
  if (A.kind === "paired") f = mr(mi("t"), mo("="), fr(bar("d"), fr(sb(mi("s"), mi("d")), rt(mi("n")))));
  else if (A.kind === "logistic") f = mr(mi("ln"), fr(mi("p"), mr(mn(1), mo("−"), mi("p"))), mo("="), sb(mi("β"), mn(0)), mo("+"), sb(mi("β"), mn(1)), sb(mi("x"), mn(1)), mo("+"), mo("⋯"));
  else if (A.kind === "pivot") return "";
  else return _formula(R);
  return '<div class="math"><math display="block">' + f + "</math></div>";
};
var _caption = caption;
caption = function (ds) { var s = A.sel; return A.kind === "paired" ? "Change from " + s.x + " to " + s.y + " for each row" : A.kind === "logistic" ? "Effect of each predictor on the log-odds of " + s.o + " = " + s.ov + ", with 95% ranges" : _caption(ds); };
