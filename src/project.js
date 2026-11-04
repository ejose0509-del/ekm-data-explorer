// Local downloads and portable projects. Imported content is rebuilt from a schema.
var PROJECT = {remember: !!window.EKM_LOCAL, message: '', key: 'ekm-project-v1', last: '', storageMessage: ''};
function nativeDownload(filename, data) {
  var mime = /\.csv$/i.test(filename) ? 'text/csv' : /\.json$/i.test(filename) ? 'application/json' : /\.svg$/i.test(filename) ? 'image/svg+xml' : /\.doc$/i.test(filename) ? 'application/msword' : 'text/html';
  var blob = data instanceof Blob ? data : new Blob([data], {type: mime + ';charset=utf-8'}), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
}
saveFile = function (filename, data) {
  function native() {
    try { nativeDownload(filename, data); XP.msg = 'Download started: ' + filename; } catch (err) { XP.msg = 'Could not download. Check your browser download settings and try again.'; }
    render();
  }
  if (!window.claude || !window.claude.use || window.EKM_LOCAL) { native(); return; }
  return Promise.resolve().then(function () { return window.claude.use('downloads'); }).then(function (dl) {
    if (!dl) { native(); return; }
    return dl.save({filename: filename, data: data}).then(function () { XP.msg = 'Saved ' + filename; render(); });
  }).catch(function (err) { if (err && err.code === 'cancelled') { XP.msg = 'Download cancelled.'; render(); } else native(); });
};

