// ---------- Clean & enhance: on-device data quality methods ----------
// Methods, each written here from its published description:
//   OpenRefine clustering (fingerprint, n-gram fingerprint, Levenshtein with blocking)
//   ydata-profiling alerts (missing, constant, unique, cardinality, imbalance, skew, zeros, duplicates, correlation)
//   Palantir Foundry data expectations and health checks (primary key, allowed values, freshness) and its step history
//   scikit-learn KNNImputer, MissingIndicator and IsolationForest
var E = {sev: "", openFix: null, clusterCol: null, clusterMethod: "fingerprint", clusters: null, picked: Object.create(null), iso: null, undo: Object.create(null), orig: Object.create(null), msg: ""};

// --- OpenRefine key-collision and nearest-neighbour clustering ---
function asciiFold(s) { return s.normalize("NFKD").replace(/[̀-ͯ]/g, ""); }
function fingerprint(s) {
  s = asciiFold(String(s).trim().toLowerCase()).replace(/[\p{P}\p{Cc}]/gu, "");
  return s.split(/\s+/).filter(Boolean).filter(function (t, i, a) { return a.indexOf(t) === i; }).sort().join(" ");
}
function ngramFP(s, n) {
  s = asciiFold(String(s).toLowerCase()).replace(/[\p{P}\p{Cc}\s]/gu, "");
  var g = []; for (var i = 0; i + n <= s.length; i++) g.push(s.slice(i, i + n));
  return g.filter(function (t, i, a) { return a.indexOf(t) === i; }).sort().join("");
}
function lev(a, b) {
  if (a === b) return 0; var m = a.length, n = b.length, prev = [], cur2;
  for (var j = 0; j <= n; j++) prev[j] = j;
  for (var i = 1; i <= m; i++) { cur2 = [i]; for (var k = 1; k <= n; k++) cur2[k] = Math.min(prev[k] + 1, cur2[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)); prev = cur2; }
  return prev[n];
}
function clusterValues(counts, method) {
  var vals = Object.keys(counts), groups = Object.create(null);
  if (method === "levenshtein") {
    // Blocking: compare only values that share a 3-character substring (OpenRefine allows lowering its default of 6; 6 misses typos in short words), then join within radius.
    var parent = vals.map(function (_, i) { return i; }), find = function (i) { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    var blocks = Object.create(null); vals.forEach(function (v, i) { var s = v.toLowerCase(), b = Math.min(3, s.length); for (var p = 0; p + b <= s.length; p++) (blocks[s.slice(p, p + b)] = blocks[s.slice(p, p + b)] || []).push(i); });
    Object.keys(blocks).forEach(function (k) { var ids = blocks[k]; if (ids.length > 200) return; for (var a = 0; a < ids.length; a++) for (var b2 = a + 1; b2 < ids.length; b2++) { var x = vals[ids[a]].toLowerCase(), y = vals[ids[b2]].toLowerCase(); if (lev(x, y) <= (Math.min(x.length, y.length) < 6 ? 1 : 2)) parent[find(ids[a])] = find(ids[b2]); } });
    vals.forEach(function (v, i) { var r = find(i); (groups[r] = groups[r] || []).push(v); });
  } else {
    vals.forEach(function (v) { var k = method === "ngram" ? ngramFP(v, 2) : fingerprint(v); (groups[k] = groups[k] || []).push(v); });
  }
  return Object.keys(groups).map(function (k) { return groups[k].sort(function (a, b) { return counts[b] - counts[a]; }); }).filter(function (g) { return g.length > 1; })
    .map(function (g) { return {values: g, rows: g.reduce(function (s, v) { return s + counts[v]; }, 0), into: g[0]}; }).sort(function (a, b) { return b.rows - a.rows; });
}

// --- scikit-learn style imputation ---
function knnFill(ds, j, k) {   // KNNImputer: mean of the k nearest rows (nan-euclidean on standardized numbers) that have a value
  var feats = ds.cols.map(function (c, i) { return i; }).filter(function (i) { return i !== j && ds.cols[i].type === "number"; });
  var st2 = feats.map(function (i) { var d = S.describe(colVals(ds, i)); return [d.mean, d.sd || 1]; });
  var Z = ds.rows.map(function (r) { return feats.map(function (i, q) { return typeof r[i] === "number" ? (r[i] - st2[q][0]) / st2[q][1] : null; }); });
  var donors = []; ds.rows.forEach(function (r, i) { if (r[j] != null) donors.push(i); });
  var numeric = isNum(ds.cols[j]), changed = 0;
  var out = ds.rows.map(function (r, i) {
    if (r[j] != null || !feats.length) return r;
    var d = donors.map(function (o) { var s = 0, n = 0; for (var q = 0; q < feats.length; q++) if (Z[i][q] != null && Z[o][q] != null) { s += (Z[i][q] - Z[o][q]) * (Z[i][q] - Z[o][q]); n++; } return [n ? Math.sqrt(s * feats.length / n) : Infinity, o]; })
      .filter(function (x) { return isFinite(x[0]); }).sort(function (a, b) { return a[0] - b[0]; }).slice(0, k);
    if (!d.length) return r;
    var v; if (numeric) v = S.mean(d.map(function (x) { return ds.rows[x[1]][j]; }));
    else { var c = Object.create(null); d.forEach(function (x) { var w = ds.rows[x[1]][j]; c[w] = (c[w] || 0) + 1; }); v = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0]; }
    changed++; var r2 = r.slice(); r2[j] = numeric ? +(+v).toPrecision(6) : v; return r2;
  });
  var left = out.filter(function (r) { return r[j] == null; }).length;
  return {rows: out, changed: changed, why: left ? left + " missing value" + (left > 1 ? "s" : "") + " could not be filled: those rows have no other measurements to compare with. Try the median or most common value instead." : ""};
}

