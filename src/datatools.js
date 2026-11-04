// ---------- Combine and reshape: formula columns, joins, wide/long, replaying steps ----------
var DT = {open: "", msg: "", join: {}, melt: {}, pivot: {}};

// Formula columns: + − * / ^, parentheses, column names (bare or in [brackets]), and log, ln, sqrt, abs, exp, round, min, max.
var FN = {log: Math.log10, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, round: function (x, d) { var m = Math.pow(10, d || 0); return Math.round(x * m) / m; }, min: Math.min, max: Math.max};
function parseFormula(src, ds) {
  var toks = [], i = 0, names = ds.cols.map(function (c) { return c.name; }).sort(function (a, b) { return b.length - a.length; });
  while (i < src.length) {
    var ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === "[") { var e = src.indexOf("]", i); if (e < 0) throw "A [column] bracket is not closed."; toks.push({t: "col", v: src.slice(i + 1, e)}); i = e + 1; continue; }
    var num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(src.slice(i)); if (num) { toks.push({t: "num", v: +num[0]}); i += num[0].length; continue; }
    if ("+-*/^(),".indexOf(ch) >= 0) { toks.push({t: ch}); i++; continue; }
    var hit = names.filter(function (n) { return src.slice(i, i + n.length) === n; })[0];
    if (hit) { toks.push({t: "col", v: hit}); i += hit.length; continue; }
    var id = /^[A-Za-z_]\w*/.exec(src.slice(i)); if (id && Object.prototype.hasOwnProperty.call(FN, id[0].toLowerCase())) { toks.push({t: "fn", v: id[0].toLowerCase()}); i += id[0].length; continue; }
    throw "“" + src.slice(i, i + 12) + "” is not a column, number or function.";
  }
  var p = 0, peek = function () { return toks[p] || {}; }, eat = function (t) { if (peek().t !== t) throw "Expected “" + t + "”."; p++; };
  function prim() {
    var k = peek(); p++;
    if (k.t === "num") return {n: k.v}; if (k.t === "col") { if (idxOf(ds, k.v) < 0) throw "No column named “" + k.v + "”."; return {c: idxOf(ds, k.v)}; }
    if (k.t === "-") return {op: "neg", a: pow()};
    if (k.t === "(") { var e = add(); eat(")"); return e; }
    if (k.t === "fn") { eat("("); var args = [add()]; while (peek().t === ",") { p++; args.push(add()); } eat(")"); return {fn: k.v, args: args}; }
    throw "The formula ends too early or has an extra symbol.";
  }
  function pow() { var a = prim(); if (peek().t === "^") { p++; return {op: "^", a: a, b: pow()}; } return a; }
  function mul() { var a = pow(); while (peek().t === "*" || peek().t === "/") { var o = peek().t; p++; a = {op: o, a: a, b: pow()}; } return a; }
  function add() { var a = mul(); while (peek().t === "+" || peek().t === "-") { var o = peek().t; p++; a = {op: o, a: a, b: mul()}; } return a; }
  var ast = add(); if (p < toks.length) throw "Unexpected “" + (toks[p].v || toks[p].t) + "”.";
  return ast;
}
function evalF(node, row) {
  if (node.n != null) return node.n;
  if (node.c != null) { var v = row[node.c]; return typeof v === "number" ? v : null; }
  if (node.fn) { var a = node.args.map(function (x) { return evalF(x, row); }); if (a.some(function (x) { return x == null; })) return null; var r = FN[node.fn].apply(null, a); return isFinite(r) ? r : null; }
  var x = evalF(node.a, row); if (x == null) return null;
  if (node.op === "neg") return -x;
  var y = evalF(node.b, row); if (y == null) return null;
  var out = node.op === "+" ? x + y : node.op === "-" ? x - y : node.op === "*" ? x * y : node.op === "/" ? (y === 0 ? null : x / y) : Math.pow(x, y);
  return out != null && isFinite(out) ? out : null;
}
function opFormula(ds, name, expr) {
  var ast = parseFormula(expr, ds), n = 0, rows = ds.rows.map(function (r) { var v = evalF(ast, r); if (v != null) n++; return r.concat([v == null ? null : +v.toPrecision(10)]); });
  return {rows: rows, cols: ds.cols.concat([{name: name, type: "number"}]), changed: n};
}

