// ---------- Offline assistant: explicit rules over computed evidence; no model or network ----------
var _runLocal = runAnalysis;
runAnalysis = function (ds) { var R = _runLocal(ds); LAST_R = R; return R; };
function localNumber(v) { return typeof v === "number" && isFinite(v); }
function localCI(v) { return Array.isArray(v) && v.length === 2 && v.every(localNumber) && v[0] <= v[1]; }
function localText(h) {
  var entities = {amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'"};
  return String(h || "").replace(/<\/?[A-Za-z][^>]*>/g, "").replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, function (_, key) { return entities[key]; });
}
function localList(items) { return '<ul class="plain">' + items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join("") + '</ul>'; }
function localExamples(ds) {
  var nums = ds.cols.filter(function (c) { return c.type === "number"; }), cats = ds.cols.filter(function (c) { return c.type === "category"; });
  var out = ds.cols.length ? ["Summarize " + ds.cols[0].name] : [];
  if (nums[0] && cats[0]) out.push("Compare " + nums[0].name + " by " + cats[0].name);
  if (nums.length > 1) out.push("Relate " + nums[0].name + " and " + nums[1].name);
  return out;
}
// Match complete column names, preferring a longer name over a name contained in it.
function mentioned(ds, q) {
  var text = q.toLowerCase(), spans = [], occupied = [], ambiguous = false;
  var word = function (c) { return c && /[a-z0-9_\u00c0-\uffff]/i.test(c); };
  ds.cols.slice().sort(function (a, b) { return b.name.length - a.name.length; }).forEach(function (c) {
    var names = [c.name.toLowerCase(), c.name.toLowerCase().replace(/[_\-.]+/g, " ")];
    names.filter(function (n, i) { return n && names.indexOf(n) === i; }).forEach(function (n) {
      var start = 0, at;
      while ((at = text.indexOf(n, start)) >= 0) {
        var end = at + n.length; start = at + 1;
        if (word(text[at - 1]) || word(text[end])) continue;
        var overlap = occupied.filter(function (s) { return at < s.end && end > s.at; });
        if (overlap.length) { if (overlap.some(function (s) { return s.at === at && s.end === end && s.col !== c; })) ambiguous = true; continue; }
        occupied.push({at: at, end: end, col: c}); spans.push({at: at, col: c});
      }
    });
  });
  if (ambiguous) return [];
  return spans.sort(function (a, b) { return a.at - b.at; }).map(function (s) { return s.col; }).filter(function (c, i, all) { return all.indexOf(c) === i; });
}
function routeQuestion(ds, q) {
  var cols = mentioned(ds, q), nums = cols.filter(isNum), cats = cols.filter(function (c) { return c.type === "category"; }), times = cols.filter(function (c) { return c.type === "year" || c.type === "date"; });
  var measures = nums.filter(function (c) { return c.type === "number"; }), w = q.toLowerCase();
  if (/\b(caus\w*|prove|guarantee|why|diagnos\w*|recommend treatment)\b/.test(w)) return null;
  if (/\b(paired|before|after|pre|post)\b/.test(w) && measures.length === 2 && cols.length === 2) return {kind: "paired", sel: {x: measures[0].name, y: measures[1].name}};
  if (/\b(trend|over time|per year|each year|growth)\b/.test(w) && measures.length === 1 && times.length === 1 && cats.length <= 1)
    return {kind: "trend", sel: {y: measures[0].name, t: times[0].name, g: (cats[0] || {}).name}};
  if (/\b(predict|model|regress\w*)\b/.test(w)) {
    var split = /\b(?:from|using)\b/.exec(w);
    if (!split) return null; // Never guess the direction of a prediction.
    var targets = mentioned(ds, q.slice(0, split.index)), predictors = mentioned(ds, q.slice(split.index + split[0].length));
    if (targets.length !== 1 || !predictors.length || predictors.some(function (c) { return c.type !== "number" || c === targets[0]; })) return null;
    var target = targets[0], binary = binaryCols(ds).indexOf(target) >= 0;
    if (binary && /\b(logistic|yes\/no|odds|probability)\b/.test(w)) return {kind: "logistic", sel: {o: target.name, lp: predictors.map(function (c) { return c.name; })}};
    if (target.type === "number") return {kind: "regress", sel: {y: target.name, preds: predictors.map(function (c) { return c.name; })}};
    return null;
  }
  if (/\b(pivot|table|count by)\b/.test(w) && cats.length >= 1 && cats.length <= 2 && measures.length <= 1)
    return {kind: "pivot", sel: {g: cats[0].name, g2: (cats[1] || {}).name, y: (measures[0] || {}).name, agg: measures.length ? "mean" : "count"}};
  if (/\b(compare|differ\w*|higher|lower|across|versus|vs|by)\b/.test(w) && measures.length === 1 && cats.length === 1 && cols.length === 2)
    return {kind: "compare", sel: {y: measures[0].name, g: cats[0].name}};
  if (/\b(relat\w*|correlat\w*|associat\w*|link\w*|move together)\b/.test(w) && cols.length === 2) {
    if (nums.length === 2) return {kind: "relate", sel: {x: nums[0].name, y: nums[1].name}};
    if (cats.length === 2) return {kind: "cross", sel: {g: cats[0].name, g2: cats[1].name}};
  }
  if (cols.length === 1) {
    var rest = w.replace(cols[0].name.toLowerCase(), "").replace(cols[0].name.toLowerCase().replace(/[_\-.]+/g, " "), "");
    rest = rest.replace(/\b(summarize|summarise|summary|describe|average|mean|median|distribution|spread|what|is|the|of|for|column|please)\b/g, "").replace(/[?.,\s]/g, "");
    if (!rest) return {kind: "describe", sel: {y: cols[0].name}};
  }
  return null;
}
askBox = function () {
  var ds = cur(), examples = ds ? localExamples(ds) : [];
  return '<form class="ask" id="askform"><label class="field assistant-question" for="askq">Offline assistant<input id="askq" maxlength="300" value="' + esc(A.askq || "") + '" placeholder="e.g. Compare Score by Group" autocomplete="off"></label><button type="submit" class="btn btn-primary">Answer</button></form>' +
    '<p class="count">Ask about named columns, or ask “Check data quality”. Answers use local calculations and fixed rules; no data is sent.</p>' +
    '<div class="slot" role="group" aria-label="Example questions">' + examples.map(function (q, i) { return '<button type="button" class="btn" data-local-question="' + i + '">' + esc(q) + '</button>'; }).join("") + '</div>' +
    (A.askmsg ? '<p class="how" id="ask-answer" role="status" tabindex="-1">' + esc(A.askmsg) + '</p>' : "");
};
function askAnswer(ds) {
  var q = ((document.getElementById("askq") || {}).value || "").trim(); if (!q) return;
  A.askq = q;
  if (/\b(caus\w*|prove|guarantee|why|diagnos\w*)\b/i.test(q)) A.askmsg = "This assistant cannot establish causes, diagnose conditions, or explain why a pattern exists from this table. Ask about an association or comparison instead.";
  else if (/\bp[- ]?values?\b|\bp\s*[=<>]|valor\s+p\b|significan/i.test(q)) { var currentResult = runAnalysis(ds); A.askmsg = localExplanation(ds, currentResult, 'pvalue').join(' '); }
  else if (/sample size|how many|combine|join|merge|files|muestra|combinar|archivos/i.test(q)) A.askmsg = 'To combine files, import them under Your data, then open Combine datasets in Clean & enhance. Sample-size planning needs a meaningful target effect, desired power and study design. Observed-effect power in Go deeper is an approximation; it cannot determine your required sample size by itself.';
  else if (/^(check data quality|check (my |the )?data|missing (data|values)|data quality)[?.!]?$/i.test(q)) {
    var rows = filterRows(ds), missing = 0;
    rows.forEach(function (r) { r.forEach(function (v) { if (v == null) missing++; }); });
    A.askmsg = "In the current selection: " + rows.length + " rows, " + ds.cols.length + " columns and " + missing + " missing cells. Open Clean & enhance for the health check and fixes you can undo.";
  } else {
    var r = routeQuestion(ds, q);
    if (r) { A.kind = r.kind; A.sel = r.sel; A.ai = Object.create(null); A.askmsg = "Selected: " + KIND_HELP[r.kind] + (r.kind === "paired" ? " Check that both columns measure the same thing on the same rows; the first named column is Before and the second is After." : " Check the selected columns below."); }
    else A.askmsg = "I could not match that to a supported analysis without guessing. Use complete column names and a task such as Summarize, Compare, Relate, or Predict [outcome] from [predictors]. For a trend, name a measure and a year/date column. Try an example above.";
  }
  render(); refocus("#ask-answer");
}
function localDiagnostics(ds, R) {
  var rows = filterRows(ds), s = A.sel, vectors = [], notes = [], failed = false, checked = 0;
  var values = function (n) { return getCol(ds, rows, n); };
  if (A.kind === "describe" && localNumber(R.summary.mean)) vectors = [[s.y, values(s.y)]];
  if (A.kind === "relate") {
    var pairedRows = rows.filter(function (r) { return localNumber(r[idxOf(ds, s.x)]) && localNumber(r[idxOf(ds, s.y)]); });
    vectors = [[s.x, getCol(ds, pairedRows, s.x)], [s.y, getCol(ds, pairedRows, s.y)]];
  }
  if (A.kind === "compare") {
    var groups = groupsOf(ds, rows, s.y, s.g);
    vectors = Object.keys(groups).filter(function (k) { return groups[k].length >= 2; }).slice(0, 12).map(function (k) { return [k, groups[k]]; });
  }
  if (A.kind === "paired") vectors = [["Paired changes", rows.filter(function (r) { return localNumber(r[idxOf(ds, s.x)]) && localNumber(r[idxOf(ds, s.y)]); }).map(function (r) { return r[idxOf(ds, s.y)] - r[idxOf(ds, s.x)]; })]];
  vectors.forEach(function (v) {
    var w = S2.shapiro(v[1]); if (!w || !localNumber(w.p)) return;
    checked++; if (w.p < 0.05) { failed = true; notes.push("Shapiro–Wilk flags non-normality for “" + v[0] + "” (p " + (w.p < 0.001 ? "< 0.001" : "= " + fp(w.p)) + ")."); }
  });
  if (failed && A.kind === "compare") {
    var gs = Object.keys(groups).filter(function (k) { return groups[k].length >= 2; }).map(function (k) { return groups[k]; });
    var rank = gs.length === 2 ? S2.mannWhitney(gs[0], gs[1]) : gs.length > 2 ? S2.kruskal(gs) : null;
    if (rank && localNumber(rank.p)) notes.push(gs.length === 2 ? "Rank-based check: Mann–Whitney U = " + f3(rank.U) + ", p " + (rank.p < 0.001 ? "< 0.001" : "= " + fp(rank.p)) + ", rank effect r = " + f3(rank.r) + "." : "Rank-based check: Kruskal–Wallis H = " + f3(rank.H) + ", p " + (rank.p < 0.001 ? "< 0.001" : "= " + fp(rank.p)) + ", epsilon squared = " + f3(rank.eps2) + ".");
  }
  if (failed && A.kind === "relate") {
    var rho = S.correlate(vectors[0][1], vectors[1][1]);
    if (localNumber(rho.rho) && localNumber(rho.prho)) notes.push("Rank-based check: Spearman rho = " + f3(rho.rho) + ", p " + (rho.prho < 0.001 ? "< 0.001" : "= " + fp(rho.prho)) + ".");
  }
  if (checked && !failed) notes.push("Shapiro–Wilk did not detect non-normality in the checked values. This does not prove normality or independence.");
  if (failed) notes.push("Consider the rank-based alternative: " + ({describe: "Mann–Whitney or Kruskal–Wallis for independent groups; Spearman for two numbers", compare: Array.isArray(R.summary.groups) ? "Mann–Whitney for two independent groups" : "Kruskal–Wallis for several independent groups", relate: "Spearman correlation", paired: "Wilcoxon signed-rank for paired changes"}[A.kind] || "check the assumptions of the selected method") + ". See the rank-based result in the poster when available; its assumptions also matter.");
  return {failed: failed, checked: checked, notes: notes};
}
function localFacts(R) {
  var s = R.summary || {}, facts = [], intervals = [], effects = [], effectFacts = [];
  var add = function (label, v) { if (localNumber(v)) facts.push(label + ": " + f3(v) + "."); };
  var ci = function (label, v) { if (localCI(v)) intervals.push(label + ": " + f3(v[0]) + " to " + f3(v[1]) + "."); };
  var effect = function (label, v) { if (localNumber(v)) { add(label, v); effects.push(label); effectFacts.push(label + ": " + f3(v) + "."); } };
  add(R.kind === "matrix" ? "Rows in selected table" : "Rows used", s.n);
  if (R.kind === "describe") {
    add("Mean", s.mean); add("Median", s.median); add("Standard deviation", s.sd); add("Missing values", s.missing);
    if (localNumber(s.min) && localNumber(s.max)) facts.push("Observed values: " + f3(s.min) + " to " + f3(s.max) + ". This is the data range, not a confidence interval.");
    add("Distinct values", s.distinct);
    if (s.top && s.top.length) facts.push("Most common value: “" + s.top[0][0] + "” (" + s.top[0][1] + " rows).");
  }
  if (R.kind === "compare") { if (Array.isArray(s.groups)) facts.push("Mean difference is “" + s.groups[0] + "” minus “" + s.groups[1] + "”."); add("Difference in means", s.diff); effect("Cohen’s d", s.cohen_d); add("ANOVA F", s.F); effect("Eta squared", s.eta2); ci("95% confidence interval for the mean difference", s.ci95); }
  if (R.kind === "relate") { if (s.x && s.y) facts.push("Columns: “" + s.x + "” and “" + s.y + "”."); effect("Pearson r", s.r); effect("Spearman rho (rank-based)", s.spearman); ci("95% confidence interval for Pearson r", s.ci95); }
  if (R.kind === "cross") { add("Chi-square", s.x2); effect("Cramér’s V", s.cramers_v); }
  if (R.kind === "paired") { if (s.before && s.after) facts.push("Before: “" + s.before + "”; After: “" + s.after + "”."); add("Mean change (After minus Before)", s.mean_change); effect("Paired effect size dz", s.dz); ci("95% confidence interval for the mean change", s.ci95); if (localNumber(s.wilcoxon_p)) facts.push("Wilcoxon signed-rank p " + (s.wilcoxon_p < 0.001 ? "< 0.001" : "= " + fp(s.wilcoxon_p)) + "."); }
  if (R.kind === "regress") { effect("R squared (in-sample fit)", s.r2); add("Adjusted R squared", s.adj_r2); (s.coefficients || []).forEach(function (c) { add("Coefficient for “" + c.name + "”", c.b); ci("95% confidence interval for “" + c.name + "”", c.ci95); }); }
  if (R.kind === "logistic") { effect("McFadden pseudo R squared", s.mcfadden_r2); (s.odds_ratios || []).forEach(function (c) { effect("Odds ratio for “" + c.name + "”", c.or); ci("95% confidence interval for that odds ratio", c.ci95); }); }
  if (R.kind === "trend") (s.series || []).forEach(function (x) { effect("Slope per year for “" + x.name + "”", x.slope_per_year); });
  if (R.kind === "matrix") (s.strongest || []).forEach(function (x) { effect("Pearson r for “" + x.pair + "”", x.r); });
  if (R.kind === "pivot" && s.highest) facts.push("Highest displayed cell: “" + s.highest[1] + "”, " + f3(s.highest[0]) + ". A pivot table describes the data; it does not test an association.");
  return {facts: facts, intervals: intervals, effects: effects, effectFacts: effectFacts};
}
function localExplanation(ds, R, topic) {
  var f = localFacts(R), sm = R.summary || {}, diag = localDiagnostics(ds, R), out = [];
  var p = localNumber(sm.p) ? sm.p : sm.p_model, tested = localNumber(p), descriptive = ["describe", "pivot", "matrix"].indexOf(R.kind) >= 0;
  if (!R.reading.length || !f.facts.length) return ["There is no supported explanation for the current result yet. Check the selected columns and the requirements in the poster. No findings have been inferred."];
  if (topic === "result") {
    out.push("For “" + ds.name + "”: " + (sm.test || KIND_HELP[R.kind] || "Selected analysis"));
    out = out.concat(f.facts);
    if (tested) out.push("Test p " + (p < 0.001 ? "< 0.001" : "= " + fp(p)) + ". " + (p < 0.05 ? "This is below the conventional .05 threshold under the test’s assumptions." : "This does not cross the conventional .05 threshold; it does not establish that there is no association or difference."));
    if (R.kind === "matrix") out.push("This map screens multiple pairs. Pairwise missing values may reduce the rows available for each correlation. Open an individual pair for its row count, assumptions and confidence interval, and account for multiple comparisons.");
    if (R.kind === "regress" || R.kind === "logistic") out.push("Model fit describes these data. It does not establish predictive performance on new data; check held-out performance before using predictions.");
  }
  if (topic === "uncertainty" || topic === "result") {
    if (topic === "uncertainty") out = out.concat(f.effectFacts);
    out = out.concat(f.intervals);
    if (topic === "uncertainty" && !f.effects.length) out.push("No test effect size is stored for this result. Descriptive summaries report location, spread or counts instead.");
    if (!f.intervals.length) out.push("A confidence interval is not available in this result’s stored summary. No interval has been estimated by the assistant.");
    if (tested && !descriptive && !f.effects.length) out.push("An effect size is not available in this summary. Report one before drawing a substantive conclusion.");
    if (localNumber(sm.n) && sm.n < 30) out.push("Only " + sm.n + " rows were used. Inspect uncertainty and unusual values carefully; a small sample can give unstable estimates.");
  }
  if (topic === "pvalue") out.push(tested ? "The displayed p-value is " + (p < 0.001 ? "less than 0.001" : fp(p)) + ". Under the null hypothesis and the test’s assumptions, it describes how often a statistic at least this extreme would occur. It is not the probability that the null hypothesis is true, and it does not measure effect size or causation." : "There is no single test p-value in this summary. A descriptive table does not establish statistical significance; inspect any individual tests separately.");
  if (topic === "assumptions" || topic === "result") {
    out = out.concat(diag.notes);
    if (!diag.checked) out.push("No normality check is available here. Check the assumptions of this method before interpreting its tests.");
    out.push("Independence, representative sampling, study design and possible confounding cannot be verified from column values alone.");
    if (R.kind === "paired") out.push("Each row must identify the same unit measured twice on a comparable scale. Verify this in the source data.");
  }
  if (topic === "next") {
    out.push("To combine files, import each dataset under Your data, then use Combine datasets in Clean & enhance. For a sample-size plan, specify a meaningful target effect, desired power and design; the observed-effect power calculation under Go deeper is only an approximation, not a study plan.");
    out.push("Inspect missing values, duplicates and unusual values in Clean & enhance before interpreting the result. Do not remove valid observations just to obtain a smaller p-value.");
    out = out.concat(diag.notes);
    (R.next || []).forEach(function (n) { out.push("An exploratory option: " + n.label + "."); });
    out.push("Choose follow-up analyses for the research question, and account for multiple comparisons when testing several hypotheses.");
  }
  out.push("These calculations alone do not establish causation or explain why a pattern exists. Domain knowledge and study design are still needed.");
  return out;
}
function explanationPanel(ds, R) {
  // Recomputed on every render: changing dataset, filter or columns cannot leave a stale explanation.
  var topics = [["result", "Explain this result"], ["uncertainty", "Effect & uncertainty"], ["assumptions", "Assumptions"], ["pvalue", "What does p mean?"], ["next", "Next steps"]], topic = A.localTopic || "result";
  return '<section class="card assistant" aria-labelledby="offline-title"><h2 id="offline-title">Offline result assistant</h2><p class="count">Built from the current analysis using fixed rules. No model, account or internet connection is needed. This is not an open-ended chatbot.</p>' +
    '<div class="pills" role="group" aria-label="Explanation topic">' + topics.map(function (t) { return '<button type="button" class="pill' + (topic === t[0] ? ' on' : '') + '" aria-pressed="' + (topic === t[0]) + '" data-local-topic="' + t[0] + '">' + t[1] + '</button>'; }).join("") + '</div>' +
    '<div id="offline-answer" class="assistant-answer" role="status">' + localList(localExplanation(ds, R, topic)) + '</div></section>';
}
function explainResult(ds, R) { A.localTopic = "result"; render(); }
// Capture which reporting checks can actually be supported by a saved result.
function localEvidence(ds, R) {
  var text = localText((R.reading || []).join(" ") + " " + (R.apa || "")), diag = localDiagnostics(ds, R), f = localFacts(R);
  var sm = R.summary || {}, p = localNumber(sm.p) ? sm.p : sm.p_model;
  return {tested: R.kind === "matrix" || localNumber(p) || (sm.series || []).some(function (x) { return localNumber(x.p); }),
    multiple: R.kind === "matrix", effect: f.effects.length > 0 && /\br\s*=|\bd\s*=|dz\s*=|η²|Cramér|Pearson|Spearman|R²|OR\s*=|odds|per year|r\(/i.test(text),
    interval: f.intervals.length > 0 && /95%|confidence|CI\s*\[|most plausibly lies between/i.test(text),
    normalityFailed: diag.failed, rankReported: /(?:Mann|Kruskal|Wilcoxon|Spearman)[\s\S]*(?:p\s*[=<]|ρ\s*=|rho\s*=)/i.test(text)};
}
function localReviewChecks() {
  var items = WP.items, tested = items.filter(function (it) { return it.evidence ? it.evidence.tested : localNumber(it.p); });
  var failed = tested.filter(function (it) { return it.evidence ? it.evidence.normalityFailed : /not normal/i.test(localText((it.reading || []).join(" "))); });
  var check = function (label, applicable, ok, fix) { return {label: label, status: !applicable ? "Not applicable" : ok ? "Reported" : "Check", fix: fix}; };
  return [
    check("Effect sizes for tested results", tested.length, tested.every(function (it) { return it.evidence && it.evidence.effect; }), "Include an effect size for every tested result; a p-value alone does not show the size of an association."),
    check("Confidence intervals for tested results", tested.length, tested.every(function (it) { return it.evidence && it.evidence.interval; }), "Include a confidence interval for each main effect. A data range or standard deviation is not a confidence interval."),
    check("Multiple comparisons", tested.length > 1 || items.some(function (it) { return it.evidence && it.evidence.multiple; }), false, "Several tested results are collected. Decide which form a family of hypotheses and report an appropriate correction or an explicit exploratory interpretation."),
    check("Rank-based results when normality is flagged", failed.length, failed.every(function (it) { return it.evidence && it.evidence.rankReported; }), "Normality was flagged. Report and interpret the relevant rank-based alternative, checking its assumptions too."),
    check("Figures", items.length, items.every(function (it) { return !!it.fig; }), "Add a figure where it helps readers evaluate the result.")
  ];
}
function selfCheck() {
  return '<ul class="plain checklist">' + localReviewChecks().map(function (c) { return '<li><span class="chip ' + (c.status === "Reported" ? "q-verified" : c.status === "Check" ? "q-estimated" : "") + '">' + c.status + '</span><span>' + esc(c.label) + '</span></li>'; }).join("") + '</ul>';
}
function localReviewKey() { return JSON.stringify([WP.title, WP.items]); }
function reviewWriteup() {
  var notes = localReviewChecks().filter(function (c) { return c.status === "Check"; }).map(function (c) { return c.fix; });
  if (WP.items.some(function (it) { return localNumber(it.n) && it.n < 30; })) notes.push("Some results use fewer than 30 rows. Describe the sample size and uncertainty, and avoid broad generalizations.");
  notes.push("Check study design, independence, sampling and confounders against the source study. These cannot be certified from this draft.");
  notes.push("Describe associations or differences; these analyses alone do not establish causation. This rules-based review cannot certify that the methods or wording are correct.");
  WP.review = {key: localReviewKey(), text: notes}; render(); refocus("#offline-review");
}
function reviewPanel() {
  var review = WP.review && WP.review.key === localReviewKey() ? WP.review : null;
  return '<section class="card assistant"><h2>Offline write-up review</h2><p class="count">Checks saved results for reporting gaps using fixed rules. It cannot verify the study design or replace a statistical reviewer.</p><button type="button" class="btn btn-primary" data-wpr2="1">Review write-up</button>' +
    (review ? '<div id="offline-review" class="assistant-answer" role="status" tabindex="-1">' + localList(review.text) + '</div>' : '') + '</section>';
}
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return;
  if (b.dataset.localTopic) { A.localTopic = b.dataset.localTopic; render(); refocus('[data-local-topic="' + A.localTopic + '"]'); }
  if (b.dataset.localQuestion != null) { var ds = cur(), q = ds && localExamples(ds)[+b.dataset.localQuestion]; if (q) { document.getElementById("askq").value = q; askAnswer(ds); } }
});
