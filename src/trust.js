var _trustNeed = need;
need = function (R, what) { R = _trustNeed(R, what); R.valid = false; R.reason = localText(R.head); R.reading = []; R.apa = ""; return R; };
// ---------- Versioned results and explicit data-quality decisions ----------
var DATA_VERSIONS = new WeakMap(), NEXT_VERSION = 1;
function objectVersion(obj) { if (!DATA_VERSIONS.has(obj)) DATA_VERSIONS.set(obj, NEXT_VERSION++); return DATA_VERSIONS.get(obj); }
function dataVersion(ds) { return [objectVersion(ds.rows), objectVersion(ds.cols)]; }
function browserProjectEstimate() {
  function table(rows) { if (!rows || !rows.length) return 0; var k = Math.min(32, rows.length), n = 0; for (var i = 0; i < k; i++) n += JSON.stringify(rows[Math.floor(i * rows.length / k)]).length + 1; return n / k * rows.length; }
  var size = JSON.stringify(WP.items).length + JSON.stringify(WF.steps).length + JSON.stringify(AUD.log).length;
  A.sets.forEach(function (ds) { size += table(ds.rows) + table(ds.rawRows) + JSON.stringify(ds.cols).length; var orig = E.orig[ds.id]; if (orig) size += table(orig.rows); (E.undo[ds.id] || []).forEach(function (u) { size += table(u.rows); }); });
  return size;
}
var _budgetCache = cacheProject;
cacheProject = function () {
  if (PROJECT.remember && browserProjectEstimate() > 1000000) { PROJECT.remember = false; PROJECT.storageMessage = "Browser autosave paused: this project exceeds the browser-storage budget. Save a project file before closing; the earlier browser copy is unchanged."; return; }
  return _budgetCache();
};
var _trustRender = render;
render = function () {
  if (MOD.job && (cur() !== MOD.job.ds || A.kind !== MOD.job.kind || st.tab !== "analyze" || modelCacheKey(MOD.job.ds) !== MOD.job.key)) { MOD.job = null; MOD.busy = ""; }
  var ds = cur();
  if (ds && Array.isArray(ds.rows)) {
    if (MOD.key && MOD.key !== modelCacheKey(ds)) { MOD.key = ""; MOD.res = null; MOD.compare = null; MOD.compareKey = ""; }
    if (MI.res && (MI.ds !== ds.rows || MI.key !== miInputKey(ds))) { MI.res = null; MI.ds = null; MI.key = ""; }
  }
  _trustRender();
};