// Join: keep every row here, add the other dataset's columns where the keys match (a left join)
function joinSets(L, Rt, kl, kr) {
  var ri = idxOf(Rt, kr), li = idxOf(L, kl), map = Object.create(null), dup = 0;
  Rt.rows.forEach(function (r) { var k = r[ri] == null ? null : String(r[ri]).trim(); if (k == null) return; if (map[k]) dup++; else map[k] = r; });
  var keep = Rt.cols.map(function (_, j) { return j; }).filter(function (j) { return j !== ri; }), names = Object.create(null); L.cols.forEach(function (c) { names[c.name] = 1; });
  var cols = L.cols.concat(keep.map(function (j) { var n = Rt.cols[j].name; n = uniqueColumnName(n, Object.keys(names)); names[n] = true; return {name: n, type: Rt.cols[j].type}; })), hit = 0;
  var rows = L.rows.map(function (r) { var m = r[li] == null ? null : map[String(r[li]).trim()]; if (m) hit++; return r.concat(keep.map(function (j) { return m ? m[j] : null; })); });
  return {cols: cols, rows: rows, hit: hit, dup: dup};
}
function addDerived(name, cols, rows, note) {
  var ds = {id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name, origin: "file", source: "", note: note, added: new Date().toISOString().slice(0, 10), cols: cols, rows: rows, saved: false, recipe: []};
  A.sets.unshift(ds); pickSet(ds.id); saveSet(ds); return ds;
}
// Wide → long (melt) and long → wide (pivot)
function melt(ds, ids) {
  var idI = ids.map(function (n) { return idxOf(ds, n); }), val = ds.cols.map(function (_, j) { return j; }).filter(function (j) { return idI.indexOf(j) < 0; }), rows = [];
  ds.rows.forEach(function (r) { val.forEach(function (j) { rows.push(idI.map(function (i) { return r[i]; }).concat([ds.cols[j].name, r[j]])); }); });
  var numeric = val.every(function (j) { return isNum(ds.cols[j]); });
  var variable = uniqueColumnName('variable', ids), value = uniqueColumnName('value', ids.concat([variable]));
  return {cols: ids.map(function (n) { return ds.cols[idxOf(ds, n)]; }).concat([{name: variable, type: "category"}, {name: value, type: numeric ? "number" : "text"}]), rows: rows};
}
function widen(ds, id, key, val) {
  var ii = idxOf(ds, id), ki = idxOf(ds, key), vi = idxOf(ds, val), order = [], keys = [], m = Object.create(null), clash = 0;
  ds.rows.forEach(function (r) { var a = r[ii], k = r[ki]; if (a == null || k == null) return; if (!m[a]) { m[a] = Object.create(null); order.push(a); } if (keys.indexOf(k) < 0) keys.push(k); if (m[a][k] !== undefined) clash++; m[a][k] = r[vi]; });
  var wideNames = [ds.cols[ii].name];
  return {cols: [ds.cols[ii]].concat(keys.map(function (k) { var name = uniqueColumnName(String(k), wideNames); wideNames.push(name); return {name: name, type: ds.cols[vi].type}; })), rows: order.map(function (a) { return [a].concat(keys.map(function (k) { return m[a][k] === undefined ? null : m[a][k]; })); }), clash: clash};
}
// Replay recorded steps on another dataset
function replayStep(ds, st2) {
  var j = st2.col ? idxOf(ds, st2.col) : -1;
  if (st2.col && j < 0 && st2.op !== "formula") return null;
  if (st2.op === "dedupe") return opDedupe(ds); if (st2.op === "trim") return opTrim(ds, j); if (st2.op === "tonum") return opToNum(ds, j); if (st2.op === "drop") return opDrop(ds, j);
  if (st2.op === "fill") return opFill(ds, j, st2.how, /marking/.test(st2.text || ""));
  if (st2.op === "outliers") return opOutliers(ds, j, st2.how); if (st2.op === "derive") return opDerive(ds, j, st2.how);
  if (st2.op === "merge") return opMerge(ds, j, st2.groups || []);
  if (st2.op === "isolation-forest") return (st2.cols || []).every(function (c) { return idxOf(ds, c) >= 0; }) ? opIso(ds, st2.cols, st2.share) : null;
  if (st2.op === "formula") return opFormula(ds, st2.name, st2.expr);
  return null;
}
function replayAll(ds, steps) {
  var done = 0, skipped = 0;
  steps.forEach(function (st2) {
    var res; try { res = replayStep(ds, st2); } catch (e) { res = null; }
    if (!res || !res.changed) { skipped++; return; }
    (E.undo[ds.id] = E.undo[ds.id] || []).push({rows: ds.rows, cols: JSON.parse(JSON.stringify(ds.cols))});
    if (!E.orig[ds.id]) E.orig[ds.id] = {rows: ds.rows, cols: JSON.parse(JSON.stringify(ds.cols)), recipe: (ds.recipe || []).slice()};
    ds.rows = res.rows; if (res.cols) ds.cols = res.cols;
    ds.recipe = (ds.recipe || []).concat([Object.assign({}, st2, {at: new Date().toISOString(), changed: res.changed, replayed: true})]); done++;
  });
  saveSet(ds);
  return {done: done, skipped: skipped};
}

