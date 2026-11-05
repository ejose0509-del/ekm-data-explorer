// ---------- Connected data: import from a link or a database, scheduled refresh, shared team workspace ----------
var CN = {url: "", msg: "", busy: "", sqlPath: "", sqlQuery: "SELECT name FROM sqlite_master WHERE type = 'table'", timers: Object.create(null), ws: [], wsOn: false, wsMsg: ""};
function localMode() { return !!(window.EKM_LOCAL && window.EKM_LOCAL.token); }
function sheetsURL(u) {   // a Google Sheets edit link becomes its CSV export link
  var m = /docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(u); if (!m) return u;
  var gid = /[#&?]gid=(\d+)/.exec(u); return "https://docs.google.com/spreadsheets/d/" + m[1] + "/export?format=csv" + (gid ? "&gid=" + gid[1] : "");
}
function fetchBytes(url) {
  url = sheetsURL(url);
  if (!/^https?:\/\//i.test(url)) return Promise.reject(new Error("Use a link that starts with https://"));
  var direct = fetch(url, {credentials: "omit", cache: "no-store"}).then(function (r) { if (!r.ok) throw new Error("The server answered " + r.status + "."); return r.arrayBuffer().then(function (b) { return {buf: b, type: r.headers.get("content-type") || ""}; }); });
  if (!localMode()) return direct.catch(function (e) { throw new Error(/answered/.test(e.message) ? e.message : "This page cannot reach that link: the site does not allow it (CORS), or this copy of EKM may only load files you choose. Download the file and add it, or run EKM's local mode (python3 local_ai/server.py), which can fetch links for you."); });
  return direct.catch(function () {
    return fetch("/api/fetch", {method: "POST", headers: {"Content-Type": "application/json", "X-EKM-Token": window.EKM_LOCAL.token}, body: JSON.stringify({url: url})}).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || "The local service could not fetch that link."); }, function () { throw new Error("The local service could not fetch that link."); });
      return r.arrayBuffer().then(function (b) { return {buf: b, type: r.headers.get("x-ekm-content-type") || r.headers.get("content-type") || ""}; });
    });
  });
}
function tableFromBytes(buf, hint, ctype) {
  var u8 = new Uint8Array(buf), head = String.fromCharCode.apply(null, u8.subarray(0, 4));
  if (head === "PAR1" || /\.parquet($|\?)/i.test(hint)) return parquetToTable(buf);
  if (head.slice(0, 2) === "PK" || /\.xlsx?($|\?)/i.test(hint) || /spreadsheetml|ms-excel/.test(ctype)) return loadXLSX().then(function (X) { var wb = X.read(buf, {type: "array"}), sh = wb.Sheets[wb.SheetNames[0]]; var aoa = X.utils.sheet_to_json(sh, {header: 1, raw: true, defval: ""}).filter(function (r) { return r.some(function (c) { return String(c).trim() !== ""; }); }); return {header: aoa[0] || [], body: aoa.slice(1)}; });
  var t = new TextDecoder("utf-8").decode(u8);
  if (/^\s*[\[{]/.test(t)) {
    var j = losslessJSONParse(t); if (j && !Array.isArray(j) && typeof j === "object") j = j.data || j.rows || j.results || Object.values(j).filter(Array.isArray)[0];
    if (!Array.isArray(j) || j.some(function (o) { return !o || typeof o !== "object" || Array.isArray(o); })) throw new Error("The JSON is not a list of row objects.");
    var keys = []; j.forEach(function (o) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
    return {header: keys, body: j.map(function (o) { return keys.map(function (k) { var v = o[k]; return v != null && typeof v === "object" ? JSON.stringify(v) : v == null ? null : v; }); })};
  }
  if (/^\s*<(!doctype|html)/i.test(t)) throw new Error("That link returned a web page, not a data file. Use the direct download link (for Google Sheets, share the sheet so anyone with the link can view).");
  var rows = splitCSV(t); if (rows.length < 2) throw new Error("No header row and data rows were found.");
  return {header: rows[0], body: rows.slice(1)};
}
function sqliteTable(path, query) {
  if (!localMode()) return Promise.reject(new Error("Database connections need EKM's local mode: run python3 local_ai/server.py and open the address it prints."));
  return fetch("/api/sqlite", {method: "POST", headers: {"Content-Type": "application/json", "X-EKM-Token": window.EKM_LOCAL.token}, body: JSON.stringify({path: path, query: query})})
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "The query failed."); return {header: j.columns, body: j.rows, truncated: j.truncated}; }); });
}
function loadSpec(spec) { return spec.kind === "sqlite" ? sqliteTable(spec.path, spec.query) : fetchBytes(spec.url).then(function (r) { return tableFromBytes(r.buf, spec.url, r.type); }); }
function importSpec(spec, name) {
  CN.busy = "Connecting…"; CN.msg = ""; render();
  loadSpec(spec).then(function (t) {
    if (!t.header.length || !t.body.length) throw new Error("The source returned no rows.");
    var ds = makeSet(name, t.header, t.body); ds.sourceSpec = spec; ds.source = spec.kind === "sqlite" ? spec.path + " · " + spec.query : spec.url; ds.refreshedAt = new Date().toISOString();
    A.sets.unshift(ds); pickSet(ds.id); CN.busy = ""; CN.msg = "Imported " + t.body.length + " rows" + (t.truncated ? " (the first rows only; narrow the query to get the rest)" : "") + "."; saveSet(ds); render();
  }).catch(function (e) { CN.busy = ""; CN.msg = e.message || "Could not import from that source."; render(); });
}
// Refresh prepares a separate table, then publishes it only after strict replay.
var REFRESH_JOBS = new WeakMap();
function refreshSignature(ds) { return JSON.stringify([dataVersion(ds), ds.cols, ds.recipe || [], ds.importOptions || null, ds.sourceSpec]); }
function refreshColumns(cols, metadata) {
  return cols.map(function (c) { var old = metadata[c.name]; if (!old) return c; var copy = Object.assign({}, c); ["label", "unit", "values", "tags", "limits"].forEach(function (k) { if (old[k] != null) copy[k] = clone(old[k]); }); return copy; });
}
function checkRefreshTable(ds) {
  if (!ds.cols.length || !ds.rows.length || ds.rows.length > 1000000 || ds.cols.length > 2000 || ds.rows.length * ds.cols.length > 8000000) throw new Error("Refreshed table is empty or exceeds the row/column/cell budget.");
  ds.rows.forEach(function (r) { if (!Array.isArray(r) || r.length !== ds.cols.length) throw new Error("Refresh produced an invalid row."); r.forEach(function (v, j) { if (v != null && (typeof v === "object" || typeof v === "number" && !isFinite(v) || isNum(ds.cols[j]) && typeof v !== "number")) throw new Error("Refresh produced an invalid value in " + ds.cols[j].name); }); });
}
function refreshSet(ds, quiet) {
  if (!ds.sourceSpec) return Promise.resolve();
  var job = {}, signature = refreshSignature(ds), steps = clone(ds.recipe || []), metadata = Object.create(null);
  ds.cols.forEach(function (c) { metadata[c.name] = clone(c); }); REFRESH_JOBS.set(ds, job);
  if (!quiet) { CN.busy = "Refreshing " + ds.name + "…"; render(); }
  return Promise.resolve().then(function () { return loadSpec(ds.sourceSpec); }).then(function (t) {
    if (REFRESH_JOBS.get(ds) !== job) return;
    if (A.sets.indexOf(ds) < 0 || refreshSignature(ds) !== signature) throw new Error("Data or settings changed while the source was loading. Retry with the current version.");
    if (!t || t.truncated) throw new Error("The source was truncated. Narrow the query before refreshing.");
    if (steps.some(function (s) { return s.op === "rowtag" && !s.identity; })) throw new Error("Row tags without recorded stable identifiers cannot be refreshed safely. Keep this copy and review/reapply those tags with a unique identifier.");
    var oldOptions = {decimal: IMPORT.decimal, missing: IMPORT.missing}, log = auditLog, fresh;
    try {
      IMPORT.decimal = (ds.importOptions || oldOptions).decimal; IMPORT.missing = (ds.importOptions || oldOptions).missing;
      auditLog = function () {}; // parsing a candidate is not a committed import
      fresh = makeSet(ds.name, t.header, t.body);
    } finally { IMPORT.decimal = oldOptions.decimal; IMPORT.missing = oldOptions.missing; auditLog = log; }
    fresh.id = ds.id; fresh.cols = refreshColumns(fresh.cols, metadata); checkRefreshTable(fresh);
    var original = {rows: fresh.rows, cols: clone(fresh.cols), recipe: []}, undo = [];
    fresh.recipe = [];
    steps.forEach(function (step) {
      // replayStep never publishes the candidate or writes its dataset to storage.
      var before = {rows: fresh.rows, cols: clone(fresh.cols), recipe: fresh.recipe.slice()}, result = replayStep(fresh, step);
      if (!result || !Array.isArray(result.rows)) throw new Error("Cannot safely replay " + (step.text || step.op));
      fresh.rows = result.rows; if (result.cols) fresh.cols = result.cols;
      fresh.cols = refreshColumns(fresh.cols, metadata); checkRefreshTable(fresh);
      fresh.recipe.push(Object.assign({}, step, {changed: result.changed || 0, replayed: true})); undo.push(before);
    });
    if (REFRESH_JOBS.get(ds) !== job) return;
    if (refreshSignature(ds) !== signature) throw new Error("Data changed during refresh. Retry with the current version.");
    var beforeCount = ds.rows.length;
    ["rows", "cols", "recipe", "rawRows", "rawColumns", "sourceHeaders", "importOptions"].forEach(function (k) { ds[k] = fresh[k]; });
    E.orig[ds.id] = original; E.undo[ds.id] = undo; ds.refreshedAt = new Date().toISOString(); A.ai = Object.create(null);
    auditLog("Refreshed data", ds, beforeCount + " → " + ds.rows.length + " rows; " + steps.length + " steps replayed with stable identity");
    CN.busy = ""; CN.msg = ds.name + " refreshed: " + ds.rows.length + " rows; " + steps.length + " steps replayed.";
    // Storage failure does not undo a successfully prepared source refresh.
    try { Promise.resolve(saveSet(ds)).catch(function () { CN.msg = "Refresh completed, but storage failed. Save a project file."; render(); }); }
    catch (e) { CN.msg = "Refresh completed, but storage failed. Save a project file."; }
    render();
  }).catch(function (e) {
    if (REFRESH_JOBS.get(ds) !== job) return;
    CN.busy = ""; CN.msg = "Refresh failed: " + (e.message || "the source could not be reached") + ". The previous data is kept."; render();
  });
}
function schedule(ds) {
  if (CN.timers[ds.id]) { clearInterval(CN.timers[ds.id]); delete CN.timers[ds.id]; }
  var m = +ds.refreshEvery; if (m > 0 && ds.sourceSpec) CN.timers[ds.id] = setInterval(function () { if (A.sets.indexOf(ds) >= 0) refreshSet(ds, true); else { clearInterval(CN.timers[ds.id]); delete CN.timers[ds.id]; } }, m * 60000);
}
function connectCard() {
  return '<section class="card" aria-labelledby="cn-h"><h2 id="cn-h">Connect to a source</h2><p class="count">Import a CSV, Excel, JSON or Parquet file from a link, including a shared Google Sheet. Connected datasets can be refreshed, and their cleaning steps replay on the new data.</p>' +
    '<label class="field" for="cnurl">Link<input id="cnurl" type="url" inputmode="url" value="' + esc(CN.url) + '" placeholder="https://…/data.csv"></label><div class="slot"><button type="button" class="btn" data-cn="url">Import from link</button></div>' +
    (localMode() ? '<h3 class="sub-h">SQLite database</h3><label class="field" for="cnpath">Database file on this computer<input id="cnpath" value="' + esc(CN.sqlPath) + '" placeholder="/Users/you/data/study.sqlite"></label><label class="field" for="cnsql">Query (read-only)<textarea id="cnsql" rows="3">' + esc(CN.sqlQuery) + '</textarea></label><div class="slot"><button type="button" class="btn" data-cn="sql">Run query</button></div>' :
      '<p class="count">Database connections (SQLite) are available in local mode: <code>python3 local_ai/server.py</code>.</p>') +
    (CN.busy ? '<p class="count" role="status">' + esc(CN.busy) + "</p>" : "") + (CN.msg ? '<p class="how" role="status">' + esc(CN.msg) + "</p>" : "") + "</section>";
}
function sourceCard(ds) {
  if (!ds.sourceSpec) return "";
  return '<section class="card"><h2>Live source</h2><p class="count">' + esc(ds.sourceSpec.kind === "sqlite" ? ds.sourceSpec.path : ds.sourceSpec.url) + "</p>" + (ds.refreshedAt ? '<p class="count">Last refreshed ' + esc(ds.refreshedAt.slice(0, 16).replace("T", " ")) + "</p>" : "") +
    '<div class="slot"><button type="button" class="btn" data-cn="refresh">Refresh now</button><label class="field" for="cnevery">Refresh automatically<select id="cnevery"><option value="0">Never</option>' + [5, 15, 30, 60].map(function (m) { return '<option value="' + m + '"' + (+ds.refreshEvery === m ? " selected" : "") + ">Every " + m + " minutes</option>"; }).join("") + "</select></label></div>" +
    '<p class="count">Automatic refresh runs while this page is open. Each refresh is recorded in the audit trail.</p></section>';
}
var _dataViewC = VIEWS.data;
VIEWS.data = function () {
  var h = _dataViewC(), ds = cur(), card = connectCard();
  if (!ds || !ds.rows) return h.replace(/(<section class="card drop"[\s\S]*?<\/section>)/, "$1" + card);
  return h.replace(/(<section class="card drop"[\s\S]*?<\/section>)/, "$1" + card + sourceCard(ds));
};

