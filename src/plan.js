// ---------- Plan: sample size, power and sensitivity before collecting data ----------
var PL = {design: "tind", solve: "n", es: 0.5, alpha: 0.05, power: 0.8, alt: "two-sided", ratio: 1, k: 3, df: 2, preds: 3, n: 64, drop: 0, m: 1, icc: 0.05, helper: {}, msg: ""};
var PL_DESIGNS = [
  ["tind", "Two independent groups", "Cohen's d", [0.2, 0.5, 0.8], "independent-samples t-test"],
  ["tone", "Same people twice, or one group vs a value", "Cohen's d<sub>z</sub>", [0.2, 0.5, 0.8], "paired or one-sample t-test"],
  ["anova", "Three or more groups", "Cohen's f", [0.1, 0.25, 0.4], "one-way ANOVA"],
  ["corr", "Two numbers related", "Correlation r", [0.1, 0.3, 0.5], "test of a Pearson correlation"],
  ["prop", "Two proportions", "Cohen's h", [0.2, 0.5, 0.8], "comparison of two proportions (normal approximation)"],
  ["chisq", "Two categories (crosstab)", "Cohen's w", [0.1, 0.3, 0.5], "chi-square test"],
  ["regress", "Several predictors (R²)", "Cohen's f²", [0.02, 0.15, 0.35], "F test of R² in multiple regression"]
];
function plDesign() { return PL_DESIGNS.filter(function (d) { return d[0] === PL.design; })[0]; }
// Power for a per-group (two-group designs) or total n
function plPower(n, es) {
  var P = S3.power, a = PL.alpha, alt = PL.alt;
  switch (PL.design) {
    case "tind": return n >= 2 ? P.tInd(es, n, PL.ratio, a, alt) : NaN;
    case "tone": return n >= 2 ? P.tOne(es, n, a, alt) : NaN;
    case "anova": return n > PL.k ? P.anova(es, n, PL.k, a) : NaN;
    case "corr": return P.corr(es, n, a, alt);
    case "prop": return P.prop(es, n, PL.ratio, a, alt);
    case "chisq": return n > PL.df ? P.chisq(es, n, PL.df, a) : NaN;
    case "regress": return P.regress(es, n, PL.preds, a);
  }
}
function plTwoGroup() { return PL.design === "tind" || PL.design === "prop"; }
function plMinN() { return PL.design === "anova" ? PL.k + 1 : PL.design === "regress" ? PL.preds + 2 : PL.design === "corr" ? 4 : PL.design === "chisq" ? PL.df + 1 : 2; }
function plTotal(n) { return plTwoGroup() ? n + Math.ceil(n * PL.ratio) : n; }
function plInflate(nTotal) { var deff = 1 + (Math.max(1, PL.m) - 1) * PL.icc; return {deff: deff, n: Math.ceil(Math.ceil(nTotal * deff) / (1 - PL.drop / 100))}; }
function plSolve() {
  var es = +PL.es, out = {};
  if (PL.solve === "n") { out.n = S3.solveN(function (n) { return plPower(n, es); }, PL.power, plMinN()); out.power = plPower(out.n, es); out.es = es; }
  else if (PL.solve === "power") { out.n = Math.max(plMinN(), Math.round(PL.n)); out.power = plPower(out.n, es); out.es = es; }
  else { out.n = Math.max(plMinN(), Math.round(PL.n)); out.es = S3.solveEffect(function (e) { return plPower(out.n, PL.design === "corr" ? Math.min(e, 0.999) : e); }, PL.power, PL.design === "corr" ? 0.999 : 5); out.power = PL.power; }
  return out;
}
function plCurve(es, nStar) {
  var lo = plMinN(), hi = Math.max(lo + 10, Math.ceil((nStar || 50) * 2.2)), pts = [], step = Math.max(1, Math.round((hi - lo) / 60));
  for (var n = lo; n <= hi; n += step) { var p = plPower(n, es); if (isFinite(p)) pts.push([n, p]); }
  return pts;
}
function plSentence(o, d) {
  var unit = plTwoGroup() ? " per group (" + plTotal(o.n) + " in total" + (PL.ratio !== 1 ? ", allocation 1:" + PL.ratio : "") + ")" : PL.design === "anova" ? " in total (" + Math.ceil(o.n / PL.k) + " per group)" : " in total", inf = plInflate(plTotal(o.n));
  var core = PL.solve === "es" ? "With " + o.n + unit.replace(/^ in total/, " participants") + ", the study has " + Math.round(PL.power * 100) + "% power to detect " + d[2].replace(/<\/?sub>/g, "") + " = " + fz(o.es) + " or larger"
    : "A sample of " + o.n + unit + " gives " + Math.round(o.power * 100) + "% power to detect " + d[2].replace(/<\/?sub>/g, "") + " = " + fz(o.es);
  return core + " at " + (PL.alt === "two-sided" ? "two-sided " : "one-sided ") + "α = " + fz(PL.alpha, 3).replace(/0+$/, "") + " (" + d[4] + (PL.design === "anova" ? ", " + PL.k + " groups" : PL.design === "regress" ? ", " + PL.preds + " predictors" : PL.design === "chisq" ? ", " + PL.df + " df" : "") + "; " + (PL.design === "corr" ? "pwr.r.test method" : PL.design === "prop" ? "normal approximation" : "exact noncentral distribution") + ")." +
    (inf.deff > 1.0001 || PL.drop > 0 ? " Allowing for " + (inf.deff > 1.0001 ? "clustering (design effect " + f3(inf.deff) + ")" : "") + (inf.deff > 1.0001 && PL.drop > 0 ? " and " : "") + (PL.drop > 0 ? PL.drop + "% dropout" : "") + ", recruit " + inf.n + " in total." : "");
}
function num(id, label, v, step, min, max, hint) { return '<label class="field" for="' + id + '">' + label + '<input id="' + id + '" type="number" inputmode="decimal" data-pl="' + id + '" value="' + v + '" step="' + step + '"' + (min != null ? ' min="' + min + '"' : "") + (max != null ? ' max="' + max + '"' : "") + ">" + (hint ? '<span class="count">' + hint + "</span>" : "") + "</label>"; }
function plHelper(d) {
  var h = PL.helper;
  if (PL.design === "tind" || PL.design === "tone") return '<details class="dt"><summary>Work out d from means and SD</summary><div class="toolbar">' + num("h_m1", "Mean 1", h.m1 || "", "any") + num("h_m2", "Mean 2", h.m2 || "", "any") + num("h_sd", PL.design === "tone" ? "SD of the differences" : "Pooled SD", h.sd || "", "any", 0) + '<button type="button" class="btn" data-plh="d">Use it</button></div></details>';
  if (PL.design === "prop") return '<details class="dt"><summary>Work out h from two proportions</summary><div class="toolbar">' + num("h_p1", "Proportion 1", h.p1 || "", "0.01", 0, 1) + num("h_p2", "Proportion 2", h.p2 || "", "0.01", 0, 1) + '<button type="button" class="btn" data-plh="h">Use it</button></div></details>';
  if (PL.design === "anova") return '<details class="dt"><summary>Work out f from η²</summary><div class="toolbar">' + num("h_eta", "η² (share of variance)", h.eta || "", "0.01", 0, 0.99) + '<button type="button" class="btn" data-plh="f">Use it</button></div></details>';
  if (PL.design === "regress") return '<details class="dt"><summary>Work out f² from R²</summary><div class="toolbar">' + num("h_r2", "Expected R²", h.r2 || "", "0.01", 0, 0.99) + '<button type="button" class="btn" data-plh="f2">Use it</button></div></details>';
  return "";
}
function plFromAnalysis() {   // effect size from the current analysis, as an estimate to plan a follow-up
  var R = LAST_R, s = R && R.summary || {};
  if (s.cohen_d != null && isFinite(s.cohen_d)) return {design: "tind", es: Math.abs(s.cohen_d), label: "Cohen's d = " + fz(Math.abs(s.cohen_d)) + " from Compare groups"};
  if (s.r != null && isFinite(s.r) && R.kind === "relate") return {design: "corr", es: Math.abs(s.r), label: "r = " + fz(Math.abs(s.r)) + " from Two numbers"};
  if (s.cramers_v != null && isFinite(s.cramers_v)) return {design: "chisq", es: s.cramers_v, label: "Cramér's V = " + fz(s.cramers_v) + " from Two categories (equals w for 2 × k tables)"};
  if (s.r2 != null && isFinite(s.r2) && R.kind === "regress") return {design: "regress", es: s.r2 / (1 - s.r2), label: "f² = " + fz(s.r2 / (1 - s.r2)) + " from Several predictors"};
  return null;
}
function planView() {
  var d = plDesign(), o = plSolve(), from = plFromAnalysis(), inf = isFinite(o.n) ? plInflate(plTotal(o.n)) : null;
  var inputs = '<div class="toolbar">' + choice("pl_design", "Study design", PL_DESIGNS.map(function (x) { return [x[0], x[1]]; }), PL.design) +
    choice("pl_solve", "Find", [["n", "Sample size"], ["power", "Power for a given sample"], ["es", "Smallest detectable effect"]], PL.solve) + "</div><div class=\"toolbar\">" +
    (PL.solve !== "es" ? num("es", d[2].replace(/<\/?sub>/g, ""), PL.es, "0.01", 0.001, PL.design === "corr" ? 0.99 : 5, "small " + d[3][0] + " · medium " + d[3][1] + " · large " + d[3][2]) : "") +
    (PL.solve !== "n" ? num("n", plTwoGroup() ? "Participants per group" : "Total participants", PL.n, "1", plMinN()) : "") +
    (PL.solve !== "power" ? num("power", "Power", PL.power, "0.01", 0.5, 0.999, "usually 0.80 or 0.90") : "") +
    num("alpha", "Significance level α", PL.alpha, "0.005", 0.0001, 0.5) +
    (["tind", "tone", "corr", "prop"].indexOf(PL.design) >= 0 ? choice("pl_alt", "Hypothesis", [["two-sided", "Two-sided"], ["larger", "One-sided (larger)"], ["smaller", "One-sided (smaller)"]], PL.alt) : "") +
    (plTwoGroup() ? num("ratio", "Group 2 size ÷ group 1", PL.ratio, "0.1", 0.1, 10) : "") +
    (PL.design === "anova" ? num("k", "Number of groups", PL.k, "1", 2, 20) : "") + (PL.design === "chisq" ? num("df", "Degrees of freedom (rows − 1)(columns − 1)", PL.df, "1", 1, 100) : "") + (PL.design === "regress" ? num("preds", "Predictors", PL.preds, "1", 1, 50) : "") + "</div>" + plHelper(d) +
    '<details class="dt"><summary>Allow for dropout and clustering</summary><div class="toolbar">' + num("drop", "Expected dropout %", PL.drop, "1", 0, 90) + num("m", "People per cluster (class, site)", PL.m, "1", 1, 1000, "1 = no clustering") + num("icc", "Intraclass correlation", PL.icc, "0.01", 0, 1, "typical 0.01–0.20") + "</div></details>" +
    (from ? '<p class="count">From your current analysis: ' + esc(from.label) + '. <button type="button" class="linkbtn" data-plfrom="1">Plan a follow-up with it</button> Observed effects from small studies are usually inflated; consider a smaller planning value.</p>' : "");
  var res = !isFinite(o.n) || !isFinite(o.power) || !isFinite(o.es) ? '<p class="warn" role="status">No sample size up to 100 million reaches this power. Check that the effect size is above zero.</p>' :
    figs([[PL.solve === "n" ? (plTwoGroup() ? "Needed per group" : "Needed in total") : PL.solve === "power" ? "Power" : "Smallest detectable " + d[2].replace(/<\/?sub>/g, ""), PL.solve === "n" ? String(o.n) : PL.solve === "power" ? Math.round(o.power * 1000) / 10 + "%" : fz(o.es)],
      ["Total", String(plTotal(o.n))], ["Recruit (after dropout & clustering)", String(inf.n)], [PL.solve === "power" ? "Effect" : "Achieved power", PL.solve === "power" ? fz(o.es) : Math.round(o.power * 1000) / 10 + "%"]], true);
  var curve = isFinite(o.n) ? plCurve(o.es, o.n) : [], target = PL.solve === "power" ? null : PL.power;
  var chart = curve.length > 2 ? xyLines([{name: "Power for " + d[2].replace(/<\/?sub>/g, "") + " = " + fz(o.es), pts: curve}].concat(target ? [{name: "Target " + Math.round(target * 100) + "%", pts: [[curve[0][0], target], [curve[curve.length - 1][0], target]], dash: true}] : []), plTwoGroup() ? "Participants per group" : "Total participants", "Power", [0, 1]) : "";
  var sens = d[3].map(function (e) { var n = S3.solveN(function (n2) { return plPower(n2, e); }, PL.power, plMinN()); return [["Small", "Medium", "Large"][d[3].indexOf(e)] + " (" + e + ")", isFinite(n) ? String(n) : "—", isFinite(n) ? String(plTotal(n)) : "—"]; });
  var sentence = isFinite(o.n) && isFinite(o.es) ? plSentence(o, d) : "";
  return '<h1 class="vt">Plan a study</h1><p class="lede">Work out how many participants you need before collecting data, or what a fixed sample can detect. Calculations use exact noncentral distributions and match statsmodels and G*Power.</p>' +
    '<div class="poster"><section aria-labelledby="pl1"><h3 class="step" id="pl1"><i>1</i> Design</h3>' + inputs + "</section>" +
    '<section aria-labelledby="pl2"><h3 class="step" id="pl2"><i>2</i> Result</h3>' + res + (chart ? '<div class="chartwrap">' + chart + '</div><p class="figcap"><b>Fig. 1</b> Power as the sample grows</p>' : "") +
    '<h3 class="sub-h">Sample needed for ' + Math.round(PL.power * 100) + "% power by effect size</h3>" + table(["Effect (" + d[2] + ")", plTwoGroup() ? "Per group" : "Total", "Total"], sens) + "</section>" +
    '<section aria-labelledby="pl3"><h3 class="step" id="pl3"><i>3</i> Justification</h3>' + (sentence ? '<div class="reading"><p id="pl-sentence">' + esc(sentence) + '</p></div><div class="slot"><button type="button" class="btn" data-plcopy="1">Copy</button><button type="button" class="btn" data-pladd="1">Add to write-up</button></div>' : "") +
    (PL.msg ? '<p class="how" role="status">' + esc(PL.msg) + "</p>" : "") +
    '<div class="caveats"><h3>Keep in mind</h3><ul class="plain"><li>The planned effect size drives everything. Base it on the smallest effect that would matter in practice, or on several earlier studies, not on one small pilot.</li><li>Power analysis assumes the planned test and its conditions (normality, independence). Clustered designs need the design-effect adjustment above or a mixed-model simulation.</li>' + (PL.design === "corr" ? "<li>Correlation power uses the pwr package's Fisher-z method; exact methods can differ by a participant or two.</li>" : "") + "</ul></div></section></div>";
}
GROUPS.plan = ["plan"]; VIEWS.plan = planView;
view.addEventListener("change", function (e) {
  if (st.tab !== "plan") return;
  var t = e.target, d = t.dataset || {};
  if (d.pl) { if (/^h_/.test(t.id)) { PL.helper[t.id.slice(2)] = t.value; return; } var v = parseFloat(t.value); if (isFinite(v)) { PL[t.id] = t.id === "n" || t.id === "k" || t.id === "df" || t.id === "preds" || t.id === "m" ? Math.round(v) : v; } PL.msg = ""; render(); refocus("#" + t.id); return; }
  if (d.asel && /^pl_/.test(d.asel)) { var key = d.asel.slice(3); PL[key] = t.value; if (key === "design") { PL.es = plDesign()[3][1]; PL.helper = {}; } PL.msg = ""; render(); refocus("#" + t.id); e.stopImmediatePropagation(); }
}, true);
view.addEventListener("click", function (e) {
  if (st.tab !== "plan") return;
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset, h = PL.helper;
  if (d.plh) {
    var es = NaN;
    if (d.plh === "d") es = Math.abs((+h.m1 - +h.m2) / +h.sd); else if (d.plh === "h") es = Math.abs(2 * Math.asin(Math.sqrt(+h.p1)) - 2 * Math.asin(Math.sqrt(+h.p2)));
    else if (d.plh === "f") es = Math.sqrt(+h.eta / (1 - +h.eta)); else if (d.plh === "f2") es = +h.r2 / (1 - +h.r2);
    if (isFinite(es) && es > 0) { PL.es = +es.toFixed(4); PL.msg = "Effect size set to " + fz(PL.es) + "."; } else PL.msg = "Fill in every box with valid numbers first.";
    render(); return;
  }
  if (d.plfrom) { var f = plFromAnalysis(); if (f) { PL.design = f.design; PL.es = +f.es.toFixed(4); PL.solve = "n"; PL.msg = "Planning a follow-up with " + f.label + "."; } render(); return; }
  if (d.plcopy) { var txt = (document.getElementById("pl-sentence") || {}).textContent || ""; try { navigator.clipboard.writeText(txt).then(function () { PL.msg = "Copied."; render(); }, function () { PL.msg = "Copy was blocked; select the sentence and copy it."; render(); }); } catch (err) { PL.msg = "Copy was blocked; select the sentence and copy it."; render(); } return; }
  if (d.pladd) { var t2 = (document.getElementById("pl-sentence") || {}).textContent || ""; wpLoad(); WP.items = WP.items.filter(function (it) { return it.kind !== "plan"; }); WP.items.unshift({id: Date.now().toString(36), at: new Date().toISOString(), dataset: "", kind: "plan", test: "Sample-size calculation (" + plDesign()[4] + ")", title: "Sample size", apa: "", reading: [t2], caveats: [], evidence: {tested: false}, p: null, n: null, fig: ""}); WP.review = null; try { wpSave(); } catch (err) {} PL.msg = "Added to the Methods section of the write-up."; render(); }
});
