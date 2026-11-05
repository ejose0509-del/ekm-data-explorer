// ---------- Home and plain language: a welcoming start, everyday names for every analysis ----------
// For college and medical students as well as clinicians: plain words first, the method's proper name second.

// ---- Everyday names and one-line questions for each analysis (the method name stays in brackets) ----
var PLAIN_KINDS = {
  describe: ["Describe one column", "What is typical, how spread out, and what is unusual in one column."],
  compare: ["Compare groups", "Is a number different between groups, such as treatment arms? (t-test or ANOVA)"],
  relate: ["Two numbers together", "Do two numbers rise and fall together, such as age and blood pressure? (correlation)"],
  cross: ["Two categories together", "Are two categories linked, such as treatment and outcome? (chi-square)"],
  trend: ["Change over time", "How a number changes across dates or years."],
  regress: ["What predicts a number", "How several measurements together predict one number. (multiple regression)"],
  paired: ["Before and after", "Did the same people change between two measurements? (paired t-test, Wilcoxon)"],
  logistic: ["What predicts yes or no", "Which factors go with a yes/no outcome, such as readmission. (logistic regression, odds ratios)"],
  pivot: ["Summary table", "A number summarised for every combination of categories."],
  matrix: ["All links at once", "How every pair of number columns moves together, on one map."],
  rmanova: ["Same people, 3+ times", "Did the same people change across three or more visits or conditions? (repeated-measures ANOVA, Friedman)"],
  mixed: ["Patients within sites", "Measurements grouped by patient, clinic or school, analysed together. (mixed model)"],
  reliability: ["Questionnaire reliability", "Do the questions of a scale measure one thing consistently? (Cronbach's alpha, omega)"],
  factor: ["Questionnaire structure", "Which questions group together into underlying themes? (factor analysis, PCA)"],
  agree: ["Do raters agree?", "How well two or more raters, readers or instruments agree. (kappa, ICC)"],
  missing: ["Missing values", "Where values are missing, whether that looks random, and estimates that allow for it. (multiple imputation)"],
  model: ["Predict an outcome", "How well other columns predict one outcome for new patients or rows. (cross-validated models)"]
};
KINDS.forEach(function (k) { var p = PLAIN_KINDS[k[0]]; if (p) { k[1] = p[0]; KIND_HELP[k[0]] = p[1]; } });

// ---- Plainer page introductions ----
var PLAIN_LEDES = [
  ["Add a dataset, check that each column has the right type, then open Analyze for statistics and a plain-language reading.", "Add your table, check what each column holds, then open Analyze. Every result starts with a plain-language summary."],
  ["Add a dataset to begin. EKM checks every column, helps you clean it, then runs the statistics and explains what they show.", "Add a table to begin. EKM checks each column, helps you tidy it, runs the statistics and explains what they show."],
  ["A health check of every column, with fixes you can apply and undo. Nothing changes until you press a button.", "A check of every column for gaps, typos and odd values, with fixes you can undo. Nothing changes until you press a button."],
  ["Pick a chart type and the columns to draw.", "Choose a chart and the columns to draw."]
];
function plainCopy(h) { PLAIN_LEDES.forEach(function (p) { h = h.split(p[0]).join(p[1]); }); return h; }
["data", "enhance", "charts"].forEach(function (t) { var f = VIEWS[t]; if (f) VIEWS[t] = function () { return plainCopy(f()); }; });

// ---- An ID column is never a default analysis variable ----
var _defaultsW = defaults;
defaults = function (ds) {
  var s = A.sel, hadX = !!s.x && idxOf(ds, s.x) >= 0, hadY = !!s.y && idxOf(ds, s.y) >= 0, out = _defaultsW(ds);
  var isId = function (n) { var c = colMeta(ds, n); return c && typeof likelyId === "function" && likelyId(ds, c); };
  var pool = out.nums.filter(function (c) { return !likelyId(ds, c); }).map(function (c) { return c.name; });
  if (!hadY && isId(s.y) && pool.length) s.y = pool[0];
  if (!hadX && (isId(s.x) || s.x === s.y)) { var other = pool.filter(function (n) { return n !== s.y; })[0]; if (other) s.x = other; }
  if (Array.isArray(s.preds) && !hadY) s.preds = s.preds.filter(function (n) { return !isId(n) && n !== s.y; });
  return out;
};