// ---- Team workspace: share a whole project; teammates open their own copy ----
// Storage rules for a published copy: {path: "workspace", read: "view", write: "owner"}, {path: "workspace/{self}", write: "interact"}
var WS_CHUNK = 200000;
function wsStart() {
  if (CN.wsOn || !ST.on || !ST.db) return; CN.wsOn = true;
  ST.db.collection("workspace").onSnapshot(function (s) { CN.ws = s.docs.map(function (d) { var v = d.data() || {}; return {owner: d.id, name: String(v.name || "Project"), at: String(v.at || ""), parts: +v.parts || 0, datasets: +v.datasets || 0, size: +v.size || 0}; }).filter(function (w) { return w.parts > 0; }).sort(function (a, b) { return b.at.localeCompare(a.at); }); if (st.tab === "writeup") render(); }, function () {});
}
function wsShare() {
  if (!ST.on || !ST.db || !ST.uid) { CN.wsMsg = "Team workspaces need this page to be opened in Claude with sharing turned on."; render(); return; }
  var text; try { text = JSON.stringify(projectSnapshot()); } catch (e) { CN.wsMsg = e.message; render(); return; }
  if (text.length > 8e6) { CN.wsMsg = "This project is " + (text.length / 1e6).toFixed(1) + " MB; shared projects can be up to 8 MB. Remove large datasets or share a filtered copy."; render(); return; }
  var n = Math.ceil(text.length / WS_CHUNK), base = "workspace/" + ST.uid, ops = [];
  for (var i = 0; i < n; i++) ops.push(ST.db.doc(base + "/parts/" + i).set({i: i, text: text.slice(i * WS_CHUNK, (i + 1) * WS_CHUNK)}));
  CN.wsMsg = "Sharing…"; render();
  Promise.all(ops).then(function () { return ST.db.doc(base).set({name: WP.title || (cur() || {}).name || "Project", at: new Date().toISOString(), parts: n, datasets: A.sets.length, size: text.length}); })
    .then(function () { auditLog("Shared project", null, A.sets.length + " datasets, " + (text.length / 1e6).toFixed(2) + " MB"); CN.wsMsg = "Shared. Teammates who can open this page can open a copy; only you can update or remove it."; render(); })
    .catch(function (e) { CN.wsMsg = e && e.code === "permission_denied" ? "You can view this page but not share to it. Ask the owner for edit access." : "Could not share the project. Try again."; render(); });
}
function wsOpen(owner) {
  var w = CN.ws.filter(function (x) { return x.owner === owner; })[0]; if (!w) return;
  CN.wsMsg = "Opening…"; render();
  Promise.all(Array.apply(null, Array(w.parts)).map(function (_, i) { return ST.db.doc("workspace/" + owner + "/parts/" + i).get(); })).then(function (snaps) {
    var text = snaps.map(function (s) { return s.exists ? String((s.data() || {}).text || "") : ""; }).join("");
    restoreProject(JSON.parse(text)); auditLog("Opened shared project", null, w.name + " from " + (owner === ST.uid ? "you" : "a teammate")); CN.wsMsg = "Opened a copy of “" + w.name + "”. Your changes stay in your copy."; nav("data");
  }).catch(function (e) { CN.wsMsg = "Could not open that project: " + (e && e.message || "it may be incomplete") + "."; render(); });
}
function wsRemove() { if (!ST.on) return; ST.db.doc("workspace/" + ST.uid).set({parts: 0, name: "", at: new Date().toISOString()}).then(function () { CN.wsMsg = "Stopped sharing your project."; auditLog("Stopped sharing project", null, ""); render(); }).catch(function () {}); }
function workspaceCard() {
  wsStart();
  var mine = CN.ws.filter(function (w) { return w.owner === ST.uid; })[0];
  return '<section class="card" aria-labelledby="ws-h"><h2 id="ws-h">Team workspace</h2>' + (ST.on ? '<p class="count">Share the whole project (datasets, cleaning steps, workflow, write-up and audit trail). Everyone who can open this page can open a copy; only the person who shared it can update or remove it.</p>' +
    (CN.ws.length ? '<ul class="plain">' + CN.ws.map(function (w) { return '<li><b>' + esc(w.name) + '</b> <span class="count">' + (w.owner === ST.uid ? "yours" : "a teammate's") + " · " + esc(w.at.slice(0, 16).replace("T", " ")) + " · " + w.datasets + " dataset" + (w.datasets === 1 ? "" : "s") + '</span> <button type="button" class="linkbtn" data-wsopen="' + esc(w.owner) + '">Open a copy</button></li>'; }).join("") + "</ul>" : '<p class="nd">No shared projects yet.</p>') +
    '<div class="slot"><button type="button" class="btn" data-ws="share">' + (mine ? "Update my shared project" : "Share this project") + "</button>" + (mine ? '<button type="button" class="btn" data-ws="remove">Stop sharing</button>' : "") + "</div>"
    : '<p class="count">Sharing works when this page runs in Claude with storage turned on. Elsewhere, save a project file under Your data and send it.</p>') + (CN.wsMsg ? '<p class="how" role="status">' + esc(CN.wsMsg) + "</p>" : "") + "</section>";
}
var _writeupViewC = VIEWS.writeup;
VIEWS.writeup = function () { var h = _writeupViewC(); return h.replace(/(<section class="card" aria-labelledby="au-h">)/, workspaceCard() + "$1"); };

