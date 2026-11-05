// ---------- Glossary: catalog profiling, personal-data rules, join inference, terms, certification, formulas, coverage ----------
// Ideas and rules from NVIDIA Auto Ontology (Apache-2.0). Everything here is rule-based and runs in the page.
var ONT = {terms: [], sec: "catalog", msg: "", edit: null, q: "", draftBusy: false};
function ontId() { return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function canCertify() { return !ST.on || !ONT.user || ONT.user.canEdit() !== false; }
if (window.claude && window.claude.use) window.claude.use("user").then(function (u) { ONT.user = u; }).catch(function () {});

// ---- 1. Catalog profile per column (Auto Ontology's calculate_columns_profiling, on the whole table) ----
var PROFILE = new WeakMap();
function shapeOf(v) { return String(v).trim().replace(/[0-9]/g, "9").replace(/[a-z]/gi, "a"); }
function profileSet(ds) {
  var p = PROFILE.get(ds.rows); if (p && p.cols === ds.cols) return p.out;
  var out = ds.cols.map(function (c, j) {
    var vals = colVals(ds, j), counts = Object.create(null), n = 0, k = 0;
    vals.forEach(function (v) { if (v == null) return; n++; var s = String(v); if (!counts[s]) { counts[s] = 0; k++; } counts[s]++; });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 5).map(function (s) { return [s, counts[s]]; });
    var fmt = null, mixed = null;
    if (c.type === "date" || c.type === "text" || c.type === "category" || c.type === "year" || /date|time|dob|birth|day|month/i.test(c.name)) {
      var distinct = Object.keys(counts).slice(0, 400); fmt = AO.inferDateFormat(distinct);
      if (!fmt && distinct.length) {   // values that mix more than one recognizable date shape
        var groups = Object.create(null); distinct.forEach(function (s) { (groups[shapeOf(s)] = groups[shapeOf(s)] || []).push(s); });
        var named = Object.keys(groups).map(function (g) { return AO.inferDateFormat(groups[g]); }).filter(Boolean);
        if (named.length > 1) mixed = named.filter(function (x, i) { return named.indexOf(x) === i; }).slice(0, 4);
      }
    }
    var pii = AO.evaluateRules(c.name, ds.name);
    return {name: c.name, type: c.type, n: n, missing: vals.length - n, distinct: k, unique: n > 0 && k === n, top: top, format: fmt, mixedFormats: mixed, pii: pii};
  });
  PROFILE.set(ds.rows, {cols: ds.cols, out: out}); return out;
}
// Personal-data tags come from the ported rules first; EKM's own patterns only fill gaps the rules leave open.
var _suggestColumnO = suggestColumn;
suggestColumn = function (ds, c) {
  var t = _suggestColumnO(ds, c), d = AO.evaluateRules(c.name, ds.name);
  if (d) {
    t.pii = {status: d.status, category: d.category, confidence: d.confidence, reason: d.reason};
    if (d.status === "pii") { if (AO.shouldAutoTag(d)) t.sens = "personal"; else t.piiReview = true; }
    else if (d.status === "not_pii" && t.sens === "personal") delete t.sens;
  }
  return t;
};