function opt(cols, cur2) { return cols.map(function (c) { var n = c.name || c; return "<option" + (n === cur2 ? " selected" : "") + ">" + esc(n) + "</option>"; }).join(""); }
function toolsPanel(ds) {
  var others = A.sets.filter(function (s) { return s.id !== ds.id; }), withSteps = others.filter(function (s) { return (s.recipe || []).length; });
  var J = DT.join, jo = others.filter(function (s) { return s.id === J.with; })[0] || others[0];
  if (jo && !jo.rows) loadRows(jo).then(render);
  var sec = function (id, title, body) { return '<details class="dt"' + (DT.open === id ? " open" : "") + ' data-dtsec="' + id + '"><summary>' + title + "</summary>" + body + "</details>"; };
  var formula = '<div class="dt-body"><label class="field" for="fname">New column name<input id="fname" maxlength="60" placeholder="bmi"></label>' +
    '<label class="field" for="fexpr">Formula<input id="fexpr" maxlength="300" placeholder="[body_mass_g] / 1000" autocomplete="off"></label>' +
    '<p class="count">Use column names (in [brackets] if they have spaces), numbers, + − * / ^, and log, ln, sqrt, abs, exp, round, min, max. Rows with a missing value get no result.</p>' +
    '<button type="button" class="btn btn-primary" data-dt="formula">Add column</button></div>';
  var join = others.length ? '<div class="dt-body"><div class="toolbar"><label class="field" for="jwith">Join with<select id="jwith" data-dtj="with">' + others.map(function (s) { return '<option value="' + s.id + '"' + (jo && s.id === jo.id ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select></label>" +
    '<label class="field" for="jl">Key here<select id="jl" data-dtj="kl">' + opt(ds.cols, J.kl) + "</select></label>" + (jo && jo.cols ? '<label class="field" for="jr">Key there<select id="jr" data-dtj="kr">' + opt(jo.cols, J.kr) + "</select></label>" : "") + "</div>" +
    '<p class="count">Keeps every row of this dataset and adds the other one\'s columns where the keys match. The result is a new dataset.</p><button type="button" class="btn btn-primary" data-dt="join">Join</button></div>' : '<p class="count">Add a second dataset under Your data to join it to this one.</p>';
  var M = DT.melt, P = DT.pivot;
  var reshape = '<div class="dt-body"><h3 class="sub-h">Wide to long</h3><p class="count">Keep these columns as identifiers; every other column becomes a row with its name and value.</p><fieldset class="field preds"><legend>Identifier columns</legend>' +
    ds.cols.map(function (c) { return '<label class="chk"><input type="checkbox" data-dtm="' + esc(c.name) + '"' + ((M.ids || []).indexOf(c.name) >= 0 ? " checked" : "") + "> " + esc(c.name) + "</label>"; }).join("") + '</fieldset><button type="button" class="btn" data-dt="melt">Make long</button>' +
    '<h3 class="sub-h">Long to wide</h3><div class="toolbar"><label class="field" for="pw1">One row per<select id="pw1" data-dtp="id">' + opt(ds.cols, P.id) + '</select></label><label class="field" for="pw2">New columns from<select id="pw2" data-dtp="key">' + opt(ds.cols, P.key) + '</select></label><label class="field" for="pw3">Values from<select id="pw3" data-dtp="val">' + opt(ds.cols, P.val) + "</select></label></div>" +
    '<button type="button" class="btn" data-dt="widen">Make wide</button></div>';
  var replay = '<div class="dt-body"><p class="count">Run the same cleaning steps on new data, for example next month\'s file.</p>' +
    (withSteps.length ? '<div class="slot"><label class="field" for="rfrom">Steps from<select id="rfrom">' + withSteps.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + " (" + s.recipe.length + " steps)</option>"; }).join("") + '</select></label><button type="button" class="btn btn-primary" data-dt="replay">Apply them here</button></div>' : "") +
    '<div class="slot"><label class="btn" for="rfile">Load steps from a file</label><input type="file" id="rfile" accept=".json" class="sr-file"><span class="count">a .json file saved from Your data</span></div></div>';
  return '<section class="card dt-card"><h2>Combine and reshape</h2>' + (DT.msg ? '<p class="how" role="status">' + esc(DT.msg) + "</p>" : "") +
    sec("formula", "New column from a formula", formula) + sec("join", "Join another dataset", join) + sec("reshape", "Reshape (wide ⇄ long)", reshape) + sec("replay", "Replay saved steps", replay) + "</section>";
}
var _enhanceView = VIEWS.enhance;
VIEWS.enhance = function () { var h = _enhanceView(), ds = cur(); if (!ds || !ds.rows) return h; return h + toolsPanel(ds); };

view.addEventListener("toggle", function (e) { var d = e.target.dataset && e.target.dataset.dtsec; if (d && e.target.open) DT.open = d; }, true);
view.addEventListener("change", function (e) {
  if (st.tab !== "enhance") return; var t = e.target, d = t.dataset || {};
  if (d.dtj) { DT.join[d.dtj] = t.value; if (d.dtj === "with") DT.join.kr = ""; render(); return; }
  if (d.dtp) { DT.pivot[d.dtp] = t.value; return; }
  if (d.dtm != null) { var ids = DT.melt.ids || []; DT.melt.ids = t.checked ? ids.concat([d.dtm]) : ids.filter(function (x) { return x !== d.dtm; }); return; }
  if (t.id === "rfile" && t.files && t.files[0]) {
    t.files[0].text().then(function (txt) { var steps = JSON.parse(txt); steps = Array.isArray(steps) ? steps : steps.steps; if (!Array.isArray(steps)) throw 0; var r = replayAll(cur(), steps); DT.msg = "Applied " + r.done + " step" + (r.done === 1 ? "" : "s") + (r.skipped ? "; " + r.skipped + " skipped because a column was missing or nothing needed changing" : "") + "."; render(); })
      .catch(function () { DT.msg = "That file is not a set of EKM steps."; render(); });
  }
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button[data-dt]"); if (!b || st.tab !== "enhance") return; var ds = cur(), a = b.dataset.dt; DT.msg = "";
  if (a === "formula") {
    var name = (document.getElementById("fname").value || "").trim(), expr = (document.getElementById("fexpr").value || "").trim(); DT.open = "formula";
    if (!name || !expr) { DT.msg = "Give the new column a name and a formula."; render(); return; }
    if (idxOf(ds, name) >= 0) { DT.msg = "A column called “" + name + "” already exists."; render(); return; }
    try { parseFormula(expr, ds); } catch (err) { DT.msg = "Formula problem: " + err; render(); return; }
    return applyStep(ds, {op: "formula", name: name, expr: expr, text: "Added " + name + " = " + expr}, function () { return opFormula(ds, name, expr); });
  }
  if (a === "join") {
    var other = A.sets.filter(function (s) { return s.id === (DT.join.with || (A.sets.filter(function (x) { return x.id !== ds.id; })[0] || {}).id); })[0];
    if (!other || !other.rows) { DT.msg = "The other dataset is still loading. Try again in a moment."; render(); return; }
    var kl = DT.join.kl || ds.cols[0].name, kr = DT.join.kr || other.cols[0].name, j = joinSets(ds, other, kl, kr);
    addDerived(ds.name + " + " + other.name, j.cols, j.rows, "Joined on " + kl + " = " + kr + ".");
    DT.msg = j.hit + " of " + j.rows.length + " rows found a match" + (j.dup ? "; " + j.dup + " repeated keys in " + other.name + " used their first row" : "") + ". The joined data is now the current dataset."; DT.open = "join"; render(); return;
  }
  if (a === "melt") { var ids = (DT.melt.ids || []).filter(function (n) { return idxOf(ds, n) >= 0; }); if (!ids.length || ids.length === ds.cols.length) { DT.msg = "Tick the identifier columns, leaving at least one column to turn into rows."; DT.open = "reshape"; render(); return; }
    var m = melt(ds, ids); addDerived(ds.name + " (long)", m.cols, m.rows, "Reshaped from wide to long."); DT.msg = "Made " + m.rows.length + " rows. The long version is now the current dataset."; DT.open = "reshape"; render(); return; }
  if (a === "widen") { var P = DT.pivot, id = P.id || ds.cols[0].name, key = P.key || (ds.cols[1] || ds.cols[0]).name, val = P.val || (ds.cols[2] || ds.cols[0]).name;
    if (id === key || key === val || id === val) { DT.msg = "Pick three different columns."; DT.open = "reshape"; render(); return; }
    var w = widen(ds, id, key, val); addDerived(ds.name + " (wide)", w.cols, w.rows, "Reshaped from long to wide."); DT.msg = "Made " + w.rows.length + " rows and " + (w.cols.length - 1) + " value columns" + (w.clash ? "; " + w.clash + " repeated cells kept their last value" : "") + "."; DT.open = "reshape"; render(); return; }
  if (a === "replay") { var src = A.sets.filter(function (s) { return s.id === document.getElementById("rfrom").value; })[0]; if (!src) return; var r = replayAll(ds, src.recipe); DT.msg = "Applied " + r.done + " of " + src.recipe.length + " steps from " + src.name + (r.skipped ? "; " + r.skipped + " skipped (missing column or nothing to change)" : "") + "."; DT.open = "replay"; render(); return; }
});