view.addEventListener("change", function (e) {
  var t = e.target;
  if (t.id === "cnurl") CN.url = t.value.trim(); else if (t.id === "cnpath") CN.sqlPath = t.value.trim(); else if (t.id === "cnsql") CN.sqlQuery = t.value;
  else if (t.id === "cnevery") { var ds = cur(); if (ds) { ds.refreshEvery = +t.value; schedule(ds); auditLog("Set refresh schedule", ds, +t.value ? "every " + t.value + " minutes" : "off"); render(); } }
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset;
  if (d.cn === "url") { var u = (document.getElementById("cnurl") || {}).value || CN.url; CN.url = u.trim(); if (!CN.url) { CN.msg = "Paste a link first."; render(); return; } var nm = decodeURIComponent((CN.url.split("?")[0].split("/").pop() || "Linked data").replace(/\.[^.]+$/, "")) || "Linked data"; importSpec({kind: "url", url: CN.url}, /docs\.google\.com/.test(CN.url) ? "Google Sheet" : nm.slice(0, 60)); return; }
  if (d.cn === "sql") { CN.sqlPath = ((document.getElementById("cnpath") || {}).value || "").trim(); CN.sqlQuery = (document.getElementById("cnsql") || {}).value || CN.sqlQuery; if (!CN.sqlPath) { CN.msg = "Enter the path to a .sqlite or .db file."; render(); return; } importSpec({kind: "sqlite", path: CN.sqlPath, query: CN.sqlQuery}, (CN.sqlPath.split(/[\\/]/).pop() || "Database").replace(/\.[^.]+$/, "") + " query"); return; }
  if (d.cn === "refresh") { var ds = cur(); if (ds) refreshSet(ds); return; }
  if (d.ws === "share") { wsShare(); return; }
  if (d.ws === "remove") { wsRemove(); return; }
  if (d.wsopen) { wsOpen(d.wsopen); return; }
});
