// ---------- Making results intelligible: plain headline, everyday effect sizes, how sure, reading level, glossary ----------
// Every sentence is built from computed numbers by fixed rules; nothing here guesses or invents.
var XL = {level: "new", examples: false, term: null};
try { XL.level = localStorage.getItem("ekm-level") || "new"; } catch (e) {}
function nameOf(n) { var c = colMeta(cur(), n); return c && c.label ? c.label : n; }
function unitOf(n) { var c = colMeta(cur(), n); return c && c.unit ? " " + c.unit : ""; }
function amt(v, n) { return f3(Math.abs(v)) + un(n); }
function nm(n) { return esc(nameOf(n)); }
function un(n) { return esc(unitOf(n)); }
function pct(x) { return Math.round(x * 100) + "%"; }
function phi(z) { return S2.pnorm(z); }
function entity(ds) { var id = ds.cols.filter(function (c) { return tagOf(c).role === "id"; })[0]; if (!id) return "rows"; var w = id.name.replace(/[_\s-]*(id|code|number|no|#)$/i, "").trim(); return w && !/^(id|row|record)$/i.test(w) ? w.toLowerCase().replace(/([^s])$/, "$1s") : "rows"; }
function sizeWord(kind, v) { var a = Math.abs(v); return kind === "d" ? (a < 0.2 ? "negligible" : a < 0.5 ? "small" : a < 0.8 ? "moderate" : "large") : kind === "r" ? (a < 0.1 ? "almost no" : a < 0.3 ? "a weak" : a < 0.5 ? "a moderate" : "a strong") : kind === "v" ? (a < 0.1 ? "almost no" : a < 0.3 ? "a weak" : a < 0.5 ? "a moderate" : "a strong") : kind === "eta" ? (a < 0.01 ? "negligible" : a < 0.06 ? "small" : a < 0.14 ? "moderate" : "large") : ""; }

// ---- 1. Headline and everyday translation for each analysis ----
function takeaway(ds, R) {
  var s = R.summary || {}, sel = A.sel, ent = esc(entity(ds)), h = "", ev = [];
  switch (R.kind) {
    case "describe":
      if (s.mean != null) { var qv = S.nums(getCol(ds, filterRows(ds), A.sel.y)).sort(function (a, b) { return a - b; }), q1 = S.quantile(qv, 0.25), q3 = S.quantile(qv, 0.75); h = "A typical value of " + nm(s.column) + " is about " + amt(s.median, s.column) + "; half of " + ent + " fall between " + f3(q1) + " and " + f3(q3) + un(s.column) + "."; if (Math.abs(s.skew) > 1) ev.push("The values lean " + (s.skew > 0 ? "high: a few large values pull the average (" + f3(s.mean) + ") above the typical value" : "low: a few small values pull the average (" + f3(s.mean) + ") below the typical value") + "."); if (s.missing) ev.push(s.missing + " of " + (s.n + s.missing) + " " + ent + " have no value here."); }
      else if (s.top && s.top[0]) { h = "The most common " + nm(s.column) + " is “" + esc(s.top[0][0]) + "”: " + s.top[0][1] + " of " + s.n + " " + ent + " (" + pct(s.top[0][1] / s.n) + ")."; ev.push("There are " + s.distinct + " different values in all."); }
      break;
    case "compare":
      if (Array.isArray(s.groups)) { var hi = s.diff >= 0 ? 0 : 1, lo = 1 - hi, ps = phi(Math.abs(s.cohen_d) / Math.SQRT2);
        h = "“" + esc(s.groups[hi]) + "” tends to have higher " + nm(s.measure) + " than “" + esc(s.groups[lo]) + "”: about " + amt(s.diff, s.measure) + " more on average.";
        ev.push("Pick one from each group at random: the “" + esc(s.groups[hi]) + "” one has the higher value about " + pct(ps) + " of the time (50% would mean no difference).");
        ev.push("The real gap is plausibly anywhere from " + f3(Math.min(Math.abs(s.ci95[0]), Math.abs(s.ci95[1]))) + " to " + f3(Math.max(Math.abs(s.ci95[0]), Math.abs(s.ci95[1]))) + un(s.measure) + (s.ci95[0] < 0 && s.ci95[1] > 0 ? ", which includes no difference at all" : "") + ".");
      } else if (s.highest) { h = nm(s.measure) + " differs across the " + s.groups + " groups of " + nm(sel.g) + ": highest in “" + esc(s.highest) + "”, lowest in “" + esc(s.lowest) + "”."; ev.push("Group membership accounts for about " + pct(s.eta2) + " of the differences between " + ent + " (" + sizeWord("eta", s.eta2) + ")."); }
      break;
    case "relate":
      h = (Math.abs(s.r) < 0.1 ? nm(s.x) + " and " + nm(s.y) + " barely move together." : "When " + nm(s.x) + " is higher, " + nm(s.y) + " tends to be " + (s.r > 0 ? "higher" : "lower") + ": about " + amt(s.slope, s.y) + " " + (s.r > 0 ? "more" : "less") + " for each extra" + (un(s.x) || " unit") + " of " + nm(s.x) + ".");
      ev.push("This is " + sizeWord("r", s.r) + " link: " + nm(s.x) + " accounts for about " + pct(s.r * s.r) + " of the ups and downs in " + nm(s.y) + "; the other " + pct(1 - s.r * s.r) + " comes from other things.");
      ev.push("It describes a tendency across " + ent + ", not a rule for each one, and it does not show that one causes the other.");
      break;
    case "cross": h = nm(s.rows) + " and " + nm(s.columns) + " are " + (s.p < 0.05 ? "linked" : "not clearly linked") + ": " + sizeWord("v", s.cramers_v) + " association (Cramér's V = " + fz(s.cramers_v) + ")."; ev.push("Compare the percentages across rows of the table: if " + nm(s.rows) + " did not matter, every row would show the same mix of " + nm(s.columns) + "."); break;
    case "trend": var ser = (s.series || [])[0]; if (ser && ser.slope_per_year != null) { h = nm(s.measure) + " has been " + (Math.abs(ser.slope_per_year) < 1e-9 ? "flat" : ser.slope_per_year > 0 ? "rising" : "falling") + ": about " + amt(ser.slope_per_year, s.measure) + " per year" + (s.series.length > 1 ? " for “" + esc(ser.name) + "”" : "") + "."; ev.push("Over ten years at that pace, that is about " + amt(10 * ser.slope_per_year, s.measure) + "."); } break;
    case "regress": var cs = (s.coefficients || []).filter(function (c) { return c.name !== "Intercept"; }).sort(function (a, b) { return a.p - b.p; }); if (cs[0]) { h = "Together these columns explain about " + pct(s.r2) + " of the differences in " + nm(s.outcome) + "; the clearest single factor is " + nm(cs[0].name) + "."; cs.slice(0, 3).forEach(function (c) { ev.push("With the others held fixed, one more" + (un(c.name) || " unit") + " of " + nm(c.name) + " goes with " + amt(c.b, s.outcome) + " " + (c.b >= 0 ? "more" : "less") + " " + nm(s.outcome) + "."); }); } break;
    case "paired": h = "From “" + esc(s.before) + "” to “" + esc(s.after) + "”, " + ent + " changed by about " + amt(s.mean_change, s.after) + " on average (" + (s.mean_change >= 0 ? "up" : "down") + ")."; ev.push("A typical " + ent.replace(/s$/, "") + " moved " + sizeWord("d", s.dz) + " amount relative to how much the changes vary (d<sub>z</sub> = " + fz(s.dz) + ")."); break;
    case "logistic": var or = (s.odds_ratios || []).slice().sort(function (a, b) { return a.p - b.p; })[0]; if (or) { h = "The chance that " + esc(s.outcome) + " " + (or.or >= 1 ? "rises" : "falls") + " with " + nm(or.name) + ": each extra unit multiplies the odds by " + f3(or.or) + "."; ev.push("Put simply: odds of " + f3(or.or) + "× mean that where 10 in 100 had the outcome, about " + Math.round(100 * (or.or * 0.1 / (1 - 0.1)) / (1 + or.or * 0.1 / (1 - 0.1))) + " in 100 would after a one-unit increase (for a group starting at 10%)."); } break;
    case "pivot": if (s.highest) h = "The highest value is “" + esc(s.highest[1]) + "” (" + f3(s.highest[0]) + "), the lowest “" + esc((s.lowest || [])[1]) + "” (" + f3((s.lowest || [])[0]) + ")."; break;
    case "matrix": var st = (s.strongest || [])[0]; if (st) h = "The strongest link is " + esc(st.pair) + " (r = " + fz(st.r) + "); check it with its own analysis before relying on it."; break;
    case "rmanova": h = "The same " + ent + " scored differently across conditions" + (s.p < 0.05 ? "" : ", but not clearly so") + ": condition explains about " + pct(s.partial_eta2) + " of the change within each " + ent.replace(/s$/, "") + "."; break;
    case "mixed": var mc = (s.coefficients || [])[0]; h = (s.icc != null ? pct(s.icc) + " of the differences in " + nm(A.sel.y) + " lie between groups of " + nm(A.sel.mg) + ", so " + ent + " in the same group are alike." : "Effects are estimated while allowing each group of " + nm(A.sel.mg) + " to differ.") + (mc ? " One more" + (un(mc.name) || " unit") + " of " + nm(mc.name) + " goes with " + amt(mc.b, A.sel.y) + " " + (mc.b >= 0 ? "more" : "less") + " " + nm(A.sel.y) + "." : ""); break;
    case "reliability": h = "These " + s.items + " items " + (s.alpha >= 0.8 ? "hang together well" : s.alpha >= 0.7 ? "hang together acceptably" : "do not hang together well") + " as one scale (α = " + fz(s.alpha) + ")."; ev.push("Roughly " + pct(Math.max(0, s.alpha)) + " of the differences in the total score reflect consistent differences between " + ent + "; the rest is item-to-item noise."); break;
    case "factor": h = "The " + s.items + " items group into " + s.factors + " underlying dimension" + (s.factors > 1 ? "s" : "") + ", which together capture " + pct(s.variance_explained.reduce(function (a, b) { return a + b; }, 0)) + " of their variation."; break;
    case "agree": h = s.icc2 != null ? "Raters agree " + (s.icc2 >= 0.9 ? "excellently" : s.icc2 >= 0.75 ? "well" : s.icc2 >= 0.5 ? "moderately" : "poorly") + ": " + pct(s.icc2) + " of the variation in ratings reflects real differences between what was rated." : "Raters agree on " + pct(s.observed_agreement) + " of cases, against " + pct(s.chance_agreement) + " expected by chance (κ = " + fz(s.kappa) + ")."; break;
    case "missing": h = s.missing_cells ? s.complete_rows + " of " + s.n + " " + ent + " are complete; the gaps fall into " + s.patterns + " patterns." : "Nothing is missing in the selected columns."; break;
    case "model": h = s.task === "regression" ? "On " + ent + " it had not seen, the model explains about " + pct(Math.max(0, s.cv_mean)) + " of the differences in " + nm(A.sel.mt) + "." : "On " + ent + " it had not seen, the model tells the two outcomes apart " + pct(s.cv_mean) + " of the time (AUC; 50% is guessing)."; break;
  }
  return {headline: h, everyday: ev};
}

// ---- 2. How sure can I be? ----
function howSure(ds, R) {
  var s = R.summary || {}, n = s.n || 0, reasons = [], score = 0, kind = R.kind;
  if (["describe", "pivot", "missing"].indexOf(kind) >= 0) return {level: "Descriptive", cls: "q-reported", reasons: ["This describes these " + (n || "") + " rows; it makes no claim beyond them."]};
  var p = s.p != null ? s.p : s.p_model, ci = s.ci95;
  if (n >= 200) { score += 2; reasons.push(n + " rows is a solid sample."); } else if (n >= 50) { score += 1; reasons.push(n + " rows is a moderate sample."); } else if (n) { score -= 1; reasons.push("Only " + n + " rows: one or two changed values could change the picture."); }
  if (typeof p === "number" && isFinite(p)) { if (p < 0.001) { score += 2; reasons.push("A pattern this strong would be very unusual by chance alone."); } else if (p < 0.05) { score += 1; reasons.push("Unlikely to be chance alone, but not overwhelmingly so (p " + (p < 0.01 ? "< .01" : "= " + fz(p, 3)) + ")."); } else { score -= 2; reasons.push("Could easily be chance (p = " + fz(p, 3) + ")."); } }
  if (Array.isArray(ci) && ci.length === 2 && isFinite(ci[0]) && isFinite(ci[1]) && kind !== "reliability" && kind !== "agree") { if (ci[0] < 0 && ci[1] > 0) { score -= 1; reasons.push("The plausible range includes zero (no effect)."); } }
  if (kind === "reliability" || kind === "agree") { var w = ci ? ci[1] - ci[0] : 0.5; if (w < 0.1) { score += 2; reasons.push("The estimate is precise (interval width " + fz(w) + ")."); } else if (w < 0.25) { score += 1; reasons.push("The estimate is reasonably precise."); } else { score -= 1; reasons.push("The estimate is imprecise (interval " + fz(ci ? ci[0] : 0) + " to " + fz(ci ? ci[1] : 1) + ")."); } }
  if (kind === "model") { var rel = s.cv_sd != null ? s.cv_sd / Math.max(0.05, Math.abs(s.cv_mean)) : 1; if (rel < 0.1) { score += 1; reasons.push("Performance is steady across validation folds."); } else if (rel > 0.3) { score -= 1; reasons.push("Performance varies a lot between validation folds."); } if (s.task === "classification" && s.cv_mean < 0.6) score -= 1; }
  try { var diag = localDiagnostics(ds, R); if (diag.failed) { score -= 1; reasons.push("The data break a normality assumption; check that the rank-based result agrees."); } } catch (e) {}
  var cav = (R.caveats || []).join(" ");
  if (/few groups|Only \d+ groups|Heywood|singular|unstable/i.test(cav)) { score -= 1; reasons.push("A warning below limits how far to trust this."); }
  var level = score >= 3 ? "Strong" : score >= 1 ? "Moderate" : "Weak";
  return {level: level, cls: level === "Strong" ? "q-verified" : level === "Moderate" ? "q-estimated" : "q-excluded", reasons: reasons.slice(0, 4)};
}

// ---- 3. Example rows behind the result ----
function exampleRows(ds, R) {
  var s = A.sel, rows = filterRows(ds), cols = [], pick = [];
  var idc = ds.cols.filter(function (c) { return tagOf(c).role === "id"; })[0];
  var add = function (n) { if (n && idxOf(ds, n) >= 0 && cols.indexOf(n) < 0) cols.push(n); };
  if (idc) add(idc.name);
  var key = {describe: s.y, compare: s.y, relate: s.y, regress: s.y, paired: s.y, mixed: s.y, trend: s.y, logistic: s.o, rmanova: null}[R.kind];
  if (R.kind === "relate") add(s.x); if (R.kind === "compare" || R.kind === "trend") add(s.g); if (R.kind === "trend") add(s.t); if (R.kind === "paired") add(s.x); if (R.kind === "mixed") add(s.mg); add(key);
  (R.kind === "regress" ? (s.preds || []) : R.kind === "mixed" ? (s.mx || []) : []).slice(0, 3).forEach(add);
  if (!key || idxOf(ds, key) < 0) return "";
  var kj = idxOf(ds, key), withVal = rows.filter(function (r) { return r[kj] != null; });
  if (isNum(ds.cols[kj])) { var sorted = withVal.slice().sort(function (a, b) { return a[kj] - b[kj]; }); pick = sorted.slice(-3).reverse().concat(sorted.length > 6 ? [sorted[Math.floor(sorted.length / 2)]] : [], sorted.slice(0, 3)); }
  else pick = withVal.slice(0, 6);
  var idx = cols.map(function (n) { return idxOf(ds, n); });
  return '<div class="tablewrap"><table class="nosort"><thead><tr>' + cols.map(function (n) { return "<th>" + esc(nameOf(n)) + "</th>"; }).join("") + "</tr></thead><tbody>" + pick.map(function (r) { return "<tr>" + idx.map(function (j) { var v = r[j]; return "<td" + (typeof v === "number" ? ' class="num"' : "") + ">" + (v == null ? "—" : esc(typeof v === "number" ? f3(v) : String(v))) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>" + (isNum(ds.cols[kj]) ? '<p class="count">The three highest, a middle one and the three lowest by ' + esc(nameOf(key)) + ".</p>" : "");
}

// ---- 4. The takeaway panel, reading level and glossary ----
function takeawayPanel(ds, R) {
  if (!R || R.valid === false || !R.reading || !R.reading.length) return "";
  var t = takeaway(ds, R), sure = howSure(ds, R); if (!t.headline) return "";
  return '<section class="takeaway" aria-labelledby="tk-h"><div class="tk-top"><h2 id="tk-h" class="tk-head">' + t.headline + '</h2><span class="chip ' + sure.cls + ' sure">' + (sure.level === "Descriptive" ? "Describes these rows" : "How sure: " + sure.level) + "</span></div>" +
    (t.everyday.length ? '<ul class="plain tk-every">' + t.everyday.map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul>" : "") +
    '<details class="tk-why"><summary>Why “' + sure.level.toLowerCase() + "”?</summary><ul class=\"plain\">" + sure.reasons.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>" +
    '<div class="slot"><button type="button" class="linkbtn" data-xlex="1" aria-expanded="' + XL.examples + '">' + (XL.examples ? "Hide example rows" : "Show example rows") + '</button><span class="tk-level" role="group" aria-label="Reading level"><button type="button" class="pill' + (XL.level === "new" ? " on" : "") + '" aria-pressed="' + (XL.level === "new") + '" data-xlvl="new">New to statistics</button><button type="button" class="pill' + (XL.level === "researcher" ? " on" : "") + '" aria-pressed="' + (XL.level === "researcher") + '" data-xlvl="researcher">Researcher</button></span></div>' +
    (XL.examples ? exampleRows(ds, R) : "") + "</section>";
}
var GLOSSARY = {
  "p-value": function (s) { return "How often a pattern at least this strong would appear if nothing were going on" + (s.p != null ? "; here p = " + fz(s.p, 3) : "") + ". It is not the chance that the finding is true."; },
  "confidence interval": function (s) { return "The range of values that fit the data well" + (Array.isArray(s.ci95) ? "; here " + f3(s.ci95[0]) + " to " + f3(s.ci95[1]) : "") + ". Repeated studies would capture the true value in 95% of such ranges."; },
  "effect size": function () { return "How big a difference or link is, in a form that does not depend on sample size. A tiny effect can be ‘significant’ in a huge sample."; },
  "Cohen's d": function (s) { return "The difference between groups in units of their spread" + (s.cohen_d != null ? "; here d = " + fz(s.cohen_d) : "") + ". About 0.2 is small, 0.5 moderate, 0.8 large."; },
  "correlation": function (s) { return "How closely two numbers move together, from −1 (opposite) through 0 (unrelated) to +1 (together)" + (s.r != null ? "; here r = " + fz(s.r) : "") + "."; },
  "standard deviation": function (s) { return "The typical distance of values from their average" + (s.sd != null ? "; here " + f3(s.sd) : "") + "."; },
  "median": function (s) { return "The middle value when all values are sorted" + (s.median != null ? "; here " + f3(s.median) : "") + ". Unlike the average, extreme values barely move it."; },
  "sphericity": function () { return "An assumption of repeated-measures ANOVA: the changes between every pair of conditions vary by similar amounts. When it fails, EKM applies a correction."; },
  "ICC": function (s) { return "Intraclass correlation: the share of variation that lies between groups or targets rather than within them" + (s.icc != null ? "; here " + fz(s.icc) : s.icc2 != null ? "; here " + fz(s.icc2) : "") + "."; },
  "AUC": function (s) { return "Area under the ROC curve: the chance the model ranks a random positive case above a random negative one" + (s.cv_mean != null && s.metric === "AUC" ? "; here " + fz(s.cv_mean) : "") + ". 0.5 is guessing, 1 is perfect."; },
  "kappa": function (s) { return "Agreement between raters beyond what chance would produce" + (s.kappa != null ? "; here κ = " + fz(s.kappa) : "") + ". 0 means chance-level, 1 perfect."; },
  "Cronbach's α": function (s) { return "How consistently a set of items measures one thing" + (s.alpha != null ? "; here α = " + fz(s.alpha) : "") + ". Around .70 is usually acceptable; above .95 can mean redundant items."; },
  "cross-validation": function () { return "Testing a model on rows it did not learn from, several times over, so the score reflects new data rather than memorisation."; },
  "odds ratio": function () { return "How the odds of an outcome multiply when a predictor rises by one unit. 1 means no change; 2 means the odds double."; },
  "R²": function (s) { var v = s.r2 != null ? s.r2 : s.cv_mean; return "The share of the differences in the outcome that the model accounts for" + (v != null ? "; here " + pct(Math.max(0, v)) : "") + "."; },
  "multiple imputation": function () { return "Filling each gap several times with plausible values, analysing every completed copy and combining the results, so the uncertainty from missing data is kept."; }
};
var TERM_RE = /\b(p-value|p\s?[=<]|confidence interval|95% CI|effect size|Cohen's d|correlation|standard deviation|SD\b|median|sphericity|ICC|AUC|kappa|κ|Cronbach's α|cross-validation|cross-validated|odds ratio|R²|multiple imputation)/i;
function termKey(m) { var k = m.toLowerCase(); if (/^p\s?[=<]/.test(k) || k === "p-value") return "p-value"; if (k === "95% ci") return "confidence interval"; if (k === "sd") return "standard deviation"; if (k === "κ") return "kappa"; if (k === "cross-validated") return "cross-validation"; for (var g in GLOSSARY) if (g.toLowerCase() === k) return g; return null; }
function linkTerms(root) {   // wrap the first mention of each term in reading and caveat text
  var seen = Object.create(null);
  [].forEach.call(root.querySelectorAll(".reading li, .caveats li, .tk-every li"), function (li) {
    var walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT), nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var m = TERM_RE.exec(node.nodeValue); if (!m) return; var key = termKey(m[1]); if (!key || seen[key]) return; seen[key] = 1;
      var after = node.splitText(m.index), rest = after.splitText(m[1].length), b = document.createElement("button");
      b.type = "button"; b.className = "term"; b.dataset.term = key; b.setAttribute("aria-expanded", XL.term === key ? "true" : "false"); b.textContent = after.nodeValue; after.parentNode.replaceChild(b, after);
      if (XL.term === key) { var d = document.createElement("span"); d.className = "termdef"; d.setAttribute("role", "note"); d.textContent = GLOSSARY[key](LAST_R && LAST_R.summary || {}); rest.parentNode.insertBefore(d, rest); }
    });
  });
}
var _analyzeViewX = VIEWS.analyze;
VIEWS.analyze = function () {
  var h = _analyzeViewX(), ds = cur(); if (!ds || !ds.rows || !LAST_R) return h;
  var R = LAST_R;   // never mutate R: other modules key their caches on its contents
  h = h.replace('<div class="poster">', takeawayPanel(ds, R) + '<div class="poster">');
  if (XL.level === "new") {
    h = h.replace(/(<section aria-labelledby="pm">[\s\S]*?)<div class="math">[\s\S]*?<\/math><\/div>/, '$1<details class="mathfold"><summary>Show the formula</summary>' + formula(R) + "</details>");
    var ex = R.extra || ""; if (ex && !/<(button|select|input|textarea)\b/.test(ex) && h.indexOf(ex) >= 0) h = h.replace(ex, '<details class="extrafold"><summary>Show the detailed tables and checks</summary>' + ex + "</details>");
  }
  return h;
};
var _renderX = render;
render = function () { _renderX(); if (st.tab === "analyze") try { linkTerms(view); } catch (e) {} };

// ---- 5. What's in this data: a short overview with suggested questions ----
function overview(ds) {
  var ent = entity(ds), n = ds.rows.length, by = function (r) { return ds.cols.filter(function (c) { return tagOf(c).role === r; }); };
  var nums = ds.cols.filter(function (c) { return isNum(c) && ["id", "rowtag", "ignore"].indexOf(tagOf(c).role) < 0; }), cats = ds.cols.filter(function (c) { return c.type === "category" && ["id", "rowtag"].indexOf(tagOf(c).role) < 0; });
  var parts = [n + " " + ent + ", " + ds.cols.length + " columns (" + nums.length + " numbers, " + cats.length + " categories)."];
  var g = by("group")[0]; if (g) { var u = Object.create(null); colVals(ds, idxOf(ds, g.name)).forEach(function (v) { if (v != null) u[v] = 1; }); parts.push(ent.charAt(0).toUpperCase() + ent.slice(1) + " come from " + Object.keys(u).length + " groups of " + nameOf(g.name) + ".") ; }
  var tm = by("time")[0]; if (tm) { var tv = colVals(ds, idxOf(ds, tm.name)).filter(function (v) { return v != null; }).map(String).sort(); if (tv.length) parts.push(nameOf(tm.name) + " runs from " + tv[0] + " to " + tv[tv.length - 1] + "."); }
  var o = by("outcome")[0]; if (o && isNum(o)) { var d = S.describe(colVals(ds, idxOf(ds, o.name))); parts.push("The outcome, " + nameOf(o.name) + ", ranges from " + f3(d.min) + " to " + f3(d.max) + unitOf(o.name) + " (typically " + f3(d.median) + ")."); }
  var miss = ds.cols.map(function (c, j) { return [c.name, colVals(ds, j).filter(function (v) { return v == null; }).length]; }).filter(function (m) { return m[1]; }).sort(function (a, b) { return b[1] - a[1]; });
  parts.push(miss.length ? miss.length + " column" + (miss.length > 1 ? "s have" : " has") + " gaps; most in " + nameOf(miss[0][0]) + " (" + miss[0][1] + " missing)." : "No values are missing.");
  var items = by("item"), raters = by("rater"); if (items.length >= 3) parts.push(items.length + " columns look like questionnaire items from one scale."); if (raters.length >= 2) parts.push(raters.length + " columns look like ratings of the same thing by different raters.");
  var sens = ds.cols.filter(sensitive); if (sens.length) parts.push(sens.length + " column" + (sens.length > 1 ? "s are" : " is") + " tagged personal or sensitive and stay out of exports.");
  // Suggested questions
  var q = [], y = o && isNum(o) ? o : nums[0];
  if (y && g) q.push(["Does " + nameOf(y.name) + " differ between groups of " + nameOf(g.name) + "?", nums.length > 1 ? "mixed" : "compare", {y: y.name, mg: g.name, g: g.name, mx: nums.filter(function (c) { return c !== y; }).slice(0, 2).map(function (c) { return c.name; })}]);
  else if (y && cats[0]) q.push(["Does " + nameOf(y.name) + " differ by " + nameOf(cats[0].name) + "?", "compare", {y: y.name, g: cats[0].name}]);
  if (y && nums.length > 1) q.push(["What goes along with higher " + nameOf(y.name) + "?", "regress", {y: y.name, preds: nums.filter(function (c) { return c !== y; }).slice(0, 4).map(function (c) { return c.name; })}]);
  if (items.length >= 3) q.push(["Do the questionnaire items form one reliable scale?", "reliability", {items: items.map(function (c) { return c.name; })}]);
  if (raters.length >= 2) q.push(["Do the raters agree?", "agree", {raters: raters.map(function (c) { return c.name; })}]);
  if (tm && y) q.push(["How has " + nameOf(y.name) + " changed over " + nameOf(tm.name) + "?", "trend", {y: y.name, t: tm.name}]);
  q.push(["Which patterns stand out across all columns?", null, null]);
  XL.questions = q.slice(0, 4);
  return '<section class="card overview" aria-labelledby="ov-h"><h2 id="ov-h">What’s in this data</h2><p>' + parts.map(esc).join(" ") + '</p><div class="slot">' + XL.questions.map(function (x, i) { return '<button type="button" class="btn" data-xlq="' + i + '">' + esc(x[0]) + "</button>"; }).join("") + "</div></section>";
}
var _dataViewX = VIEWS.data;
VIEWS.data = function () { var h = _dataViewX(), ds = cur(); if (!ds || !ds.rows) return h; return h.replace(/(<div class="agrid"><div class="amain">)/, "$1" + overview(ds)); };

view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset;
  if (d.xlvl) { XL.level = d.xlvl; try { localStorage.setItem("ekm-level", XL.level); } catch (err) {} render(); refocus('[data-xlvl="' + d.xlvl + '"]'); return; }
  if (d.xlex) { XL.examples = !XL.examples; render(); refocus("[data-xlex]"); return; }
  if (d.term) { XL.term = XL.term === d.term ? null : d.term; render(); refocus('[data-term="' + d.term + '"]'); return; }
  if (d.xlq != null) { var q = (XL.questions || [])[+d.xlq]; if (!q) return; if (!q[1]) { nav("discover"); return; } A.kind = q[1]; Object.keys(q[2]).forEach(function (k) { A.sel[k] = q[2][k]; }); nav("analyze"); return; }
});
