// ---------- Plan: sample size, power and sensitivity before collecting data ----------
function plDefaults() { return {design: "tind", solve: "n", es: 0.5, alpha: 0.05, power: 0.8, alt: "two-sided", ratio: 1, k: 3, df: 2, preds: 3, n: 64, drop: 0, m: 1, icc: 0.05, helper: {}, open: {}, msg: ""}; }
var PL = plDefaults();
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
function plErrors(c) {
  var errors = [], finite = function (key) { return typeof c[key] === "number" && isFinite(c[key]); };
  function range(key, lo, hi, integer) { if (!finite(key) || c[key] < lo || c[key] > hi || (integer && Math.floor(c[key]) !== c[key])) errors.push(key + " must be " + (integer ? "a whole number " : "finite ") + "from " + lo + " to " + hi + "."); }
  if (!PL_DESIGNS.some(function (d) { return d[0] === c.design; })) errors.push("Choose a supported study design.");
  if (["n", "power", "es"].indexOf(c.solve) < 0) errors.push("Choose what to solve for.");
  if (["two-sided", "larger", "smaller"].indexOf(c.alt) < 0) errors.push("Choose a supported hypothesis.");
  range("alpha", .0001, .5); range("power", .5, .999); range("drop", 0, 90); range("m", 1, 1000, true); range("icc", 0, 1);
  if (c.solve !== "power" && c.power <= c.alpha) errors.push("Target power must exceed alpha.");
  if (c.solve !== "es" && (!finite("es") || c.es <= 0 || (c.design === "corr" ? c.es >= 1 : c.es > (c.design === "prop" ? Math.PI : 5)))) errors.push("Effect magnitude must be positive and finite, below 1 for correlation, at most pi for proportions, or at most 5 for other designs.");
  if (c.design === "tind" || c.design === "prop") range("ratio", .1, 10);
  if (c.design === "anova") range("k", 2, 20, true);
  if (c.design === "chisq") range("df", 1, 100, true);
  if (c.design === "regress") range("preds", 1, 50, true);
  var min = c.design === "anova" ? c.k + 1 : c.design === "regress" ? c.preds + 2 : c.design === "corr" ? 4 : c.design === "chisq" ? c.df + 1 : 2;
  if (c.solve !== "n") range("n", min, 1e8, true);
  return errors;
}
// Power for a per-group (two-group designs) or total n
function plPower(n, es) {
  var P = S3.power, a = PL.alpha, alt = PL.alt, signed = alt === "smaller" ? -Math.abs(es) : Math.abs(es), ratio = Math.ceil(n * PL.ratio) / n;
  switch (PL.design) {
    case "tind": return n >= 2 ? P.tInd(signed, n, ratio, a, alt) : NaN;
    case "tone": return n >= 2 ? P.tOne(signed, n, a, alt) : NaN;
    case "anova": return n > PL.k ? P.anova(es, n, PL.k, a) : NaN;
    case "corr": return P.corr(signed, n, a, alt);
    case "prop": return P.prop(signed, n, ratio, a, alt);
    case "chisq": return n > PL.df ? P.chisq(es, n, PL.df, a) : NaN;
    case "regress": return P.regress(es, n, PL.preds, a);
  }
}
function plTwoGroup() { return PL.design === "tind" || PL.design === "prop"; }
function plMinN() { return PL.design === "anova" ? PL.k + 1 : PL.design === "regress" ? PL.preds + 2 : PL.design === "corr" ? 4 : PL.design === "chisq" ? PL.df + 1 : 2; }
function plTotal(n) { return plTwoGroup() ? n + Math.ceil(n * PL.ratio) : n; }
function plInflate(nTotal) {
  if (!(isFinite(nTotal) && nTotal > 0 && PL.drop >= 0 && PL.drop <= 90 && PL.m >= 1 && PL.m <= 1000 && PL.m === Math.floor(PL.m) && PL.icc >= 0 && PL.icc <= 1)) return {err: "Invalid recruitment settings."};
  var deff = 1 + (PL.m - 1) * PL.icc, adjusted = Math.ceil(nTotal * deff / (1 - PL.drop / 100)), clusters = Math.ceil(adjusted / PL.m);
  return {deff: deff, n: clusters * PL.m, clusters: clusters};
}
function plSolve() {
  var errors = plErrors(PL); if (errors.length) return {err: errors.join(" ")};
  var es = PL.es, out = {};
  if (PL.solve === "n") { out.n = S3.solveN(function (n) { return plPower(n, es); }, PL.power, plMinN()); out.es = es; }
  else if (PL.solve === "power") { out.n = PL.n; out.es = es; }
  else { out.n = PL.n; out.es = S3.solveEffect(function (e) { return plPower(out.n, e); }, PL.power, PL.design === "corr" ? .999999 : PL.design === "prop" ? Math.PI : 5); }
  if (!isFinite(out.n) || !isFinite(out.es)) return {err: "No solution within the supported sample/effect range. Check the target and effect magnitude."};
  out.power = plPower(out.n, out.es);
  if (!isFinite(out.power) || out.power < 0 || out.power > 1 || plInflate(plTotal(out.n)).err) return {err: "No finite valid power/recruitment result is available for these settings."};
  return out;
}
function plCurve(es, nStar) {
  var lo = plMinN(), hi = Math.max(lo + 10, Math.ceil((nStar || 50) * 2.2)), pts = [], step = Math.max(1, Math.round((hi - lo) / 60));
  for (var n = lo; n <= hi; n += step) { var p = plPower(n, es); if (isFinite(p)) pts.push([n, p]); }
  return pts;
}
function plSentence(o, d) {
  var unit = plTwoGroup() ? (PL.ratio === 1 ? " per group (" + plTotal(o.n) + " in total)" : " in group 1 and " + Math.ceil(o.n * PL.ratio) + " in group 2 (" + plTotal(o.n) + " in total)") : PL.design === "anova" ? " in total (allocate across " + PL.k + " groups as evenly as possible)" : " in total", inf = plInflate(plTotal(o.n));
  var core = PL.solve === "es" ? "With " + o.n + unit.replace(/^ in total/, " participants") + ", the study has " + Math.round(PL.power * 100) + "% power to detect " + d[2].replace(/<\/?sub>/g, "") + " magnitude = " + String(o.es) + " or larger"
    : "A sample of " + o.n + unit + " gives about " + Math.round(o.power * 100) + "% power to detect " + d[2].replace(/<\/?sub>/g, "") + " magnitude = " + String(o.es);
  return core + " at " + (["tind", "tone", "corr", "prop"].indexOf(PL.design) < 0 ? "" : PL.alt === "two-sided" ? "two-sided " : "one-sided " + PL.alt + " ") + "α = " + String(PL.alpha) + " (" + d[4] + (PL.design === "anova" ? ", " + PL.k + " groups" : PL.design === "regress" ? ", " + PL.preds + " predictors" : PL.design === "chisq" ? ", " + PL.df + " df" : "") + "; " + (PL.design === "corr" ? "pwr.r.test method" : PL.design === "prop" ? "normal approximation" : "exact noncentral distribution") + ")." +
    (PL.m > 1 || PL.drop > 0 ? " Allowing for " + (PL.m > 1 ? "clustering (design effect " + f3(inf.deff) + ")" : "") + (PL.m > 1 && PL.drop > 0 ? " and " : "") + (PL.drop > 0 ? PL.drop + "% dropout" : "") + ", recruit " + inf.n + " in total" + (PL.m > 1 ? " in " + inf.clusters + " whole clusters of " + PL.m : "") + ". This design-effect inflation is an approximation, not a mixed-model power calculation." : "");
}
function num(id, label, v, step, min, max, hint) { return '<label class="field" for="' + id + '">' + label + '<input id="' + id + '" type="number" inputmode="decimal" data-pl="' + id + '" value="' + esc(v == null ? '' : v) + '" step="' + step + '"' + (min != null ? ' min="' + min + '"' : "") + (max != null ? ' max="' + max + '"' : "") + ">" + (hint ? '<span class="count">' + hint + "</span>" : "") + "</label>"; }
function plHelper(d) {
  var h = PL.helper;
  if (PL.design === "tind" || PL.design === "tone") return '<details class="dt" data-pl-detail="helper"' + (PL.open.helper ? ' open' : '') + '><summary>Work out d from means and SD</summary><div class="toolbar">' + num("h_m1", "Mean 1", (h.m1 == null ? "" : h.m1), "any") + num("h_m2", "Mean 2", (h.m2 == null ? "" : h.m2), "any") + num("h_sd", PL.design === "tone" ? "SD of the differences" : "Pooled SD", (h.sd == null ? "" : h.sd), "any", 0) + '<button type="button" class="btn" data-plh="d">Use it</button></div></details>';
  if (PL.design === "prop") return '<details class="dt" data-pl-detail="helper"' + (PL.open.helper ? ' open' : '') + '><summary>Work out h from two proportions</summary><div class="toolbar">' + num("h_p1", "Proportion 1", (h.p1 == null ? "" : h.p1), "0.01", 0, 1) + num("h_p2", "Proportion 2", (h.p2 == null ? "" : h.p2), "0.01", 0, 1) + '<button type="button" class="btn" data-plh="h">Use it</button></div></details>';
  if (PL.design === "anova") return '<details class="dt" data-pl-detail="helper"' + (PL.open.helper ? ' open' : '') + '><summary>Work out f from η²</summary><div class="toolbar">' + num("h_eta", "η² (share of variance)", (h.eta == null ? "" : h.eta), "0.01", 0, 0.99) + '<button type="button" class="btn" data-plh="f">Use it</button></div></details>';
  if (PL.design === "regress") return '<details class="dt" data-pl-detail="helper"' + (PL.open.helper ? ' open' : '') + '><summary>Work out f² from R²</summary><div class="toolbar">' + num("h_r2", "Expected R²", (h.r2 == null ? "" : h.r2), "0.01", 0, 0.99) + '<button type="button" class="btn" data-plh="f2">Use it</button></div></details>';
  return "";
}
function plFromAnalysis() {   // effect size from the current analysis, as an estimate to plan a follow-up
  var R = LAST_R, s = R && R.summary || {};
  if (!R || R.valid === false || s.primary) return null;
  if (s.cohen_d != null && isFinite(s.cohen_d)) return {design: "tind", es: Math.abs(s.cohen_d), label: "Cohen's d = " + fz(Math.abs(s.cohen_d)) + " from Compare groups"};
  if (s.r != null && isFinite(s.r) && R.kind === "relate") return {design: "corr", es: Math.abs(s.r), label: "r = " + fz(Math.abs(s.r)) + " from Two numbers"};
  if (s.cramers_v != null && isFinite(s.cramers_v)) return s.table_shape ? {design: "chisq", es: s.cramers_v * Math.sqrt(Math.min(s.table_shape[0] - 1, s.table_shape[1] - 1)), df: s.df, label: "Cohen's w from the displayed " + s.table_shape.join(" × ") + " table"} : null;
  if (s.r2 != null && isFinite(s.r2) && R.kind === "regress") return {design: "regress", es: s.r2 / (1 - s.r2), preds: s.coefficients.length - 1, label: "f² = " + fz(s.r2 / (1 - s.r2)) + " from Several predictors"};
  return null;
}
function planView() {
  PL.open = PL.open || {}; [].forEach.call(view.querySelectorAll("details[data-pl-detail]"), function (el) { PL.open[el.getAttribute("data-pl-detail")] = el.open; });
  var d = plDesign() || PL_DESIGNS[0], o = plSolve(), from = plFromAnalysis(), inf = isFinite(o.n) ? plInflate(plTotal(o.n)) : null;
  var inputs = '<div class="toolbar">' + choice("pl_design", "Study design", PL_DESIGNS.map(function (x) { return [x[0], x[1]]; }), PL.design) +
    choice("pl_solve", "Find", [["n", "Sample size"], ["power", "Power for a given sample"], ["es", "Smallest detectable effect"]], PL.solve) + "</div><div class=\"toolbar\">" +
    (PL.solve !== "es" ? num("es", d[2].replace(/<\/?sub>/g, "") + " magnitude", PL.es, "any", 0, PL.design === "corr" ? 1 : PL.design === "prop" ? Math.PI : 5, "small " + d[3][0] + " · medium " + d[3][1] + " · large " + d[3][2]) : "") +
    (PL.solve !== "n" ? num("n", plTwoGroup() ? "Participants in group 1" : "Total participants", PL.n, "1", plMinN()) : "") +
    num("power", "Target power (sample/sensitivity)", PL.power, "0.01", 0.5, 0.999, "usually 0.80 or 0.90") +
    num("alpha", "Significance level α", PL.alpha, "0.005", 0.0001, 0.5) +
    (["tind", "tone", "corr", "prop"].indexOf(PL.design) >= 0 ? choice("pl_alt", "Hypothesis", [["two-sided", "Two-sided"], ["larger", "One-sided (larger)"], ["smaller", "One-sided (smaller)"]], PL.alt) : "") +
    (plTwoGroup() ? num("ratio", "Group 2 size ÷ group 1", PL.ratio, "0.1", 0.1, 10) : "") +
    (PL.design === "anova" ? num("k", "Number of groups", PL.k, "1", 2, 20) : "") + (PL.design === "chisq" ? num("df", "Degrees of freedom (rows − 1)(columns − 1)", PL.df, "1", 1, 100) : "") + (PL.design === "regress" ? num("preds", "Predictors", PL.preds, "1", 1, 50) : "") + "</div>" + plHelper(d) +
    '<details class="dt" data-pl-detail="drop"' + (PL.open.drop ? ' open' : '') + '><summary>Allow for dropout and clustering</summary><div class="toolbar">' + num("drop", "Expected dropout %", PL.drop, "1", 0, 90) + num("m", "People per cluster (class, site)", PL.m, "1", 1, 1000, "1 = no clustering") + num("icc", "Intraclass correlation", PL.icc, "0.01", 0, 1, "typical 0.01–0.20") + "</div></details>" +
    (from ? '<p class="count">From your current analysis: ' + esc(from.label) + '. <button type="button" class="linkbtn" data-plfrom="1">Plan a follow-up with it</button> Observed effects from small studies are usually inflated; consider a smaller planning value.</p>' : "");
  var res = o.err ? '<p class="warn" role="status">' + esc(o.err) + "</p>" :
    figs([[PL.solve === "n" ? (plTwoGroup() ? "Needed in group 1" : "Needed in total") : PL.solve === "power" ? "Power" : "Smallest detectable " + d[2].replace(/<\/?sub>/g, ""), PL.solve === "n" ? String(o.n) : PL.solve === "power" ? Math.round(o.power * 1000) / 10 + "%" : String(o.es)],
      ["Total", String(plTotal(o.n))], ["Recruit (after dropout & clustering)", String(inf.n)], [PL.solve === "power" ? "Effect" : "Achieved power", PL.solve === "power" ? String(o.es) : Math.round(o.power * 1000) / 10 + "%"]], true);
  var curve = isFinite(o.n) ? plCurve(o.es, o.n) : [], target = PL.solve === "power" ? null : PL.power;
  var chart = curve.length > 2 ? xyLines([{name: "Power for " + d[2].replace(/<\/?sub>/g, "") + " magnitude = " + String(o.es), pts: curve}].concat(target ? [{name: "Target " + Math.round(target * 100) + "%", pts: [[curve[0][0], target], [curve[curve.length - 1][0], target]], dash: true}] : []), plTwoGroup() ? "Participants in group 1" : "Total participants", "Power", [0, 1]) : "";
  var sens = o.err ? [] : d[3].map(function (e) { var n = S3.solveN(function (n2) { return plPower(n2, e); }, PL.power, plMinN()); return [["Small", "Medium", "Large"][d[3].indexOf(e)] + " (" + e + ")", isFinite(n) ? String(n) : "—", isFinite(n) ? String(plTotal(n)) : "—"]; });
  var sentence = isFinite(o.n) && isFinite(o.es) ? plSentence(o, d) : "";
  return '<h1 class="vt">Plan a study</h1><p class="lede">Work out how many participants you need before collecting data, or what a fixed sample can detect. Calculations follow the selected power model; correlation and proportion methods use approximations.</p>' +
    '<div class="poster"><section aria-labelledby="pl1"><h3 class="step" id="pl1"><i>1</i> Design</h3>' + inputs + "</section>" +
    '<section aria-labelledby="pl2"><h3 class="step" id="pl2"><i>2</i> Result</h3>' + res + (chart ? '<div class="chartwrap">' + chart + '</div><p class="figcap"><b>Fig. 1</b> Power as the sample grows</p>' : "") +
    (o.err ? '' : '<h3 class="sub-h">Sample needed for ' + Math.round(PL.power * 100) + "% power by effect size</h3>" + table(["Effect (" + d[2] + ")", plTwoGroup() ? "Group 1" : "Total", "Total"], sens)) + "</section>" +
    '<section aria-labelledby="pl3"><h3 class="step" id="pl3"><i>3</i> Justification</h3>' + (sentence ? '<div class="reading"><p id="pl-sentence">' + esc(sentence) + '</p></div><div class="slot"><button type="button" class="btn" data-plcopy="1">Copy</button><button type="button" class="btn" data-pladd="1">Add to write-up</button></div>' : "") +
    (PL.msg ? '<p class="how" role="status">' + esc(PL.msg) + "</p>" : "") +
    '<div class="caveats"><h3>Keep in mind</h3><ul class="plain"><li>The planned effect size drives everything. Base it on the smallest effect that would matter in practice, or on several earlier studies, not on one small pilot.</li><li>Power analysis assumes the planned test and its conditions (normality, independence). Clustered designs need the design-effect adjustment above or a mixed-model simulation.</li>' + (PL.design === "corr" ? "<li>Correlation power uses the pwr package's Fisher-z method; exact methods can differ by a participant or two.</li>" : "") + "</ul></div></section></div>";
}
GROUPS.plan = ["plan"]; VIEWS.plan = planView;
view.addEventListener("change", function (e) {
  if (st.tab !== "plan") return;
  var t = e.target, d = t.dataset || {};
  if (d.pl) { if (/^h_/.test(t.id)) { PL.helper[t.id.slice(2)] = t.value; cacheProject(); return; } var v = t.value === "" ? null : Number(t.value); PL[t.id] = v != null && isFinite(v) ? v : null; PL.msg = ""; render(); refocus("#" + t.id); return; }
  if (d.asel && /^pl_/.test(d.asel)) { var key = d.asel.slice(3); PL[key] = t.value; if (key === "design") { PL.es = plDesign()[3][1]; PL.helper = {}; } PL.msg = ""; render(); refocus("#" + t.id); e.stopImmediatePropagation(); }
}, true);
view.addEventListener("click", function (e) {
  if (st.tab !== "plan") return;
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset, h = PL.helper;
  if (d.plh) {
    var keys = d.plh === "d" ? ["m1", "m2", "sd"] : d.plh === "h" ? ["p1", "p2"] : d.plh === "f" ? ["eta"] : ["r2"], valid = keys.every(function (key) { return h[key] !== "" && h[key] != null && isFinite(Number(h[key])); });
    if (d.plh === "d") valid = valid && +h.sd > 0;
    if (d.plh === "h") valid = valid && +h.p1 >= 0 && +h.p1 <= 1 && +h.p2 >= 0 && +h.p2 <= 1;
    if (d.plh === "f" || d.plh === "f2") { var share = +(d.plh === "f" ? h.eta : h.r2); valid = valid && share >= 0 && share < 1; }
    if (!valid) { PL.msg = "Fill every helper box with valid numbers; SD must be positive, proportions 0–1 and variance shares below 1."; render(); return; }
    var es = NaN;
    if (d.plh === "d") es = Math.abs((+h.m1 - +h.m2) / +h.sd); else if (d.plh === "h") es = Math.abs(2 * Math.asin(Math.sqrt(+h.p1)) - 2 * Math.asin(Math.sqrt(+h.p2)));
    else if (d.plh === "f") es = Math.sqrt(+h.eta / (1 - +h.eta)); else if (d.plh === "f2") es = +h.r2 / (1 - +h.r2);
    if (isFinite(es) && es > 0) { PL.es = es; PL.msg = "Effect size set to " + fz(PL.es) + "."; } else PL.msg = "Fill in every box with valid numbers first.";
    render(); return;
  }
  if (d.plfrom) { var f = plFromAnalysis(); if (f) { PL.design = f.design; PL.es = f.es; if (f.df) PL.df = f.df; if (f.preds) PL.preds = f.preds; PL.solve = "n"; PL.msg = "Planning a follow-up with " + f.label + "."; } render(); return; }
  if (d.plcopy) { var txt = (document.getElementById("pl-sentence") || {}).textContent || ""; try { navigator.clipboard.writeText(txt).then(function () { PL.msg = "Copied."; render(); }, function () { PL.msg = "Copy was blocked; select the sentence and copy it."; render(); }); } catch (err) { PL.msg = "Copy was blocked; select the sentence and copy it."; render(); } return; }
  if (d.pladd) { if (plSolve().err) { PL.msg = "Correct the plan before adding it to the write-up."; render(); return; } var t2 = (document.getElementById("pl-sentence") || {}).textContent || ""; wpLoad(); WP.items = WP.items.filter(function (it) { return it.kind !== "plan"; }); WP.items.unshift({id: Date.now().toString(36), at: new Date().toISOString(), dataset: "", kind: "plan", test: "Sample-size calculation (" + plDesign()[4] + ")", title: "Sample size", apa: "", reading: [t2], caveats: [], evidence: {tested: false}, p: null, n: null, fig: ""}); WP.review = null; try { wpSave(); } catch (err) {} PL.msg = "Added to the Methods section of the write-up."; render(); }
});

