// ---------- Analyzer: people bring their own data ----------
// A dataset: {id, name, origin: "sample"|"file", source, note, added, cols: [{name, type}], rows: [[...]], saved}
var A = {sets: [], cur: null, kind: "describe", sel: {}, chart: {type: "histogram"}, msg: "", busy: "", ai: {}, del: null};
var MAX_SAVE = 4e6, CHUNK = 180000;

// --- parsing ---
function parseNum(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  var s = String(v == null ? "" : v).trim();
  if (!s || /^(na|n\/a|nan|null|none|-|—|\.|no data( found)?)$/i.test(s)) return null;
  var pct = /%$/.test(s); s = s.replace(/[%$€£¥\s]/g, "");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return undefined;
  return +s;
}
function isMissing(v) { return v == null || v === "" || parseNum(v) === null && !/\S/.test(String(v)) || /^(na|n\/a|nan|null|none|no data( found)?)$/i.test(String(v).trim()); }
function splitCSV(text) {
  text = String(text).replace(/^\uFEFF/, "");
  // Count separators only outside quoted cells in the first nonblank record.
  var counts = [0, 0, 0, 0], seps = [",", ";", "\t", "|"], quoted = false, started = false;
  for (var k = 0; k < text.length; k++) {
    var c = text[k];
    if (c === '"') { if (quoted && text[k + 1] === '"') k++; else quoted = !quoted; started = true; }
    else if (!quoted && (c === "\r" || c === "\n")) { if (started) break; }
    else if (!quoted) { var at = seps.indexOf(c); if (at >= 0) counts[at]++; if (/\S/.test(c)) started = true; }
  }
  var d = seps[counts.indexOf(Math.max.apply(null, counts))];
  var rows = [], row = [], cell = "", q = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (q) throw new Error("A quoted cell is not closed. Close the quote and try again.");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
}
function typeColumn(vals, name) {
  var present = vals.filter(function (v) { return !isMissing(v); });
  if (!present.length) return "empty";
  var numeric = present.filter(function (v) { return typeof parseNum(v) === "number"; }).length / present.length;
  if (numeric >= 0.9) {
    var ns = present.map(parseNum).filter(function (v) { return typeof v === "number"; });
    if (/year|año|ano|yr|anio/i.test(name) && ns.every(function (v) { return v === Math.round(v) && v >= 1800 && v <= 2200; })) return "year";
    return "number";
  }
  if (present.filter(function (v) { return /^\d{4}-\d{2}(-\d{2})?/.test(String(v)); }).length / present.length >= 0.9) return "date";
  var uniq = {}; present.forEach(function (v) { uniq[String(v).trim()] = 1; });
  var u = Object.keys(uniq).length;
  return u <= 40 || u / present.length < 0.3 ? "category" : "text";
}
function makeSet(name, header, body, origin, extra) {
  header = header.map(function (h, i) { h = String(h || "").trim(); return h || "Column " + (i + 1); });
  var seen = Object.create(null), reserved = Object.create(null);
  header.forEach(function (h) { reserved[h] = true; });
  header = header.map(function (h) { var n = h, i = 2; if (seen[n]) { do { n = h + " (" + i++ + ")"; } while (seen[n] || reserved[n]); } seen[n] = true; return n; });
  if (!header.length) throw new Error("No columns were found. Add a header row and try again.");
  body.forEach(function (r, i) { if (r.length > header.length) throw new Error("Data row " + (i + 1) + " has more values than the header. Add the missing column names or remove the extra values."); });
  var cols = header.map(function (h, j) { return {name: h, type: typeColumn(body.map(function (r) { return r[j]; }), h)}; });
  var rows = body.map(function (r) { return cols.map(function (c, j) { var v = r[j]; if (isMissing(v)) return null; if (c.type === "number" || c.type === "year") { var n = parseNum(v); return typeof n === "number" ? n : null; } return String(v).trim(); }); });
  return Object.assign({id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, origin: origin || "file", source: "", note: "", added: new Date().toISOString().slice(0, 10), cols: cols, rows: rows, saved: false}, extra || {});
}
function colVals(ds, j) { return ds.rows.map(function (r) { return r[j]; }); }
function idxOf(ds, name) { for (var j = 0; j < ds.cols.length; j++) if (ds.cols[j].name === name) return j; return -1; }
function cur() { for (var i = 0; i < A.sets.length; i++) if (A.sets[i].id === A.cur) return A.sets[i]; return A.sets[0]; }
function isNum(c) { return c.type === "number" || c.type === "year"; }

// --- private storage: data/users/<id>, split into chunks under 256 KB ---
var ST = {db: null, uid: null, on: false, loaded: false};
function stStart() {
  if (!window.claude || !window.claude.use) return;
  Promise.all([window.claude.use("db"), window.claude.use("user")]).then(function (r) {
    if (!r[0] || !r[1]) return;
    ST.db = r[0];
    return r[1].id().then(function (id) {
      if (!id) return; ST.uid = id; ST.on = true;
      return ST.db.collection("data/users/" + id).where("kind", "==", "dataset").get().then(function (snap) {
        snap.docs.forEach(function (d) { var m = d.data(); if (!m || A.sets.some(function (s) { return s.id === m.id; })) return; A.sets.push(Object.assign({}, m, {rows: null, saved: true})); });
        ST.loaded = true; render();
      });
    });
  }).catch(function () {});
}
function col() { return ST.db.collection("data/users/" + ST.uid); }
function saveSet(ds) {
  if (ds.origin === "sample") { if (!(ds.recipe || []).length) return Promise.resolve(); ds.origin = "file"; ds.name = ds.name.replace(" (example)", " (your copy)"); ds.id = "d" + Date.now().toString(36); A.cur = ds.id; }
  if (!ST.on) return Promise.resolve();
  var json = JSON.stringify(ds.rows);
  if (json.length > MAX_SAVE) { ds.saveNote = "Too large to keep (" + (json.length / 1e6).toFixed(1) + " MB, limit 4 MB). It works until you close the page."; return Promise.resolve(); }
  var parts = []; for (var i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
  var meta = {kind: "dataset", id: ds.id, name: ds.name, origin: "file", source: ds.source || "", note: ds.note || "", added: ds.added, cols: ds.cols, nRows: ds.rows.length, parts: parts.length, recipe: (ds.recipe || []).slice(-200)};
  return Promise.all(parts.map(function (p, i) { return col().doc(ds.id + "_p" + i).set({kind: "part", part: p}); }))
    .then(function () { return col().doc(ds.id).set(meta); }).then(function () { ds.saved = true; ds.saveNote = ""; render(); })
    .catch(function () { ds.saveNote = "Could not save. It still works until you close the page."; render(); });
}
function saveMeta(ds) { if (ST.on && ds.saved) col().doc(ds.id).update({name: ds.name, source: ds.source || "", note: ds.note || "", cols: ds.cols}).catch(function () {}); }
function loadRows(ds) {
  if (ds.rows || !ST.on) return Promise.resolve(ds);
  return Promise.all(Array.from({length: ds.parts}, function (_, i) { return col().doc(ds.id + "_p" + i).get(); }))
    .then(function (snaps) { ds.rows = JSON.parse(snaps.map(function (s) { return s.data().part; }).join("")); return ds; });
}
function deleteSet(ds) {
  A.sets = A.sets.filter(function (s) { return s.id !== ds.id; }); A.cur = A.sets[0] && A.sets[0].id; A.sel = {}; A.ai = {};
  if (ST.on && ds.saved) { var n = ds.parts || 0; col().doc(ds.id).delete().catch(function () {}); for (var i = 0; i < n; i++) col().doc(ds.id + "_p" + i).delete().catch(function () {}); }
}

// --- reading files ---
function readFile(file) {
  var name = file.name.replace(/\.[^.]+$/, ""), ext = (file.name.split(".").pop() || "").toLowerCase();
  A.busy = "Reading " + file.name + "…"; render();
  var done = function (ds) { A.busy = ""; if (!ds.rows.length) { A.msg = file.name + " has no data rows."; render(); return; } A.sets.unshift(ds); A.cur = ds.id; A.sel = {}; A.ai = {}; A.msg = ""; render(); saveSet(ds); };
  var fail = function (m) { A.busy = ""; A.msg = m; render(); };
  if (file.size > 25e6) return fail(file.name + " is " + (file.size / 1e6).toFixed(0) + " MB. Files up to 25 MB can be opened.");
  if (ext === "xlsx" || ext === "xls") {
    return loadXLSX().then(function (X) {
      return file.arrayBuffer().then(function (buf) {
        var wb = X.read(buf, {type: "array"}), sh = wb.Sheets[wb.SheetNames[0]];
        if (!sh) throw new Error("No worksheets were found.");
        var aoa = X.utils.sheet_to_json(sh, {header: 1, raw: true, defval: ""});
        aoa = aoa.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); });
        done(makeSet(name + (wb.SheetNames.length > 1 ? " (" + wb.SheetNames[0] + ")" : ""), aoa[0] || [], aoa.slice(1)));
      }).catch(function () { fail("Could not read " + file.name + ". Open it in a spreadsheet app and save it as XLSX or CSV, then try again."); });
    }).catch(function () { fail("The spreadsheet reader did not load. Save the sheet as CSV and add that instead."); });
  }
  return file.text().then(function (t) {
    if (ext === "json" || /^\s*[\[{]/.test(t)) {
      var j;
      try { j = JSON.parse(t); } catch (e) { return fail(file.name + " is not valid JSON. Check its commas, quotes and brackets, then try again."); }
      if (j && !Array.isArray(j) && typeof j === "object") j = j.data || j.rows || Object.values(j).filter(Array.isArray)[0];
      if (!Array.isArray(j) || j.some(function (o) { return !o || typeof o !== "object" || Array.isArray(o); }))
        return fail(file.name + " needs a JSON array of row objects, optionally inside data or rows. Export the table as CSV if needed.");
      var keys = []; j.forEach(function (o) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
      return done(makeSet(name, keys, j.map(function (o) { return keys.map(function (k) { var v = Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null; return v != null && typeof v === "object" ? JSON.stringify(v) : v; }); })));
    }
    var rows = splitCSV(t); if (rows.length < 2) return fail(file.name + " needs a header row and at least one data row.");
    done(makeSet(name, rows[0], rows.slice(1)));
  }).catch(function (e) { fail("Could not read " + file.name + ". " + (e && e.message || "Save the table as UTF-8 CSV and try again.")); });
}

var _xlsx = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsx) return _xlsx;
  _xlsx = new Promise(function (ok, no) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = function () { if (window.XLSX) ok(window.XLSX); else { _xlsx = null; s.remove(); no(new Error("Spreadsheet reader unavailable")); } }; s.onerror = function () { _xlsx = null; s.remove(); no(new Error("Spreadsheet reader unavailable")); }; document.head.appendChild(s); });
  return _xlsx;
}