// --- Isolation Forest (Liu, Ting & Zhou 2008; scikit-learn defaults: 100 trees, 256 samples) ---
function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function cN(n) { return n <= 1 ? 0 : 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n; }
function isoForest(X, trees, sub) {
  var rand = rng(42), n = X.length, d = X[0].length, psi = Math.min(sub, n), hmax = Math.ceil(Math.log2(psi));
  function build(idx, h) {
    if (h >= hmax || idx.length <= 1) return {size: idx.length};
    var q = Math.floor(rand() * d), lo = Infinity, hi = -Infinity; idx.forEach(function (i) { if (X[i][q] < lo) lo = X[i][q]; if (X[i][q] > hi) hi = X[i][q]; });
    if (lo === hi) return {size: idx.length};
    var p = lo + rand() * (hi - lo), L = [], R = []; idx.forEach(function (i) { (X[i][q] < p ? L : R).push(i); });
    return {q: q, p: p, l: build(L, h + 1), r: build(R, h + 1)};
  }
  var forest = []; for (var t = 0; t < trees; t++) { var s = []; for (var k = 0; k < psi; k++) s.push(Math.floor(rand() * n)); forest.push(build(s, 0)); }
  function depth(x, node, h) { while (node.q != null) { node = x[node.q] < node.p ? node.l : node.r; h++; } return h + cN(node.size); }
  return X.map(function (x) { var e = 0; forest.forEach(function (tr) { e += depth(x, tr, 0); }); return Math.pow(2, -(e / trees) / cN(psi)); });
}

