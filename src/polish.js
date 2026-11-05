// ---------- Polish from a real-data test run: clearer report text, an assistant that understands plain words,
// coded 0/1 columns, ID columns kept out of choices, page order, and a pointer to reshape long-format ratings ----------

// ---- Report text: one statistic stated once, "p < .001" not "p = < .001", supporting checks under one heading ----
function tidyStat(t) {
  if (typeof t !== "string") return t;
  return t.replace(/\bp = < ?/g, "p < ").replace(/\bp = > ?/g, "p > ").replace(/ = > /g, " > ").replace(/ = < /g, " < ")
    .replace(/an estimated (a|an) /g, "$1 ")
    .replace(/(^|[\s(:;,])(\S+) = (−?-?[\d.]+), ([^,;()<>]*?)\2 = \3/g, "$1$4$2 = $3")   // "ρ = .56, Spearman ρ = .56" → "Spearman ρ = .56"
    .replace(/(Spearman ρ = (−?-?[\d.]+)[\s\S]*?);? Spearman(?:'|’)s ρ = \2/, "$1");
}
var _runAnalysisP = runAnalysis;
runAnalysis = function (ds) {
  var R = _runAnalysisP(ds); if (!R) return R;
  if (Array.isArray(R.reading)) R.reading = R.reading.map(tidyStat);
  if (Array.isArray(R.caveats)) R.caveats = R.caveats.map(tidyStat);
  if (R.apa) R.apa = tidyStat(R.apa);
  return R;
};
var SUPPORT_MARK = "⁣", OLD_SUPPORT = "Secondary/assumption checks: ";
// Supporting checks read as one paragraph: a single lead-in, then the sentences
function proseLines(lines) {
  var seen = false;
  return (lines || []).map(function (t) {
    t = String(t); var marked = t.indexOf(SUPPORT_MARK) === 0 || t.indexOf(OLD_SUPPORT) === 0;
    if (!marked) return t;
    t = t.indexOf(SUPPORT_MARK) === 0 ? t.slice(1) : t.slice(OLD_SUPPORT.length);
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (seen) return t; seen = true; return "Supporting analyses (they make different assumptions): " + t;
  });
}
function plainHeadline(ds, R) { try { var h = takeaway(ds, R).headline || ""; return plain(h.split('<span class="tk-stat">')[0]); } catch (e) { return ""; } }
var _addToPaperP = addToPaper;
addToPaper = function (ds, R) {
  var n = WP.items.length; _addToPaperP(ds, R); var it = WP.items[WP.items.length - 1];
  if (it && WP.items.length > n) { it.reading = proseLines(it.reading).map(tidyStat); it.apa = tidyStat(it.apa); it.plainLead = plainHeadline(ds, R); wpSave(); }
};
// Items saved before this change are tidied when the write-up opens
var _writeupViewPolish = VIEWS.writeup;
VIEWS.writeup = function () { WP.items.forEach(function (it) { if (Array.isArray(it.reading)) it.reading = proseLines(it.reading).map(tidyStat); if (it.apa) it.apa = tidyStat(it.apa); }); return _writeupViewPolish(); };

// ---- ID columns stay out of variable choices (they remain available for grouping by patient or site) ----
function idCol(ds, c) { return !!(ds && c && typeof likelyId === "function" && likelyId(ds, c)); }
var _pickP = pick;
pick = function (id, label, cols, cur2, allowNone) {
  var ds = cur(); if (ds && id !== "mg" && id !== "f" && Array.isArray(cols)) cols = cols.filter(function (c) { return c.name === cur2 || !idCol(ds, c); });
  return _pickP(id, label, cols, cur2, allowNone);
};
var _mselListP = mselList;
mselList = function (key, cols, label, min) {
  var ds = cur(), on = Array.isArray(A.sel[key]) ? A.sel[key] : [];
  if (ds && Array.isArray(cols)) cols = cols.filter(function (c) { return on.indexOf(c.name) >= 0 || !idCol(ds, ds.cols[idxOf(ds, c.name)] || c); });
  return _mselListP(key, cols, label, min);
};
var _localExamplesP = localExamples;
localExamples = function (ds) {
  var keep = ds.cols.filter(function (c) { return !idCol(ds, c); }), nums = keep.filter(function (c) { return c.type === "number"; }), cats = keep.filter(function (c) { return c.type === "category"; });
  var out = []; if (nums[0]) out.push("Summarize " + nums[0].name); if (nums[0] && cats[0]) out.push("Compare " + nums[0].name + " by " + cats[0].name); if (nums.length > 1) out.push("Relate " + nums[0].name + " and " + nums[1].name);
  return out.length ? out : _localExamplesP(ds);
};

// ---- The assistant understands everyday words: "progression" finds progression_1yr, "blood pressure" finds mean_bp ----
var WORD_STOP = {mean: 1, avg: 1, average: 1, total: 1, log: 1, num: 1, number: 1, pct: 1, value: 1, val: 1, the: 1, and: 1, of: 1, yr: 1, raw: 1};
var ABBR = {bp: ["blood pressure"], sbp: ["systolic"], dbp: ["diastolic"], bmi: ["body mass", "body-mass"], chol: ["cholesterol"], hdl: ["good cholesterol"], ldl: ["bad cholesterol"], glu: ["glucose", "sugar"], glucose: ["sugar"], hr: ["heart rate", "pulse"], los: ["length of stay"], temp: ["temperature"], wt: ["weight"], ht: ["height"], dob: ["birth"], sex: ["gender"], gender: ["sex"], trig: ["triglyceride"], triglycerides: ["triglyceride"], hba1c: ["a1c"], egfr: ["kidney function"], tx: ["treatment"], grp: ["group"], dx: ["diagnosis"]};
function colTokens(name) { return String(name).toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").split(/[^a-z0-9]+/).filter(function (t) { return t && !/^\d/.test(t) && !WORD_STOP[t] && (t.length >= 3 || ABBR[t]); }); }
function hasWord(q, t) {
  var w = " " + q.toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  if (w.indexOf(" " + t + " ") >= 0 || w.indexOf(" " + t + "s ") >= 0 || (t.length > 4 && w.indexOf(" " + t.replace(/s$/, "") + " ") >= 0)) return true;
  return (ABBR[t] || []).some(function (p) { return w.indexOf(" " + p + " ") >= 0 || w.indexOf(" " + p + "s ") >= 0; });
}
var _mentionedP = mentioned;
mentioned = function (ds, q) {
  var found = _mentionedP(ds, q) || [], names = found.map(function (c) { return c.name; });
  var extra = ds.cols.filter(function (c) { if (names.indexOf(c.name) >= 0 || idCol(ds, c)) return false; var t = colTokens(c.name); return t.length && t.every(function (x) { return hasWord(q, x); }); });
  // a column whose words are all inside another matched column's words is the less specific match
  extra = extra.filter(function (c) { var t = colTokens(c.name); return !extra.concat(found).some(function (o) { if (o === c) return false; var u = colTokens(o.name), isFound = found.indexOf(o) >= 0; return (isFound ? u.length >= t.length : u.length > t.length) && t.every(function (x) { return u.indexOf(x) >= 0; }); }); });   // an exact column name already in the question wins
  return found.concat(extra);
};
var EFFECT_WORDS = /\b(affect\w*|effect\w*|influenc\w*|impact\w*|depend\w*|matter\w*|go(?:es)? with|different|differ\w*|change\w* with|related|relationship)\b/i;
var _routeQuestionP = routeQuestion;
routeQuestion = function (ds, q) {
  var r = _routeQuestionP(ds, q); if (r || !EFFECT_WORDS.test(q) || /\b(caus\w*|prove|guarantee|diagnos\w*)\b/i.test(q)) return r;
  var cols = mentioned(ds, q); if (cols.length !== 2) return null;
  var nums = cols.filter(function (c) { return c.type === "number"; }), cats = cols.filter(function (c) { return c.type === "category"; });
  if (nums.length === 2) return {kind: "relate", sel: {x: nums[0].name, y: nums[1].name}};
  if (nums.length === 1 && cats.length === 1) return {kind: "compare", sel: {y: nums[0].name, g: cats[0].name}};
  if (cats.length === 2) return {kind: "cross", sel: {g: cats[0].name, g2: cats[1].name}};
  return null;
};
var _askAnswerP = askAnswer;
askAnswer = function (ds) {
  _askAnswerP(ds);
  var q = A.askq || "";
  if (/^Selected:/.test(A.askmsg || "") && /\b(affect\w*|effect\w*|influenc\w*|impact\w*|depend\w*)\b/i.test(q)) {
    A.askmsg += " Note: this shows whether they are associated in your data. It cannot show that one affects the other; that needs a study designed for it, such as a randomised trial.";
    render(); refocus("#ask-answer");
  }
};

// ---- Coded columns: numbers that are really categories (0/1 sex, 1–4 chest-pain type) ----
var CODE_SKIP = /count|num|^n_|_n$|visits?|days?|years?|age|score|children|stay|items?\d*$|^q\d+|rating|grade|level|size|dose|weeks?|months?|hours?|times?|vessels?/i;
var CODE_HINT = /sex|gender|target|outcome|status|class|type|group|arm|flag|yes|smok|diabet|fbs|exang|cp$|thal|slope|restecg|died|death|alive|event|case|treat|site|code/i;
function codedColumns(ds) {
  if (!ds || !ds.rows || ds.codedKept) return [];
  return ds.cols.filter(function (c, j) {
    if (c.type !== "number" || idCol(ds, c) || CODE_SKIP.test(c.name)) return false;
    var u = Object.create(null), n = 0, ok = true;
    ds.rows.forEach(function (r) { var v = r[j]; if (v == null) return; n++; if (v !== Math.round(v) || v < 0 || v > 9) ok = false; u[v] = 1; });
    var k = Object.keys(u).length; if (!ok || n < 10 || k < 2) return false;
    return k === 2 || (k <= 5 && CODE_HINT.test(c.name));
  }).map(function (c) { var j = idxOf(ds, c.name), u = Object.create(null); ds.rows.forEach(function (r) { if (r[j] != null) u[r[j]] = 1; }); return {name: c.name, j: j, values: Object.keys(u).map(Number).sort(function (a, b) { return a - b; })}; });
}
function codedCard(ds) {
  var cc = codedColumns(ds); if (!cc.length) return "";
  return '<section class="card coded" aria-labelledby="coded-h"><h2 id="coded-h">Some numbers look like codes</h2><p>' + cc.map(function (c) { return "<b>" + esc(c.name) + "</b> (" + c.values.join(", ") + ")"; }).join(", ") +
    " hold only a few whole numbers, so they probably stand for groups, such as 0 = no and 1 = yes. Averaging codes gives meaningless answers. Treat them as categories so EKM compares groups instead.</p>" +
    '<div class="slot"><button type="button" class="btn btn-primary" data-coded="all">Treat ' + (cc.length === 1 ? "it" : "all " + cc.length) + ' as categories</button><button type="button" class="btn" data-coded="keep">They are real amounts</button></div><p class="count">You can undo this, or change any single column under Type below.</p></section>';
}
view.addEventListener("click", function (e) {
  var b = e.target.closest("button[data-coded]"); if (!b) return; var ds = cur(); if (!ds) return;
  if (b.dataset.coded === "keep") { ds.codedKept = true; render(); return; }
  var cc = codedColumns(ds);
  try { cc.forEach(function (c) { var j = idxOf(ds, c.name); applyStep(ds, {op: "type", col: c.name, type: "category", text: "Changed type of " + c.name + " to category"}, function () { return changeColumnType(ds, j, "category"); }); }); A.msg = cc.length + " column" + (cc.length === 1 ? "" : "s") + " now treated as categories: " + cc.map(function (c) { return c.name; }).join(", ") + "."; }
  catch (err) { A.msg = err.message; }
  render();
});

// ---- Page order: the data comes first; backup and scan cards follow it ----
function afterLede(html, block) {
  var i = html.indexOf('<p class="lede">'); if (i < 0) return block + html;
  var end = html.indexOf("</p>", i); return end < 0 ? block + html : html.slice(0, end + 4) + block + html.slice(end + 4);
}
VIEWS.data = (function (base) {
  return function () {
    var h = base(), ds = cur();
    // project.js placed the backup card first; move it to the end and say plainly what it is for
    var m = /^<section class="card"><h2>Keep your project<\/h2>[\s\S]*?<\/section>/.exec(h);
    if (m) {
      var card = m[0].replace("<h2>Keep your project</h2>", "<h2>Project file</h2>").replace(/<p class="count">Full backups retain ALL originals[^<]*<\/p>/, '<p class="count">' + (PROJECT.remember ? "Your work saves automatically in this browser (see Settings). " : "") + "Save a project file to move your work to another computer or send it to a colleague. It keeps every column, including sensitive columns tagged personal; leaving them out of saved CSV files does not apply to project files, so check before sharing.</p>");
      h = h.slice(m[0].length) + card;
    }
    return ds ? afterLede(h, codedCard(ds)) : h;
  };
})(VIEWS.data);
VIEWS.enhance = (function (base) {
  return function () {
    var h = base(), m = /^<section class="card"><h2>Relationship scan<\/h2>[\s\S]*?<\/section>/.exec(h);
    if (!m) return h;
    var ds = cur(), job = ds && ds.rows && REL.cache.get(ds.rows), card = m[0];
    if (job && job.state === "complete" && !job.findings.length) card = '<section class="card"><h2>Relationship scan</h2><p class="count" role="status" tabindex="-1" data-relationship-status="1">Checked ' + job.done + " pairs of columns: no near-duplicate or strongly linked columns found.</p></section>";
    return afterLede(h.slice(m[0].length), card);
  };
})(VIEWS.enhance);
var _relationshipPanelP = relationshipPanel;
relationshipPanel = function (job) {
  _relationshipPanelP(job);
  if (job && job.state === "complete" && !job.findings.length) { var b = view.querySelector("[data-relationship-show]"), s = view.querySelector("[data-relationship-status]"); if (b) b.remove(); if (s) s.textContent = "Checked " + job.done + " pairs of columns: no near-duplicate or strongly linked columns found."; }
};

// ---- Ratings stored one row per rating: point to the reshape tool with the columns already chosen ----
function longLayout(ds) {
  if (!ds || !ds.rows || ds.cols.length > 5) return null;
  var nums = ds.cols.filter(function (c) { return c.type === "number"; }), cats = ds.cols.filter(function (c) { return c.type !== "number" && c.type !== "empty"; });
  var count = function (c) { var j = idxOf(ds, c.name), u = Object.create(null); ds.rows.forEach(function (r) { if (r[j] != null) u[r[j]] = 1; }); return Object.keys(u).length; };
  var key = cats.filter(function (c) { var k = count(c); return k >= 2 && k <= 30 && k < ds.rows.length / 2; })[0]; if (!key) return null;
  var k = count(key), id = ds.cols.filter(function (c) { return c !== key && count(c) * k <= ds.rows.length * 1.05 && count(c) * k >= ds.rows.length * 0.6 && count(c) >= 3; })[0];
  var val = nums.filter(function (c) { return c !== id && c !== key; })[0];
  return id && val ? {id: id.name, key: key.name, val: val.name, k: k} : null;
}
var _runAnalysisL = runAnalysis;
runAnalysis = function (ds) {
  var R = _runAnalysisL(ds);
  if (R && /^(agree|reliability|rmanova|paired)$/.test(R.kind || A.kind) && /class="nd"/.test(R.head || "")) {
    var L = longLayout(ds);
    if (L) R.head = '<p class="nd">This table has one row per rating: <b>' + esc(L.id) + "</b> repeats for each <b>" + esc(L.key) + "</b>, and the scores are in <b>" + esc(L.val) + "</b>. This analysis needs one column per " + esc(L.key) + ".</p>" +
      '<div class="slot"><button type="button" class="btn btn-primary" data-longfix="1" data-lid="' + esc(L.id) + '" data-lkey="' + esc(L.key) + '" data-lval="' + esc(L.val) + '">Make one column per ' + esc(L.key) + "</button></div>";
  }
  return R;
};
view.addEventListener("click", function (e) {
  var b = e.target.closest("button[data-longfix]"); if (!b) return;
  DT.pivot = {id: b.dataset.lid, key: b.dataset.lkey, val: b.dataset.lval}; DT.open = "reshape"; nav("enhance");
  setTimeout(function () { var w = view.querySelector('[data-dt="widen"]'); if (w) { w.scrollIntoView({block: "center"}); w.focus(); } }, 0);
});

// ---- Phone: keep the current tab visible in the scrolling tab row ----
var _renderPT = render;
render = function () {
  _renderPT();
  var bar = document.getElementById("tabs"), a = bar && bar.querySelector('a[aria-current="page"]');
  if (a && bar.scrollWidth > bar.clientWidth + 1) { var l = a.offsetLeft - bar.offsetLeft, r = l + a.offsetWidth; if (l < bar.scrollLeft || r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = Math.max(0, l - 16); }
};