// A plan can retain a finite out-of-domain draft, but it cannot produce a result.
function cleanPlan(input) {
  var out = plDefaults(); if (input == null) return out;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid planning settings.");
  ["design", "solve", "alt"].forEach(function (key) { if (input[key] != null) out[key] = input[key]; });
  if (!PL_DESIGNS.some(function (d) { return d[0] === out.design; }) || ["n", "power", "es"].indexOf(out.solve) < 0 || ["two-sided", "larger", "smaller"].indexOf(out.alt) < 0) throw new Error("Invalid planning choices.");
  ["es", "alpha", "power", "ratio", "k", "df", "preds", "n", "drop", "m", "icc"].forEach(function (key) { if (Object.prototype.hasOwnProperty.call(input, key)) { var v = input[key]; if (v !== null && (typeof v !== "number" || !isFinite(v))) throw new Error("Invalid planning number: " + key); out[key] = v; } });
  if (input.open != null) { if (typeof input.open !== "object" || Array.isArray(input.open)) throw new Error("Invalid planning disclosure state."); ["helper", "drop"].forEach(function (key) { if (input.open[key] != null) out.open[key] = !!input.open[key]; }); }
  if (input.helper != null) { if (typeof input.helper !== "object" || Array.isArray(input.helper)) throw new Error("Invalid planning helper."); ["m1", "m2", "sd", "p1", "p2", "eta", "r2"].forEach(function (key) { var v = input.helper[key]; if (v != null) { if (["number", "string"].indexOf(typeof v) < 0 || String(v).length > 100) throw new Error("Invalid planning helper value."); out.helper[key] = v; } }); }
  return out;
}
var _planSnapshot = projectSnapshot, _planValidate = validateProject, _planRestore = restoreProject;
projectSnapshot = function () { var p = _planSnapshot(); p.plan = cleanPlan(PL); return p; };
validateProject = function (p) { var v = _planValidate(p); v.plan = cleanPlan(p.plan); return v; };
restoreProject = function (p) { var plan = cleanPlan(p.plan); _planRestore(p); PL = plan; };