// --- formatting ---
function f3(v) { if (v == null || !isFinite(v)) return "—"; var a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(2) + "M" : a >= 1000 ? Math.round(v).toLocaleString("en-US") : a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : a === 0 ? "0" : v.toPrecision(3); }
function fp(p) { return p == null || !isFinite(p) ? "—" : p < 0.001 ? "< 0.001" : p.toFixed(3); }
var TYPE_LABEL = {number: "Number", year: "Year", date: "Date", category: "Category", text: "Text", empty: "Empty"};

// --- built-in interpreter: plain-language reading of each result ---
function rWord(r) { var a = Math.abs(r); return a < 0.1 ? "almost no" : a < 0.3 ? "a weak" : a < 0.5 ? "a moderate" : a < 0.7 ? "a strong" : "a very strong"; }
function pWord(p) { return p < 0.001 ? "very unlikely to be chance alone (p < 0.001)" : p < 0.01 ? "unlikely to be chance alone (p = " + fp(p) + ")" : p < 0.05 ? "probably not chance alone, though the evidence is modest (p = " + fp(p) + ")" : "could easily be chance (p = " + fp(p) + ")"; }
function nCaveat(n) { return n < 10 ? "With only " + n + " data points, any pattern here is fragile; one changed row could flip it." : n < 30 ? "The sample is small (" + n + " rows), so treat exact numbers as rough." : ""; }

// --- analyses ---
var KINDS = [["describe", "Summarize a column"], ["compare", "Compare groups"], ["relate", "Two numbers"], ["cross", "Two categories"], ["trend", "Change over time"], ["regress", "Several predictors"]];
var KIND_HELP = {describe: "Typical value, spread and unusual values of one column.", compare: "Does a number differ between groups? (t-test or ANOVA)", relate: "Do two numbers move together? (correlation and a fitted line)", cross: "Are two categories linked? (crosstab and chi-square)", trend: "How a number changes over years or dates.", regress: "How several numbers together predict one outcome (multiple regression)."};

