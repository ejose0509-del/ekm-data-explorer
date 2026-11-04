// ---------- Scale and publication: large files, Parquet, cached column work, Word and PDF export, figure options ----------
var MAX_TEXT = 50e6, MAX_SHEET = 25e6;

// ---- Column values and summaries are cached per data version, so re-rendering large tables stays fast ----
var COLCACHE = new WeakMap(), DESCCACHE = new WeakMap();
var _colValsP = colVals;
colVals = function (ds, j) {
  if (!ds || !ds.rows) return _colValsP(ds, j);
  var m = COLCACHE.get(ds.rows); if (!m) { m = Object.create(null); COLCACHE.set(ds.rows, m); }
  if (!m[j]) m[j] = Object.freeze(_colValsP(ds, j));
  return m[j];
};
var _describeP = S.describe;
S.describe = function (a) { if (Object.isFrozen(a) && a.length > 1000) { var c = DESCCACHE.get(a); if (!c) { c = _describeP(a); DESCCACHE.set(a, c); } return c; } return _describeP(a); };

// ---- Import: Parquet, large CSV parsed off the main thread, bigger limits ----
function parseInWorker(text) {
  return new Promise(function (ok, no) {
    var src = amin.toString() + "\n" + amax.toString() + "\nvar splitCSV = " + splitCSV.toString() + ";\nonmessage = function (e) { try { postMessage({rows: splitCSV(e.data)}); } catch (err) { postMessage({error: err.message}); } };", w;
    try { w = new Worker(URL.createObjectURL(new Blob([src], {type: "text/javascript"}))); } catch (e) { try { ok(splitCSV(text)); } catch (err) { no(err); } return; }
    w.onmessage = function (e) { w.terminate(); if (e.data.error) no(new Error(e.data.error)); else ok(e.data.rows); };
    w.onerror = function () { w.terminate(); try { ok(splitCSV(text)); } catch (err) { no(err); } };
    w.postMessage(text);
  });
}
function parquetToTable(buf) {
  var P = window.EKMParquet; if (!P) return Promise.reject(new Error("The Parquet reader is unavailable."));
  var preflight = P.parquetMetadataAsync ? P.parquetMetadataAsync(buf).then(function (meta) { var n = Number(meta.num_rows), k = Math.max(1, (meta.schema || []).length - 1), values = 0, decoded = 0; (meta.row_groups || []).forEach(function (group) { decoded += Number(group.total_byte_size || 0); (group.columns || []).forEach(function (col) { values += Number((col.meta_data || {}).num_values || 0); }); }); if (values > 8000000 || decoded > 128e6) throw new Error("Decoded Parquet exceeds the browser memory budget. Filter it before importing."); if (!isFinite(n) || n > 1000000 || k > 2000 || n * k > 8000000) throw new Error("Decoded table exceeds the browser row/column/cell budget. Filter it before importing."); }) : Promise.resolve();
  return preflight.then(function () { return P.parquetReadObjects({file: buf, compressors: P.compressors}); }).then(function (objs) {
    var keys = []; objs.forEach(function (o) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
    var body = objs.map(function (o) { return keys.map(function (k) { var v = o[k]; if (v == null) return null; if (typeof v === "bigint") return v <= BigInt("9007199254740991") && v >= BigInt("-9007199254740991") ? Number(v) : String(v); if (v instanceof Date) return isNaN(v) ? null : (v.getUTCHours() || v.getUTCMinutes() || v.getUTCSeconds() || v.getUTCMilliseconds() ? v.toISOString() : v.toISOString().slice(0, 10)); if (typeof v === "object") return JSON.stringify(v, function (_, x) { return typeof x === "bigint" ? (x <= BigInt("9007199254740991") && x >= BigInt("-9007199254740991") ? Number(x) : String(x)) : x; }); return v; }); });
    return {header: keys, body: body};
  });
}
var _readFileP = readFile;
readFile = function (file) {
  var ext = (file.name.split(".").pop() || "").toLowerCase(), name = file.name.replace(/\.[^.]+$/, "");
  var done = function (ds) { A.busy = ""; if (!ds.rows.length) { A.msg = file.name + " has no data rows."; render(); return; } A.sets.unshift(ds); A.cur = ds.id; A.sel = Object.create(null); A.ai = Object.create(null); A.msg = ""; render(); saveSet(ds); };
  var fail = function (m) { A.busy = ""; A.msg = m; render(); };
  if (ext === "parquet" || ext === "pq") {
    if (file.size > MAX_TEXT) return fail(file.name + " is " + (file.size / 1e6).toFixed(0) + " MB. Parquet files up to 50 MB can be opened.");
    A.busy = "Reading " + file.name + "…"; render();
    return file.arrayBuffer().then(parquetToTable).then(function (t) { if (!t.header.length) throw new Error("No columns were found."); done(makeSet(name, t.header, t.body)); })
      .catch(function (e) { fail("Could not read " + file.name + ": " + (e && e.message || "unsupported Parquet encoding") + ". Export it as CSV and try again."); });
  }
  if ((ext === "xlsx" || ext === "xls") && file.size > MAX_SHEET) return fail(file.name + " is " + (file.size / 1e6).toFixed(0) + " MB. Spreadsheets up to 25 MB can be opened; save larger ones as CSV or Parquet.");
  if (file.size > MAX_TEXT) return fail(file.name + " is " + (file.size / 1e6).toFixed(0) + " MB. Files up to 50 MB can be opened; for larger data, filter or aggregate it first, or save it as Parquet.");
  if (file.size <= 25e6 || ext === "xlsx" || ext === "xls") {
    if (file.size > 25e6) { var shim = {name: file.name, size: 1, arrayBuffer: function () { return file.arrayBuffer(); }, text: function () { return file.text(); }}; return _readFileP(shim); }
    return _readFileP(file);
  }
  A.busy = "Reading " + file.name + " (" + (file.size / 1e6).toFixed(0) + " MB)…"; render();
  file.text().then(function (t) {
    if (ext === "json" || /^\s*[\[{]/.test(t)) { var shim2 = {name: file.name, size: 1, text: function () { return Promise.resolve(t); }}; return _readFileP(shim2); }
    A.busy = "Parsing " + file.name + "… large files take a few seconds."; render();
    return parseInWorker(t).then(function (rows) { if (rows.length < 2) return fail(file.name + " needs a header row and at least one data row."); A.busy = "Checking column types…"; render(); setTimeout(function () { try { done(makeSet(name, rows[0], rows.slice(1))); } catch (e) { fail(e.message); } }, 20); });
  }).catch(function (e) { fail("Could not read " + file.name + ". " + (e && e.message || "The file may be too large for this browser's memory.")); });
};
var _dataViewP = VIEWS.data;
VIEWS.data = function () {
  var h = _dataViewP();
  return h.replace("CSV, TSV, Excel (.xlsx) or JSON, up to 25 MB.", "CSV, TSV, Excel, JSON or Parquet, up to 50 MB (spreadsheets up to 25 MB). Table limits: 1,000,000 rows, 2,000 columns and 8,000,000 cells.").replace('accept=".csv,.tsv,.txt,.json,.xlsx,.xls"', 'accept=".csv,.tsv,.txt,.json,.xlsx,.xls,.parquet,.pq"');
};
// Very large scatter plots are drawn from an even sample of points (the statistics still use every row)
var _scatterP = scatter;
scatter = function (xs, ys, xl, yl, co) {
  var n = xs.length, cap = 4000; if (n <= cap) return _scatterP(xs, ys, xl, yl, co);
  var step = n / cap, sx = [], sy = []; for (var i = 0; i < cap; i++) { var k = Math.floor(i * step); sx.push(xs[k]); sy.push(ys[k]); }
  return _scatterP(sx, sy, xl, yl, co) + '<p class="count">Showing ' + cap.toLocaleString("en-US") + " of " + n.toLocaleString("en-US") + " points, evenly spaced through the data; calculations use all of them.</p>";
};

// ---- Figure options (Charts tab and all exports) ----
var PALETTES = {
  chalk: null,
  okabe: {"--blue": "#56B4E9", "--yellow": "#E69F00", "--pink": "#CC79A7", "--green": "#009E73", "--orange": "#D55E00", "--violet": "#0072B2", "--accent": "#E69F00", "--accent-soft": "rgba(230,159,0,.18)", "--ve": "#D55E00"},
  gray: {"--blue": "#e6e6e6", "--yellow": "#d0d0d0", "--pink": "#a8a8a8", "--green": "#8a8a8a", "--orange": "#bdbdbd", "--violet": "#767676", "--accent": "#d9d9d9", "--accent-soft": "rgba(217,217,217,.18)", "--ve": "#ffffff"}
};
function figStyle() { var ch = A.chart, p = PALETTES[ch.pal || "chalk"]; return p ? Object.keys(p).map(function (k) { return k + ":" + p[k]; }).join(";") : ""; }
function applyFigure(html) {
  var ch = A.chart, style = figStyle(), fs = ch.font && ch.font !== "md" ? " fs-" + ch.font : "", n = 0;
  if (!style && !fs && !ch.xl && !ch.yl) return html;
  return html.replace(/<svg([^>]*?)class="achart([^"]*)"([^>]*)>([\s\S]*?)<\/svg>/, function (m, a, cls, b, inner) {
    if (ch.xl || ch.yl) inner = inner.replace(/(<text[^>]*class="ax"[^>]*>)([^<]*)(<\/text>)/g, function (t, o, txt, c) { n++; return n === 1 && ch.xl ? o + esc(ch.xl) + c : n === 2 && ch.yl ? o + esc(ch.yl) + c : t; });
    return "<svg" + a + 'class="achart' + cls + fs + '"' + b + (style ? ' style="' + style + '"' : "") + ">" + inner + "</svg>";
  });
}
function figureCard() {
  var ch = A.chart;
  return '<details class="dt figopts"' + (ch.figOpen ? " open" : "") + ' data-figopen="1"><summary>Figure options</summary><div class="toolbar">' +
    '<label class="field" for="fg_title">Title (in exported files)<input id="fg_title" data-fig="title" value="' + esc(ch.title || "") + '" maxlength="120"></label>' +
    '<label class="field" for="fg_xl">Horizontal axis title<input id="fg_xl" data-fig="xl" value="' + esc(ch.xl || "") + '" maxlength="80" placeholder="automatic"></label>' +
    '<label class="field" for="fg_yl">Vertical axis title<input id="fg_yl" data-fig="yl" value="' + esc(ch.yl || "") + '" maxlength="80" placeholder="automatic"></label></div><div class="toolbar">' +
    choiceFig("pal", "Colours", [["chalk", "Chalk (screen)"], ["okabe", "Colour-blind safe (Okabe–Ito)"], ["gray", "Greyscale (print)"]], ch.pal || "chalk") +
    choiceFig("font", "Text size", [["sm", "Small"], ["md", "Standard"], ["lg", "Large"], ["xl", "Poster"]], ch.font || "md") +
    choiceFig("dpi", "PNG resolution", [["1", "Screen (1×)"], ["2", "Standard (2×)"], ["3", "Print (3×, about 300 dpi)"], ["4", "High (4×)"]], String(ch.dpi || 2)) +
    choiceFig("width", "Exported width", [["", "As shown"], ["480", "Single column (480 px)"], ["960", "Full width (960 px)"], ["1400", "Slide (1400 px)"]], String(ch.width || "")) + "</div></details>";
}
function choiceFig(key, label, opts, cur2) { return '<label class="field" for="fg_' + key + '">' + label + '<select id="fg_' + key + '" data-fig="' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(cur2) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>"; }
var _chartsViewP = VIEWS.charts;
VIEWS.charts = function () { var h = _chartsViewP(), ds = cur(); if (!ds || !ds.rows || h.indexOf("achart") < 0) return h; return applyFigure(h).replace(/(<section class="card"><div class="chartwrap">)/, figureCard() + "$1"); };
var _svgTextP = svgText;
svgText = function (svg, paper) {
  var t = _svgTextP(svg, paper), ch = A.chart, title = st.tab === "charts" ? ch.title : "";
  if (title) {
    var vb = (svg.getAttribute("viewBox") || "0 0 640 320").split(" ").map(Number), W = vb[2], H = vb[3] + 36;
    t = t.replace(/<svg([^>]*)>/, function (m, a) { return "<svg" + a.replace(/viewBox="[^"]*"/, 'viewBox="0 -36 ' + W + " " + H + '"').replace(/height="[^"]*"/, 'height="' + H + '"') + '><text x="' + W / 2 + '" y="-12" text-anchor="middle" font-family="STIX Two Text, Georgia, serif" font-size="17" font-weight="600" fill="' + (paper ? "#1b2620" : "#e8efe9") + '">' + esc(title) + "</text>"; }).replace(/<rect width="100%" height="100%"/, '<rect y="-36" width="100%" height="' + H + '"');
  }
  if (st.tab === "charts" && ch.width) { var vb2 = /viewBox="([^"]*)"/.exec(t)[1].split(" ").map(Number), w = +ch.width, h2 = Math.round(vb2[3] * w / vb2[2]); t = t.replace(/(<svg[^>]*?)width="[^"]*"/, '$1width="' + w + '"').replace(/(<svg[^>]*?)height="[^"]*"/, '$1height="' + h2 + '"'); }
  return t;
};
svgToPng = function (text, w, h) {
  var scale = Math.max(1, Math.min(4, +(A.chart.dpi || 2))), mw = /<svg[^>]*?width="([\d.]+)"/.exec(text), mh = /<svg[^>]*?height="([\d.]+)"/.exec(text);
  if (mw && mh) { w = +mw[1]; h = +mh[1]; }
  return new Promise(function (ok, no) {
    var img = new Image(), url = URL.createObjectURL(new Blob([text], {type: "image/svg+xml"}));
    img.onload = function () { var c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale); var g = c.getContext("2d"); g.scale(scale, scale); g.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); c.toBlob(function (b) { b ? ok(b) : no(); }, "image/png"); };
    img.onerror = no; img.src = url;
  });
};
view.addEventListener("change", function (e) {
  var t = e.target, k = t.dataset && t.dataset.fig; if (!k) return;
  A.chart[k] = k === "dpi" ? +t.value : t.value.trim ? t.value.trim() : t.value; if (!A.chart[k]) delete A.chart[k];
  render(); refocus("#fg_" + k);
});
view.addEventListener("click", function (e) { var sm = e.target.closest("summary"), d = sm && sm.parentElement; if (d && d.dataset.figopen) A.chart.figOpen = !d.open; }, true);   // recorded on click: a queued toggle event can arrive after a re-render

