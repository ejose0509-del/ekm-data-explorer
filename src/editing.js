// ---------- Data editing: editable grid, filter conditions, variable labels and units, recoding, appending, join types ----------
var ED = {page: 0, edit: false, msg: "", sort: null, recode: {}, append: {}, where: null};

// ---- Variable labels and units ----
function colMeta(ds, name) { var j = ds ? idxOf(ds, name) : -1; return j >= 0 ? ds.cols[j] : null; }
function axisLabel(name) { var c = colMeta(cur(), name); if (!c) return name; var l = c.label || name; return c.unit ? l + " (" + c.unit + ")" : l; }
pick = function (id, label, cols, cur2, allowNone) {   // value is the column name; the text adds its label
  return '<label class="field" for="' + id + '">' + label + '<select id="' + id + '" data-asel="' + id + '">' + (allowNone ? '<option value="">None</option>' : "") +
    cols.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === cur2 ? " selected" : "") + ">" + esc(c.name) + (c.label ? " — " + esc(c.label) : "") + "</option>"; }).join("") + "</select></label>";
};
var _histogram = histogram; histogram = function (v, label) { return _histogram(v, axisLabel(label)); };
var _scatter = scatter; scatter = function (xs, ys, xl, yl, co) { return _scatter(xs, ys, axisLabel(xl), axisLabel(yl), co); };
var _boxplot = boxplot; boxplot = function (names, ds2, yl) { return _boxplot(names, ds2, axisLabel(yl)); };
var _lineChart = lineChart; lineChart = function (lines, xl, yl) { return _lineChart(lines, axisLabel(xl), axisLabel(yl)); };
function parseValueLabels(text) {   // "1 = Male; 2 = Female" → {"1": "Male", "2": "Female"}
  var out = Object.create(null), n = 0;
  String(text || "").split(/[;\n]/).forEach(function (part) { var m = /^\s*([^=]+?)\s*=\s*(.+?)\s*$/.exec(part); if (m) { out[m[1]] = m[2]; n++; } });
  return n ? out : null;
}
function labelsCard(ds) {
  return '<section class="card"><h2>Variable labels and units</h2><p class="count">Labels and units appear on chart axes and in column menus. Value labels map codes to words, e.g. <code>1 = Female; 2 = Male</code>.</p>' +
    '<div class="tablewrap"><table class="nosort vartable"><thead><tr><th>Column</th><th>Label</th><th>Unit</th><th>Value labels</th></tr></thead><tbody>' + ds.cols.map(function (c, j) {
      var vl = c.values ? Object.keys(c.values).map(function (k) { return k + " = " + c.values[k]; }).join("; ") : "";
      return "<tr><td><b>" + esc(c.name) + '</b></td><td><input data-vmeta="label" data-vcol="' + j + '" value="' + esc(c.label || "") + '" maxlength="80" aria-label="Label for ' + esc(c.name) + '"></td><td><input data-vmeta="unit" data-vcol="' + j + '" value="' + esc(c.unit || "") + '" maxlength="24" aria-label="Unit for ' + esc(c.name) + '" class="short"></td><td><input data-vmeta="values" data-vcol="' + j + '" value="' + esc(vl) + '" maxlength="600" aria-label="Value labels for ' + esc(c.name) + '">' + (c.values ? ' <button type="button" class="linkbtn" data-vapply="' + j + '">Apply to the data</button>' : "") + "</td></tr>";
    }).join("") + "</tbody></table></div></section>";
}

