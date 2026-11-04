// Input fidelity and explicit conversion rules. Source values are never overwritten.
function uniqueColumnName(name, used) { var n = name, i = 2; while (used.indexOf(n) >= 0) n = name + ' (' + i++ + ')'; return n; }
function validDateValue(v) { var t = String(v), m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(t); if (!m) return false; var d = new Date(t + (m[3] ? '' : '-01') + 'T00:00:00Z'); return !isNaN(d.getTime()) && d.toISOString().slice(0, m[3] ? 10 : 7) === t; }
function changeColumnType(ds, j, type) {
  var name = ds.cols[j].name, original = ds.rawColumns ? ds.rawColumns.indexOf(name) : -1;
  var useRaw = original >= 0 && ds.rawRows.length === ds.rows.length && (ds.recipe || []).every(function (s) { return s.op === 'type'; });
  var rows = ds.rows.map(function (r, i) {
    var row = r.slice(), v = useRaw ? ds.rawRows[i][original] : r[j];
    if ((type === 'number' || type === 'year') && ds.importOptions) v = importedValue(v, ds.importOptions);
    if (isMissing(v)) row[j] = null;
    else if (type === 'number' || type === 'year') { var n = parseNum(v); if (typeof n !== 'number' || !isFinite(n)) throw new Error('“' + name + '” contains a value that cannot be converted without loss. Check original values or use explicit missing-value settings.'); row[j] = n; }
    else if (type === 'date') { if (!validDateValue(v)) throw new Error('“' + v + '” is not a valid ISO calendar date. Use YYYY-MM-DD.'); row[j] = String(v); }
    else row[j] = String(v);
    return row;
  });
  var cols = ds.cols.map(function (c, i) { return {name: c.name, type: i === j ? type : c.type}; });
  return {rows: rows, cols: cols, changed: ds.rows.length || 1};
}
var _replayInput = replayStep;
replayStep = function (ds, step) { return step.op === 'type' && idxOf(ds, step.col) >= 0 ? changeColumnType(ds, idxOf(ds, step.col), step.type) : _replayInput(ds, step); };
opToNum = function (ds, j) { return changeColumnType(ds, j, 'number'); };
function losslessJSONParse(text) {
  var out = '', i = 0;
  while (i < text.length) {
    if (text[i] === '"') { var start = i++; while (i < text.length) { if (text[i] === '\\') i += 2; else if (text[i++] === '"') break; } out += text.slice(start, i); }
    else { var number = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (number) { var token = number[0]; out += /^-?\d+$/.test(token) && Math.abs(+token) > 9007199254740991 ? JSON.stringify(token) : token; i += token.length; }
      else out += text[i++];
    }
  }
  return JSON.parse(out);
}
var IMPORT = {decimal: '.', missing: 'blank', sheet: null, workbook: null};
function importedValue(v, options) {
  if (options.missing === 'tokens' && /^(na|n\/a|nan|null|none|no data( found)?)$/i.test(String(v).trim())) return null;
  if (options.decimal === ',' && typeof v === 'string' && /^[-+]?\d+(?:\.\d{3})*,\d+(?:[eE][-+]?\d+)?$/.test(v.trim())) return v.trim().replace(/\./g, '').replace(',', '.');
  return v;
}
var _inputMake = makeSet;
makeSet = function (name, header, body, origin, extra) {
  if (body.length > 1000000 || header.length > 2000 || body.length * header.length > 8000000) throw new Error("Table exceeds the browser row/column/cell budget. Filter or split the source.");
  var options = {decimal: IMPORT.decimal, missing: IMPORT.missing};
  var converted = body.map(function (r) { return r.map(function (v) { return importedValue(v, options); }); });
  var ds = _inputMake(name, header, converted, origin, extra);
  ds.sourceHeaders = header.map(function (h) { return h == null ? '' : String(h); });
  ds.rawColumns = ds.cols.map(function (c) { return c.name; });
  ds.rawRows = body.map(function (r) { return header.map(function (_, j) { return r[j] == null ? null : r[j]; }); });
  ds.importOptions = options; return ds;
};
var _inputData = VIEWS.data;
VIEWS.data = function () {
  var h = _inputData(), ds = cur(), settings = '<details class="dt"><summary>Import settings</summary><div class="toolbar"><label class="field">Decimal mark<select id="import-decimal"><option value="."' + (IMPORT.decimal === '.' ? ' selected' : '') + '>Dot (1.5)</option><option value=","' + (IMPORT.decimal === ',' ? ' selected' : '') + '>Comma (1,5)</option></select></label><label class="field">Missing values<select id="import-missing"><option value="blank"' + (IMPORT.missing === 'blank' ? ' selected' : '') + '>Empty cells only</option><option value="tokens"' + (IMPORT.missing === 'tokens' ? ' selected' : '') + '>Empty, NA, N/A, null, none</option></select></label></div><p class="count">Applies to the next upload or paste. Identifiers with leading zeros and unsafe integers stay as text. Mixed numeric/text columns keep every value. Original values remain available below.</p></details>';
  h = h.replace('<div class="slot"><label class="btn btn-primary" for="afile">', settings + '<div class="slot"><label class="btn btn-primary" for="afile">');
  if (IMPORT.workbook) h += '<section class="card"><h2>Choose worksheet</h2><label class="field">Worksheet<select id="import-sheet">' + IMPORT.workbook.names.map(function (n, i) { return '<option value="' + i + '">' + esc(n) + '</option>'; }).join('') + '</select></label><button class="btn btn-primary" type="button" data-import-sheet="1">Import selected worksheet</button><p class="count">The first worksheet was imported. Select another worksheet to add it as a separate dataset.</p></section>';
  if (ds && ds.rawRows) h += '<section class="card"><h2>Original values</h2><p class="count">Unmodified imported values. Cleaning and type changes affect the working table; this source copy remains unchanged.</p><button class="btn" type="button" data-source-csv="1">Original data (.csv)</button><details><summary>Preview original rows</summary><div class="tablewrap"><table><thead><tr>' + ds.rawColumns.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + ds.rawRows.slice(0, 12).map(function (r) { return '<tr>' + r.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div></details></section>';
  return h;
};
view.addEventListener('change', function (e) { if (e.target.id === 'import-decimal') IMPORT.decimal = e.target.value; if (e.target.id === 'import-missing') IMPORT.missing = e.target.value; });
view.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  if (b.dataset.sourceCsv && cur()) saveFile(slug(cur().name) + '-original.csv', csvText({cols: (cur().sourceHeaders || cur().rawColumns).map(function (n) { return {name:n}; }), rows: cur().rawRows}));
  if (b.dataset.importSheet && IMPORT.workbook) { try { var w = IMPORT.workbook, i = +document.getElementById('import-sheet').value, aoa = w.reader.utils.sheet_to_json(w.book.Sheets[w.names[i]], {header:1, raw:true, defval:''}); aoa = aoa.filter(function(r){return r.some(function(v){return String(v).trim()!=='';});}); var ds = makeSet(w.name+' ('+w.names[i]+')',aoa[0]||[],aoa.slice(1)); if (!ds.rows.length) throw new Error('This worksheet has no data rows.'); A.sets.unshift(ds); pickSet(ds.id); saveSet(ds); render(); } catch(err) { A.msg=err.message; render(); } }
});