function projectSnapshot() {
  if (A.sets.some(function (ds) { return !Array.isArray(ds.rows); })) throw new Error('Load every dataset before saving the project.');
  return {format: 'ekm-project', version: 1, datasets: A.sets, current: A.cur, analysis: A.kind, selection: A.sel, chart: A.chart,
    writeup: {title: WP.title, items: WP.items}, history: {undo: E.undo, original: E.orig}};
}
function projectSvg(text) {
  if (!text) return '';
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Invalid figure.');
  var doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Invalid figure.');
  var tags = ['svg','g','rect','circle','line','polyline','path','text','title'];
  var attrs = ['xmlns','width','height','viewBox','x','y','x1','x2','y1','y2','cx','cy','r','rx','d','points','transform','text-anchor','font-family','font-size','font-style','font-weight','fill','stroke','stroke-width','opacity','fill-opacity','stroke-opacity'];
  function clean(node) {
    if (tags.indexOf(node.localName) < 0) return null;
    var el = document.createElementNS('http://www.w3.org/2000/svg', node.localName);
    [].forEach.call(node.attributes, function (a) { if (attrs.indexOf(a.name) >= 0 && !/url\s*\(|javascript:|data:|https?:|\/\//i.test(a.value.replace('http://www.w3.org/2000/svg', ''))) el.setAttribute(a.name, a.value); });
    [].forEach.call(node.childNodes, function (child) { if (child.nodeType === 3) el.appendChild(document.createTextNode(child.textContent)); else if (child.nodeType === 1) { var c = clean(child); if (c) el.appendChild(c); } });
    return el;
  }
  return new XMLSerializer().serializeToString(clean(root));
}
function validateProject(p) {
  function tree(v, depth) {
    if (depth > 50) throw new Error('Project nesting is too deep.');
    if (typeof v === 'number' && !isFinite(v)) throw new Error('Invalid numeric value.');
    if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { if (['__proto__','constructor','prototype'].indexOf(k) >= 0) throw new Error('Unsafe project field.'); tree(v[k], depth + 1); });
  }
  tree(p, 0);
  if (!p || p.format !== 'ekm-project' || p.version !== 1 || !Array.isArray(p.datasets) || !p.writeup || !Array.isArray(p.writeup.items)) throw new Error('Choose an EKM project JSON file (version 1).');
  var ids = Object.create(null);
  if (p.selection && (typeof p.selection !== 'object' || Array.isArray(p.selection) || Object.keys(p.selection).some(function (k) { var v = p.selection[k]; return v != null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean' && !(Array.isArray(v) && v.every(function (x) { return typeof x === 'string'; })); }))) throw new Error('Invalid analysis selection.');
  if (p.chart && (typeof p.chart !== 'object' || Array.isArray(p.chart) || Object.keys(p.chart).some(function (k) { return p.chart[k] !== null && ['string','number','boolean'].indexOf(typeof p.chart[k]) < 0; }))) throw new Error('Invalid chart settings.');
  if (p.selection) Object.keys(p.selection).forEach(function (k) {
    var v = p.selection[k];
    if (v == null) return;
    if (['preds','lp'].indexOf(k) >= 0 ? !Array.isArray(v) || v.some(function (x) { return typeof x !== 'string'; }) : typeof v !== 'string') throw new Error('Invalid analysis selection: ' + k + '.');
  });
  if (p.chart) {
    if (p.chart.type && ['histogram','bar','box','scatter','line','3d'].indexOf(p.chart.type) < 0) throw new Error('Invalid chart type.');
    if (p.chart.agg != null && ['count','mean','sum','median'].indexOf(p.chart.agg) < 0) throw new Error('Invalid chart aggregation.');
    if (p.chart.fit != null && typeof p.chart.fit !== 'boolean') throw new Error('Invalid fitted-line setting.');
  }
  function dataset(ds) {
    if (!ds || typeof ds.id !== 'string' || !/^[\w-]{1,100}$/.test(ds.id) || ['__proto__','constructor','prototype'].indexOf(ds.id) >= 0 || typeof ds.name !== 'string' || !Array.isArray(ds.cols) || !ds.cols.length || !Array.isArray(ds.rows)) throw new Error('Invalid dataset.');
    var names = Object.create(null);
    var cols = ds.cols.map(function (c) { if (!c || typeof c.name !== 'string' || names[c.name] || ['number','year','date','category','text','empty'].indexOf(c.type) < 0) throw new Error('Invalid columns.'); names[c.name] = true; return {name: c.name, type: c.type}; });
    var rows = ds.rows.map(function (r) { if (!Array.isArray(r) || r.length !== cols.length) throw new Error('Invalid data row.'); return r.map(function (v,j) { if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new Error('Invalid cell.'); if (v !== null && isNum(cols[j]) && typeof v !== 'number') throw new Error('Numeric cells must contain numbers.'); return v; }); });
    var raw = null;
    if (ds.rawRows || ds.rawColumns) { if (!Array.isArray(ds.rawColumns) || !Array.isArray(ds.rawRows) || !ds.rawColumns.every(function (n) { return typeof n === 'string'; })) throw new Error('Invalid source columns.'); raw = ds.rawRows.map(function (r) { if (!Array.isArray(r) || r.length !== ds.rawColumns.length || r.some(function (v) { return v !== null && ['number','string','boolean'].indexOf(typeof v) < 0; })) throw new Error('Invalid source row.'); return r.slice(); }); }
    return Object.assign({id: ds.id, name: ds.name, cols: cols, rows: rows, origin: 'file', source: String(ds.source || ''), note: String(ds.note || ''), added: String(ds.added || ''), saved: false, recipe: Array.isArray(ds.recipe) ? ds.recipe : []}, raw ? {rawRows: raw, rawColumns: ds.rawColumns.slice(), sourceHeaders: Array.isArray(ds.sourceHeaders) && ds.sourceHeaders.length === ds.rawColumns.length && ds.sourceHeaders.every(function (n) { return typeof n === 'string'; }) ? ds.sourceHeaders.slice() : ds.rawColumns.slice(), importOptions: {decimal: ds.importOptions && ds.importOptions.decimal === ',' ? ',' : '.', missing: ds.importOptions && ds.importOptions.missing === 'tokens' ? 'tokens' : 'blank'}} : {});
  }
  if (p.selection && p.selection.agg != null && ['count','mean','sum','median'].indexOf(p.selection.agg) < 0) throw new Error('Invalid pivot aggregation.');
  var sets = p.datasets.map(function (ds) { var d = dataset(ds); if (ids[d.id]) throw new Error('Duplicate dataset identifier.'); ids[d.id] = true; return d; });
  var items = p.writeup.items.map(function (it) {
    if (!it || !Array.isArray(it.reading) || !Array.isArray(it.caveats)) throw new Error('Invalid write-up result.');
    var out = Object.create(null);
    ['id','at','dataset','source','kind','test','title'].forEach(function (k) { out[k] = String(it[k] || ''); });
    out.reading = it.reading.map(function (s) { if (typeof s !== 'string') throw new Error('Invalid reading.'); return esc(localText(s)); });
    out.caveats = it.caveats.map(function (s) { if (typeof s !== 'string') throw new Error('Invalid caveat.'); return esc(localText(s)); });
    out.apa = esc(localText(it.apa)); out.fig = projectSvg(it.fig); out.p = localNumber(it.p) ? it.p : null; out.n = localNumber(it.n) ? it.n : null;
    // Imported reporting flags are not certificates; review them again.
    out.evidence = null; return out;
  });
  var history = {undo: Object.create(null), original: Object.create(null)};
  if (p.history) sets.forEach(function (ds) {
    var orig = (p.history.original || {})[ds.id], undo = (p.history.undo || {})[ds.id];
    if (orig) history.original[ds.id] = dataset(Object.assign({}, ds, orig));
    if (Array.isArray(undo)) history.undo[ds.id] = undo.map(function (u) { var d = dataset(Object.assign({}, ds, u)); return {rows: d.rows, cols: d.cols, recipe: d.recipe}; });
  });
  return {datasets: sets, current: ids[p.current] ? p.current : (sets[0] || {}).id, analysis: KINDS.some(function (k) { return k[0] === p.analysis; }) ? p.analysis : 'describe',
    selection: p.selection && typeof p.selection === 'object' && !Array.isArray(p.selection) ? p.selection : {}, chart: p.chart && typeof p.chart === 'object' ? p.chart : {type:'histogram'}, writeup: {title: String(p.writeup.title || 'Results'), items: items}, history: history};
}
function restoreProject(p) {
  var v = validateProject(p); // Validate everything before replacing live state.
  if (PROJECT.owner) { PROJECT.owner = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2); PROJECT.lastDraft = ''; }
  A.sets = v.datasets; A.cur = v.current; A.kind = v.analysis; A.sel = v.selection; A.chart = v.chart; A.ai = Object.create(null); A.askmsg = ''; A.askq = '';
  WP.title = v.writeup.title; WP.items = v.writeup.items; WP.review = null;
  E.undo = v.history.undo; E.orig = v.history.original; E.openFix = null; E.iso = null; E.clusters = null; E.picked = Object.create(null);
  LM.request++; if (LM.ctl) LM.ctl.abort(); LM.ctl = null; LM.key = ''; LM.state = ''; LM.lines = []; LM.question = ''; if (typeof IMPORT !== 'undefined' && IMPORT) IMPORT.workbook = null; PROJECT.last = ''; XP.msg = '';
}
function cacheProject() {
  if (!PROJECT.remember) return;
  try {
    var text = JSON.stringify(projectSnapshot());
    // Persist each tab before publishing a shared copy: simultaneous writers retain both drafts.
    if (text !== PROJECT.lastDraft) { localStorage.setItem(PROJECT.key + '-draft-' + PROJECT.owner, JSON.stringify({savedAt: new Date().toISOString(), project: JSON.parse(text)})); PROJECT.lastDraft = text; }
    var latest = localStorage.getItem(PROJECT.key);
    if (latest !== PROJECT.base && latest !== text) {
      PROJECT.conflict = true;
      PROJECT.storageMessage = 'Another tab saved a newer project. This tab is preserved as a separate browser draft. Save a project file, or load the latest shared copy.'; return;
    }
    PROJECT.conflict = false;
    if (text !== latest) localStorage.setItem(PROJECT.key, text);
    PROJECT.base = text; PROJECT.last = text;
    PROJECT.storageMessage = 'Saved in this browser. Keep a project file as a backup.';
  } catch (err) { PROJECT.storageMessage = 'Browser save unavailable or full. Save a project file to keep your work.'; }
}
function projectControls() {
  var recovery = '';
  try { var drafts = Object.keys(localStorage).filter(function (k) { return k.indexOf(PROJECT.key + '-draft-') === 0 && k !== PROJECT.key + '-draft-' + PROJECT.owner; }); if (drafts.length) recovery = '<label class="field">Preserved tab drafts<select id="project-draft">' + drafts.map(function (k) { var d = JSON.parse(localStorage.getItem(k)); return '<option value="' + esc(k) + '">' + esc(d.savedAt + ' · ' + d.project.datasets.map(function (s) { return s.name; }).join(', ')) + '</option>'; }).join('') + '</select></label><button type="button" class="btn" data-project-draft="1">Open preserved draft</button>'; } catch (err) {}
  return '<section class="card"><h2>Keep your project</h2><div class="slot"><button type="button" class="btn" data-project-save="1">Save project (.json)</button><button type="button" class="btn" data-project-open="1">Open project</button><input class="sr-file" id="project-file" tabindex="-1" type="file" accept=".json"><label class="chk"><input type="checkbox" id="project-remember"' + (PROJECT.remember ? ' checked' : '') + '> Keep in this browser</label><button type="button" class="btn" data-project-clear="1">Forget browser copy</button>' + (PROJECT.conflict ? '<button type="button" class="btn" data-project-latest="1">Load latest shared copy</button>' : '') + recovery + '</div><p class="count" role="status">' + esc((PROJECT.message ? PROJECT.message + ' ' : '') + (PROJECT.storageMessage || 'A project file includes your datasets, cleaning history and write-up. Opening one replaces the current project; save your work first.')) + '</p></section>';
}
var _projectData = VIEWS.data;
VIEWS.data = function () { return projectControls() + _projectData(); };
var _projectRender = render;
render = function () { cacheProject(); _projectRender(); };
view.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.dataset.projectLatest || b.dataset.projectDraft) { try { var text = localStorage.getItem(b.dataset.projectDraft ? document.getElementById('project-draft').value : PROJECT.key), p = JSON.parse(text); restoreProject(b.dataset.projectDraft ? p.project : p); PROJECT.base = localStorage.getItem(PROJECT.key); PROJECT.conflict = false; PROJECT.message = 'Project restored; other tab drafts remain available.'; } catch(err) { PROJECT.message = 'Could not restore project: ' + err.message; } render(); return; }
  if (b.dataset.projectOpen) { document.getElementById('project-file').value = ''; document.getElementById('project-file').click(); }
  if (b.dataset.projectSave) { try { var snapshot = projectSnapshot(); validateProject(snapshot); var projectText = JSON.stringify(snapshot, null, 2); if (new Blob([projectText]).size > 50e6) throw new Error('Project exceeds the 50 MB opening limit. Export your datasets separately or reduce cleaning history.'); nativeDownload('ekm-project.json', projectText); PROJECT.message = 'Project download started.'; } catch (err) { PROJECT.message = err.message; } render(); }
  if (b.dataset.projectClear) { PROJECT.remember = false; try { localStorage.setItem('ekm-remember', 'off'); localStorage.removeItem(PROJECT.key); Object.keys(localStorage).filter(function (k) { return k.indexOf(PROJECT.key + '-draft-') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (err) {} PROJECT.base = null; PROJECT.conflict = false; PROJECT.storageMessage = ''; PROJECT.last = ''; PROJECT.message = 'Browser copy and preserved drafts removed. Your current tab is unchanged; save a project file before closing it.'; render(); }
});
view.addEventListener('change', function (e) {
  if (e.target.id === 'project-remember') { PROJECT.remember = e.target.checked; PROJECT.storageMessage = ''; try { localStorage.setItem('ekm-remember', PROJECT.remember ? 'on' : 'off'); } catch (err) {} if (!PROJECT.remember) { try { localStorage.removeItem(PROJECT.key); Object.keys(localStorage).filter(function(k){return k.indexOf(PROJECT.key+'-draft-')===0;}).forEach(function(k){localStorage.removeItem(k);}); PROJECT.lastDraft = ''; PROJECT.base = null; } catch (err) {} PROJECT.message = 'Browser saving off. Save a project file before closing this tab.'; } render(); }
  if (e.target.id === 'project-file' && e.target.files[0]) {
    var f = e.target.files[0]; if (f.size > 50e6) { PROJECT.message = 'Project files up to 50 MB can be opened.'; render(); return; }
    f.text().then(function (text) { restoreProject(JSON.parse(text)); PROJECT.message = 'Project opened. Review imported results before using them.'; nav('data'); }).catch(function (err) { PROJECT.message = 'Project not opened. ' + err.message; render(); });
  }
});
try { var pref = localStorage.getItem('ekm-remember'); if (pref) PROJECT.remember = pref === 'on'; var cached = localStorage.getItem(PROJECT.key); PROJECT.base = cached; if (cached) { restoreProject(JSON.parse(cached)); PROJECT.remember = true; } } catch (err) { PROJECT.remember = false; PROJECT.message = 'Saved browser project could not be restored. Open a project backup.'; }

PROJECT.owner = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
window.addEventListener('storage', function (e) { if (e.key === 'ekm-remember' && e.newValue === 'off') { PROJECT.remember = false; PROJECT.base = null; PROJECT.conflict = false; PROJECT.storageMessage = 'Browser saving was switched off in another tab. Save a project file to keep your work.'; render(); return; } if (e.key === PROJECT.key && PROJECT.remember && e.newValue !== PROJECT.base) { PROJECT.conflict = true; render(); } });