// ---- ZIP (stored, CRC-32) for .docx ----
var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zipStore(files) {   // files: [{name, data: Uint8Array}]
  var enc = new TextEncoder(), parts = [], central = [], off = 0;
  function u16(v) { return [v & 255, (v >>> 8) & 255]; } function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
  files.forEach(function (f) {
    var nm = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    var head = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(nm.length), u16(0)));
    parts.push(head, nm, f.data);
    central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off))), nm);
    off += head.length + nm.length + size;
  });
  var cdSize = central.reduce(function (s, a) { return s + a.length; }, 0);
  var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(off), u16(0)));
  return new Blob(parts.concat(central, [end]), {type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
}
// ---- Native Word document from the write-up ----
function xmlEsc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
function wRun(text, o) { o = o || {}; return "<w:r>" + (o.b || o.i || o.size ? "<w:rPr>" + (o.b ? "<w:b/>" : "") + (o.i ? "<w:i/>" : "") + (o.size ? '<w:sz w:val="' + o.size + '"/>' : "") + "</w:rPr>" : "") + '<w:t xml:space="preserve">' + xmlEsc(text) + "</w:t></w:r>"; }
function wPara(text, style, runs) { return "<w:p>" + (style ? '<w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' : "") + (runs || wRun(text)) + "</w:p>"; }
function richRuns(html) {   // keep italics from APA strings (<i>p</i>), subscripts as text
  var out = [], re = /<(i|sub|sup|b)>([\s\S]*?)<\/\1>|([^<]+)|<[^>]+>/g, m;
  while ((m = re.exec(html))) { if (m[3]) out.push(wRun(plain(m[3]))); else if (m[2] != null) out.push(m[1] === "i" ? wRun(plain(m[2]), {i: true}) : m[1] === "b" ? wRun(plain(m[2]), {b: true}) : "<w:r><w:rPr><w:vertAlign w:val=\"" + (m[1] === "sub" ? "subscript" : "superscript") + "\"/></w:rPr><w:t xml:space=\"preserve\">" + xmlEsc(plain(m[2])) + "</w:t></w:r>"); }
  return out.join("");
}
function wImage(rid, idx, wPx, hPx) {
  var cx = Math.round(Math.min(6, wPx / 96) * 914400), cy = Math.round(cx * hPx / wPx);
  return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + idx + '" name="Figure ' + idx + '"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + idx + '" name="figure' + idx + '.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
function paperModel() {   // the write-up as structured blocks, shared by .docx and PDF
  var holder = document.createElement("div"); holder.innerHTML = paperHTML(true);
  var blocks = [];
  [].forEach.call(holder.children, function (el) {
    var tag = el.tagName.toLowerCase();
    if (tag === "h1") blocks.push({t: "title", text: el.textContent});
    else if (tag === "p" && el.className === "pmeta") blocks.push({t: "meta", text: el.textContent});
    else if (tag === "h2") blocks.push({t: "h2", text: el.textContent});
    else if (tag === "p") blocks.push({t: "p", html: el.innerHTML});
    else if (tag === "ul") [].forEach.call(el.children, function (li) { blocks.push({t: "li", html: li.innerHTML}); });
    else if (tag === "section") [].forEach.call(el.children, function (c) {
      var ct = c.tagName.toLowerCase();
      if (ct === "h3") blocks.push({t: "h3", text: c.textContent});
      else if (ct === "p") blocks.push({t: "p", html: c.innerHTML});
      else if (ct === "figure") { var svg = c.querySelector("svg"), cap = c.querySelector("figcaption"); if (svg) blocks.push({t: "fig", svg: svg.outerHTML.indexOf("xmlns") < 0 ? svg.outerHTML.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"') : svg.outerHTML, w: +(svg.getAttribute("width") || 640), h: +(svg.getAttribute("height") || 320), cap: cap ? cap.innerHTML : ""}); }
    });
  });
  return blocks;
}
function figPng(b) { return svgToPng(b.svg, b.w, b.h).then(function (blob) { return blob.arrayBuffer(); }).then(function (ab) { return new Uint8Array(ab); }).catch(function () { return null; }); }
function exportDocx() {
  var blocks = paperModel(), figs = blocks.filter(function (b) { return b.t === "fig"; });
  return Promise.all(figs.map(figPng)).then(function (pngs) {
    var body = [], rels = [], media = [], fi = 0;
    blocks.forEach(function (b) {
      if (b.t === "title") body.push(wPara(b.text, "Title")); else if (b.t === "meta") body.push(wPara(b.text, "Subtitle"));
      else if (b.t === "h2") body.push(wPara(b.text, "Heading1")); else if (b.t === "h3") body.push(wPara(b.text, "Heading2"));
      else if (b.t === "p") body.push(wPara("", null, richRuns(b.html))); else if (b.t === "li") body.push(wPara("", "ListBullet", wRun("• ") + richRuns(b.html)));
      else if (b.t === "fig") { var png = pngs[fi++]; if (png) { var rid = "rIdImg" + fi; media.push({name: "word/media/figure" + fi + ".png", data: png}); rels.push('<Relationship Id="' + rid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/figure' + fi + '.png"/>'); body.push(wImage(rid, fi, b.w, b.h)); } body.push(wPara("", "Caption", richRuns(b.cap))); }
    });
    var NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    var doc = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS + "><w:body>" + body.join("") + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>';
    var style = function (id, name, run, para) { return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:qFormat/>' + (para ? "<w:pPr>" + para + "</w:pPr>" : "") + "<w:rPr>" + run + "</w:rPr></w:style>"; };
    var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' + style("Title", "Title", '<w:b/><w:sz w:val="36"/>', '<w:jc w:val="center"/>') + style("Subtitle", "Subtitle", '<w:i/><w:sz w:val="20"/>', '<w:jc w:val="center"/>') +
      style("Heading1", "heading 1", '<w:b/><w:sz w:val="28"/>', '<w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/>') + style("Heading2", "heading 2", '<w:b/><w:i/><w:sz w:val="24"/>', '<w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/>') +
      style("Caption", "caption", '<w:sz w:val="20"/>', '<w:spacing w:after="240"/>') + style("ListBullet", "List Bullet", "", '<w:ind w:left="360" w:hanging="360"/>') + "</w:styles>";
    var enc = new TextEncoder(), files = [
      {name: "[Content_Types].xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>')},
      {name: "_rels/.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>')},
      {name: "docProps/core.xml", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xmlEsc(WP.title) + '</dc:title><dc:creator>EKM Data Explorer</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().slice(0, 19) + "Z</dcterms:created></cp:coreProperties>")},
      {name: "word/_rels/document.xml.rels", data: enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + rels.join("") + "</Relationships>")},
      {name: "word/document.xml", data: enc.encode(doc)}, {name: "word/styles.xml", data: enc.encode(styles)}].concat(media);
    return zipStore(files);
  });
}
// ---- PDF via jsPDF (loaded on demand from cdnjs) ----
var _jspdf = null;
function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (_jspdf) return _jspdf;
  _jspdf = new Promise(function (ok, no) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"; s.onload = function () { if (window.jspdf && window.jspdf.jsPDF) ok(window.jspdf.jsPDF); else { _jspdf = null; no(new Error("PDF writer unavailable")); } }; s.onerror = function () { _jspdf = null; s.remove(); no(new Error("PDF writer unavailable")); }; document.head.appendChild(s); });
  return _jspdf;
}
function winAnsi(s) {   // standard PDF fonts cover Latin-1; spell out the statistical symbols they lack
  var map = {"α": "alpha", "β": "beta", "χ": "chi", "η": "eta", "κ": "kappa", "ω": "omega", "ε": "epsilon", "ρ": "rho", "τ": "tau", "λ": "lambda", "σ": "sigma", "μ": "mu", "Δ": "Delta", "≤": "<=", "≥": ">=", "−": "-", "≈": "~", "∼": "~", "→": "->", "≠": "!=", "√": "sqrt", "∑": "sum", "ₚ": "p", "‖": "||", "⇄": "<->", "‘": "'", "’": "'", "“": "\"", "”": "\"", "…": "...", " ": " "};
  return String(s).replace(/[^\u0000-ÿ–—•·×±²³µ]/g, function (c) { return map[c] != null ? map[c] : ""; });
}
function exportPdf() {
  return loadJsPDF().then(function (JsPDF) {
    var blocks = paperModel(), figs = blocks.filter(function (b) { return b.t === "fig"; });
    return Promise.all(figs.map(function (b) { return svgToPng(b.svg, b.w, b.h).then(function (blob) { return new Promise(function (ok) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.readAsDataURL(blob); }); }).catch(function () { return null; }); })).then(function (urls) {
      var doc = new JsPDF({unit: "mm", format: "a4"}), W = 210, M = 22, y = M, fi = 0, lineH = function (pt) { return pt * 0.3528 * 1.45; };
      var ensure = function (h) { if (y + h > 297 - M) { doc.addPage(); y = M; } };
      var text = function (str, font, size, style, indent, align) { doc.setFont(font, style); doc.setFontSize(size); var lines = doc.splitTextToSize(winAnsi(str), W - 2 * M - (indent || 0)); lines.forEach(function (ln) { ensure(lineH(size)); doc.text(ln, align === "center" ? W / 2 : M + (indent || 0), y, align === "center" ? {align: "center"} : undefined); y += lineH(size); }); };
      blocks.forEach(function (b) {
        if (b.t === "title") { text(b.text, "times", 18, "bold", 0, "center"); y += 2; }
        else if (b.t === "meta") { text(b.text, "times", 10, "italic", 0, "center"); y += 4; }
        else if (b.t === "h2") { y += 3; ensure(12); text(b.text, "helvetica", 13, "bold"); y += 1; }
        else if (b.t === "h3") { y += 1; ensure(10); text(b.text, "times", 12, "bolditalic"); }
        else if (b.t === "p") { text(plain(b.html), "times", 11.5, "normal"); y += 2; }
        else if (b.t === "li") { text("•  " + plain(b.html), "times", 11.5, "normal", 4); }
        else if (b.t === "fig") { var u = urls[fi++]; if (u) { var w = Math.min(W - 2 * M, b.w * 0.2646), h = w * b.h / b.w; ensure(h + 8); doc.addImage(u, "PNG", (W - w) / 2, y, w, h); y += h + 3; } text(plain(b.cap), "times", 10, "normal"); y += 3; }
      });
      var pages = doc.getNumberOfPages(); for (var p = 1; p <= pages; p++) { doc.setPage(p); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(p + " / " + pages, W / 2, 297 - 10, {align: "center"}); }
      return doc.output("blob");
    });
  });
}
var _writeupViewP = VIEWS.writeup;
VIEWS.writeup = function () { var h = _writeupViewP(); return h.replace('<button type="button" class="btn" data-wpexp="doc">For Word (.doc)</button>', '<button type="button" class="btn btn-primary" data-wpx="docx">Word (.docx)</button><button type="button" class="btn" data-wpx="pdf">PDF</button><button type="button" class="btn" data-wpexp="doc">Older Word (.doc)</button>'); };
view.addEventListener("click", function (e) {
  var b = e.target.closest("button[data-wpx]"); if (!b) return; var kind = b.dataset.wpx, base = slug(WP.title || "results") + "-" + today();
  XP.msg = kind === "pdf" ? "Preparing the PDF…" : "Preparing the Word document…"; render();
  (kind === "pdf" ? exportPdf() : exportDocx()).then(function (blob) { saveFile(base + (kind === "pdf" ? ".pdf" : ".docx"), blob); XP.msg = (kind === "pdf" ? "PDF" : "Word document") + " ready" + (kind === "pdf" ? ". Symbols such as χ² are spelled out (chi²) because standard PDF fonts lack them." : "."); render(); })
    .catch(function (err) { XP.msg = kind === "pdf" ? "The PDF writer could not load (it comes from cdnjs). Use Word (.docx) instead, or print the web page version." : "The Word document could not be created: " + (err && err.message || "unknown error") + "."; render(); });
});

// Budget the expanded in-memory table before reading, and warn before unsaveable work.
var IMPORT_PENDING = null;
var _budgetRead = readFile;
function importBudget(file) {
  var cap = /\.(xlsx|xls)$/i.test(file.name) ? MAX_SHEET : MAX_TEXT;
  if (navigator.deviceMemory && navigator.deviceMemory <= 4) cap = Math.min(cap, 25e6);
  var memory = performance.memory;
  if (memory && memory.jsHeapSizeLimit) cap = Math.min(cap, Math.max(0, (memory.jsHeapSizeLimit - memory.usedJSHeapSize) / 12));
  return Math.floor(cap);
}
readFile = function (file) {
  IMPORT_PENDING = null;
  var cap = importBudget(file);
  if (file.size > cap) { A.busy = ""; A.msg = file.name + " exceeds this browser's import budget (" + Math.floor(cap / 1e6) + " MB). Filter or split the file before importing. The working dataset is unchanged."; render(); return; }
  if (file.size > 6e6) { IMPORT_PENDING = file; A.busy = ""; A.msg = ""; render(); return; }
  return _budgetRead(file);
};
var _budgetView = VIEWS.data;
VIEWS.data = function () {
  var h = _budgetView();
  h = h.replace("up to 50 MB (spreadsheets up to 25 MB).", "up to 50 MB (spreadsheets up to 25 MB), subject to available memory.");
  if (IMPORT_PENDING) h = '<section class="card"><h2>Large import: save limits</h2><p class="warn">' + esc(IMPORT_PENDING.name) + ' is ' + (IMPORT_PENDING.size / 1e6).toFixed(1) + ' MB. A project stores both original and working values plus history and may exceed the 50 MB project limit. Browser saving may also be unavailable. Continuing pauses browser autosave for this tab. Continue only if you can keep the source and export working CSV and steps separately; split or reduce the source to retain a portable project.</p><div class="slot"><button type="button" class="btn btn-primary" data-import-continue="1">Continue import</button><button type="button" class="btn" data-import-cancel="1">Cancel import</button></div></section>' + h;
  return h;
};
view.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; if (b.dataset.importCancel) { IMPORT_PENDING = null; render(); } if (b.dataset.importContinue && IMPORT_PENDING) { var f = IMPORT_PENDING; IMPORT_PENDING = null; PROJECT.remember = false; PROJECT.storageMessage = "Large import: browser autosave paused. Keep the source and download your working data and steps."; return _budgetRead(f); } });