// ---- Home ----
function homeView() {
  var ds = A.sets.filter(function (s) { return s.rows || s.nRows; })[0];
  var steps = [
    ["Plan", "Work out how many participants you need before you start.", "plan"],
    ["Add your data", "A spreadsheet or file: CSV, Excel, JSON or Parquet.", "data"],
    ["Check and clean", "Find gaps, typos and odd values, and fix them with undo.", "enhance"],
    ["Analyze", "Ask a question; EKM picks the statistics and explains the result.", "analyze"],
    ["Report", "Collect results into a draft results section for Word or PDF.", "writeup"]
  ];
  return '<section class="home">' +
    '<h1 class="home-title">Make sense of your data</h1>' +
    '<p class="lede">Add a table and EKM checks it, runs the right statistics and explains the results in plain language. It works on this device: your data is not uploaded.</p>' +
    '<div class="slot home-actions">' +
      (ds ? '<button type="button" class="btn btn-primary" data-hgo="analyze">Continue with “' + esc(ds.name) + '”</button><button type="button" class="btn" data-hgo="data">Add another table</button>' : '<button type="button" class="btn btn-primary" data-hgo="data">Add your data</button>') +
      '<button type="button" class="btn" data-hgo="plan">Plan a new study</button>' +
      '<button type="button" class="btn" data-project-open="1">Open a saved project</button><input type="file" id="project-file" accept=".json,application/json" class="sr-file" tabindex="-1" aria-hidden="true">' +
    "</div>" +
    '<ol class="home-steps">' + steps.map(function (s2) { return '<li><button type="button" class="linkbtn" data-hgo="' + s2[2] + '">' + s2[0] + "</button><span>" + s2[1] + "</span></li>"; }).join("") + "</ol>" +
    '<p class="home-note">For students learning statistics, medical students, clinicians and researchers. Results open with a plain-language summary; switch to the Researcher view under any result for every test statistic. The calculations are checked against SciPy and statsmodels.</p>' +
    "</section>";
}
GROUPS.home = ["home"]; VIEWS.home = homeView;
view.addEventListener("click", function (e) { var b = e.target.closest("button[data-hgo]"); if (b) nav(b.dataset.hgo); });

// ---- Rank-based results get a plain first sentence; the exact statistic stays right under it ----
var _takeawayW = takeaway;
takeaway = function (ds, R) {
  var t = _takeawayW(ds, R), s = R.summary || {}, p = s.primary; if (!p || !t.headline) return t;
  var e = +p.effect, a = Math.abs(e), sig = typeof p.p === "number" && p.p < 0.05, nm = function (n) { return esc(nameOf(n)); }, sel = A.sel, plain = "";
  var strength = a < 0.1 ? "almost no" : a < 0.3 ? "a weak" : a < 0.5 ? "a moderate" : "a strong";
  if (R.kind === "relate" && isFinite(e)) plain = nm(sel.x) + " and " + nm(sel.y) + " show " + strength + (a < 0.1 ? " link." : (e > 0 ? " positive link: when one is higher, the other tends to be higher too." : " negative link: when one is higher, the other tends to be lower."));
  else if (R.kind === "compare") plain = nm(sel.y) + (sig ? " differs between the groups of " : " does not clearly differ between the groups of ") + nm(sel.g) + ".";
  else if (R.kind === "paired") plain = sig ? "Values changed between " + nm(sel.x) + " and " + nm(sel.y) + "." : "No clear change between " + nm(sel.x) + " and " + nm(sel.y) + ".";
  if (!plain) return t;
  t.headline = plain + '<span class="tk-stat">' + t.headline + "</span>";
  t.everyday = ["This result uses ranks (the order of the values), the safer choice when values are skewed or not bell-shaped."].concat(t.everyday);
  return t;
};

// ---- Conclusion: supporting checks grouped under one heading instead of a prefix on every line ----
var _analyzeViewW = VIEWS.analyze;
VIEWS.analyze = function () {
  var h = _analyzeViewW(), PRE = "\u2063";
  return h.replace(/<div class="reading"><ul class="plain">([\s\S]*?)<\/ul><\/div>/, function (m, items) {
    var main = [], extra = [];
    items.replace(/<li>([\s\S]*?)<\/li>/g, function (x, body) { (body.indexOf(PRE) === 0 ? extra : main).push(body.indexOf(PRE) === 0 ? body.slice(PRE.length) : body); return x; });
    if (!extra.length) return m;
    return '<div class="reading"><ul class="plain">' + main.map(function (b) { return "<li>" + b + "</li>"; }).join("") + '</ul><h4 class="reading-sub">Supporting checks (they make different assumptions)</h4><ul class="plain">' + extra.map(function (b) { return "<li>" + b.charAt(0).toUpperCase() + b.slice(1) + "</li>"; }).join("") + "</ul></div>";
  });
};