function pick(id, label, cols, cur, allowNone) {
  return '<label class="field" for="' + id + '">' + label + '<select id="' + id + '" data-asel="' + id + '">' + (allowNone ? '<option value="">None</option>' : "") +
    cols.map(function (c) { return "<option" + (c.name === cur ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></label>";
}
function defaults(ds) {
  var nums = ds.cols.filter(function (c) { return c.type === "number"; }), cats = ds.cols.filter(function (c) { return c.type === "category"; }), time = ds.cols.filter(function (c) { return c.type === "year" || c.type === "date"; });
  var s = A.sel, has = function (n) { return idxOf(ds, n) >= 0; };
  if (!has(s.y)) s.y = (nums[0] || {}).name; if (!has(s.x)) s.x = (nums[1] || nums[0] || {}).name;
  if (!has(s.g)) s.g = (cats[0] || {}).name; if (!has(s.g2)) s.g2 = (cats[1] || cats[0] || {}).name;
  if (!has(s.t)) s.t = (time[0] || {}).name; if (s.f && !has(s.f)) s.f = "";
  if (!s.preds) s.preds = nums.slice(1, 4).map(function (c) { return c.name; });
  s.preds = s.preds.filter(has);
  return {nums: nums, cats: cats, time: time};
}
function filterRows(ds) {   // optional subset: one category value
  if (!A.sel.f || !A.sel.fv) return ds.rows;
  var j = idxOf(ds, A.sel.f); return ds.rows.filter(function (r) { return String(r[j]) === A.sel.fv; });
}
function runAnalysis(ds) {
  var c = defaults(ds), s = A.sel, rows = filterRows(ds), get = function (n) { var j = idxOf(ds, n); return rows.map(function (r) { return r[j]; }); };
  var R = {kind: A.kind, controls: "", head: "", chart: "", reading: [], caveats: [], summary: {}};
  if (A.kind === "describe") {
    var all = ds.cols.filter(function (x) { return x.type !== "empty"; });
    var col = all.filter(function (x) { return x.name === s.y; })[0] || all[0]; s.y = col.name;
    R.controls = pick("y", "Column", all, s.y);
    var vals = get(s.y), miss = vals.filter(function (v) { return v == null; }).length;
    if (isNum(col)) {
      var d = S.describe(vals); R.summary = {column: s.y, n: d.n, mean: d.mean, sd: d.sd, median: d.median, min: d.min, max: d.max, skew: d.skew, outliers: d.outliers, missing: miss};
      R.head = figs([["Typical (median)", f3(d.median)], ["Average", f3(d.mean)], ["Spread (SD)", f3(d.sd)], ["Range", f3(d.min) + " to " + f3(d.max)], ["Rows", d.n + (miss ? " · " + miss + " missing" : "")]]);
      R.chart = histogram(S.nums(vals), s.y);
      R.reading.push("Half the rows are below " + f3(d.median) + " and half above. The middle half sits between " + f3(d.q1) + " and " + f3(d.q3) + ".");
      if (Math.abs(d.skew) > 1) R.reading.push("The values are lopsided (" + (d.skew > 0 ? "a long tail of high values" : "a long tail of low values") + "), so the median describes a typical row better than the average.");
      else R.reading.push("The values are roughly balanced around the middle, so the average and median tell a similar story.");
      if (d.outliers) R.caveats.push(d.outliers + " value" + (d.outliers > 1 ? "s sit" : " sits") + " far from the rest (beyond 1.5× the middle range). Check whether they are real or entry errors.");
      if (miss / vals.length > 0.2) R.caveats.push(Math.round(miss / vals.length * 100) + "% of rows have no value here. If they are missing for a reason, the summary may be biased.");
      if (nCaveat(d.n)) R.caveats.push(nCaveat(d.n));
    } else {
      var counts = {}; vals.forEach(function (v) { if (v != null) counts[v] = (counts[v] || 0) + 1; });
      var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }), n = vals.length - miss;
      R.summary = {column: s.y, n: n, distinct: top.length, top: top.slice(0, 5).map(function (k) { return [k, counts[k]]; }), missing: miss};
      R.head = figs([["Distinct values", top.length], ["Most common", esc(top[0] || "—")], ["Its share", n ? Math.round(counts[top[0]] / n * 100) + "%" : "—"], ["Rows", n + (miss ? " · " + miss + " missing" : "")]]);
      R.chart = bars(top.slice(0, 15).map(function (k) { return [k, counts[k]]; }), "Rows");
      R.reading.push(top.length + " different values. The most common is “" + esc(top[0]) + "” (" + counts[top[0]] + " rows)" + (top[1] ? ", then “" + esc(top[1]) + "” (" + counts[top[1]] + ")." : "."));
      if (top.length > 15) R.caveats.push("Only the 15 most common values are drawn.");
    }
  } else if (A.kind === "compare") {
    if (!c.nums.length || !c.cats.length) return need(R, "a number column and a category column");
    R.controls = pick("y", "Measure", c.nums, s.y) + pick("g", "Group by", c.cats, s.g);
    var y = get(s.y), g = get(s.g), groups = {};
    y.forEach(function (v, i) { if (typeof v === "number" && g[i] != null) (groups[g[i]] = groups[g[i]] || []).push(v); });
    var names = Object.keys(groups).filter(function (k) { return groups[k].length >= 2; }).sort(function (a, b) { return S.mean(groups[b]) - S.mean(groups[a]); });
    if (names.length < 2) return need(R, "at least two groups with two or more values each");
    var shown = names.slice(0, 12), ds2 = shown.map(function (k) { return S.describe(groups[k]); });
    R.chart = boxplot(shown, ds2, s.y);
    var tbl = '<div class="tablewrap"><table class="nosort"><thead><tr><th>' + esc(s.g) + "</th><th>Rows</th><th>Average</th><th>Median</th><th>SD</th></tr></thead><tbody>" +
      shown.map(function (k, i) { return "<tr><td>" + esc(k) + '</td><td class="num">' + ds2[i].n + '</td><td class="num">' + f3(ds2[i].mean) + '</td><td class="num">' + f3(ds2[i].median) + '</td><td class="num">' + f3(ds2[i].sd) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    if (names.length === 2) {
      var t = S.ttest(groups[names[0]], groups[names[1]]);
      R.summary = {test: "Welch t-test", measure: s.y, groups: names, means: [t.A.mean, t.B.mean], diff: t.diff, ci95: [t.ciLo, t.ciHi], t: t.t, df: t.df, p: t.p, cohen_d: t.d};
      R.head = figs([["Difference in averages", f3(t.diff)], ["95% range for it", f3(t.ciLo) + " to " + f3(t.ciHi)], ["p-value", fp(t.p)], ["Effect size (d)", f3(t.d)]], true) + tbl;
      R.reading.push("“" + esc(names[0]) + "” averages " + f3(t.A.mean) + " against " + f3(t.B.mean) + " for “" + esc(names[1]) + "”, a difference of " + f3(t.diff) + ". That gap " + pWord(t.p) + ".");
      R.reading.push("The effect is " + (Math.abs(t.d) < 0.2 ? "negligible" : Math.abs(t.d) < 0.5 ? "small" : Math.abs(t.d) < 0.8 ? "medium" : "large") + " (Cohen's d = " + f3(t.d) + "). The true difference most plausibly lies between " + f3(t.ciLo) + " and " + f3(t.ciHi) + ".");
    } else {
      var an = S.anova(names.map(function (k) { return groups[k]; }));
      R.summary = {test: "One-way ANOVA", measure: s.y, groups: names.length, F: an.F, df: [an.df1, an.df2], p: an.p, eta2: an.eta2, highest: names[0], lowest: names[names.length - 1]};
      R.head = figs([["F", f3(an.F)], ["Groups", names.length], ["p-value", fp(an.p)], ["Share explained by group", Math.round(an.eta2 * 100) + "%"]], true) + tbl;
      R.reading.push("Across " + names.length + " groups, the differences in " + esc(s.y) + " are " + pWord(an.p) + ".");
      R.reading.push("Group membership accounts for about " + Math.round(an.eta2 * 100) + "% of the variation. Highest: “" + esc(names[0]) + "”; lowest: “" + esc(names[names.length - 1]) + "”.");
      if (an.p < 0.05) R.caveats.push("ANOVA says some groups differ, not which ones. Compare the two groups you care about directly before drawing conclusions about them.");
      if (names.length > 12) R.caveats.push("Only the 12 groups with the highest averages are drawn.");
    }
    var small = names.filter(function (k) { return groups[k].length < 5; }).length;
    if (small) R.caveats.push(small + " group" + (small > 1 ? "s have" : " has") + " fewer than 5 rows; their averages are unreliable.");
    R.caveats.push("A difference between groups does not show the grouping causes it; other factors may differ between the groups too.");
  } else if (A.kind === "relate") {
    if (c.nums.length < 2) return need(R, "two number columns");
    R.controls = pick("x", "First number (across)", c.nums, s.x) + pick("y", "Second number (up)", c.nums, s.y);
    var co = S.correlate(get(s.x), get(s.y));
    if (co.n < 3) return need(R, "at least three rows with both values");
    R.summary = {test: "Pearson and Spearman correlation", x: s.x, y: s.y, n: co.n, r: co.r, ci95: [co.ciLo, co.ciHi], p: co.p, spearman: co.rho, slope: co.slope, r2: co.r2};
    R.head = figs([["Correlation (r)", f3(co.r)], ["95% range for r", f3(co.ciLo) + " to " + f3(co.ciHi)], ["p-value", fp(co.p)], ["Rows used", co.n]], true);
    R.chart = scatter(co.x, co.y, s.x, s.y, co);
    R.reading.push("There is " + rWord(co.r) + " " + (co.r >= 0 ? "positive" : "negative") + " link: when " + esc(s.x) + " is higher, " + esc(s.y) + " tends to be " + (co.r >= 0 ? "higher" : "lower") + ". It is " + pWord(co.p) + ".");
    R.reading.push("On the fitted line, each 1-unit rise in " + esc(s.x) + " goes with a change of " + f3(co.slope) + " in " + esc(s.y) + ". " + esc(s.x) + " accounts for about " + Math.round(co.r2 * 100) + "% of the variation in " + esc(s.y) + ".");
    if (Math.abs(co.rho - co.r) > 0.2) R.caveats.push("The rank-based correlation (" + f3(co.rho) + ") differs from r, so a few extreme points or a curved pattern may be driving the result. Look at the chart.");
    R.caveats.push("Correlation is not causation: a third factor can drive both numbers.");
    if (nCaveat(co.n)) R.caveats.push(nCaveat(co.n));
  } else if (A.kind === "cross") {
    if (c.cats.length < 2) return need(R, "two category columns");
    R.controls = pick("g", "Rows", c.cats, s.g) + pick("g2", "Columns", c.cats, s.g2);
    var a = get(s.g), b = get(s.g2), ra = {}, cb = {}, cells = {};
    a.forEach(function (v, i) { if (v == null || b[i] == null) return; ra[v] = (ra[v] || 0) + 1; cb[b[i]] = (cb[b[i]] || 0) + 1; cells[v + "\u0000" + b[i]] = (cells[v + "\u0000" + b[i]] || 0) + 1; });
    var rk = Object.keys(ra).sort(function (p, q) { return ra[q] - ra[p]; }).slice(0, 12), ck = Object.keys(cb).sort(function (p, q) { return cb[q] - cb[p]; }).slice(0, 8);
    if (rk.length < 2 || ck.length < 2 || s.g === s.g2) return need(R, "two different category columns with at least two values each");
    var table = rk.map(function (r) { return ck.map(function (k) { return cells[r + "\u0000" + k] || 0; }); }), ch = S.chisq(table);
    R.summary = {test: "Chi-square test of independence", rows: s.g, columns: s.g2, x2: ch.x2, df: ch.df, p: ch.p, cramers_v: ch.v, n: ch.n};
    R.head = figs([["Chi-square", f3(ch.x2)], ["p-value", fp(ch.p)], ["Strength (Cramér's V)", f3(ch.v)], ["Rows used", ch.n]], true) +
      '<div class="tablewrap"><table class="nosort"><thead><tr><th>' + esc(s.g) + " \\ " + esc(s.g2) + "</th>" + ck.map(function (k) { return "<th>" + esc(k) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rk.map(function (r, i) { var tot = table[i].reduce(function (x, y) { return x + y; }, 0); return "<tr><td>" + esc(r) + "</td>" + table[i].map(function (v) { return '<td class="num">' + v + ' <span class="count">' + Math.round(v / tot * 100) + "%</span></td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    R.reading.push("Whether " + esc(s.g2) + " varies with " + esc(s.g) + ": the pattern is " + pWord(ch.p) + ". The link is " + (ch.v < 0.1 ? "negligible" : ch.v < 0.3 ? "weak" : ch.v < 0.5 ? "moderate" : "strong") + " (V = " + f3(ch.v) + ").");
    R.reading.push("Percentages in the table are within each row, so compare them down a column.");
    if (ch.lowExpected > 0.2) R.caveats.push("Many cells have small expected counts, so the p-value is approximate. Merge rare categories for a firmer answer.");
    if (Object.keys(ra).length > 12 || Object.keys(cb).length > 8) R.caveats.push("Only the most common values are tested; rarer ones were left out.");
  } else if (A.kind === "trend") {
    if (!c.time.length || !c.nums.length) return need(R, "a year or date column and a number column");
    R.controls = pick("t", "Time", c.time, s.t) + pick("y", "Measure", c.nums, s.y) + pick("g", "Separate lines by", c.cats, s.g, true);
    var tcol = ds.cols[idxOf(ds, s.t)], tv = get(s.t).map(function (v) { return tcol.type === "year" ? v : v ? Date.parse(String(v).slice(0, 10)) / (365.25 * 864e5) + 1970 : null; }), yv = get(s.y), gv = s.g ? get(s.g) : null, series = {};
    tv.forEach(function (t2, i) { if (t2 == null || typeof yv[i] !== "number") return; var k = gv ? (gv[i] == null ? "(none)" : gv[i]) : s.y; (series[k] = series[k] || {}); (series[k][t2] = series[k][t2] || []).push(yv[i]); });
    var keys = Object.keys(series).slice(0, 7);
    if (!keys.length) return need(R, "rows with both a time and a value");
    var lines = keys.map(function (k) { return {name: k, pts: Object.keys(series[k]).map(Number).sort(function (p, q) { return p - q; }).map(function (t3) { return [t3, S.mean(series[k][t3])]; })}; });
    R.chart = lineChart(lines, s.t, s.y);
    R.summary = {measure: s.y, by: s.g || null, series: lines.map(function (l) { var f = l.pts[0], z = l.pts[l.pts.length - 1], co2 = S.correlate(l.pts.map(function (p) { return p[0]; }), l.pts.map(function (p) { return p[1]; })); return {name: l.name, from: f, to: z, change_pct: f[1] ? (z[1] - f[1]) / Math.abs(f[1]) * 100 : null, slope_per_year: co2.slope, p: co2.p}; })};
    R.head = figs(R.summary.series.slice(0, 4).map(function (x) { return [esc(x.name) + " " + Math.round(x.from[0]) + "→" + Math.round(x.to[0]), (x.change_pct == null ? "—" : (x.change_pct > 0 ? "+" : "") + x.change_pct.toFixed(0) + "%")]; }));
    R.summary.series.forEach(function (x) {
      R.reading.push(esc(x.name) + ": from " + f3(x.from[1]) + " (" + Math.round(x.from[0]) + ") to " + f3(x.to[1]) + " (" + Math.round(x.to[0]) + "), " + (x.slope_per_year > 0 ? "rising" : "falling") + " about " + f3(Math.abs(x.slope_per_year)) + " a year on average" + (x.p < 0.05 ? "." : ", though the year-to-year movement is too irregular to call it a steady trend."));
      var fl = flatTail(x.name, series[x.name]); if (fl) R.caveats.push(esc(x.name) + " is identical every year from " + fl + ". Values that stop changing are often carried forward, not measured.");
    });
    if (keys.length < Object.keys(series).length) R.caveats.push("Only the first 7 lines are drawn.");
    R.caveats.push("An average yearly change smooths over turns in direction; read the chart for those.");
  } else if (A.kind === "regress") {
    if (c.nums.length < 2) return need(R, "an outcome and at least one predictor (number columns)");
    var preds = c.nums.filter(function (x) { return x.name !== s.y; });
    R.controls = pick("y", "Outcome", c.nums, s.y) + '<fieldset class="field preds"><legend>Predictors</legend>' + preds.map(function (x) {
      return '<label class="chk"><input type="checkbox" data-pred="' + esc(x.name) + '"' + (s.preds.indexOf(x.name) >= 0 ? " checked" : "") + "> " + esc(x.name) + "</label>"; }).join("") + "</fieldset>";
    var use = s.preds.filter(function (p) { return p !== s.y; });
    if (!use.length) return need(R, "at least one predictor ticked");
    var X = rows.map(function (r) { return use.map(function (p) { return r[idxOf(ds, p)]; }); }), o = S.ols(get(s.y), X, use);
    if (o.error) { R.head = '<p class="nd">' + esc(o.error) + "</p>"; return R; }
    R.summary = {test: "Ordinary least squares", outcome: s.y, n: o.n, r2: o.r2, adj_r2: o.adj, p_model: o.pF, coefficients: o.coefs.map(function (k) { return {name: k.name, b: k.b, ci95: [k.lo, k.hi], p: k.p}; })};
    R.head = figs([["Explained (R²)", Math.round(o.r2 * 100) + "%"], ["Adjusted R²", Math.round(o.adj * 100) + "%"], ["Model p-value", fp(o.pF)], ["Complete rows", o.n]], true) +
      '<div class="tablewrap"><table class="nosort"><thead><tr><th>Term</th><th>Effect</th><th>95% range</th><th>p-value</th></tr></thead><tbody>' +
      o.coefs.map(function (k) { return "<tr><td>" + esc(k.name) + '</td><td class="num">' + f3(k.b) + '</td><td class="num">' + f3(k.lo) + " to " + f3(k.hi) + '</td><td class="num">' + fp(k.p) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    R.chart = coefChart(o.coefs.slice(1));
    R.reading.push("Together, the predictors account for about " + Math.round(o.r2 * 100) + "% of the variation in " + esc(s.y) + " across " + o.n + " complete rows.");
    o.coefs.slice(1).forEach(function (k) {
      R.reading.push("Holding the others fixed, each 1-unit rise in " + esc(k.name) + " goes with a change of " + f3(k.b) + " in " + esc(s.y) + (k.p < 0.05 ? " (a clear effect, p = " + fp(k.p) + ")." : " (not clearly different from zero, p = " + fp(k.p) + ")."));
    });
    if (o.n < 10 * use.length) R.caveats.push("A common rule of thumb asks for about 10 rows per predictor; this model has " + o.n + " rows for " + use.length + ". Results may not hold on new data.");
    R.caveats.push("Effects are associations after adjusting for the listed predictors only; anything left out can still confound them.");
    var dropped = ds.rows.length - o.n; if (dropped > 0) R.caveats.push(dropped + " rows were left out because a value was missing.");
  }
  if (A.sel.f && A.sel.fv) R.caveats.unshift("Only rows where " + esc(A.sel.f) + " is “" + esc(A.sel.fv) + "” are included.");
  return R;
}
function flatTail(name, byYear) { var ys = Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; }), v = ys.map(function (y) { return S.mean(byYear[y]); }), n = v.length, i = n - 1; while (i > 0 && v[i - 1] === v[n - 1]) i--; return n - i >= 4 ? Math.round(ys[i]) + " to " + Math.round(ys[n - 1]) : ""; }
function need(R, what) { R.head = '<p class="nd">This analysis needs ' + what + ". Pick another analysis or change column types under Your data.</p>"; return R; }
var FIGPREV = {};
function rewrite(key, val) { var c = FIGPREV[key] != null && FIGPREV[key] !== String(val) ? " rewrite" : ""; FIGPREV[key] = String(val); return c; }
function figs(list, keyFirst) { return '<div class="figs afigs">' + list.map(function (x, i) { return '<div class="fig' + (keyFirst && !i ? " key" : "") + '"><span class="label">' + x[0] + '</span><b class="num' + rewrite(A.kind + x[0], x[1]) + '">' + x[1] + "</b></div>"; }).join("") + "</div>"; }

// --- charts (SVG, sized to scale, colored by theme tokens) ---
function CW() { return window.matchMedia && matchMedia("(max-width: 600px)").matches ? 360 : 640; }
function LW(W) { return W < 400 ? 112 : 196; }
var PAL = ["var(--blue)", "var(--yellow)", "var(--pink)", "var(--green)", "var(--orange)", "var(--violet)", "var(--chalk-2)"];
function ticks(lo, hi, n) { if (lo === hi) { lo -= 1; hi += 1; } var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = n / span * step; step *= err <= 0.15 ? 10 : err <= 0.35 ? 5 : err <= 0.75 ? 2 : 1; var t = [], s = Math.ceil(lo / step) * step; for (var v = s; v <= hi + step * 1e-9; v += step) t.push(+v.toPrecision(12)); return t; }
function frame(W, H, x, y, xt, yt, xl, yl, body, xfmt) {
  var g = '<svg viewBox="0 0 ' + W + " " + H + '" class="achart" role="img" aria-label="' + esc(yl + " by " + xl) + '">';
  yt.forEach(function (v) { g += '<line x1="56" x2="' + (W - 12) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)"/><text x="50" y="' + (y(v) + 4) + '" text-anchor="end" class="tk">' + f3(v) + "</text>"; });
  xt.forEach(function (v) { g += '<text x="' + x(v) + '" y="' + (H - 26) + '" text-anchor="middle" class="tk">' + (xfmt ? xfmt(v) : f3(v)) + "</text>"; });
  return g + body + '<text x="' + ((W + 56) / 2) + '" y="' + (H - 6) + '" text-anchor="middle" class="ax">' + esc(xl) + '</text>' + (W < 400 ? '<text x="60" y="11" text-anchor="start" class="ax">' + esc(yl) + "</text>" : '<text x="14" y="' + (H / 2) + '" text-anchor="middle" class="ax" transform="rotate(-90 14 ' + (H / 2) + ')">' + esc(yl) + "</text>") + "</svg>";
}
function histogram(v, label) {
  if (v.length < 2) return "";
  var W = CW(), H = 300, lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), k = Math.max(5, Math.min(30, Math.ceil(Math.log2(v.length) + 1))), w = (hi - lo) / k || 1, bins = new Array(k).fill(0);
  v.forEach(function (x) { bins[Math.min(k - 1, Math.floor((x - lo) / w))]++; });
  var ym = Math.max.apply(null, bins), yt = ticks(0, ym, 4), xt = ticks(lo, hi, W < 400 ? 4 : 6).filter(function (t) { return t >= lo && t <= hi; });
  var x = function (t) { return 56 + (t - lo) / ((hi - lo) || 1) * (W - 68); }, y = function (c) { return H - 40 - c / yt[yt.length - 1] * (H - 60); };
  var body = bins.map(function (c, i) { var x0 = x(lo + i * w), x1 = x(lo + (i + 1) * w); return '<rect x="' + (x0 + 1) + '" y="' + y(c) + '" width="' + Math.max(1, x1 - x0 - 2) + '" height="' + (H - 40 - y(c)) + '" fill="var(--accent)" opacity="0.85"><title>' + f3(lo + i * w) + "–" + f3(lo + (i + 1) * w) + ": " + c + "</title></rect>"; }).join("");
  return frame(W, H, x, y, xt, yt, label, "Rows", body);
}
function bars(items, yl) {
  var W = CW(), rowH = 26, H = items.length * rowH + 30, mx = Math.max.apply(null, items.map(function (i) { return i[1]; })) || 1;
  var g = '<svg viewBox="0 0 ' + W + " " + H + '" class="achart" role="img" aria-label="' + esc(yl) + '">';
  items.forEach(function (it, i) { var L = LW(W), w = it[1] / mx * (W - L - 64), yy = 10 + i * rowH; g += '<text x="' + (L - 6) + '" y="' + (yy + 15) + '" text-anchor="end" class="tk">' + esc(String(it[0]).slice(0, W < 400 ? 14 : 28)) + '</text><rect x="' + L + '" y="' + (yy + 3) + '" width="' + Math.max(1, w) + '" height="16" rx="2" fill="var(--accent)"/><text x="' + (L + 4 + w) + '" y="' + (yy + 15) + '" class="tk">' + f3(it[1]) + "</text>"; });
  return g + "</svg>";
}
function boxplot(names, ds2, yl) {
  var W = CW(), rowH = 30, H = names.length * rowH + 44, lo = Math.min.apply(null, ds2.map(function (d) { return d.min; })), hi = Math.max.apply(null, ds2.map(function (d) { return d.max; })), xt = ticks(lo, hi, 6).filter(function (t) { return t >= lo && t <= hi; });
  var L = LW(W), x = function (v) { return L + (v - lo) / ((hi - lo) || 1) * (W - L - 16); };
  var g = '<svg viewBox="0 0 ' + W + " " + H + '" class="achart" role="img" aria-label="' + esc(yl) + ' by group">';
  xt.forEach(function (t) { g += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="6" y2="' + (H - 34) + '" stroke="var(--line)"/><text x="' + x(t) + '" y="' + (H - 20) + '" text-anchor="middle" class="tk">' + f3(t) + "</text>"; });
  names.forEach(function (n, i) { var d = ds2[i], yy = 10 + i * rowH; g += '<text x="' + (L - 6) + '" y="' + (yy + 14) + '" text-anchor="end" class="tk">' + esc(String(n).slice(0, W < 400 ? 14 : 28)) + '</text><line x1="' + x(d.min) + '" x2="' + x(d.max) + '" y1="' + (yy + 10) + '" y2="' + (yy + 10) + '" stroke="var(--muted)"/><rect x="' + x(d.q1) + '" y="' + (yy + 2) + '" width="' + Math.max(2, x(d.q3) - x(d.q1)) + '" height="16" fill="var(--accent-soft)" stroke="var(--accent)"/><line x1="' + x(d.median) + '" x2="' + x(d.median) + '" y1="' + (yy + 2) + '" y2="' + (yy + 18) + '" stroke="var(--accent)" stroke-width="2.5"/><circle cx="' + x(d.mean) + '" cy="' + (yy + 10) + '" r="3" fill="var(--ink)"><title>Average ' + f3(d.mean) + "</title></circle>"; });
  return g + '<text x="' + ((W + L) / 2) + '" y="' + (H - 4) + '" text-anchor="middle" class="ax">' + esc(yl) + " (box = middle half, line = median, dot = average)</text></svg>";
}
function scatter(xs, ys, xl, yl, co) {
  var W = CW(), H = 340, xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs), ylo = Math.min.apply(null, ys), yhi = Math.max.apply(null, ys), xt = ticks(xlo, xhi, W < 400 ? 4 : 6), yt = ticks(ylo, yhi, 5);
  xlo = Math.min(xlo, xt[0]); xhi = Math.max(xhi, xt[xt.length - 1]); ylo = Math.min(ylo, yt[0]); yhi = Math.max(yhi, yt[yt.length - 1]);
  var x = function (v) { return 56 + (v - xlo) / ((xhi - xlo) || 1) * (W - 68); }, y = function (v) { return H - 40 - (v - ylo) / ((yhi - ylo) || 1) * (H - 56); };
  var body = xs.map(function (v, i) { return '<circle cx="' + x(v) + '" cy="' + y(ys[i]) + '" r="3.5" fill="var(--accent)" opacity="0.7"/>'; }).join("");
  if (co) body += '<line x1="' + x(xlo) + '" y1="' + y(co.intercept + co.slope * xlo) + '" x2="' + x(xhi) + '" y2="' + y(co.intercept + co.slope * xhi) + '" stroke="var(--ve)" stroke-width="2"/>';
  return frame(W, H, x, y, xt, yt, xl, yl, body);
}
function lineChart(lines, xl, yl) {
  var W = CW(), H = 320, all = [].concat.apply([], lines.map(function (l) { return l.pts; })), xs = all.map(function (p) { return p[0]; }), ys = all.map(function (p) { return p[1]; });
  var xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs), yt = ticks(Math.min(0, Math.min.apply(null, ys)), Math.max.apply(null, ys), 5), xt = ticks(xlo, xhi, W < 400 ? 4 : 6).filter(function (t) { return t >= xlo && t <= xhi; });
  var x = function (v) { return 56 + (v - xlo) / ((xhi - xlo) || 1) * (W - 68); }, y = function (v) { return H - 40 - (v - yt[0]) / ((yt[yt.length - 1] - yt[0]) || 1) * (H - 56); };
  var body = lines.map(function (l, i) { return '<polyline fill="none" stroke="' + PAL[i % PAL.length] + '" stroke-width="2" points="' + l.pts.map(function (p) { return x(p[0]) + "," + y(p[1]); }).join(" ") + '"/>' + l.pts.map(function (p) { return '<circle cx="' + x(p[0]) + '" cy="' + y(p[1]) + '" r="2.5" fill="' + PAL[i % PAL.length] + '"><title>' + esc(l.name) + " " + Math.round(p[0]) + ": " + f3(p[1]) + "</title></circle>"; }).join(""); }).join("");
  var legend = '<div class="legend">' + lines.map(function (l, i) { return '<span><i style="background:' + PAL[i % PAL.length] + '"></i>' + esc(l.name) + "</span>"; }).join("") + "</div>";
  return frame(W, H, x, y, xt, yt, xl, yl, body, function (v) { return String(Math.round(v)); }) + (lines.length > 1 ? legend : "");
}
function coefChart(coefs) {
  if (!coefs.length) return "";
  var W = CW(), rowH = 30, H = coefs.length * rowH + 44, lo = Math.min(0, Math.min.apply(null, coefs.map(function (c) { return c.lo; }))), hi = Math.max(0, Math.max.apply(null, coefs.map(function (c) { return c.hi; }))), xt = ticks(lo, hi, 5).filter(function (t) { return t >= lo && t <= hi; });
  var L = LW(W), x = function (v) { return L + (v - lo) / ((hi - lo) || 1) * (W - L - 16); };
  var g = '<svg viewBox="0 0 ' + W + " " + H + '" class="achart" role="img" aria-label="Effect of each predictor with 95% range">';
  xt.forEach(function (t) { g += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="6" y2="' + (H - 34) + '" stroke="' + (t === 0 ? "var(--muted)" : "var(--line)") + '"/><text x="' + x(t) + '" y="' + (H - 20) + '" text-anchor="middle" class="tk">' + f3(t) + "</text>"; });
  coefs.forEach(function (c, i) { var yy = 10 + i * rowH + 10, col = c.p < 0.05 ? "var(--accent)" : "var(--neutral)"; g += '<text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" class="tk">' + esc(String(c.name).slice(0, W < 400 ? 14 : 28)) + '</text><line x1="' + x(c.lo) + '" x2="' + x(c.hi) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + col + '" stroke-width="2"/><circle cx="' + x(c.b) + '" cy="' + yy + '" r="4.5" fill="' + col + '"/>'; });
  return g + '<text x="' + ((W + L) / 2) + '" y="' + (H - 4) + '" text-anchor="middle" class="ax">Effect per 1-unit rise, with 95% range (grey = not clearly different from zero)</text></svg>';
}

// --- Ask Claude (sends the summary only, never the rows) ---
function askClaude(ds, R) {
  var key = A.kind + JSON.stringify(A.sel);
  A.ai[key] = {text: "", state: "wait"}; render();
  if (!window.claude || !window.claude.use) { A.ai[key] = {state: "off"}; render(); return; }
  window.claude.use("sample").then(function (sample) {
    if (!sample) { A.ai[key] = {state: "off"}; render(); return; }
    var q = (document.getElementById("aiq") || {}).value || "";
    var prompt = "You are a careful statistician explaining results to someone without statistics training.\n" +
      "Dataset: " + ds.name + " (" + (ds.rows ? ds.rows.length : ds.nRows) + " rows). Columns: " + ds.cols.map(function (c) { return c.name + " [" + c.type + "]"; }).join(", ") + ".\n" +
      (ds.source ? "Source given by the user: " + ds.source + "\n" : "") +
      "Analysis: " + KIND_HELP[A.kind] + "\nResults (JSON): " + JSON.stringify(R.summary) + "\nAutomatic notes already shown: " + R.reading.concat(R.caveats).join(" ").replace(/<[^>]+>/g, "") + "\n" +
      (q ? "The user asks: " + q + "\n" : "") +
      "Write 120-200 words in plain language: what the result means, how sure we can be, what it does not show, and one sensible next step. Use only these numbers; do not invent data. No headings.";
    var ctl = new AbortController(); A.ai[key].ctl = ctl;
    return sample(prompt, {cache: false, signal: ctl.signal, onText: function (o) { A.ai[key] = {text: o.text, state: "stream", ctl: ctl}; var el = document.getElementById("aiout"); if (el) el.textContent = o.text; else render(); }})
      .then(function (res) { A.ai[key] = {text: res.text, state: "done"}; render(); });
  }).catch(function (e) {
    A.ai[key] = {state: "error", text: e && e.code === "not_granted" ? "Claude explanations are turned off for this page. The built-in reading above still applies." : e && e.code === "rate_limited" ? "Claude is busy. Try again in a minute." : "Could not reach Claude. The built-in reading above still applies."};
    render();
  });
}

// --- views ---
function noData(title, text) { return '<h1 class="vt">' + title + '</h1><p class="lede">' + text + "</p><p>" + go2("data", "Add a dataset") + "</p>"; }
function dataView() {
  var ds = cur(), store = ST.on ? "Your files are kept privately for you: nobody else, the page owner included, can read them." : "Sign in to Claude to keep your files between visits. For now they stay in this browser tab.";
  var add = '<section class="card drop" id="drop" aria-labelledby="add-h"><h2 id="add-h">Add your data</h2><p class="count">CSV, TSV, Excel (.xlsx) or JSON, up to 25 MB. The first row should name the columns. ' + store + "</p>" +
    '<div class="slot"><label class="btn btn-primary" for="afile">Choose a file</label><input type="file" id="afile" accept=".csv,.tsv,.txt,.json,.xlsx,.xls" class="sr-file"><span class="count">or drop it here</span></div>' +
    '<details class="paste"><summary>Paste from a spreadsheet instead</summary><textarea id="apaste" rows="5" placeholder="Paste cells with a header row"></textarea><button type="button" class="btn" data-apaste="1">Use pasted data</button></details>' +
    (A.busy ? '<p class="count" role="status">' + esc(A.busy) + "</p>" : "") + (A.msg ? '<p class="warn" role="alert">' + esc(A.msg) + "</p>" : "") + "</section>";
  var list = '<section class="card"><h2>Datasets</h2><ul class="plain dslist">' + A.sets.map(function (s) {
    var on = ds && s.id === ds.id;
    return '<li class="' + (on ? "on" : "") + '"><button type="button" class="linkbtn" data-ads="' + s.id + '"' + (on ? ' aria-current="true"' : "") + ">" + esc(s.name) + '</button> <span class="chip ' + (s.origin === "sample" ? "q-reported" : "q-verified") + '">' + (s.origin === "sample" ? "Example" : "Yours") + '</span><div class="count">' + (s.rows ? s.rows.length : s.nRows) + " rows · " + s.cols.length + " columns" + (s.origin === "file" ? (s.saved ? " · saved" : ST.on ? " · not saved" : "") : "") + "</div></li>";
  }).join("") + "</ul></section>";
  if (!ds) return emptyData(add);
  if (!ds.rows) { loadRows(ds).then(render).catch(function () { A.msg = "Could not load " + ds.name + "."; render(); }); return '<div class="agrid"><div class="amain"><p class="count" role="status">Loading ' + esc(ds.name) + "…</p></div><div>" + add + list + "</div></div>"; }
  var prof = '<div class="tablewrap"><table class="nosort"><thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Summary</th><th>Check</th></tr></thead><tbody>' + ds.cols.map(function (c, j) {
    var v = colVals(ds, j), miss = v.filter(function (x) { return x == null; }).length, sum = "", flag = [];
    if (isNum(c)) { var d = S.describe(v); sum = "median " + f3(d.median) + " · " + f3(d.min) + " to " + f3(d.max); if (d.outliers) flag.push(d.outliers + " unusual"); if (d.sd === 0) flag.push("never changes"); }
    else { var u = {}; v.forEach(function (x) { if (x != null) u[x] = (u[x] || 0) + 1; }); var k = Object.keys(u).sort(function (a, b) { return u[b] - u[a]; }); sum = k.length + " distinct" + (k[0] ? " · most often “" + esc(String(k[0]).slice(0, 24)) + "”" : ""); if (k.length === 1) flag.push("one value only"); }
    if (miss / v.length > 0.5) flag.push("mostly empty");
    return "<tr><td><b>" + esc(c.name) + '</b></td><td><select data-atype="' + j + '" aria-label="Type of ' + esc(c.name) + '">' + ["number", "year", "date", "category", "text"].map(function (t) { return '<option value="' + t + '"' + (c.type === t ? " selected" : "") + ">" + TYPE_LABEL[t] + "</option>"; }).join("") + '</select></td><td class="num">' + (miss ? Math.round(miss / v.length * 100) + "%" : "—") + "</td><td>" + sum + "</td><td>" + flag.map(function (f) { return '<span class="chip q-estimated">' + f + "</span>"; }).join(" ") + "</td></tr>";
  }).join("") + "</tbody></table></div>";
  var prev = '<div class="tablewrap"><table class="nosort"><thead><tr>' + ds.cols.map(function (c) { return "<th>" + esc(c.name) + "</th>"; }).join("") + "</tr></thead><tbody>" +
    ds.rows.slice(0, 12).map(function (r) { return "<tr>" + r.map(function (v) { return "<td>" + (v == null ? '<span class="nd">—</span>' : esc(typeof v === "number" ? f3(v) : String(v).slice(0, 60))) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  var about = '<section class="card"><h2>About this dataset</h2>' +
    (ds.origin === "file" ? '<label class="field" for="aname">Name<input id="aname" value="' + esc(ds.name) + '" maxlength="80"></label>' +
      '<label class="field" for="asrc">Where it comes from (link or description)<input id="asrc" value="' + esc(ds.source || "") + '" maxlength="300" placeholder="e.g. https://… or Clinic records, 2025"></label>' +
      '<label class="field" for="anote">Notes<textarea id="anote" rows="2" maxlength="600">' + esc(ds.note || "") + "</textarea></label>" +
      (ds.saveNote ? '<p class="warn">' + esc(ds.saveNote) + "</p>" : "") +
      (A.del === ds.id ? '<div class="slot"><span class="warn">Delete “' + esc(ds.name) + '” for good?</span><button type="button" class="btn" data-adelyes="1">Delete</button><button type="button" class="btn" data-adelno="1">Keep</button></div>' : '<button type="button" class="btn" data-adel="1">Delete dataset</button>')
      : "<p>" + esc(ds.note) + '</p><p class="count">Source: ' + esc(ds.source) + "</p>") + "</section>";
  return '<h1 class="vt">Your data</h1><p class="lede">Add a dataset, check that each column has the right type, then open Analyze for statistics and a plain-language reading.</p>' +
    '<div class="agrid"><div class="amain"><section class="card"><h2>' + esc(ds.name) + ' <span class="count">' + ds.rows.length + " rows · " + ds.cols.length + " columns</span></h2>" +
    '<p class="count">Types were guessed from the values. Fix any that are wrong: a number stored as text cannot be averaged.</p>' + prof +
    '<div class="slot"><a class="more-link" href="#enhance" data-go="enhance">Check and clean it →</a><a class="more-link" href="#analyze" data-go="analyze">Analyze this dataset →</a><a class="more-link" href="#charts" data-go="charts">Chart it →</a></div></section>' +
    '<section class="card"><h2>First rows</h2>' + prev + "</section></div><div class=\"aside\">" + add + list + about + "</div></div>";
}
function analyzeView() {
  var ds = cur(); if (!ds) return noData("Analyze", "Add a dataset under Your data, then choose an analysis here.");
  if (!ds.rows) { loadRows(ds).then(render); return '<p class="count" role="status">Loading…</p>'; }
  var R = runAnalysis(ds), key = A.kind + JSON.stringify(A.sel), ai = A.ai[key] || {};
  var cats = ds.cols.filter(function (c) { return c.type === "category"; }), fcol = A.sel.f ? ds.cols[idxOf(ds, A.sel.f)] : null, fvals = [];
  if (fcol) { var u = {}; colVals(ds, idxOf(ds, A.sel.f)).forEach(function (v) { if (v != null) u[v] = 1; }); fvals = Object.keys(u).sort(); }
  var filter = cats.length ? '<details class="subset"' + (A.sel.f ? " open" : "") + '><summary>Use only some rows</summary><div class="toolbar">' + pick("f", "Where", cats, A.sel.f, true) +
    (fcol ? '<label class="field" for="fv">is<select id="fv" data-asel="fv"><option value="">Choose…</option>' + fvals.map(function (v) { return "<option" + (v === A.sel.fv ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("") + "</select></label>" : "") + "</div></details>" : "";
  var aiBox = '<section class="card ai"><h2>Ask Claude to explain</h2><p class="count">Sends the numbers above and your column names, never your rows. Claude may ask permission the first time.</p>' +
    '<div class="slot"><input id="aiq" maxlength="300" placeholder="Optional: what do you want to know?" aria-label="Question for Claude"><button type="button" class="btn btn-primary" data-aask="1"' + (ai.state === "wait" || ai.state === "stream" ? " disabled" : "") + ">Explain</button></div>" +
    (ai.state === "wait" ? '<p class="count" role="status">Thinking…</p>' : "") + (ai.text ? '<p id="aiout" class="ai-out" aria-live="polite">' + esc(ai.text) + "</p>" : "") +
    (ai.state === "off" ? '<p class="count">Claude explanations are not available in this view. The built-in reading still applies.</p>' : "") + "</section>";
  return '<h1 class="vt">' + esc(ds.name) + "</h1>" + askBox() +
    '<div class="pills" role="group" aria-label="Analysis">' + KINDS.map(function (k) { return '<button type="button" class="pill' + (A.kind === k[0] ? " on" : "") + '" aria-pressed="' + (A.kind === k[0]) + '" data-akind="' + k[0] + '">' + k[1] + "</button>"; }).join("") + "</div>" +
    '<div class="toolbar">' + R.controls + "</div>" + filter +
    '<div class="poster"><section aria-labelledby="pm"><h3 class="step" id="pm"><i>1</i> Method</h3><p class="method-note">' + esc(KIND_HELP[A.kind]) + (R.summary.test ? " Test: " + esc(R.summary.test) + "." : "") + "</p>" + formula(R) +
    (R.summary.n ? '<p class="count">' + R.summary.n + " rows used" + (A.sel.f && A.sel.fv ? ", where " + esc(A.sel.f) + " is “" + esc(A.sel.fv) + "”" : "") + ".</p>" : "") + "</section>" +
    '<section aria-labelledby="pr"><h3 class="step" id="pr"><i>2</i> Result</h3>' + R.head + (R.chart ? '<div class="chartwrap">' + R.chart + '</div><p class="figcap"><b>Fig. 1</b> ' + esc(caption(ds)) + "</p>" : "") + (R.extra || "") + "</section>" +
    '<section aria-labelledby="pc"><h3 class="step" id="pc"><i>3</i> Conclusion</h3>' +
    (R.reading.length ? '<div class="reading"><ul class="plain">' + R.reading.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul></div>" : '<p class="nd">The conclusion appears once the analysis has the columns it needs.</p>') +
    (R.caveats.length ? '<div class="caveats"><h3>Keep in mind</h3><ul class="plain">' + R.caveats.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul></div>" : "") + conclusionExtras(R) + "</section></div>" +
    (R.reading.length ? deepPanel(ds, R) + toolsBar(ds, R) + aiBox : "") + sharedPanel();
}
// The formula behind each analysis, typeset in MathML as on a lecture board.
function mi(v) { return "<mi>" + v + "</mi>"; } function mo(v) { return "<mo>" + v + "</mo>"; } function mn(v) { return "<mn>" + v + "</mn>"; }
function mr() { return "<mrow>" + [].slice.call(arguments).join("") + "</mrow>"; }
function fr(a, b) { return "<mfrac>" + a + b + "</mfrac>"; } function rt(a) { return "<msqrt>" + a + "</msqrt>"; }
function bar(v) { return '<mover accent="true">' + mi(v) + mo("¯") + "</mover>"; } function sb(b, i) { return "<msub>" + b + i + "</msub>"; } function sp(b, i) { return "<msup>" + b + i + "</msup>"; }
function dev(v) { return mr(mo("("), mi(v), mo("−"), bar(v), mo(")")); }
function formula(R) {
  var t = R.summary.test || "", f = "";
  if (A.kind === "describe") f = R.summary.mean != null
    ? mr(bar("x"), mo("="), fr(mr(mo("∑"), sb(mi("x"), mi("i"))), mi("n")), mo(",&#8195;"), mi("s"), mo("="), rt(fr(mr(mo("∑"), sp(mr(mo("("), sb(mi("x"), mi("i")), mo("−"), bar("x"), mo(")")), mn(2))), mr(mi("n"), mo("−"), mn(1)))))
    : mr(mi("share"), mo("="), fr(mi("count"), mi("n")));
  else if (/Welch/.test(t)) f = mr(mi("t"), mo("="), fr(mr(sb(bar("x"), mn(1)), mo("−"), sb(bar("x"), mn(2))), rt(mr(fr(sp(sb(mi("s"), mn(1)), mn(2)), sb(mi("n"), mn(1))), mo("+"), fr(sp(sb(mi("s"), mn(2)), mn(2)), sb(mi("n"), mn(2)))))));
  else if (/ANOVA/.test(t)) f = mr(mi("F"), mo("="), fr(sb(mi("MS"), mi("between")), sb(mi("MS"), mi("within"))));
  else if (A.kind === "relate") f = mr(mi("r"), mo("="), fr(mr(mo("∑"), dev("x"), dev("y")), rt(mr(mo("∑"), sp(dev("x"), mn(2)), mo("⋅"), mo("∑"), sp(dev("y"), mn(2))))));
  else if (A.kind === "cross") f = mr(sp(mi("χ"), mn(2)), mo("="), mo("∑"), fr(sp(mr(mo("("), mi("O"), mo("−"), mi("E"), mo(")")), mn(2)), mi("E")));
  else if (A.kind === "trend") f = mr('<mover accent="true">' + mi("y") + mo("^") + "</mover>", mo("="), mi("a"), mo("+"), mi("b"), mo("⋅"), mi("t"));
  else if (A.kind === "regress") f = mr('<mover accent="true">' + mi("y") + mo("^") + "</mover>", mo("="), sb(mi("β"), mn(0)), mo("+"), sb(mi("β"), mn(1)), sb(mi("x"), mn(1)), mo("+"), mo("⋯"), mo("+"), sb(mi("β"), mi("k")), sb(mi("x"), mi("k")));
  return f ? '<div class="math"><math display="block">' + f + "</math></div>" : "";
}
function caption(ds) {
  var s = A.sel;
  return {describe: "Distribution of " + s.y, compare: s.y + " by " + s.g, relate: s.x + " against " + s.y + ", with the fitted line", cross: s.g + " by " + s.g2, trend: s.y + " over " + s.t + (s.g ? ", by " + s.g : ""), regress: "Effect of each predictor on " + s.y + ", with 95% ranges"}[A.kind] || ds.name;
}
function chartsView() {
  var ds = cur(); if (!ds) return noData("Charts", "Add a dataset under Your data, then pick a chart type here.");
  if (!ds.rows) { loadRows(ds).then(render); return '<p class="count" role="status">Loading…</p>'; }
  var c = defaults(ds), ch = A.chart, nums = c.nums.concat(c.time), all = ds.cols.filter(function (x) { return x.type !== "empty"; }), get = function (n) { var j = idxOf(ds, n); return filterRows(ds).map(function (r) { return r[j]; }); };
  var types = [["histogram", "Histogram"], ["bar", "Bar"], ["box", "Box plot"], ["scatter", "Scatter"], ["line", "Line"]];
  var ctr = "", svg = "";
  if (ch.type === "histogram") { ctr = pick("y", "Number", c.nums, A.sel.y); svg = histogram(S.nums(get(A.sel.y)), A.sel.y || ""); }
  else if (ch.type === "bar") {
    ch.agg = ch.agg || "count";
    ctr = pick("g", "Category", c.cats, A.sel.g) + '<label class="field" for="cagg">Show<select id="cagg" data-cagg="1">' + [["count", "Number of rows"], ["mean", "Average of…"], ["sum", "Total of…"], ["median", "Median of…"]].map(function (o) { return '<option value="' + o[0] + '"' + (ch.agg === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" + (ch.agg !== "count" ? pick("y", "Number", c.nums, A.sel.y) : "");
    var gv = get(A.sel.g), yv = get(A.sel.y), m = {};
    gv.forEach(function (g, i) { if (g == null) return; (m[g] = m[g] || []).push(yv[i]); });
    var items = Object.keys(m).map(function (k) { var v = S.nums(m[k]); return [k, ch.agg === "count" ? m[k].length : ch.agg === "sum" ? v.reduce(function (a, b) { return a + b; }, 0) : ch.agg === "mean" ? S.mean(v) : S.quantile(v.sort(function (a, b) { return a - b; }), 0.5)]; }).filter(function (i) { return isFinite(i[1]); }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 20);
    svg = items.length ? bars(items, ch.agg) : "";
  } else if (ch.type === "box") {
    ctr = pick("y", "Number", c.nums, A.sel.y) + pick("g", "Group by", c.cats, A.sel.g);
    var y2 = get(A.sel.y), g2 = get(A.sel.g), grp = {}; y2.forEach(function (v, i) { if (typeof v === "number" && g2[i] != null) (grp[g2[i]] = grp[g2[i]] || []).push(v); });
    var nm = Object.keys(grp).filter(function (k) { return grp[k].length >= 2; }).slice(0, 15); svg = nm.length ? boxplot(nm, nm.map(function (k) { return S.describe(grp[k]); }), A.sel.y) : "";
  } else if (ch.type === "scatter") {
    ctr = pick("x", "Across", nums, A.sel.x) + pick("y", "Up", c.nums, A.sel.y) + '<label class="chk"><input type="checkbox" data-cfit="1"' + (ch.fit !== false ? " checked" : "") + "> Fitted line</label>";
    var co = S.correlate(get(A.sel.x), get(A.sel.y)); svg = co.n >= 2 ? scatter(co.x, co.y, A.sel.x, A.sel.y, ch.fit !== false && co.n >= 3 ? co : null) : "";
  } else {
    ctr = pick("t", "Time", c.time.length ? c.time : nums, A.sel.t || (c.time[0] || nums[0] || {}).name) + pick("y", "Number", c.nums, A.sel.y) + pick("g", "Lines by", c.cats, A.sel.g, true);
    var tn = A.sel.t || (c.time[0] || nums[0] || {}).name, tdate = (ds.cols[idxOf(ds, tn)] || {}).type === "date", tv = get(tn).map(function (v) { return tdate ? (v ? Date.parse(String(v).slice(0, 10)) / (365.25 * 864e5) + 1970 : null) : v; }), yy = get(A.sel.y), gg = A.sel.g ? get(A.sel.g) : null, ser = {};
    tv.forEach(function (t, i) { if (typeof t !== "number" || typeof yy[i] !== "number") return; var k = gg ? gg[i] || "(none)" : A.sel.y; ser[k] = ser[k] || {}; (ser[k][t] = ser[k][t] || []).push(yy[i]); });
    var ln = Object.keys(ser).slice(0, 7).map(function (k) { return {name: k, pts: Object.keys(ser[k]).map(Number).sort(function (a, b) { return a - b; }).map(function (t) { return [t, S.mean(ser[k][t])]; })}; });
    svg = ln.length ? lineChart(ln, A.sel.t || "", A.sel.y || "") : "";
  }
  return '<h1 class="vt">' + esc(ds.name) + '</h1><p class="lede">Pick a chart type and the columns to draw.</p>' +
    '<div class="pills" role="group" aria-label="Chart type">' + types.map(function (t) { return '<button type="button" class="pill' + (ch.type === t[0] ? " on" : "") + '" aria-pressed="' + (ch.type === t[0]) + '" data-ctype="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>" +
    '<div class="toolbar">' + ctr + "</div>" + '<section class="card"><div class="chartwrap">' + (svg || '<p class="nd">Nothing to draw with these columns. Try another chart type or column.</p>') + "</div></section>";
}

// --- wiring ---
GROUPS.data = ["data"]; GROUPS.analyze = ["analyze"]; GROUPS.charts = ["charts"];
VIEWS.data = dataView; VIEWS.analyze = analyzeView; VIEWS.charts = chartsView;
A.sets = []; A.cur = null;
function pickSet(id) { A.cur = id; A.sel = {}; A.ai = {}; A.msg = ""; A.del = null; }
view.addEventListener("change", function (e) {
  var t = e.target, d = t.dataset || {};
  if (t.id === "afile" && t.files && t.files[0]) { readFile(t.files[0]); return; }
  if (d.asel) { A.sel[d.asel] = t.value; if (d.asel === "f") A.sel.fv = ""; render(); return; }
  if (d.atype != null) { var ds = cur(), j = +d.atype, c = ds.cols[j]; c.type = t.value; ds.rows.forEach(function (r) { var v = r[j]; if (v == null) return; if (c.type === "number" || c.type === "year") { var n = parseNum(v); r[j] = typeof n === "number" ? n : null; } else r[j] = String(v); }); saveMeta(ds); if (ds.saved) saveSet(ds); render(); return; }
  if (d.pred != null) { var p = A.sel.preds || []; A.sel.preds = t.checked ? p.concat([d.pred]) : p.filter(function (x) { return x !== d.pred; }); render(); return; }
  if (d.cagg) { A.chart.agg = t.value; render(); return; }
  if (d.cfit) { A.chart.fit = t.checked; render(); return; }
  if (t.id === "aname" || t.id === "asrc" || t.id === "anote") { var s = cur(); s[{aname: "name", asrc: "source", anote: "note"}[t.id]] = t.value.trim() || (t.id === "aname" ? s.name : ""); saveMeta(s); render(); }
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset;
  if (d.ads) { pickSet(d.ads); render(); refocus('[data-ads="' + d.ads + '"]'); return; }
  if (d.akind) { A.kind = d.akind; render(); refocus('[data-akind="' + d.akind + '"]'); return; }
  if (d.ctype) { A.chart.type = d.ctype; render(); refocus('[data-ctype="' + d.ctype + '"]'); return; }
  if (d.aask) { var ds = cur(); askClaude(ds, runAnalysis(ds)); return; }
  if (d.apaste) { try { var txt = (document.getElementById("apaste") || {}).value || "", rows = splitCSV(txt); if (rows.length < 2) { A.msg = "Paste a header row and at least one data row."; render(); return; } var ns = makeSet("Pasted data " + new Date().toISOString().slice(0, 10), rows[0], rows.slice(1)); A.sets.unshift(ns); pickSet(ns.id); render(); saveSet(ns); } catch (err) { A.msg = err.message || "Could not read the pasted table. Check its headers and quotes."; render(); } return; }
  if (d.adel) { A.del = cur().id; render(); refocus("[data-adelno]"); return; }
  if (d.adelno) { A.del = null; render(); refocus("[data-adel]"); return; }
  if (d.adelyes) { deleteSet(cur()); A.del = null; render(); return; }
});
view.addEventListener("dragover", function (e) { if (st.tab === "data") { e.preventDefault(); var z = document.getElementById("drop"); if (z) z.classList.add("over"); } });
view.addEventListener("dragleave", function () { var z = document.getElementById("drop"); if (z) z.classList.remove("over"); });
view.addEventListener("drop", function (e) { if (st.tab !== "data") return; e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files[0]; if (f) readFile(f); });
stStart();