// ---- 2. Join inference between datasets (declared nothing; inferred from values, as Auto Ontology's semantic FKs) ----
function keySample(ds, j, max) { var u = Object.create(null), out = []; for (var i = 0; i < ds.rows.length && out.length < (max || 200); i++) { var v = ds.rows[i][j]; if (v == null) continue; var s = String(v).trim(); if (!u[s]) { u[s] = 1; out.push(s); } } return out; }
function valueSet(ds, j) { var s = Object.create(null); ds.rows.forEach(function (r) { if (r[j] != null) s[String(r[j]).trim()] = 1; }); return s; }
function nameScore(a, b) { var n = function (x) { return x.toLowerCase().replace(/[^a-z0-9]/g, ""); }, x = n(a), y = n(b); if (x === y) return 1; if (x.indexOf(y) >= 0 || y.indexOf(x) >= 0) return 0.7; return 0; }
function inferJoins() {
  var sets = A.sets.filter(function (s) { return s.rows && s.rows.length; }), out = [];
  sets.forEach(function (T) {   // T: the table whose column is the key (unique values)
    var prof = profileSet(T);
    T.cols.forEach(function (tc, tj) {
      if (!prof[tj].unique || prof[tj].n < 2 || tc.type === "number" && !prof[tj].top.every(function (t) { return /^-?\d+$/.test(t[0]); })) return;
      var tv = null;
      sets.forEach(function (S) {
        if (S === T) return;
        S.cols.forEach(function (sc, sj) {
          if ((isNum(sc) !== isNum(tc)) || sc.type === "text" && tc.type !== "text") return;
          var samp = keySample(S, sj, 200); if (samp.length < 2) return;
          tv = tv || valueSet(T, tj);
          var hit = samp.filter(function (v) { return tv[v]; }).length;
          if (hit !== samp.length) return;   // every sampled value must exist in the key column
          out.push({from: S.name, fromId: S.id, fromCol: sc.name, to: T.name, toId: T.id, toCol: tc.name, sampled: samp.length, name: nameScore(sc.name, tc.name)});
        });
      });
    });
  });
  // Junction tables: two or more outgoing links and little else
  var outgoing = Object.create(null); out.forEach(function (e) { (outgoing[e.fromId] = outgoing[e.fromId] || []).push(e); });
  var junction = sets.filter(function (s) { var e = outgoing[s.id] || []; var froms = e.map(function (x) { return x.fromCol; }).filter(function (x, i, a) { return a.indexOf(x) === i; }); return s.cols.length > 2 && froms.length >= 2 && froms.length >= s.cols.length - 2; }).map(function (s) { return s.id; });
  return {edges: out.sort(function (a, b) { return b.name - a.name || b.sampled - a.sampled; }), junction: junction};
}
// Typed joins: refuse keys that do not match unless the person overrides
var _toolsPanelO = toolsPanel;
toolsPanel = function (ds) {
  var h = _toolsPanelO(ds), js = inferJoins().edges.filter(function (e) { return e.fromId === ds.id || e.toId === ds.id; }).slice(0, 6);
  if (!js.length) return h;
  var list = '<div class="joinsugg"><p class="count"><b>Suggested keys</b> (every sampled value of one column exists in the other):</p><ul class="plain">' + js.map(function (e, i) { var mine = e.fromId === ds.id; return '<li>' + esc(mine ? e.fromCol : e.toCol) + " here ↔ " + esc(mine ? e.toCol : e.fromCol) + " in " + esc(mine ? e.to : e.from) + ' <button type="button" class="linkbtn" data-jsugg="' + i + '">Use</button></li>'; }).join("") + "</ul></div>";
  ONT.joinSugg = js;
  return h.replace(/(<label class="field" for="jtype">)/, list + "$1");
};
function joinMatchShare(L, Rt, kl, kr) { var rs = valueSet(Rt, idxOf(Rt, kr)), li = idxOf(L, kl), n = 0, hit = 0; L.rows.forEach(function (r) { var v = r[li]; if (v == null) return; n++; if (rs[String(v).trim()]) hit++; }); return n ? hit / n : 0; }
document.addEventListener("click", function (e) {   // on the document so it runs before the join handler on #view
  var b = e.target.closest && e.target.closest('button[data-dt="join"]'); if (!b || !view.contains(b) || st.tab !== "enhance" || DT.join.force) return;
  var ds = cur(), other = A.sets.filter(function (s) { return s.id === (DT.join.with || (A.sets.filter(function (x) { return x.id !== ds.id; })[0] || {}).id); })[0];
  if (!other || !other.rows) return;
  var kl = DT.join.kl || ds.cols[0].name, kr = DT.join.kr || other.cols[0].name, share = joinMatchShare(ds, other, kl, kr);
  if (share < 0.01) { e.stopImmediatePropagation(); DT.open = "join"; DT.msg = "Blocked: no values of " + kl + " appear in " + other.name + "." + kr + " (" + Math.round(share * 1000) / 10 + "% match), so this join would add only empty columns. Pick the suggested key above, or tick “Join anyway” to override."; DT.join.blocked = true; render(); }
}, true);
var _toolsPanelO2 = toolsPanel;
toolsPanel = function (ds) { var h = _toolsPanelO2(ds); return DT.join.blocked ? h.replace(/(<button type="button" class="btn btn-primary" data-dt="join">)/, '<label class="chk"><input type="checkbox" data-jforce="1"' + (DT.join.force ? " checked" : "") + "> Join anyway</label>$1") : h; };
view.addEventListener("change", function (e) { var t = e.target; if (t.dataset && t.dataset.jforce) { DT.join.force = t.checked; render(); } if (t.dataset && t.dataset.dtj) { DT.join.blocked = false; DT.join.force = false; } });
view.addEventListener("click", function (e) { var b = e.target.closest("button[data-jsugg]"); if (!b) return; var s = ONT.joinSugg[+b.dataset.jsugg], ds = cur(), mine = s.fromId === ds.id; DT.join.with = mine ? s.toId : s.fromId; DT.join.kl = mine ? s.fromCol : s.toCol; DT.join.kr = mine ? s.toCol : s.fromCol; DT.join.blocked = false; DT.open = "join"; render(); });

// ---- 3. Terms: drafted from the data, edited, certified ----
function camel(s) { return String(s).replace(/\.[a-z0-9]+$/i, "").replace(/[_\-.]+/g, " ").replace(/\s+\(.*?\)\s*/g, " ").trim().split(/\s+/).filter(Boolean).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join("").replace(/s$/, "") || "Entity"; }
function describeColumn(ds, c, pr) {
  var t = tagOf(c), bits = [];
  if (c.label) bits.push(c.label + ".");
  bits.push(isNum(c) ? "Number" + (c.unit ? " in " + c.unit : "") : c.type === "date" ? "Date" : c.type === "year" ? "Year" : c.type === "category" ? "Category with " + pr.distinct + " values" : "Text");
  if (pr.unique) bits.push("unique for every row");
  if (pr.format) bits.push("stored as " + pr.format);
  if (pr.top.length && !t.sens && !pr.unique) bits.push("e.g. " + pr.top.slice(0, 3).map(function (x) { return x[0]; }).join(", "));
  return bits.join(", ").replace(/\.,/g, ".") + ".";
}
function draftTerms(ds) {   // the deterministic fallback Auto Ontology uses when no model is available, plus EKM's tags
  var prof = profileSet(ds), name = camel(ds.name), existing = ONT.terms.filter(function (t) { return t.dsId === ds.id && t.kind === "entity"; })[0];
  if (existing) return 0;
  var term = {id: ontId(), kind: "entity", name: name, description: "One row of “" + ds.name + "”" + (ds.note ? ": " + ds.note : "."), synonyms: [], dsId: ds.id, ds: ds.name, cols: [], certified: false, descCertified: false, suggested: true, formulas: []};
  ds.cols.forEach(function (c, j) { if (tagOf(c).role === "rowtag") return; term.cols.push({col: c.name, attr: c.label || c.name.replace(/[_\-.]+/g, " "), description: describeColumn(ds, c, prof[j]), certified: false}); });
  ONT.terms.push(term); return 1;
}
function termsFor(ds) { return ONT.terms.filter(function (t) { return t.dsId === ds.id || t.ds === ds.name; }); }
function certify(term, field, on) { if (!canCertify()) { ONT.msg = "Only people with edit access can certify definitions."; return; } term[field] = on; if (field === "certified" && on) { term.suggested = false; term.descCertified = true; } auditLog(on ? "Certified definition" : "Removed certification", null, term.name + (field === "descCertified" ? " (description)" : "")); }
// Analyses built on certified definitions say so
var _runAnalysisO = runAnalysis;
runAnalysis = function (ds) {
  var R = _runAnalysisO(ds); if (!ds || R.valid === false) return R;
  var used = [A.sel.y, A.sel.x, A.sel.g, A.sel.g2, A.sel.t].concat(A.sel.preds || [], A.sel.mx || []).filter(Boolean), cert = [];
  termsFor(ds).forEach(function (t) { (t.cols || []).forEach(function (c) { if (used.indexOf(c.col) >= 0 && (c.certified || t.certified)) cert.push(c.attr); }); (t.formulas || []).forEach(function (f) { if (f.certified && used.indexOf(f.name) >= 0) cert.push(f.name); }); });
  if (cert.length) R.certified = cert.filter(function (x, i, a) { return a.indexOf(x) === i; });
  return R;
};
var _conclusionExtrasO = conclusionExtras;
conclusionExtras = function (R) { var h = _conclusionExtrasO(R); return R && R.certified && R.certified.length ? '<p class="count"><span class="chip q-verified">Certified definitions</span> ' + R.certified.map(esc).join(", ") + "</p>" + h : h; };