// --- health checks ---
function checks(ds) {
  var out = [], n = ds.rows.length, push = function (sev, col, title, detail, fix, src) { out.push({sev: sev, col: col, title: title, detail: detail, fix: fix, src: src}); };
  var seen = Object.create(null), dup = 0; ds.rows.forEach(function (r) { var k = JSON.stringify(r); if (seen[k]) dup++; seen[k] = 1; });
  if (dup) push("warn", null, dup + " duplicate row" + (dup > 1 ? "s" : ""), "Rows that repeat another row exactly. They count twice in every statistic.", {op: "dedupe", label: "Remove duplicates"}, "Rule adapted from ydata-profiling");
  var keyCol = null;
  ds.cols.forEach(function (c, j) {
    var v = colVals(ds, j), miss = v.filter(function (x) { return x == null; }).length, present = v.filter(function (x) { return x != null; });
    var u = Object.create(null); present.forEach(function (x) { u[x] = (u[x] || 0) + 1; }); var distinct = Object.keys(u).length;
    if (!present.length) { push("high", c.name, "Empty column", "No values at all.", {op: "drop", label: "Remove column"}, "Rule adapted from ydata-profiling"); return; }
    if (miss) push(miss / n > 0.5 ? "high" : miss / n > 0.05 ? "warn" : "info", c.name, Math.round(miss / n * 1000) / 10 + "% missing", miss + " of " + n + " rows have no value.", {op: "fill", label: "Fill missing values"}, "Rule adapted from ydata-profiling");
    if (distinct === 1) push("warn", c.name, "Same value in every row", "“" + present[0] + "” everywhere, so it cannot explain any differences.", {op: "drop", label: "Remove column"}, "Rule adapted from ydata-profiling");
    if (distinct === n && !miss && !keyCol && n >= 20) { keyCol = c.name; push("info", c.name, "Identifies each row", "Every value is different and none is missing, so this can serve as the row ID (a primary key).", null, "Modelled on Palantir Foundry data expectations"); }
    if (isNum(c)) {
      var d = S.describe(v);
      if (Math.abs(d.skew) > 2) push("info", c.name, "Strongly lopsided", "Skewness " + d.skew.toFixed(1) + ". Medians describe it better than averages; a log transform can help in regression.", {op: "derive", label: "Add log column", how: "log"}, "Rule adapted from ydata-profiling");
      var z = present.filter(function (x) { return x === 0; }).length; if (z / n >= 0.1) push("info", c.name, Math.round(z / n * 100) + "% zeros", "Check whether zero means a real zero or a missing value.", null, "Rule adapted from ydata-profiling");
      if (d.outliers) push(d.outliers / d.n > 0.05 ? "warn" : "info", c.name, d.outliers + " unusual value" + (d.outliers > 1 ? "s" : ""), "Outside 1.5× the middle range (" + f3(d.q1 - 1.5 * (d.q3 - d.q1)) + " to " + f3(d.q3 + 1.5 * (d.q3 - d.q1)) + ").", {op: "outliers", label: "Handle unusual values"}, "Tukey's fences");
    } else {
      var asNum = present.filter(function (x) { return typeof parseNum(x) === "number"; }).length;
      if (asNum / present.length >= 0.8 && asNum >= 3) push("high", c.name, "Numbers stored as text", Math.round(asNum / present.length * 100) + "% of values read as numbers once symbols and separators are removed.", {op: "tonum", label: "Convert to numbers"}, "Rule adapted from ydata-profiling");
      var ws = present.filter(function (x) { return typeof x === "string" && (x !== x.trim() || /\s{2,}/.test(x)); }).length;
      if (ws) push("warn", c.name, ws + (ws === 1 ? " value" : " values") + " with stray spaces", "Extra spaces make identical values look different.", {op: "trim", label: "Trim spaces"}, "Adapted from OpenRefine");
      if (distinct <= 2000 && distinct > 1) { var cl = clusterValues(u, "fingerprint"); if (cl.length) push("warn", c.name, cl.length + " group" + (cl.length > 1 ? "s" : "") + " of near-identical values", "For example “" + cl[0].values.slice(0, 3).join("”, “") + "”. These are probably the same thing written differently.", {op: "cluster", label: "Review and merge"}, "Adapted from OpenRefine"); }
      if (c.type === "category") {
        var k = distinct, H = 0; Object.keys(u).forEach(function (x) { var p = u[x] / present.length; H -= p * Math.log(p); });
        var imb = k > 1 ? 1 - H / Math.log(k) : 0;
        if (imb > 0.5) push("info", c.name, "Unbalanced categories", "One value dominates (" + Object.keys(u).sort(function (a, b) { return u[b] - u[a]; })[0] + "). Comparisons with the small groups will be shaky.", null, "Rule adapted from ydata-profiling");
      }
      if (c.type !== "date" && distinct > 50 && distinct < n) push("info", c.name, distinct + " different values", "Too many to compare as groups. Merge similar values or treat it as text.", {op: "cluster", label: "Look for duplicates"}, "Rule adapted from ydata-profiling");
      if (c.type === "date") { var last = present.map(function (x) { return String(x).slice(0, 10); }).sort().pop(), age = Math.round((Date.now() - Date.parse(last)) / 864e5); if (age > 365) push("info", c.name, "Latest date is " + last, "The newest record is " + (age / 365).toFixed(1) + " years old.", null, "Modelled on Foundry's freshness check"); }
    }
  });
  var rank = {high: 0, warn: 1, info: 2};
  return out.sort(function (x, y) { return rank[x.sev] - rank[y.sev]; });
}