function rangeFindings(ds) {
  var out = [];
  ds.cols.forEach(function (c, j) {
    if (!c.limits) return;
    var n = 0; ds.rows.forEach(function (r) { var v = r[j]; if (typeof v === "number" && ((c.limits.min != null && v < c.limits.min) || (c.limits.max != null && v > c.limits.max))) n++; });
    if (n) out.push({sev: "high", col: c.name, title: n + " values outside your valid range", detail: "Allowed: " + (c.limits.min == null ? "no lower bound" : c.limits.min) + " to " + (c.limits.max == null ? "no upper bound" : c.limits.max) + ", inclusive. Correct the source or edit the cells; no values were removed.", fix: null, src: "Your data-quality rule"});
  });
  return out;
}
var _trustChecks = checks;
checks = function (ds) { return _trustChecks(ds).concat(rangeFindings(ds)); };
var _rangeAnalysis = runAnalysis;
runAnalysis = function (ds) { var r = _rangeAnalysis(ds); rangeFindings({cols: ds.cols, rows: filterRows(ds)}).forEach(function (f) { r.caveats.push(f.col + ": " + f.title + ". These rows are still included; correct them or explicitly filter them before reporting."); }); return r; };
function rangeStep(ds, spec) {
  var j = idxOf(ds, spec.col); if (j < 0 || !isNum(ds.cols[j])) throw new Error("Choose a numeric column.");
  var lo = spec.min == null || spec.min === "" ? null : Number(spec.min), hi = spec.max == null || spec.max === "" ? null : Number(spec.max);
  if ((lo != null && !isFinite(lo)) || (hi != null && !isFinite(hi)) || (lo != null && hi != null && lo > hi)) throw new Error("Enter finite bounds with minimum no greater than maximum.");
  var cols = ds.cols.slice(), c = Object.assign({}, cols[j]);
  if (lo == null && hi == null) delete c.limits; else c.limits = {min: lo, max: hi}; cols[j] = c;
  return {rows: ds.rows, cols: cols, changed: 1};
}
var _trustReplay = replayStep;
replayStep = function (ds, spec) { return spec.op === "bounds" ? rangeStep(ds, spec) : _trustReplay(ds, spec); };
var _trustPyStep = pyStep, _trustRStep = rStep;
pyStep = function (s, ds) { return s.op === "bounds" ? "# Valid range: " + s.col.replace(/[\r\n]/g, " ") + " [" + s.min + ", " + s.max + "]; source values retained" : _trustPyStep(s, ds); };
rStep = function (s, ds) { return s.op === "bounds" ? "# Valid range: " + s.col.replace(/[\r\n]/g, " ") + " [" + s.min + ", " + s.max + "]; source values retained" : _trustRStep(s, ds); };
var RANGE = {col: "", min: "", max: "", msg: ""};
function rangeCard(ds) {
  var nums = ds.cols.filter(isNum); if (!nums.length) return "";
  if (RANGE.ds !== ds.id || idxOf(ds, RANGE.col) < 0) { RANGE.ds = ds.id; RANGE.col = nums[0].name; var lim = nums[0].limits; RANGE.min = lim && lim.min != null ? String(lim.min) : ""; RANGE.max = lim && lim.max != null ? String(lim.max) : ""; RANGE.msg = ""; }
  var findings = rangeFindings(ds);
  return '<section class="card"><h2>Valid ranges</h2><p class="count">Set bounds from your study protocol or business rules, such as age ≥ 0 or a percentage between 0 and 100. Bounds are inclusive; values are flagged, never deleted automatically.</p><div class="toolbar"><label class="field" for="range-col">Column<select id="range-col">' + nums.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === RANGE.col ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label><label class="field" for="range-min">Minimum (blank for none)<input id="range-min" type="number" step="any" value="' + esc(RANGE.min) + '"></label><label class="field" for="range-max">Maximum (blank for none)<input id="range-max" type="number" step="any" value="' + esc(RANGE.max) + '"></label></div><div class="slot"><button type="button" class="btn btn-primary" data-range-save="1">Save range</button><button type="button" class="btn" data-range-clear="1">Clear range</button></div>' + (RANGE.msg ? '<p class="how" role="status">' + esc(RANGE.msg) + '</p>' : '') + ds.cols.filter(function (c) { return c.limits; }).map(function (c) { return '<p class="count">' + esc(c.name) + ': ' + esc(c.limits.min == null ? 'no minimum' : c.limits.min) + ' to ' + esc(c.limits.max == null ? 'no maximum' : c.limits.max) + '</p>'; }).join('') + (findings.length ? '<p class="warn">' + esc(findings.map(function (f) { return f.col + ': ' + f.title; }).join('; ')) + '</p>' : '') + '</section>';
}
var _trustEnhance = VIEWS.enhance;
VIEWS.enhance = function () { var ds = cur(); return _trustEnhance() + (ds && ds.rows ? rangeCard(ds) : ""); };
var _trustData = VIEWS.data;
VIEWS.data = function () { return _trustData() + (cur() ? '<section class="card"><h2>Numeric units and precision</h2><p class="count">A value such as 2.5% is imported as 2.5 percentage points, not 0.025. Numeric calculations use binary floating-point arithmetic and may round decimal amounts. Original imported values remain available. For exact monetary ledgers, keep exact decimal strings or integer minor units within the safe integer range; EKM statistical results are not an accounting ledger.</p></section>' : ''); };
view.addEventListener("input", function (e) {
  if (e.target.id === "range-min") RANGE.min = e.target.value;
  if (e.target.id === "range-max") RANGE.max = e.target.value;
});
view.addEventListener("change", function (e) {
  if (e.target.id === "range-col") { RANGE.col = e.target.value; var c = colMeta(cur(), RANGE.col), lim = c && c.limits; RANGE.min = lim && lim.min != null ? String(lim.min) : ""; RANGE.max = lim && lim.max != null ? String(lim.max) : ""; RANGE.msg = ""; render(); refocus("#range-col"); }
  if (e.target.id === "range-min") RANGE.min = e.target.value;
  if (e.target.id === "range-max") RANGE.max = e.target.value;
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"), ds = cur(); if (!b || !ds || (!b.dataset.rangeSave && !b.dataset.rangeClear)) return;
  var spec = {op: "bounds", col: RANGE.col, min: b.dataset.rangeClear ? null : RANGE.min, max: b.dataset.rangeClear ? null : RANGE.max, text: "Set valid range for " + RANGE.col, unit: "rule"};
  try { rangeStep(ds, spec); RANGE.msg = b.dataset.rangeClear ? "Range cleared." : "Range saved. Check flagged values below and in the health check."; applyStep(ds, spec, function () { return rangeStep(ds, spec); }); } catch (err) { RANGE.msg = err.message; render(); }
});
var _trustSnapshot = projectSnapshot, _trustValidate = validateProject;
projectSnapshot = function () { var p = _trustSnapshot(); p.ranges = A.sets.map(function (ds) { return {id: ds.id, cols: ds.cols.filter(function (c) { return c.limits; }).map(function (c) { return {name: c.name, min: c.limits.min, max: c.limits.max}; })}; }); return p; };
validateProject = function (p) {
  var v = _trustValidate(p);
  (Array.isArray(p.ranges) ? p.ranges : []).forEach(function (r) { var ds = v.datasets.filter(function (d) { return d.id === r.id; })[0]; if (!ds || !Array.isArray(r.cols)) return; r.cols.forEach(function (c) { if (idxOf(ds, c.name) < 0) return; var res = rangeStep(ds, {col: c.name, min: c.min, max: c.max}); ds.cols = res.cols; }); });
  // Range metadata also belongs to undo snapshots.
  function limitsFrom(source, dest) { if (!source || !dest) return; dest.cols.forEach(function (c) { var sc = (source.cols || []).filter(function (x) { return x.name === c.name; })[0]; if (sc && sc.limits) { var temp = {cols: [c], rows: []}, result = rangeStep(temp, {col: c.name, min: sc.limits.min, max: sc.limits.max}); c.limits = result.cols[0].limits; } }); }
  v.datasets.forEach(function (ds) { var old = p.history || {}; limitsFrom((old.original || {})[ds.id], v.history.original[ds.id]); (v.history.undo[ds.id] || []).forEach(function (u, i) { limitsFrom(((old.undo || {})[ds.id] || [])[i], u); }); });
  return v;
};

// Browser restoration runs in the page bootstrap after all schema extensions.