// ---- 4. Reusable formulas (Auto Ontology's SQL attributes): named EKM formulas kept with a term ----
function formulaColumns(expr, ds) { try { parseFormula(expr, ds); return true; } catch (e) { return false; } }
function applyFormula(ds, f) {
  if (idxOf(ds, f.name) >= 0) { ONT.msg = "“" + ds.name + "” already has a column called " + f.name + "."; return; }
  if (!formulaColumns(f.expr, ds)) { ONT.msg = "“" + ds.name + "” lacks a column this formula uses."; return; }
  applyStep(ds, {op: "formula", name: f.name, expr: f.expr, text: "Added " + f.name + " = " + f.expr + " (from the glossary" + (f.certified ? ", certified" : "") + ")"}, function () { return opFormula(ds, f.name, f.expr); });
  ONT.msg = "Added " + f.name + " to " + ds.name + ".";
}

// ---- 5. Coverage: can this data answer the question? (Auto Ontology's entity coverage, without embeddings) ----
var STOP = "a an and are as at be by can could did do does for from had has have how i in into is it its me my of on or our per show tell than that the their them then there these this to was we were what when where which who why will with would you your please give list find about across between each every all any much many more most less least top bottom average mean median total sum count number rate percent percentage over under during versus vs compare compared difference differ relate relationship correlation trend change changed predict prediction forecast likely chance summary summarize describe distribution higher lower increase decrease month year week day".split(" ");
function questionEntities(q) {
  var words = q.toLowerCase().replace(/[“”"'’?.,!:;()]/g, " ").split(/\s+/).filter(Boolean), out = [], cur2 = [];
  words.forEach(function (w) { if (STOP.indexOf(w) >= 0 || /^\d+$/.test(w)) { if (cur2.length) out.push(cur2.join(" ")); cur2 = []; } else cur2.push(w); });
  if (cur2.length) out.push(cur2.join(" "));
  return out.filter(function (x, i, a) { return x.length > 1 && a.indexOf(x) === i; });
}
function vocabulary(ds) {
  var v = [];
  ds.cols.forEach(function (c) { v.push([c.name.toLowerCase().replace(/[_\-.]+/g, " "), c.name, "column"]); if (c.label) v.push([c.label.toLowerCase(), c.name, "label"]); });
  termsFor(ds).forEach(function (t) { v.push([t.name.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(), null, "term"]); (t.synonyms || []).forEach(function (s) { v.push([s.toLowerCase(), t.cols.length === 1 ? t.cols[0].col : null, "synonym"]); }); (t.cols || []).forEach(function (c) { v.push([String(c.attr).toLowerCase(), c.col, "attribute"]); (c.synonyms || []).forEach(function (s) { v.push([s.toLowerCase(), c.col, "synonym"]); }); }); (t.formulas || []).forEach(function (f) { v.push([f.name.toLowerCase().replace(/[_\-.]+/g, " "), f.name, "formula"]); }); });
  return v;
}
function covers(entity, phrase) { var e = entity.replace(/s\b/g, ""), p = phrase.replace(/s\b/g, ""); return e === p || (" " + e + " ").indexOf(" " + p + " ") >= 0 || (" " + p + " ").indexOf(" " + e + " ") >= 0; }
function valueAnchor(ds, entity) {   // a phrase that names a stored category value
  for (var j = 0; j < ds.cols.length; j++) { var c = ds.cols[j]; if (c.type !== "category" && c.type !== "text") continue; var pr = profileSet(ds)[j]; if (pr.distinct > 2000 || sensitive(c)) continue; var vs = valueSet(ds, j); for (var v in vs) if (v.toLowerCase() === entity || covers(entity, v.toLowerCase()) && v.length > 2) return {col: c.name, value: v}; }
  return null;
}
function coverage(ds, q) {
  var ents = questionEntities(q), vocab = vocabulary(ds), covered = [], missing = [], anchors = [];
  ents.forEach(function (e) {
    var hit = vocab.filter(function (v) { return covers(e, v[0]); })[0];
    if (hit) { covered.push({entity: e, via: hit[2], col: hit[1]}); return; }
    var an = valueAnchor(ds, e); if (an) { anchors.push(an); covered.push({entity: e, via: "value", col: an.col}); return; }
    missing.push(e);
  });
  return {score: ents.length ? covered.length / ents.length : 0, entities: ents, covered: covered, missing: missing, anchors: anchors};
}
function nearValues(ds, colName, value) {   // values a mistyped filter probably meant
  var j = idxOf(ds, colName); if (j < 0) return [];
  var vs = Object.keys(valueSet(ds, j)), lv = value.toLowerCase();
  return vs.map(function (v) { return [v, lev(lv, v.toLowerCase())]; }).filter(function (x) { return x[1] <= Math.max(2, Math.floor(lv.length / 3)); }).sort(function (a, b) { return a[1] - b[1]; }).slice(0, 3).map(function (x) { return x[0]; });
}
// Business words in questions resolve to columns before routing
var _mentionedO = mentioned;
mentioned = function (ds, q) {
  var text = q;
  vocabulary(ds).filter(function (v) { return v[1] && v[2] !== "column"; }).sort(function (a, b) { return b[0].length - a[0].length; }).forEach(function (v) { var re = new RegExp("(^|[^a-z0-9])" + v[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=$|[^a-z0-9])", "gi"); text = text.replace(re, "$1" + v[1]); });
  return _mentionedO(ds, text);
};
var _askAnswerO = askAnswer;
askAnswer = function (ds) {
  var q = ((document.getElementById("askq") || {}).value || "").trim();
  if (q && /\b(predict|forecast|will\b|likely to|chance of|probability of)\b/i.test(q) && !/\b(from|using)\b/i.test(q)) {   // predictive questions go to the tested prediction models
    var cols = mentioned(ds, q); A.askq = q;
    if (cols.length === 1) { A.kind = "model"; A.sel = Object.assign(Object.create(null), {mt: cols[0].name}); A.askmsg = "Predictive question: opened Predict an outcome for " + cols[0].name + ". Choose predictors and validation, then train."; render(); refocus("#ask-answer"); return; }
  }
  _askAnswerO(ds);
  if (!q || !/could not match/.test(A.askmsg || "")) return;
  var cv = coverage(ds, q), pct = Math.round(cv.score * 100);
  var miss = cv.missing.length ? " Nothing in this data covers " + cv.missing.map(function (m) { return "“" + m + "”"; }).join(", ") + "." : "";
  var anchorNote = cv.anchors.length ? " Recognised values: " + cv.anchors.map(function (a) { return "“" + a.value + "” in " + a.col; }).join(", ") + "." : "";
  A.askmsg = "Coverage " + pct + "%: " + cv.covered.length + " of " + cv.entities.length + " things the question names map to columns, labels or glossary terms." + miss + anchorNote + (cv.score < 1 ? " Rephrase with covered terms, add a glossary synonym, or connect a source that has this information." : " " + A.askmsg);
  render(); refocus("#ask-answer");
};
// Filter values are checked against the data, with near-miss suggestions
var _filterCardO = filterCard;
filterCard = function (ds) {
  var h = _filterCardO(ds), w = A.sel.where; if (!w || !w.conds) return h;
  var notes = w.conds.map(function (c) { var col = colMeta(ds, c.col); if (!col || isNum(col) || ["is", "isnot", "in"].indexOf(c.op) < 0 || !c.v) return ""; var vs = valueSet(ds, idxOf(ds, c.col)), vals = c.op === "in" ? String(c.v).split(",").map(function (x) { return x.trim(); }) : [c.v]; var bad = vals.filter(function (v) { return v && !vs[v]; }); return bad.map(function (v) { var nv = nearValues(ds, c.col, v); return "No rows have " + c.col + " = “" + v + "”." + (nv.length ? " Did you mean " + nv.map(function (x) { return "“" + x + "”"; }).join(" or ") + "?" : ""); }).join(" "); }).filter(Boolean);
  return notes.length ? h.replace(/(<div class="slot"><button type="button" class="btn" data-wadd)/, '<p class="warn" role="status">' + notes.map(esc).join(" ") + "</p>$1") : h;
};

// ---- 6. Auto Ontology model YAML (data_layer + semantic_layer) ----
function yamlScalar(v) { if (v === null || v === undefined) return "null"; if (typeof v === "boolean" || typeof v === "number") return String(v); return JSON.stringify(String(v)); }
function toYaml(v, ind) {
  ind = ind || ""; var nx = ind + "  ";
  if (Array.isArray(v)) return v.length ? v.map(function (x) { return ind + "- " + (x && typeof x === "object" ? toYaml(x, nx).replace(/^\s+/, "") : yamlScalar(x)); }).join("\n") : ind + "[]";
  if (v && typeof v === "object") { var ks = Object.keys(v); if (!ks.length) return ind + "{}"; return ks.map(function (k) { var x = v[k]; if (x && typeof x === "object" && (Array.isArray(x) ? x.length : Object.keys(x).length)) return ind + k + ":\n" + toYaml(x, Array.isArray(x) ? ind : nx); return ind + k + ": " + (Array.isArray(x) ? "[]" : x && typeof x === "object" ? "{}" : yamlScalar(x)); }).join("\n"); }
  return ind + yamlScalar(v);
}
function parseYaml(text) {   // block-style YAML as written by PyYAML or toYaml: mappings, sequences, scalars, inline JSON
  var lines = text.replace(/\t/g, "  ").split(/\r?\n/).map(function (l) { return l.replace(/\s+#.*$/, ""); }).filter(function (l) { return /\S/.test(l) && !/^\s*#/.test(l) && !/^---\s*$/.test(l); }), pos = 0;
  function scalar(s) {
    s = s.trim(); if (s === "" || s === "~" || s === "null") return null; if (s === "true") return true; if (s === "false") return false;
    if (/^[\[{"]/.test(s)) { try { return JSON.parse(s); } catch (e) {} }
    if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    if (/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return +s; return s;
  }
  function indentOf(l) { return l.match(/^ */)[0].length; }
  function block(ind) {
    if (pos >= lines.length) return null;
    var isSeq = /^\s*- /.test(lines[pos]) || /^\s*-$/.test(lines[pos]);
    if (isSeq) {
      var arr = [];
      while (pos < lines.length && indentOf(lines[pos]) === ind && /^\s*-( |$)/.test(lines[pos])) {
        var rest = lines[pos].replace(/^\s*-\s?/, "");
        if (!rest) { pos++; arr.push(block(pos < lines.length ? indentOf(lines[pos]) : ind + 2)); continue; }
        if (/^[^"'\[{][^:]*:( |$)/.test(rest)) { lines[pos] = new Array(ind + 3).join(" ") + rest; arr.push(block(ind + 2)); }
        else { arr.push(scalar(rest)); pos++; }
      }
      return arr;
    }
    var obj = {};
    while (pos < lines.length && indentOf(lines[pos]) === ind && !/^\s*- /.test(lines[pos])) {
      var m = /^\s*("(?:[^"\\]|\\.)*"|[^:]+):( (.*))?$/.exec(lines[pos]); if (!m) throw new Error("Cannot read line " + (pos + 1) + ".");
      var key = m[1].charAt(0) === '"' ? JSON.parse(m[1]) : m[1].trim(), val = m[3]; pos++;
      if (val != null && val.trim() !== "") obj[key] = scalar(val);
      else if (pos < lines.length && (indentOf(lines[pos]) > ind || (indentOf(lines[pos]) === ind && /^\s*- /.test(lines[pos])))) obj[key] = block(indentOf(lines[pos]));
      else obj[key] = null;
    }
    return obj;
  }
  return block(lines.length ? indentOf(lines[0]) : 0);
}
// Auto Ontology keeps synonyms inside descriptions (it extracts "alternate names explicitly written in the description")
function withSynonyms(text, syn) { return String(text || "") + (syn && syn.length ? (text ? " " : "") + "Also called: " + syn.join(", ") + "." : ""); }
function splitSynonyms(text) { var m = /\s*Also called: ([^.]*)\.\s*$/.exec(String(text || "")); return m ? {text: String(text).slice(0, m.index), synonyms: m[1].split(",").map(function (x) { return x.trim(); }).filter(Boolean)} : {text: String(text || ""), synonyms: []}; }
function exportModel() {
  var dbId = "ekm", tables = A.sets.filter(function (s) { return s.rows; }).map(function (s) {
    var prof = profileSet(s), tid = dbId + ".main." + s.name;
    return {id: tid, name: s.name, description: s.note || "", pk: s.cols.filter(function (_, j) { return prof[j].unique && tagOf(s.cols[j]).role === "id"; }).map(function (c) { return tid + "." + c.name; }), type: "table",
      columns: s.cols.map(function (c, j) { var p = prof[j]; return {id: tid + "." + c.name, name: c.name, description: c.label || "", type: c.type, sample_values: sensitive(c) || (p.pii && p.pii.status === "pii") ? [] : p.top.map(function (t) { return isNum(c) ? +t[0] : t[0]; }).slice(0, 5), is_nullable: p.missing > 0, is_unique: p.unique}; })};
  }), joins = inferJoins();
  var terms = ONT.terms.map(function (t) { var tid = dbId + ".main." + t.ds; return {id: t.id, name: t.name, description: withSynonyms(t.description, t.synonyms), represents: [tid], columns_attributes: t.cols.map(function (c, i) { return {id: t.id + ".a" + i, name: c.attr, description: withSynonyms(c.description, c.synonyms), column_id: tid + "." + c.col}; })}; });
  var attrs = []; ONT.terms.forEach(function (t) { (t.formulas || []).forEach(function (f) { attrs.push({id: f.id, name: f.name, description: f.description + " [EKM formula: " + f.expr + "]", sql: f.sql || "", sql_column_is: [], term_id: t.id}); }); });
  return {data_layer: {databases: [{id: dbId, dialect: "ekm", schemas: [{id: dbId + ".main", name: "main", database_name: dbId, tables: tables}]}], foreign_keys: [], joins: joins.edges.map(function (e) { return {source_table_id: dbId + ".main." + e.from, target_table_id: dbId + ".main." + e.to, join_columns: [{source_column_id: dbId + ".main." + e.from + "." + e.fromCol, target_column_id: dbId + ".main." + e.to + "." + e.toCol}]}; })},
    semantic_layer: {terms: terms, semantic_fks: [], sql_attributes: {manual: attrs, table: [], sql: [], bridge_table: []}, custom_analyses: []}};
}
function importModel(doc) {
  var sl = doc && doc.semantic_layer; if (!sl || !Array.isArray(sl.terms)) throw new Error("This file has no semantic_layer.terms. Export it from Auto Ontology or EKM as a model YAML.");
  var colIds = Object.create(null); ((doc.data_layer || {}).databases || []).forEach(function (d) { (d.schemas || []).forEach(function (sc) { (sc.tables || []).forEach(function (t) { (t.columns || []).forEach(function (c) { colIds[c.id] = {table: t.name, col: c.name}; }); }); }); });
  var added = 0, matched = 0;
  sl.terms.forEach(function (t) {
    var cols = (t.columns_attributes || []).map(function (ca) { var ref = colIds[ca.column_id] || {table: "", col: String(ca.column_id || "").split(".").pop()}; var sp = splitSynonyms(ca.description); return {ref: ref, col: ref.col, attr: ca.name || ref.col, description: sp.text, synonyms: sp.synonyms, certified: false}; });
    var tableName = (cols[0] && cols[0].ref.table) || "", ds = A.sets.filter(function (s) { return s.name === tableName || (s.rows && cols.length && cols.every(function (c) { return idxOf(s, c.col) >= 0; })); })[0];
    if (ds) matched++;
    var tsp = splitSynonyms(t.description);
    ONT.terms.push({id: ontId(), kind: "entity", name: String(t.name || "Term"), description: tsp.text, synonyms: tsp.synonyms, dsId: ds ? ds.id : "", ds: ds ? ds.name : tableName, cols: cols.map(function (c) { return {col: c.col, attr: c.attr, description: c.description, synonyms: c.synonyms, certified: false}; }), certified: false, descCertified: false, suggested: false, imported: true, formulas: []});
    added++;
  });
  var attrs = []; var sa = sl.sql_attributes || {}; ["manual", "table", "sql", "bridge_table"].forEach(function (k) { (sa[k] || []).forEach(function (a) { attrs.push(a); }); });
  attrs.forEach(function (a) { var t = ONT.terms.filter(function (x) { return x.imported && sl.terms.some(function (st2) { return st2.id === a.term_id && st2.name === x.name; }); })[0]; if (!t) return; var m = /\[EKM formula: (.*)\]$/.exec(a.description || ""); t.formulas.push({id: ontId(), name: a.name || "Formula", description: String(a.description || "").replace(/\s*\[EKM formula: .*\]$/, ""), expr: m ? m[1] : "", sql: a.sql || "", certified: false}); });
  return {added: added, matched: matched, formulas: attrs.length};
}
// Agent export: what the MCP server reads (no rows, no samples from personal or sensitive columns)
function agentExport() {
  return {format: "ekm-ontology", version: 1, exported: new Date().toISOString(), datasets: A.sets.filter(function (s) { return s.rows; }).map(function (s) { var prof = profileSet(s); return {name: s.name, rows: s.rows.length, tags: s.tags || {}, columns: s.cols.map(function (c, j) { var p = prof[j], hide = sensitive(c) || (p.pii && p.pii.status === "pii"); return {name: c.name, type: c.type, label: c.label || "", unit: c.unit || "", role: tagOf(c).role || "", level: tagOf(c).level || "", sensitive: !!hide, unique: p.unique, missing: p.missing, distinct: p.distinct, format: p.format, top_values: hide ? [] : p.top.map(function (t) { return t[0]; })}; })}; }),
    terms: ONT.terms, relationships: inferJoins().edges, analyses: KINDS.map(function (k) { return {kind: k[0], name: k[1], help: KIND_HELP[k[0]]}; })};
}

// ---- Persistence: projects carry the glossary ----
var _snapO = projectSnapshot; projectSnapshot = function () { var p = _snapO(); p.ontology = {terms: ONT.terms}; return p; };
function cleanTerm(t) {
  var s = function (v, n) { return String(v == null ? "" : v).slice(0, n || 400); }, list = function (v) { return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string"; }).slice(0, 30).map(function (x) { return x.slice(0, 80); }) : []; };
  return {id: s(t.id, 40), kind: t.kind === "concept" ? "concept" : "entity", name: s(t.name, 80), description: s(t.description, 1200), synonyms: list(t.synonyms), dsId: s(t.dsId, 100), ds: s(t.ds, 200), certified: !!t.certified, descCertified: !!t.descCertified, suggested: !!t.suggested, imported: !!t.imported, ai: !!t.ai,
    cols: (Array.isArray(t.cols) ? t.cols : []).slice(0, 2000).map(function (c) { return {col: s(c.col, 200), attr: s(c.attr, 120), description: s(c.description, 600), certified: !!c.certified, synonyms: list(c.synonyms)}; }),
    formulas: (Array.isArray(t.formulas) ? t.formulas : []).slice(0, 200).map(function (f) { return {id: s(f.id, 40), name: s(f.name, 80), description: s(f.description, 600), expr: s(f.expr, 300), sql: s(f.sql, 2000), certified: !!f.certified}; })};
}
var _validO = validateProject; validateProject = function (p) { var v = _validO(p); v.ontology = {terms: p && p.ontology && Array.isArray(p.ontology.terms) ? p.ontology.terms.filter(function (t) { return t && typeof t === "object"; }).slice(0, 5000).map(cleanTerm) : []}; return v; };
var _restoreO = restoreProject; restoreProject = function (p) { var v = validateProject(p); _restoreO(p); ONT.terms = v.ontology.terms; };

// ---- The Glossary tab ----
function catalogSection() {
  var sets = A.sets.filter(function (s) { return s.rows; }); if (!sets.length) return '<p class="nd">Add a dataset under Your data first.</p>';
  return sets.map(function (s) {
    var prof = profileSet(s);
    return '<section class="card"><h2>' + esc(s.name) + ' <span class="count">' + s.rows.length + " rows</span></h2>" + table(["Column", "Type", "Unique", "Distinct", "Missing", "Stored format", "Most common", "Personal data"], prof.map(function (p, j) {
      var c = s.cols[j], hide = sensitive(c) || (p.pii && p.pii.status === "pii"), pii = p.pii;
      return [esc(p.name), esc(TYPE_LABEL[p.type] || p.type), p.unique ? '<span class="chip q-verified">Unique</span>' : "", String(p.distinct), p.missing ? String(p.missing) : "—", p.format ? "<code>" + esc(p.format) + "</code>" : p.mixedFormats ? '<span class="warn">Mixed: ' + p.mixedFormats.map(esc).join(", ") + "</span>" : "—",
        hide ? '<span class="nd">hidden</span>' : esc(p.top.slice(0, 3).map(function (t) { return t[0] + " (" + t[1] + ")"; }).join(", ")),
        !pii ? (tagOf(c).sens ? '<span class="chip q-excluded">Tagged</span>' : '<span class="nd">no rule</span>') : pii.status === "pii" ? '<span class="chip ' + (pii.confidence >= 0.9 ? "q-excluded" : "q-estimated") + '" title="' + esc(pii.reason) + '">' + esc(pii.category.replace(/_/g, " ")) + " · " + pii.confidence.toFixed(2) + "</span>" : pii.status === "not_pii" ? '<span class="chip q-verified" title="' + esc(pii.reason) + '">Not personal · ' + pii.confidence.toFixed(2) + "</span>" : '<span class="chip q-estimated">Review</span>'];
    })) + "</section>";
  }).join("") + '<p class="count">Personal-data rules are ported unchanged from NVIDIA Auto Ontology (17 rule groups; confidence 0.99 direct, 0.94/0.90 by table context, 0.96 known business fields). Columns are tagged automatically only at 0.9 or above. Hover a chip for its reason.</p>';
}
function termCard(t, i) {
  var ed = ONT.edit === t.id, ds = A.sets.filter(function (s) { return s.id === t.dsId; })[0];
  var chips = (t.certified ? '<span class="chip q-verified">Certified</span>' : t.suggested ? '<span class="chip q-reported">Suggested</span>' : "") + (t.ai ? ' <span class="chip q-estimated">AI-drafted</span>' : "") + (t.imported ? ' <span class="chip">Imported</span>' : "");
  if (ed) return '<li class="term-card"><div class="toolbar"><label class="field">Term<input data-tedit="name" value="' + esc(t.name) + '" maxlength="80"></label><label class="field">Synonyms (comma separated)<input data-tedit="synonyms" value="' + esc((t.synonyms || []).join(", ")) + '" maxlength="300"></label></div><label class="field">Description<textarea data-tedit="description" rows="2" maxlength="1200">' + esc(t.description) + "</textarea></label>" +
    table(["Column", "Attribute name", "Description", "Synonyms", "Certified"], t.cols.map(function (c, j) { return [esc(c.col), '<input data-tcol="attr" data-j="' + j + '" value="' + esc(c.attr) + '" maxlength="120">', '<input data-tcol="description" data-j="' + j + '" value="' + esc(c.description) + '" maxlength="600">', '<input data-tcol="synonyms" data-j="' + j + '" value="' + esc((c.synonyms || []).join(", ")) + '" maxlength="200">', '<input type="checkbox" data-tcol="certified" data-j="' + j + '"' + (c.certified ? " checked" : "") + (canCertify() ? "" : " disabled") + ">"]; })) +
    '<h3 class="sub-h">Formulas (reusable calculations)</h3>' + (t.formulas.length ? table(["Name", "Formula", "Description", "", ""], t.formulas.map(function (f, k) { return [esc(f.name), "<code>" + esc(f.expr) + "</code>", esc(f.description), f.certified ? '<span class="chip q-verified">Certified</span>' : '<button type="button" class="linkbtn" data-fcert="' + k + '"' + (canCertify() ? "" : " disabled") + ">Certify</button>", '<button type="button" class="linkbtn" data-fapply="' + k + '">Add to current dataset</button>']; })) : '<p class="nd">None yet.</p>') +
    '<div class="toolbar"><label class="field">Formula name<input id="f_name" maxlength="60" placeholder="Margin"></label><label class="field">Formula<input id="f_expr" maxlength="300" placeholder="[Revenue] - [Cost]"></label><label class="field">Meaning<input id="f_desc" maxlength="300"></label><button type="button" class="btn" data-fadd="1">Add formula</button></div>' +
    '<div class="slot"><button type="button" class="btn btn-primary" data-tdone="1">Done</button><button type="button" class="btn" data-tcert="' + i + '"' + (canCertify() ? "" : " disabled") + ">" + (t.certified ? "Remove certification" : "Certify term and description") + '</button><button type="button" class="btn" data-tdel="' + i + '">Delete term</button></div></li>';
  return '<li class="term-card"><div class="pc-top"><span class="label">' + esc(t.ds || "No dataset") + "</span>" + chips + '</div><p class="pc-head"><b>' + esc(t.name) + "</b>" + (t.synonyms && t.synonyms.length ? ' <span class="count">also: ' + t.synonyms.map(esc).join(", ") + "</span>" : "") + "</p><p class=\"count\">" + esc(t.description) + "</p>" +
    '<p class="count">' + t.cols.length + " attributes" + (t.cols.filter(function (c) { return c.certified; }).length ? " · " + t.cols.filter(function (c) { return c.certified; }).length + " certified" : "") + (t.formulas.length ? " · " + t.formulas.length + " formula" + (t.formulas.length > 1 ? "s" : "") : "") + (ds ? "" : ' · <span class="warn">no matching dataset open</span>') + '</p><div class="slot"><button type="button" class="btn" data-tedit-open="' + esc(t.id) + '">Edit</button></div></li>';
}
function graphSection() {
  var J = inferJoins(), sets = A.sets.filter(function (s) { return s.rows; }); if (sets.length < 2) return '<p class="nd">Add two or more datasets to see how they connect.</p>';
  var W = CW(), n = sets.length, R = Math.min(W, 560) / 2 - 70, cx = W / 2, cy = R + 50, pos = {};
  sets.forEach(function (s, i) { var a = -Math.PI / 2 + 2 * Math.PI * i / n; pos[s.id] = [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  var g = '<svg viewBox="0 0 ' + W + " " + (2 * R + 100) + '" class="achart" role="img" aria-label="How the datasets connect">';
  J.edges.forEach(function (e) { var a = pos[e.fromId], b = pos[e.toId]; if (!a || !b) return; g += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="var(--accent)" stroke-width="1.6"><title>' + esc(e.from + "." + e.fromCol + " → " + e.to + "." + e.toCol) + "</title></line>"; });
  sets.forEach(function (s) { var p = pos[s.id], term = termsFor(s)[0], jn = J.junction.indexOf(s.id) >= 0; g += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="9" fill="' + (jn ? "var(--board-2)" : "var(--yellow)") + '" stroke="var(--yellow)" stroke-width="2"/><text x="' + p[0] + '" y="' + (p[1] - 15) + '" text-anchor="middle" class="tk">' + esc((term ? term.name : s.name).slice(0, 22)) + "</text>"; });
  g += "</svg>";
  return '<div class="chartwrap">' + g + '</div><p class="count">Each line is a key whose every sampled value exists in the other dataset; hollow circles are linking (junction) tables.</p>' +
    (J.edges.length ? table(["From", "Key", "To", "Values checked"], J.edges.map(function (e) { return [esc(e.from), esc(e.fromCol) + " → " + esc(e.toCol), esc(e.to) + (J.junction.indexOf(e.fromId) >= 0 ? ' <span class="chip">via linking table</span>' : ""), String(e.sampled)]; })) : '<p class="nd">No column of one dataset has all of its values inside a unique column of another.</p>');
}
function glossaryView() {
  var secs = [["catalog", "Catalog"], ["terms", "Terms"], ["graph", "Relationships"], ["ask", "Ask the data"], ["share", "Import and export"]], body = "";
  if (ONT.sec === "catalog") body = catalogSection();
  else if (ONT.sec === "terms") { var list = ONT.terms.filter(function (t) { return !ONT.q || (t.name + " " + t.description + " " + (t.synonyms || []).join(" ") + " " + t.cols.map(function (c) { return c.attr + " " + c.col; }).join(" ")).toLowerCase().indexOf(ONT.q.toLowerCase()) >= 0; });
    body = '<div class="toolbar"><button type="button" class="btn btn-primary" data-tdraft="1">Draft terms from my datasets</button>' + (typeof aiDraftButton === "function" ? aiDraftButton() : "") + '<label class="field" for="t_q">Find<input id="t_q" type="search" value="' + esc(ONT.q) + '" placeholder="term, synonym or column"></label></div>' + (ONT.terms.length ? '<ul class="plain pcards">' + list.map(function (t) { return termCard(t, ONT.terms.indexOf(t)); }).join("") + "</ul>" : '<p class="nd">No terms yet. Draft them from your datasets, then rename, describe and certify them.</p>'); }
  else if (ONT.sec === "graph") body = graphSection();
  else if (ONT.sec === "ask") body = typeof askSection === "function" ? askSection() : "";
  else body = '<section class="card"><h2>Auto Ontology model YAML</h2><p class="count">Exchange the catalog and glossary with NVIDIA Auto Ontology (Settings → Import / Export there), and through it with Apache Ossie. Sample values from personal or sensitive columns are never exported.</p><div class="slot"><button type="button" class="btn" data-mexp="yaml">Export model YAML</button><label class="btn" for="m_imp">Import model YAML</label><input type="file" id="m_imp" accept=".yaml,.yml,.json" class="sr-file"></div></section>' +
    '<section class="card"><h2>For AI agents (MCP)</h2><p class="count">Save the glossary for EKM\'s read-only MCP server, then point Claude Desktop, Cursor or another agent at it. Agents can search terms, read columns and check whether a question is answerable; they never see your rows.</p><div class="slot"><button type="button" class="btn" data-mexp="agent">Save for agents (ekm-ontology.json)</button></div><pre class="rules">python3 local_ai/mcp_server.py --ontology ~/Downloads/ekm-ontology.json</pre></section>';
  return '<h1 class="vt">Glossary</h1><p class="lede">What your data means: a catalog of every column, business terms mapped to columns, how datasets connect, and certified definitions that analyses can rely on.</p>' +
    '<div class="pills" role="tablist">' + secs.map(function (s) { return '<button type="button" role="tab" class="pill' + (ONT.sec === s[0] ? " on" : "") + '" aria-selected="' + (ONT.sec === s[0]) + '" data-osec="' + s[0] + '">' + s[1] + "</button>"; }).join("") + "</div>" + (ONT.msg ? '<p class="how" role="status">' + esc(ONT.msg) + "</p>" : "") + body;
}
GROUPS.glossary = ["glossary"]; VIEWS.glossary = glossaryView;
function termById(id) { return ONT.terms.filter(function (t) { return t.id === id; })[0]; }
view.addEventListener("click", function (e) {
  if (st.tab !== "glossary") return; var b = e.target.closest("button"); if (!b) return; var d = b.dataset, t = ONT.edit ? termById(ONT.edit) : null; ONT.msg = "";
  if (d.osec) { ONT.sec = d.osec; ONT.edit = null; render(); refocus('[data-osec="' + d.osec + '"]'); return; }
  if (d.tdraft) { var n = 0; A.sets.forEach(function (s) { if (s.rows) n += draftTerms(s); }); ONT.msg = n ? "Drafted " + n + " term" + (n > 1 ? "s" : "") + " from your datasets. Review and certify them." : "Every open dataset already has a term."; auditLog("Drafted glossary terms", null, n + " terms"); render(); return; }
  if (d.teditOpen) { ONT.edit = d.teditOpen; render(); return; }
  if (d.tdone) { ONT.edit = null; render(); return; }
  if (d.tcert != null) { var tt = ONT.terms[+d.tcert]; certify(tt, "certified", !tt.certified); render(); return; }
  if (d.tdel != null) { var td = ONT.terms.splice(+d.tdel, 1)[0]; ONT.edit = null; auditLog("Deleted term", null, td.name); render(); return; }
  if (d.fadd && t) { var nm = (document.getElementById("f_name").value || "").trim(), ex = (document.getElementById("f_expr").value || "").trim(), ds = A.sets.filter(function (s) { return s.id === t.dsId; })[0]; if (!nm || !ex) { ONT.msg = "Give the formula a name and an expression."; render(); return; } if (ds && !formulaColumns(ex, ds)) { ONT.msg = "That formula does not work on " + ds.name + ": check the column names."; render(); return; } t.formulas.push({id: ontId(), name: nm, description: (document.getElementById("f_desc").value || "").trim(), expr: ex, sql: "", certified: false}); auditLog("Added glossary formula", null, nm + " = " + ex); render(); return; }
  if (d.fcert != null && t) { if (!canCertify()) { ONT.msg = "Only people with edit access can certify definitions."; render(); return; } t.formulas[+d.fcert].certified = true; auditLog("Certified formula", null, t.formulas[+d.fcert].name); render(); return; }
  if (d.fapply != null && t) { var c2 = cur(); if (c2) applyFormula(c2, t.formulas[+d.fapply]); render(); return; }
  if (d.mexp === "yaml") { saveFile("ekm-model-" + today() + ".yaml", "# Auto Ontology model YAML exported by EKM\n" + toYaml(exportModel()) + "\n"); auditLog("Exported model YAML", null, ONT.terms.length + " terms"); return; }
  if (d.mexp === "agent") { saveFile("ekm-ontology.json", JSON.stringify(agentExport(), null, 2)); auditLog("Saved glossary for agents", null, ONT.terms.length + " terms"); return; }
});
view.addEventListener("change", function (e) {
  if (st.tab !== "glossary") return; var t2 = e.target, d = t2.dataset || {}, t = ONT.edit ? termById(ONT.edit) : null;
  if (t2.id === "t_q") { ONT.q = t2.value; render(); refocus("#t_q"); return; }
  if (d.tedit && t) { t[d.tedit] = d.tedit === "synonyms" ? t2.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean) : t2.value.trim(); t.suggested = false; if (d.tedit === "description") t.descCertified = false; return; }
  if (d.tcol && t) { var c = t.cols[+d.j]; if (d.tcol === "certified") { if (!canCertify()) { t2.checked = !t2.checked; ONT.msg = "Only people with edit access can certify definitions."; render(); return; } c.certified = t2.checked; auditLog(t2.checked ? "Certified attribute" : "Removed certification", null, t.name + "." + c.attr); } else if (d.tcol === "synonyms") c.synonyms = t2.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean); else { c[d.tcol] = t2.value.trim(); c.certified = false; } t.suggested = false; return; }
  if (t2.id === "m_imp" && t2.files && t2.files[0]) { t2.files[0].text().then(function (txt) { var doc = /^\s*\{/.test(txt) ? JSON.parse(txt) : parseYaml(txt), r = importModel(doc); ONT.msg = "Imported " + r.added + " terms (" + r.matched + " matched an open dataset) and " + r.formulas + " formulas."; auditLog("Imported model YAML", null, r.added + " terms"); ONT.sec = "terms"; render(); }).catch(function (err) { ONT.msg = "Could not read that file: " + (err.message || err) + "."; render(); }); }
});