// --- applying fixes: every change is a step in the dataset's history ---
function applyStep(ds, step, fn) {
  var before = ds.rows, beforeCols = JSON.parse(JSON.stringify(ds.cols));
  if (!E.orig[ds.id]) E.orig[ds.id] = {rows: before, cols: beforeCols, recipe: (ds.recipe || []).slice()};
  var res; try { res = fn(); } catch (err) { E.msg = err.message || 'This change could not be applied.'; if (st.tab === 'data') A.msg = E.msg; render(); return; }
  if (!res || !res.changed) { E.msg = (res && res.why) || "Nothing needed changing."; render(); return; }
  (E.undo[ds.id] = E.undo[ds.id] || []).push({rows: before, cols: beforeCols});
  if (st.tab === 'data') A.msg = '';
  ds.rows = res.rows; if (res.cols) ds.cols = res.cols;
  ds.recipe = (ds.recipe || []).concat([Object.assign({at: new Date().toISOString(), changed: res.changed}, step)]);
  E.msg = step.text + " (" + res.changed + " " + (step.unit || "values") + ")." + (res.why ? " " + res.why : ""); E.openFix = null; E.clusters = null; A.ai = Object.create(null);
  render(); saveSet(ds);
}
function mapCol(ds, j, f) { var ch = 0; return {rows: ds.rows.map(function (r) { var v = f(r[j]); if (v === r[j]) return r; ch++; var r2 = r.slice(); r2[j] = v; return r2; }), changed: ch}; }
function opTrim(ds, j) { return mapCol(ds, j, function (v) { return typeof v === "string" ? v.trim().replace(/\s{2,}/g, " ") : v; }); }
function opToNum(ds, j) { var res = mapCol(ds, j, function (v) { if (v == null) return v; var n = parseNum(v); return typeof n === "number" ? n : null; }); var cols = ds.cols.slice(); cols[j] = Object.assign({}, cols[j], {type: "number"}); res.cols = cols; res.changed = res.changed || 1; return res; }
function opDedupe(ds) { var seen = Object.create(null), rows = ds.rows.filter(function (r) { var k = JSON.stringify(r); if (seen[k]) return false; seen[k] = 1; return true; }); return {rows: rows, changed: ds.rows.length - rows.length}; }
function opDrop(ds, j) { if (ds.cols.length <= 1) throw new Error('Keep at least one column, or delete the dataset under Your data.'); return {rows: ds.rows.map(function (r) { return r.filter(function (_, i) { return i !== j; }); }), cols: ds.cols.filter(function (_, i) { return i !== j; }), changed: 1}; }
function opFill(ds, j, how, flag) {
  var v = colVals(ds, j), c = ds.cols[j], res;
  if (how === "knn") res = knnFill(ds, j, 5);
  else {
    var fillv;
    if (how === "median") fillv = S.describe(v).median; else if (how === "mean") fillv = +S.describe(v).mean.toPrecision(6);
    else { var u = Object.create(null); v.forEach(function (x) { if (x != null) u[x] = (u[x] || 0) + 1; }); fillv = Object.keys(u).sort(function (a, b) { return u[b] - u[a]; })[0]; if (isNum(c)) fillv = +fillv; }
    res = mapCol(ds, j, function (x) { return x == null ? fillv : x; });
  }
  if (flag && res.changed) {   // MissingIndicator: remember which rows were filled
    res.rows = res.rows.map(function (r, i) { return r.concat([v[i] == null ? "yes" : "no"]); });
    res.cols = ds.cols.concat([{name: c.name + " was missing", type: "category"}]);
  }
  return res;
}
function opOutliers(ds, j, how) {
  var d = S.describe(colVals(ds, j)), lo = d.q1 - 1.5 * (d.q3 - d.q1), hi = d.q3 + 1.5 * (d.q3 - d.q1), bad = function (x) { return typeof x === "number" && (x < lo || x > hi); };
  if (how === "flag") { var n = 0; var rows = ds.rows.map(function (r) { var b = bad(r[j]); if (b) n++; return r.concat([b ? "yes" : "no"]); }); return {rows: rows, cols: ds.cols.concat([{name: ds.cols[j].name + " unusual", type: "category"}]), changed: n}; }
  if (how === "cap") return mapCol(ds, j, function (x) { return typeof x !== "number" ? x : x < lo ? +lo.toPrecision(6) : x > hi ? +hi.toPrecision(6) : x; });
  var keep = ds.rows.filter(function (r) { return !bad(r[j]); }); return {rows: keep, changed: ds.rows.length - keep.length};
}
function opDerive(ds, j, how) {
  var c = ds.cols[j], v = colVals(ds, j), d = S.describe(v), name, f;
  if (how === "log") { name = "log10 of " + c.name; f = function (x) { return typeof x === "number" && x > 0 ? +Math.log10(x).toPrecision(6) : null; }; }
  else if (how === "z") { name = c.name + " (standardized)"; f = function (x) { return typeof x === "number" ? +((x - d.mean) / d.sd).toPrecision(5) : null; }; }
  else { name = c.name + " (quarter)"; f = function (x) { return typeof x !== "number" ? null : x <= d.q1 ? "Q1 lowest" : x <= d.median ? "Q2" : x <= d.q3 ? "Q3" : "Q4 highest"; }; }
  return {rows: ds.rows.map(function (r) { return r.concat([f(r[j])]); }), cols: ds.cols.concat([{name: name, type: how === "bins" ? "category" : "number"}]), changed: v.filter(function (x) { return x != null; }).length};
}
function opMerge(ds, j, clusters) {
  var map = Object.create(null); clusters.forEach(function (cl) { cl.values.forEach(function (v) { if (v !== cl.into) map[v] = cl.into; }); });
  return mapCol(ds, j, function (v) { return v != null && Object.prototype.hasOwnProperty.call(map, v) ? map[v] : v; });
}
function opIso(ds, cols, share) {
  var idx = cols.map(function (n) { return idxOf(ds, n); }), stt = idx.map(function (i) { var d = S.describe(colVals(ds, i)); return [d.median, d.sd || 1]; });
  var X = ds.rows.map(function (r) { return idx.map(function (i, q) { return typeof r[i] === "number" ? (r[i] - stt[q][0]) / stt[q][1] : 0; }); });
  var sc = isoForest(X, 100, 256), cut = sc.slice().sort(function (a, b) { return b - a; })[Math.max(0, Math.floor(sc.length * share) - 1)];
  var n = 0; var rows = ds.rows.map(function (r, i) { var flag = sc[i] >= cut; if (flag) n++; return r.concat([+sc[i].toFixed(3), flag ? "yes" : "no"]); });
  return {rows: rows, cols: ds.cols.concat([{name: "Anomaly score", type: "number"}, {name: "Anomaly", type: "category"}]), changed: n};
}