// ---- Editable grid ----
var PAGE = 50;
function cellText(v) { return v == null ? "" : typeof v === "number" ? String(v) : String(v); }
function gridCard(ds) {
  var n = ds.rows.length, pages = Math.max(1, Math.ceil(n / PAGE)); ED.page = Math.min(ED.page, pages - 1);
  var order = ds.rows.map(function (_, i) { return i; });
  if (ED.sort && idxOf(ds, ED.sort.col) >= 0) { var j0 = idxOf(ds, ED.sort.col), dir = ED.sort.dir; order.sort(function (a, b) { var x = ds.rows[a][j0], y = ds.rows[b][j0]; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * dir; }); }
  var slice = order.slice(ED.page * PAGE, ED.page * PAGE + PAGE);
  var head = "<tr><th>#</th>" + ds.cols.map(function (c) { var on = ED.sort && ED.sort.col === c.name; return '<th><button type="button" class="linkbtn" data-gsort="' + esc(c.name) + '" aria-label="Sort the view by ' + esc(c.name) + '">' + esc(c.name) + (on ? (ED.sort.dir > 0 ? " ▲" : " ▼") : "") + "</button></th>"; }).join("") + (ED.edit ? "<th></th>" : "") + "</tr>";
  var body = slice.map(function (i) {
    var r = ds.rows[i];
    return '<tr><td class="num count">' + (i + 1) + "</td>" + r.map(function (v, j) {
      if (ED.edit) return '<td><input class="cell" data-cell="' + i + "," + j + '" value="' + esc(cellText(v)) + '" aria-label="Row ' + (i + 1) + ", " + esc(ds.cols[j].name) + '"' + (isNum(ds.cols[j]) ? ' inputmode="decimal"' : "") + "></td>";
      return "<td" + (typeof v === "number" ? ' class="num"' : "") + ">" + (v == null ? '<span class="nd">—</span>' : esc(typeof v === "number" ? f3(v) : String(v).slice(0, 60))) + "</td>";
    }).join("") + (ED.edit ? '<td><button type="button" class="linkbtn" data-gdel="' + i + '" aria-label="Delete row ' + (i + 1) + '">Delete</button></td>' : "") + "</tr>";
  }).join("");
  return '<section class="card"><h2>Rows <span class="count">' + n + " rows · page " + (ED.page + 1) + " of " + pages + "</span></h2>" +
    '<div class="slot"><button type="button" class="btn' + (ED.edit ? " btn-primary" : "") + '" data-gedit="1" aria-pressed="' + ED.edit + '">' + (ED.edit ? "Done editing" : "Edit cells") + "</button>" + (ED.edit ? '<button type="button" class="btn" data-gadd="1">Add a row</button>' : "") +
    '<button type="button" class="btn" data-gpage="-1"' + (ED.page ? "" : " disabled") + '>Previous</button><button type="button" class="btn" data-gpage="1"' + (ED.page < pages - 1 ? "" : " disabled") + ">Next</button>" +
    '<label class="field inline" for="ggo">Go to row<input id="ggo" type="number" min="1" max="' + n + '" inputmode="numeric"></label></div>' +
    (ED.msg ? '<p class="how" role="status">' + esc(ED.msg) + "</p>" : "") + (ED.edit ? '<p class="count">Changes are saved as steps in the change history, so they can be undone and replayed. Sorting only changes the view.</p>' : "") +
    '<div class="tablewrap gridwrap"><table class="nosort grid">' + "<thead>" + head + "</thead><tbody>" + body + "</tbody></table></div></section>";
}
function coerce(ds, j, text) {
  var t = String(text).trim(); if (!t) return {v: null};
  var c = ds.cols[j];
  if (isNum(c)) { var n = parseNum(t); if (typeof n !== "number") return {err: "“" + t + "” is not a number. " + c.name + " holds numbers; change its type first to store text."}; return {v: n}; }
  return {v: t};
}
function opEdit(ds, row, col, value) { var j = idxOf(ds, col); if (j < 0 || row < 0 || row >= ds.rows.length) return {rows: ds.rows, changed: 0, why: "That cell no longer exists."}; if (ds.rows[row][j] === value) return {rows: ds.rows, changed: 0}; var rows = ds.rows.slice(), r = rows[row].slice(); r[j] = value; rows[row] = r; return {rows: rows, changed: 1}; }
function opAddRow(ds) { return {rows: ds.rows.concat([ds.cols.map(function () { return null; })]), changed: 1}; }
function opDelRow(ds, row) { if (row < 0 || row >= ds.rows.length) return {rows: ds.rows, changed: 0}; return {rows: ds.rows.filter(function (_, i) { return i !== row; }), changed: 1}; }

// ---- Filter conditions (apply to Analyze and Charts) ----
var OPS = {number: [["eq", "="], ["ne", "≠"], ["lt", "<"], ["le", "≤"], ["gt", ">"], ["ge", "≥"], ["between", "between"], ["missing", "is missing"], ["present", "is not missing"]],
  text: [["is", "is"], ["isnot", "is not"], ["in", "is one of"], ["contains", "contains"], ["missing", "is missing"], ["present", "is not missing"]]};
function condTest(ds, c) {
  var j = idxOf(ds, c.col); if (j < 0) return null;
  var num = isNum(ds.cols[j]), v1 = num ? parseNum(c.v) : String(c.v || ""), v2 = num ? parseNum(c.v2) : null, list = String(c.v || "").split(",").map(function (s) { return s.trim(); });
  return function (r) {
    var x = r[j];
    switch (c.op) {
      case "missing": return x == null; case "present": return x != null;
      case "eq": return x === v1; case "ne": return x !== v1; case "lt": return x != null && x < v1; case "le": return x != null && x <= v1; case "gt": return x != null && x > v1; case "ge": return x != null && x >= v1;
      case "between": return x != null && x >= Math.min(v1, v2) && x <= Math.max(v1, v2);
      case "is": return x != null && String(x) === v1; case "isnot": return x == null || String(x) !== v1; case "in": return x != null && list.indexOf(String(x)) >= 0;
      case "contains": return x != null && String(x).toLowerCase().indexOf(v1.toLowerCase()) >= 0;
    }
    return true;
  };
}
function whereRows(ds, rows, w) {
  if (!w || !w.conds || !w.conds.length) return rows;
  var tests = w.conds.map(function (c) { return condTest(ds, c); }).filter(Boolean); if (!tests.length) return rows;
  return rows.filter(function (r) { return w.any ? tests.some(function (t) { return t(r); }) : tests.every(function (t) { return t(r); }); });
}
var _filterRows = filterRows;
filterRows = function (ds) { return whereRows(ds, _filterRows(ds), A.sel.where); };
function whereText(w) { return (w.conds || []).map(function (c) { var op = (OPS.number.concat(OPS.text).filter(function (o) { return o[0] === c.op; })[0] || [0, c.op])[1]; return c.col + " " + op + (c.op === "missing" || c.op === "present" ? "" : " " + c.v + (c.op === "between" ? " and " + c.v2 : "")); }).join(w.any ? " or " : " and "); }
function filterCard(ds) {
  var w = A.sel.where || {conds: [], any: false}, all = ds.cols.filter(function (c) { return c.type !== "empty"; }), n = filterRows(ds).length;
  var rows = w.conds.map(function (c, i) {
    var col = colMeta(ds, c.col) || all[0], ops = isNum(col) ? OPS.number : OPS.text, needV = c.op !== "missing" && c.op !== "present";
    var vals = !isNum(col) ? (function () { var u = Object.create(null); ds.rows.forEach(function (r) { var v = r[idxOf(ds, col.name)]; if (v != null) u[v] = 1; }); return Object.keys(u).sort().slice(0, 200); })() : [];
    return '<div class="cond toolbar"><label class="field">Column<select data-wcol="' + i + '">' + all.map(function (x) { return '<option value="' + esc(x.name) + '"' + (x.name === col.name ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></label>" +
      '<label class="field">Condition<select data-wop="' + i + '">' + ops.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === c.op ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      (needV ? '<label class="field">Value<input data-wv="' + i + '" value="' + esc(c.v || "") + '"' + (vals.length ? ' list="wl' + i + '"' : "") + (isNum(col) ? ' inputmode="decimal"' : "") + ">" + (vals.length ? '<datalist id="wl' + i + '">' + vals.map(function (v) { return '<option value="' + esc(v) + '">'; }).join("") + "</datalist>" : "") + "</label>" : "") +
      (c.op === "between" ? '<label class="field">and<input data-wv2="' + i + '" value="' + esc(c.v2 || "") + '" inputmode="decimal"></label>' : "") +
      '<button type="button" class="linkbtn" data-wrm="' + i + '" aria-label="Remove condition ' + (i + 1) + '">Remove</button></div>';
  }).join("");
  var cats = ds.cols.filter(function (c) { return c.type === "category"; }), fcol = A.sel.f ? colMeta(ds, A.sel.f) : null, fvals = [];
  if (fcol) { var u2 = Object.create(null); colVals(ds, idxOf(ds, A.sel.f)).forEach(function (v) { if (v != null) u2[v] = 1; }); fvals = Object.keys(u2).sort(); }
  var quick = cats.length ? '<div class="toolbar">' + pick("f", "Where", cats, A.sel.f, true) + (fcol ? '<label class="field" for="fv">is<select id="fv" data-asel="fv"><option value="">Choose…</option>' + fvals.map(function (v) { return '<option value="' + esc(v) + '"' + (v === A.sel.fv ? " selected" : "") + ">" + esc(v) + "</option>"; }).join("") + "</select></label>" : "") + "</div>" : "";
  var on = w.conds.length || (A.sel.f && A.sel.fv);
  return '<details class="subset"' + (on || A.sel.f || ED.whereOpen ? " open" : "") + ' data-wopen="1"><summary>Use only some rows' + (on ? " · " + n + " of " + ds.rows.length + " rows" : "") + "</summary>" + quick + (quick ? '<p class="count">Or combine conditions on any column:</p>' : "") +
    (w.conds.length > 1 ? '<div class="toolbar"><label class="field">Keep rows that match<select data-wany="1"><option value="all"' + (w.any ? "" : " selected") + '>all conditions</option><option value="any"' + (w.any ? " selected" : "") + ">any condition</option></select></label></div>" : "") + rows +
    '<div class="slot"><button type="button" class="btn" data-wadd="1">Add a condition</button>' + (w.conds.length ? '<button type="button" class="btn" data-wclear="1">Use all rows</button><button type="button" class="btn" data-wsave="1">Save these rows as a new dataset</button><button type="button" class="btn" data-wdrop="1">Remove the other rows</button>' : "") + "</div></details>";
}
function opFilter(ds, w) { var keep = whereRows(ds, ds.rows, w); return {rows: keep, changed: ds.rows.length - keep.length}; }
var _analyzeView2 = analyzeView;
analyzeView = function () {
  var h = _analyzeView2(), ds = cur(); if (!ds || !ds.rows) return h;
  h = h.replace(/<details class="subset"[\s\S]*?<\/details>/, "");
  return h.replace('<div class="poster">', filterCard(ds) + '<div class="poster">');
};
VIEWS.analyze = analyzeView;
var _chartsView2 = VIEWS.charts;
VIEWS.charts = function () { var h = _chartsView2(), ds = cur(); if (!ds || !ds.rows) return h; return h.replace('<section class="card"><div class="chartwrap">', filterCard(ds) + '<section class="card"><div class="chartwrap">'); };

// ---- Recode values and append rows (Clean & enhance → Combine and reshape) ----
function opRecode(ds, spec) {
  var j = idxOf(ds, spec.col); if (j < 0) throw new Error("Column “" + spec.col + "” is not in this dataset.");
  var f;
  if (spec.mode === "bins") {
    var br = spec.breaks.slice().sort(function (a, b) { return a - b; }), lab = spec.labels || [];
    f = function (x) { if (typeof x !== "number") return null; for (var i = 0; i < br.length; i++) if (x < br[i]) return lab[i] || (i ? br[i - 1] + " to under " + br[i] : "under " + br[0]); return lab[br.length] || br[br.length - 1] + " or more"; };
  } else { var m = spec.map; f = function (x) { if (x == null) return Object.prototype.hasOwnProperty.call(m, "") ? (m[""] === "" ? null : m[""]) : null; var k = String(x); if (!Object.prototype.hasOwnProperty.call(m, k)) return x; var v = m[k]; return v === "" ? null : v; }; }
  var changed = 0, newVals = ds.rows.map(function (r) { var v = f(r[j]); if (v !== r[j]) changed++; return v; });
  var allNum = newVals.every(function (v) { return v == null || typeof v === "number" || (typeof v === "string" && typeof parseNum(v) === "number"); }) && spec.mode !== "bins";
  var typed = newVals.map(function (v) { return allNum && v != null ? parseNum(v) : v == null ? null : String(v); }), type = allNum ? "number" : "category";
  if (spec.into && spec.into !== spec.col) {
    var name = uniqueColumnName(spec.into, ds.cols.map(function (c) { return c.name; }));
    return {rows: ds.rows.map(function (r, i) { return r.concat([typed[i]]); }), cols: ds.cols.concat([{name: name, type: type}]), changed: changed};
  }
  var cols = ds.cols.slice(); cols[j] = Object.assign({}, cols[j], {type: type});
  return {rows: ds.rows.map(function (r, i) { if (typed[i] === r[j]) return r; var r2 = r.slice(); r2[j] = typed[i]; return r2; }), cols: cols, changed: changed};
}
function recodeSection(ds) {
  var Rc = ED.recode, col = colMeta(ds, Rc.col) || ds.cols[0]; Rc.col = col.name; Rc.mode = Rc.mode || (isNum(col) ? "bins" : "map");
  var u = Object.create(null); ds.rows.forEach(function (r) { var v = r[idxOf(ds, col.name)]; u[v == null ? "" : String(v)] = (u[v == null ? "" : String(v)] || 0) + 1; });
  var keys = Object.keys(u).sort(function (a, b) { return u[b] - u[a]; }), many = keys.length > 60;
  var body = Rc.mode === "map" ? (many ? '<p class="count">' + keys.length + " distinct values; the 60 most common are listed. Values you leave as they are stay unchanged.</p>" : '<p class="count">Type a new value next to any you want to change; leave a box as it is to keep the value, or clear it to make the value missing.</p>') +
      '<div class="tablewrap"><table class="nosort"><thead><tr><th>Current value</th><th>Rows</th><th>New value</th></tr></thead><tbody>' + keys.slice(0, 60).map(function (k, i) { return "<tr><td>" + (k === "" ? '<span class="nd">(missing)</span>' : esc(k)) + '</td><td class="num">' + u[k] + '</td><td><input data-rcv="' + esc(k) + '" value="' + esc(Rc.map && Rc.map[k] != null ? Rc.map[k] : k) + '" aria-label="New value for ' + esc(k || "missing") + '"></td></tr>'; }).join("") + "</tbody></table></div>"
    : '<label class="field" for="rcbreaks">Cut points (comma separated)<input id="rcbreaks" data-rcb="breaks" value="' + esc(Rc.breaks || "") + '" placeholder="18, 40, 65" inputmode="decimal"></label><label class="field" for="rclabels">Group names, lowest first (optional, one more than the cut points)<input id="rclabels" data-rcb="labels" value="' + esc(Rc.labels || "") + '" placeholder="Under 18, 18–39, 40–64, 65+"></label><p class="count">Each group includes its lower cut point: 18 belongs to “18 to under 40”.</p>';
  return '<div class="dt-body"><div class="toolbar"><label class="field" for="rccol">Column<select id="rccol" data-rcs="col">' + opt(ds.cols, col.name) + '</select></label><label class="field" for="rcmode">How<select id="rcmode" data-rcs="mode"><option value="map"' + (Rc.mode === "map" ? " selected" : "") + ">Change individual values</option>" + (isNum(col) ? '<option value="bins"' + (Rc.mode === "bins" ? " selected" : "") + ">Group numbers into ranges</option>" : "") + '</select></label><label class="field" for="rcinto">Put the result in<input id="rcinto" data-rcs="into" value="' + esc(Rc.into != null ? Rc.into : col.name + " (recoded)") + '" maxlength="60"></label></div>' + body +
    '<p class="count">Type the column\'s own name in “Put the result in” to replace it.</p><button type="button" class="btn btn-primary" data-ed="recode">Recode</button></div>';
}
function appendSection(ds) {
  var others = A.sets.filter(function (s) { return s.id !== ds.id; }); if (!others.length) return '<p class="count">Add a second dataset under Your data to append its rows.</p>';
  var ap = ED.append, o = others.filter(function (s) { return s.id === ap.with; })[0] || others[0]; ap.with = o.id; if (!o.rows) { loadRows(o).then(render); return '<p class="count">Loading ' + esc(o.name) + "…</p>"; }
  var mine = ds.cols.map(function (c) { return c.name; }), theirs = o.cols.map(function (c) { return c.name; }), both = mine.filter(function (n) { return theirs.indexOf(n) >= 0; });
  return '<div class="dt-body"><div class="toolbar"><label class="field" for="apwith">Append rows from<select id="apwith" data-aps="with">' + others.map(function (s) { return '<option value="' + s.id + '"' + (s.id === o.id ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + '</select></label><label class="chk"><input type="checkbox" data-aps="src"' + (ap.src !== false ? " checked" : "") + "> Add a column naming each row's source</label></div>" +
    '<p class="count">Columns are matched by name: ' + both.length + " shared" + (mine.length - both.length ? ", " + (mine.length - both.length) + " only here" : "") + (theirs.length - both.length ? ", " + (theirs.length - both.length) + " only in " + esc(o.name) : "") + '. Unmatched columns are kept and left empty for the other dataset\'s rows. The result is a new dataset.</p><button type="button" class="btn btn-primary" data-ed="append">Append</button></div>';
}
function appendSets(a, b, withSource) {
  var names = a.cols.map(function (c) { return c.name; }); b.cols.forEach(function (c) { if (names.indexOf(c.name) < 0) names.push(c.name); });
  var cols = names.map(function (n) { var ca = colMeta(a, n), cb = colMeta(b, n); var t = ca && cb ? (ca.type === cb.type ? ca.type : isNum(ca) && isNum(cb) ? "number" : "text") : (ca || cb).type; return Object.assign({}, ca || cb, {name: n, type: t}); });
  var conv = function (ds, n, v) { var c = colMeta(ds, n); if (v == null) return null; var t = cols[names.indexOf(n)].type; return t === "number" || t === "year" ? (typeof v === "number" ? v : parseNum(v) === undefined ? null : parseNum(v)) : typeof v === "number" && t !== "number" ? String(v) : v; };
  var rows = [a, b].map(function (ds) { return ds.rows.map(function (r) { var out = names.map(function (n) { var j = idxOf(ds, n); return j < 0 ? null : conv(ds, n, r[j]); }); if (withSource) out.push(ds.name); return out; }); });
  if (withSource) cols.push({name: uniqueColumnName("Source", names), type: "category"});
  return {cols: cols, rows: rows[0].concat(rows[1])};
}
// Join with SQL semantics: every matching pair of rows is kept
function joinTyped(L, Rt, kl, kr, type, every) {
  var li = idxOf(L, kl), ri = idxOf(Rt, kr), map = Object.create(null), dupKeys = 0;
  Rt.rows.forEach(function (r, i) { var k = r[ri] == null ? null : String(r[ri]).trim(); if (k == null) return; if (map[k]) { if (map[k].length === 1) dupKeys++; map[k].push(i); } else map[k] = [i]; });
  var keep = Rt.cols.map(function (_, j) { return j; }).filter(function (j) { return j !== ri; }), names = L.cols.map(function (c) { return c.name; });
  var rcols = keep.map(function (j) { var n = uniqueColumnName(Rt.cols[j].name, names); names.push(n); return Object.assign({}, Rt.cols[j], {name: n}); });
  var rows = [], used = Object.create(null), matched = 0, blankR = keep.map(function () { return null; });
  L.rows.forEach(function (r) {
    var k = r[li] == null ? null : String(r[li]).trim(), hits = k != null && map[k] ? map[k] : null;
    if (type === "semi") { if (hits) { rows.push(r.slice()); matched++; } return; }
    if (type === "anti") { if (!hits) rows.push(r.slice()); else matched++; return; }
    if (hits && !every) hits = hits.slice(0, 1);
    if (hits) { matched++; hits.forEach(function (ix) { used[ix] = 1; rows.push(r.concat(keep.map(function (j) { return Rt.rows[ix][j]; }))); }); }
    else if (type === "left" || type === "full") rows.push(r.concat(blankR));
  });
  if (type === "right" || type === "full") Rt.rows.forEach(function (r, ix) { var k2 = r[ri] == null ? null : String(r[ri]).trim(); if (used[ix] || (!every && k2 != null && map[k2] && map[k2][0] !== ix && used[map[k2][0]])) return; var out = L.cols.map(function () { return null; }); out[li] = r[ri]; rows.push(out.concat(keep.map(function (j) { return r[j]; }))); });
  var cols = type === "semi" || type === "anti" ? L.cols.slice() : L.cols.concat(rcols);
  return {cols: cols, rows: rows, matched: matched, dupKeys: dupKeys};
}
var JOINS = [["left", "Keep every row here (left join)"], ["inner", "Only rows with a match in both (inner join)"], ["right", "Keep every row there (right join)"], ["full", "Keep every row from both (full join)"], ["semi", "Rows here that have a match (semi join)"], ["anti", "Rows here without a match (anti join)"]];
var _toolsPanel = toolsPanel;
toolsPanel = function (ds) {
  var h = _toolsPanel(ds), jt = DT.join.type || "left";
  h = h.replace(/<p class="count">Keeps every row of this dataset[^<]*<\/p>/, '<label class="field" for="jtype">Which rows to keep<select id="jtype" data-dtj="type">' + JOINS.map(function (j) { return '<option value="' + j[0] + '"' + (j[0] === jt ? " selected" : "") + ">" + j[1] + "</option>"; }).join("") + '</select></label><label class="field" for="jmany">If a key repeats there<select id="jmany" data-dtj="many"><option value="first"' + (DT.join.many === "every" ? "" : " selected") + '>Use its first row (lookup)</option><option value="every"' + (DT.join.many === "every" ? " selected" : "") + '>Use every matching row (SQL join)</option></select></label><p class="count">Rows match when the two key values are equal (ignoring surrounding spaces). The result is a new dataset.</p>');
  var sec = function (id, title, body) { return '<details class="dt"' + (DT.open === id ? " open" : "") + ' data-dtsec="' + id + '"><summary>' + title + "</summary>" + body + "</details>"; };
  return h.replace(/<\/section>\s*$/, sec("recode", "Recode values or group numbers into ranges", recodeSection(ds)) + sec("append", "Append rows from another dataset", appendSection(ds)) + "</section>");
};

// ---- Your data: replace the preview with the grid and add the labels card ----
var _dataView2 = VIEWS.data;
VIEWS.data = function () {
  var h = _dataView2(), ds = cur(); if (!ds || !ds.rows) return h;
  h = h.replace(/<section class="card"><h2>First rows<\/h2>[\s\S]*?<\/table><\/div><\/section>/, gridCard(ds));
  return h.replace(/(<\/div><div class="aside">)/, labelsCard(ds) + "$1");
};

// ---- Events ----
view.addEventListener("change", function (e) {
  var t = e.target, d = t.dataset || {}, ds = cur(); if (!ds) return;
  if (d.vmeta) {
    var j = +d.vcol, c = ds.cols[j]; if (!c) return; var cols = ds.cols.slice(), nc = Object.assign({}, c);
    if (d.vmeta === "values") { var vl = parseValueLabels(t.value); if (vl) nc.values = vl; else delete nc.values; } else { var v = t.value.trim(); if (v) nc[d.vmeta] = v; else delete nc[d.vmeta]; }
    cols[j] = nc; ds.cols = cols; saveMeta(ds); try { if (typeof auditLog === "function") auditLog("label", ds, "Set " + d.vmeta + " of " + c.name); } catch (err) {} render(); refocus('[data-vmeta="' + d.vmeta + '"][data-vcol="' + j + '"]'); return;
  }
  if (d.cell) {
    var p = d.cell.split(","), row = +p[0], col = +p[1], cv = coerce(ds, col, t.value);
    if (cv.err) { ED.msg = cv.err; render(); return; }
    var name = ds.cols[col].name, old = ds.rows[row][col]; if (old === cv.v) return;
    ED.msg = ""; applyStep(ds, {op: "edit", row: row, col: name, value: cv.v, old: old, text: "Edited row " + (row + 1) + ", " + name + ": " + cellText(old) + " → " + cellText(cv.v), unit: "cell"}, function () { return opEdit(ds, row, name, cv.v); });
    refocus('[data-cell="' + row + "," + col + '"]'); return;
  }
  if (t.id === "ggo") { var r = Math.max(1, Math.min(ds.rows.length, +t.value || 1)); ED.sort = null; ED.page = Math.floor((r - 1) / PAGE); render(); refocus('[data-cell^="' + (r - 1) + ',"]'); return; }
  var w = A.sel.where || {conds: [], any: false};
  if (d.wcol != null) { var c2 = colMeta(ds, t.value); w.conds[+d.wcol] = {col: t.value, op: isNum(c2) ? "eq" : "is", v: ""}; A.sel.where = {conds: w.conds.slice(), any: w.any}; render(); refocus('[data-wcol="' + d.wcol + '"]'); return; }
  if (d.wop != null) { w.conds[+d.wop].op = t.value; A.sel.where = {conds: w.conds.slice(), any: w.any}; render(); refocus('[data-wop="' + d.wop + '"]'); return; }
  if (d.wv != null) { w.conds[+d.wv].v = t.value; A.sel.where = {conds: w.conds.slice(), any: w.any}; render(); refocus('[data-wv="' + d.wv + '"]'); return; }
  if (d.wv2 != null) { w.conds[+d.wv2].v2 = t.value; A.sel.where = {conds: w.conds.slice(), any: w.any}; render(); return; }
  if (d.wany) { A.sel.where = {conds: w.conds.slice(), any: t.value === "any"}; render(); return; }
  if (d.rcs) { if (d.rcs === "col") { ED.recode = {col: t.value}; } else ED.recode[d.rcs] = t.value; DT.open = "recode"; if (d.rcs !== "into") render(); return; }
  if (d.rcv != null) { ED.recode.map = ED.recode.map || {}; ED.recode.map[d.rcv] = t.value; return; }
  if (d.rcb) { ED.recode[d.rcb] = t.value; return; }
  if (d.aps) { if (d.aps === "src") ED.append.src = t.checked; else ED.append[d.aps] = t.value; DT.open = "append"; render(); return; }
});
view.addEventListener("click", function (e) { var sm = e.target.closest("summary"), d = sm && sm.parentElement; if (d && d.dataset.wopen) ED.whereOpen = !d.open; }, true);
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset, ds = cur(); if (!ds) return;
  if (d.gedit) { ED.edit = !ED.edit; ED.msg = ""; render(); refocus("[data-gedit]"); return; }
  if (d.gpage) { ED.page = Math.max(0, ED.page + +d.gpage); render(); refocus('[data-gpage="' + d.gpage + '"]'); return; }
  if (d.gsort) { ED.sort = ED.sort && ED.sort.col === d.gsort ? (ED.sort.dir > 0 ? {col: d.gsort, dir: -1} : null) : {col: d.gsort, dir: 1}; ED.page = 0; render(); refocus('[data-gsort="' + d.gsort + '"]'); return; }
  if (d.gadd) { applyStep(ds, {op: "addrow", text: "Added an empty row", unit: "row"}, function () { return opAddRow(ds); }); ED.sort = null; ED.page = Math.floor((ds.rows.length - 1) / PAGE); render(); return; }
  if (d.gdel != null) { var i = +d.gdel; applyStep(ds, {op: "delrow", row: i, text: "Deleted row " + (i + 1), unit: "row", removed: ds.rows[i]}, function () { return opDelRow(ds, i); }); return; }
  if (d.vapply != null) { var j = +d.vapply, c = ds.cols[j]; applyStep(ds, {op: "recode", spec: {col: c.name, mode: "map", map: c.values, into: c.name}, text: "Applied value labels to " + c.name}, function () { return opRecode(ds, {col: c.name, mode: "map", map: c.values, into: c.name}); }); return; }
  var w = A.sel.where || {conds: [], any: false};
  if (d.wadd) { var first = ds.cols.filter(function (c) { return c.type !== "empty"; })[0]; A.sel.where = {conds: w.conds.concat([{col: first.name, op: isNum(first) ? "eq" : "is", v: ""}]), any: w.any}; ED.whereOpen = true; render(); refocus('[data-wcol="' + (A.sel.where.conds.length - 1) + '"]'); return; }
  if (d.wrm != null) { A.sel.where = {conds: w.conds.filter(function (_, i) { return i !== +d.wrm; }), any: w.any}; render(); return; }
  if (d.wclear) { A.sel.where = null; render(); return; }
  if (d.wsave) { var keep = filterRows(ds); addDerived(ds.name + " (subset)", ds.cols.slice(), keep.map(function (r) { return r.slice(); }), "Rows where " + whereText(w) + "."); A.sel.where = null; render(); return; }
  if (d.wdrop) { var spec = {conds: w.conds.slice(), any: w.any}; A.sel.where = null; applyStep(ds, {op: "filter", where: spec, text: "Kept only rows where " + whereText(spec), unit: "rows removed"}, function () { return opFilter(ds, spec); }); return; }
  if (d.ed === "recode") {
    var Rc = ED.recode, spec2 = {col: Rc.col, mode: Rc.mode, into: (Rc.into != null ? Rc.into : Rc.col + " (recoded)").trim() || Rc.col};
    DT.open = "recode";
    if (Rc.mode === "bins") { var br = String(Rc.breaks || "").split(",").map(function (s) { return parseNum(s); }).filter(function (v) { return typeof v === "number"; }); if (!br.length) { DT.msg = "Enter at least one cut point, e.g. 18, 65."; render(); return; } spec2.breaks = br; var lb = String(Rc.labels || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean); if (lb.length) { if (lb.length !== br.length + 1) { DT.msg = "Give " + (br.length + 1) + " group names for " + br.length + " cut points, or leave the names empty."; render(); return; } spec2.labels = lb; } }
    else { var m = {}; Object.keys(Rc.map || {}).forEach(function (k) { if (Rc.map[k] !== k) m[k] = Rc.map[k]; }); if (!Object.keys(m).length) { DT.msg = "Change at least one value first."; render(); return; } spec2.map = m; }
    applyStep(ds, {op: "recode", spec: spec2, text: "Recoded " + spec2.col + (spec2.into !== spec2.col ? " into " + spec2.into : "")}, function () { return opRecode(ds, spec2); });
    ED.recode = {col: Rc.col}; return;
  }
  if (d.ed === "append") { var o = A.sets.filter(function (s) { return s.id === ED.append.with; })[0]; if (!o || !o.rows) return; var ap = appendSets(ds, o, ED.append.src !== false); addDerived(ds.name + " + " + o.name + " (appended)", ap.cols, ap.rows, "Rows of " + ds.name + " followed by rows of " + o.name + "."); DT.msg = "Appended " + o.rows.length + " rows. The combined data (" + ap.rows.length + " rows) is now the current dataset."; DT.open = "append"; render(); return; }
}, false);
// Typed joins replace the left-only join
view.addEventListener("click", function (e) {
  var b = e.target.closest('button[data-dt="join"]'); if (!b || st.tab !== "enhance") return;
  e.stopImmediatePropagation();
  var ds = cur(), other = A.sets.filter(function (s) { return s.id === (DT.join.with || (A.sets.filter(function (x) { return x.id !== ds.id; })[0] || {}).id); })[0]; DT.open = "join";
  if (!other || !other.rows) { DT.msg = "The other dataset is still loading. Try again in a moment."; render(); return; }
  var kl = DT.join.kl || ds.cols[0].name, kr = DT.join.kr || other.cols[0].name, type = DT.join.type || "left", every = DT.join.many === "every", j = joinTyped(ds, other, kl, kr, type, every);
  addDerived(ds.name + " + " + other.name, j.cols, j.rows, (JOINS.filter(function (x) { return x[0] === type; })[0][1]) + " on " + kl + " = " + kr + ".");
  DT.msg = j.matched + " of " + ds.rows.length + " rows here found a match; the result has " + j.rows.length + " rows" + (j.dupKeys ? ". " + j.dupKeys + " repeated keys in " + other.name + (every ? " produced one row per match" : " used their first row") : "") + ". It is now the current dataset."; render();
}, true);
var _replayStep4 = replayStep;
replayStep = function (ds, s2) {
  if (s2.op === "edit") return opEdit(ds, s2.row, s2.col, s2.value);
  if (s2.op === "addrow") return opAddRow(ds);
  if (s2.op === "delrow") return opDelRow(ds, s2.row);
  if (s2.op === "filter") return opFilter(ds, s2.where);
  if (s2.op === "recode") return opRecode(ds, s2.spec);
  return _replayStep4(ds, s2);
};