// --- view ---
var SEV = {high: ["Fix first", "q-excluded"], warn: ["Check", "q-estimated"], info: ["Note", "q-reported"]};
function enhanceView() {
  var ds = cur(); if (!ds) return noData("Clean & enhance", "Add a dataset under Your data and its health check appears here, with fixes you can apply and undo.");
  if (!ds.rows) { loadRows(ds).then(render); return '<p class="count" role="status">Loading…</p>'; }
  var list = checks(ds), n = ds.rows.length, cells = n * ds.cols.length, miss = 0; ds.rows.forEach(function (r) { r.forEach(function (v) { if (v == null) miss++; }); });
  var bySev = {high: 0, warn: 0, info: 0}; list.forEach(function (c) { bySev[c.sev]++; });
  var o = E.orig[ds.id], before = o ? {rows: o.rows, cols: o.cols} : ds, bm = 0; before.rows.forEach(function (r) { r.forEach(function (v) { if (v == null) bm++; }); });
  var bf = o ? checks(before).length : list.length, bcells = before.rows.length * before.cols.length;
  var half = function (title, rows, cols, missPct, finds, ref) { var d = function (v, w, better) { return ref && v !== w ? ' class="' + ((v < w) === better ? "up" : "down") + '"' : ""; };
    var k = ref ? "now" : "before", w = function (lab, v) { var c = rewrite(k + lab + ds.id, v); return c ? ' class="' + c.trim() + '"' : ""; };
    return "<div><h3>" + title + "</h3><dl><dt>Rows</dt><dt>Columns</dt><dt>Missing</dt><dt>Findings</dt><dd><span" + w("r", rows) + ">" + rows.toLocaleString("en-US") + "</span></dd><dd><span" + w("c", cols) + ">" + cols + "</span></dd><dd" + d(missPct, ref && ref[2], true) + "><span" + w("m", missPct) + ">" + missPct + "%</span></dd><dd" + d(finds, ref && ref[3], true) + "><span" + w("f", finds) + ">" + finds + "</span></dd></dl></div>"; };
  var bp = bcells ? Math.round(bm / bcells * 1000) / 10 : 0, np = cells ? Math.round(miss / cells * 1000) / 10 : 0;
  var head = '<div class="halves" aria-label="Before and after cleaning">' + half("Before", before.rows.length, before.cols.length, bp, bf) + half(o ? "Now" : "Now (no changes yet)", n, ds.cols.length, np, list.length, [before.rows.length, before.cols.length, bp, bf]) + "</div>";
  var rows = list.map(function (c, i) {
    var open = E.openFix === i;
    return '<li class="chk-row"><div class="chk-top"><span class="chip ' + SEV[c.sev][1] + '">' + SEV[c.sev][0] + "</span> <b>" + (c.col ? esc(c.col) + ": " : "") + esc(c.title) + "</b></div>" +
      '<div class="count">' + esc(c.detail) + ' <span class="src">' + esc(c.src) + "</span></div>" +
      (c.fix ? (open ? fixForm(ds, c) : '<button type="button" class="btn" data-efix="' + i + '">' + esc(c.fix.label) + "</button>") : "") + "</li>";
  }).join("");
  var hist = (ds.recipe || []).length ? '<ol class="recipe">' + ds.recipe.map(function (s) { return "<li>" + esc(s.text) + ' <span class="count">' + s.changed + " " + (s.unit || "values") + " · " + s.at.slice(0, 16).replace("T", " ") + "</span></li>"; }).join("") + "</ol>" +
    '<div class="slot">' + ((E.undo[ds.id] || []).length ? '<button type="button" class="btn" data-eundo="1">Undo last step</button>' : "") + (E.orig[ds.id] ? '<button type="button" class="btn" data-ereset="1">Back to the original</button>' : "") + "</div>"
    : '<p class="count">No changes yet. Every fix you apply is listed here in order, so you can see exactly how the data was changed and undo it.</p>';
  var catCols = ds.cols.filter(function (c) { return c.type === "category" || c.type === "text"; }), numCols = ds.cols.filter(function (c) { return c.type === "number"; });
  if (!E.clusterCol || idxOf(ds, E.clusterCol) < 0) E.clusterCol = (catCols[0] || {}).name;
  var clusterPanel = catCols.length ? '<section class="card"><h2>Merge values written differently</h2><p class="count">Finds values that are probably the same thing (“New York”, “new york ”, “NY City”) using OpenRefine’s clustering methods. You choose what to merge.</p>' +
    '<div class="toolbar"><label class="field" for="ecol">Column<select id="ecol" data-ecol="1">' + catCols.map(function (c) { return "<option" + (c.name === E.clusterCol ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></label>" +
    '<label class="field" for="emeth">Method<select id="emeth" data-emeth="1">' + [["fingerprint", "Same words, any order or case"], ["ngram", "Same letters (catches typos)"], ["levenshtein", "Spelled within 1–2 letters"]].map(function (m) { return '<option value="' + m[0] + '"' + (E.clusterMethod === m[0] ? " selected" : "") + ">" + m[1] + "</option>"; }).join("") + "</select></label>" +
    '<button type="button" class="btn" data-efind="1">Find groups</button></div>' + clusterList(ds) + "</section>" : "";
  if (!E.iso) E.iso = {cols: numCols.slice(0, 6).map(function (c) { return c.name; }), share: 0.05};
  var isoPanel = numCols.length >= 2 ? '<section class="card"><h2>Find unusual rows</h2><p class="count">An Isolation Forest (the method behind scikit-learn’s IsolationForest) looks at several numbers at once and scores how easily each row separates from the rest. It catches rows that are odd in combination even when each value looks normal on its own.</p>' +
    '<fieldset class="field preds"><legend>Use these columns</legend>' + numCols.map(function (c) { return '<label class="chk"><input type="checkbox" data-eiso="' + esc(c.name) + '"' + (E.iso.cols.indexOf(c.name) >= 0 ? " checked" : "") + "> " + esc(c.name) + "</label>"; }).join("") + "</fieldset>" +
    '<div class="slot"><label class="field" for="eshare">Flag the most unusual<select id="eshare" data-eshare="1">' + [0.01, 0.02, 0.05, 0.1].map(function (s) { return '<option value="' + s + '"' + (E.iso.share === s ? " selected" : "") + ">" + s * 100 + "% of rows</option>"; }).join("") + '</select></label><button type="button" class="btn btn-primary" data-eisorun="1"' + (E.iso.cols.length ? "" : " disabled") + ">Score rows</button></div>" + topAnomalies(ds) + "</section>" : "";
  return '<h1 class="vt">' + esc(ds.name) + "</h1><p class=\"lede\">A health check of every column, with fixes you can apply and undo. Nothing changes until you press a button.</p>" + head +
    (E.msg ? '<p class="how" role="status">' + esc(E.msg) + "</p>" : "") +
    '<div class="agrid"><div class="amain"><section class="card"><h2>Health check <span class="count">' + list.length + " finding" + (list.length === 1 ? "" : "s") + "</span></h2>" +
    (list.length ? '<ul class="plain checks">' + rows + "</ul>" : '<p>No problems found. The data is ready to analyze.</p>') + "</section>" + clusterPanel + isoPanel + "</div>" +
    '<div class="aside"><section class="card"><h2>Change history</h2>' + hist + '</section><section class="card methods"><h2>Methods used</h2><ul class="plain">' +
    "<li><b>Health checks</b> are modelled on ydata-profiling’s alert rules and Palantir Foundry’s data expectations (primary key, freshness).</li>" +
    "<li><b>Merging values</b> re-implements OpenRefine’s fingerprint, n-gram and Levenshtein clustering with blocking.</li>" +
    "<li><b>Filling gaps</b> offers median, average, most common, or nearest neighbours as in scikit-learn’s KNNImputer (with columns first put on the same scale, so grams do not outweigh millimetres), with an optional ‘was missing’ column (MissingIndicator).</li>" +
    "<li><b>Unusual values</b>: Tukey’s fences for one column, Isolation Forest for whole rows.</li>" +
    "<li><b>Change history</b> keeps each step in order, like Foundry’s pipeline history and OpenRefine’s undo list.</li></ul>" +
    '<p class="count">Everything runs on your device. Your data is not sent anywhere to be cleaned.</p></section></div></div>';
}
function fixForm(ds, c) {
  var f = c.fix, inner = "";
  if (f.op === "fill") {
    var numeric = isNum(ds.cols[idxOf(ds, c.col)]);
    inner = '<label class="field" for="efillhow">Fill with<select id="efillhow">' + (numeric ? '<option value="median">The median (typical value)</option><option value="mean">The average</option>' : "") + '<option value="mode"' + (numeric ? "" : " selected") + '>The most common value</option><option value="knn">Values from the 5 most similar rows</option></select></label>' +
      '<label class="chk"><input type="checkbox" id="efillflag" checked> Add a column that marks which rows were filled</label>';
  } else if (f.op === "outliers") {
    inner = '<label class="field" for="eouthow">What to do<select id="eouthow"><option value="flag">Mark them in a new column</option><option value="cap">Pull them in to the fence (cap)</option><option value="remove">Remove those rows</option></select></label>';
  } else if (f.op === "derive") {
    inner = '<label class="field" for="ederhow">Add<select id="ederhow"><option value="log">Log10 column</option><option value="z">Standardized column (z-score)</option><option value="bins">Quarter groups (Q1–Q4)</option></select></label>';
  }
  return '<div class="fixform" data-ecol-name="' + esc(c.col || "") + '" data-eop="' + f.op + '">' + inner +
    '<div class="slot"><button type="button" class="btn btn-primary" data-eapply="1">' + esc(f.op === "cluster" ? "Open merge panel" : f.op === "fill" || f.op === "outliers" || f.op === "derive" ? "Apply" : f.label) + '</button><button type="button" class="btn" data-ecancel="1">Cancel</button></div></div>';
}
function clusterList(ds) {
  if (!E.clusters) return "";
  if (!E.clusters.length) return '<p class="count">No groups found with this method. Try another method.</p>';
  return '<ul class="plain clusters">' + E.clusters.slice(0, 40).map(function (cl, i) {
    return '<li><label class="chk"><input type="checkbox" data-epick="' + i + '"' + (E.picked[i] !== false ? " checked" : "") + "> Merge</label> " +
      cl.values.map(function (v) { return '<span class="chip">' + esc(v) + "</span>"; }).join(" ") +
      ' <label class="field inline" for="einto' + i + '">into<input id="einto' + i + '" data-einto="' + i + '" value="' + esc(cl.into) + '"></label> <span class="count">' + cl.rows + " rows</span></li>";
  }).join("") + '</ul><button type="button" class="btn btn-primary" data-emerge="1">Merge selected groups</button>';
}
function topAnomalies(ds) {
  var j = idxOf(ds, "Anomaly score"); if (j < 0) return "";
  var top = ds.rows.map(function (r, i) { return [r[j], i]; }).filter(function (x) { return typeof x[0] === "number"; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, 8);
  var show = ds.cols.map(function (c, i) { return i; }).filter(function (i) { return i !== j && ds.cols[i].name !== "Anomaly"; }).slice(0, 6);
  return '<h2 class="sub-h">Most unusual rows</h2><div class="tablewrap"><table class="nosort"><thead><tr><th>Score</th>' + show.map(function (i) { return "<th>" + esc(ds.cols[i].name) + "</th>"; }).join("") + "</tr></thead><tbody>" +
    top.map(function (t) { var r = ds.rows[t[1]]; return '<tr><td class="num">' + t[0].toFixed(2) + "</td>" + show.map(function (i) { return "<td>" + (r[i] == null ? '<span class="nd">—</span>' : esc(typeof r[i] === "number" ? f3(r[i]) : String(r[i]).slice(0, 30))) + "</td>"; }).join("") + "</tr>"; }).join("") +
    '</tbody></table></div><p class="count">Scores near 1 are easy to isolate (unusual); around 0.5 or below are ordinary. A high score is a reason to look, not proof of an error.</p>';
}

GROUPS.enhance = ["enhance"]; VIEWS.enhance = enhanceView;
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b || st.tab !== "enhance") return; var d = b.dataset, ds = cur(); if (!ds || !ds.rows) return;
  if (d.efix != null) { var c = checks(ds)[+d.efix]; E.msg = "";
    if (["dedupe", "trim", "tonum", "drop"].indexOf(c.fix.op) >= 0) { var j0 = c.col ? idxOf(ds, c.col) : -1;
      return applyStep(ds, {op: c.fix.op, col: c.col, text: {dedupe: "Removed duplicate rows", trim: "Trimmed spaces in " + c.col, tonum: "Converted " + c.col + " to numbers", drop: "Removed column " + c.col}[c.fix.op], unit: c.fix.op === "dedupe" ? "rows" : c.fix.op === "drop" ? "column" : "values"},
        function () { return c.fix.op === "dedupe" ? opDedupe(ds) : c.fix.op === "trim" ? opTrim(ds, j0) : c.fix.op === "tonum" ? opToNum(ds, j0) : opDrop(ds, j0); }); }
    if (c.fix.op === "cluster") { E.clusterCol = c.col; E.clusters = clusterValues(countsOf(ds, c.col), E.clusterMethod); E.picked = Object.create(null); render(); refocus("[data-emerge]", "[data-efind]"); return; }
    E.openFix = +d.efix; render(); refocus("[data-eapply]"); return; }
  if (d.ecancel) { E.openFix = null; render(); return; }
  if (d.eapply) { var form = b.closest(".fixform"), col = form.dataset.ecolName, op = form.dataset.eop, j = idxOf(ds, col);
    if (op === "fill") { var how = document.getElementById("efillhow").value, flag = document.getElementById("efillflag").checked; return applyStep(ds, {op: "fill", col: col, how: how, text: "Filled missing " + col + " with " + {median: "the median", mean: "the average", mode: "the most common value", knn: "values from similar rows (k = 5)"}[how] + (flag ? ", marking filled rows" : "")}, function () { return opFill(ds, j, how, flag); }); }
    if (op === "outliers") { var oh = document.getElementById("eouthow").value; return applyStep(ds, {op: "outliers", col: col, how: oh, text: {flag: "Marked", cap: "Capped", remove: "Removed rows with"}[oh] + " unusual " + col + " values", unit: oh === "remove" ? "rows" : "values"}, function () { return opOutliers(ds, j, oh); }); }
    if (op === "derive") { var dh = document.getElementById("ederhow").value; return applyStep(ds, {op: "derive", col: col, how: dh, text: "Added " + {log: "log10", z: "standardized", bins: "quarter"}[dh] + " column from " + col}, function () { return opDerive(ds, j, dh); }); }
  }
  if (d.efind) { E.clusters = clusterValues(countsOf(ds, E.clusterCol), E.clusterMethod); E.picked = Object.create(null); render(); refocus("[data-emerge]", "[data-efind]"); return; }
  if (d.emerge) { var cl = (E.clusters || []).filter(function (_, i) { return E.picked[i] !== false; }); if (!cl.length) return;
    return applyStep(ds, {op: "merge", col: E.clusterCol, method: E.clusterMethod, groups: cl.map(function (x) { return {values: x.values, into: x.into}; }), text: "Merged " + cl.length + " group" + (cl.length > 1 ? "s" : "") + " of similar " + E.clusterCol + " values"}, function () { return opMerge(ds, idxOf(ds, E.clusterCol), cl); }); }
  if (d.eisorun) { ["Anomaly score", "Anomaly"].forEach(function (n) { var k = idxOf(ds, n); if (k >= 0) { ds.rows = ds.rows.map(function (r) { return r.filter(function (_, i) { return i !== k; }); }); ds.cols = ds.cols.filter(function (_, i) { return i !== k; }); } });
    return applyStep(ds, {op: "isolation-forest", cols: E.iso.cols, share: E.iso.share, text: "Scored rows for unusualness (Isolation Forest, " + E.iso.cols.length + " columns), flagging the top " + E.iso.share * 100 + "%", unit: "rows flagged"}, function () { return opIso(ds, E.iso.cols, E.iso.share); }); }
  if (d.eundo) { var u = E.undo[ds.id].pop(); ds.rows = u.rows; ds.cols = u.cols; ds.recipe = ds.recipe.slice(0, -1); E.msg = "Undid the last step."; render(); saveSet(ds); return; }
  if (d.ereset) { var o = E.orig[ds.id]; ds.rows = o.rows; ds.cols = o.cols; ds.recipe = o.recipe.slice(); E.undo[ds.id] = []; E.msg = "Back to the data as it was before this session's changes."; render(); saveSet(ds); return; }
});
view.addEventListener("change", function (e) {
  if (st.tab !== "enhance") return; var t = e.target, d = t.dataset || {};
  if (d.ecol) { E.clusterCol = t.value; E.clusters = null; render(); return; }
  if (d.emeth) { E.clusterMethod = t.value; if (E.clusters) E.clusters = clusterValues(countsOf(cur(), E.clusterCol), E.clusterMethod); render(); return; }
  if (d.epick != null) { E.picked[+d.epick] = t.checked; return; }
  if (d.einto != null) { E.clusters[+d.einto].into = t.value; return; }
  if (d.eiso != null) { var cs = E.iso.cols; E.iso.cols = t.checked ? cs.concat([d.eiso]) : cs.filter(function (x) { return x !== d.eiso; }); render(); return; }
  if (d.eshare) { E.iso.share = +t.value; render(); return; }
});
function countsOf(ds, name) { var j = idxOf(ds, name), u = Object.create(null); ds.rows.forEach(function (r) { if (r[j] != null) u[r[j]] = (u[r[j]] || 0) + 1; }); return u; }
