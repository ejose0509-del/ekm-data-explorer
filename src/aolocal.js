// ---------- Local mode: AI-drafted glossary, AI personal-data review, AI-written answers, more databases ----------
// Everything a model writes is labelled AI-generated and validated; EKM's own tested statistics produce every number.
var AIX = {busy: "", q: "", cov: null, ai: null, sql: null, dbKind: "sqlite", dbTarget: "", dbQuery: "SELECT * FROM ", secrets: Object.create(null), sqlSource: ""};
function aiPost(path, body) {
  return fetch(path, {method: "POST", headers: {"Content-Type": "application/json", "X-EKM-Token": window.EKM_LOCAL.token}, body: JSON.stringify(body)})
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "The local service refused the request."); return j; }); });
}
function glossaryHints() { return ONT.terms.slice(0, 80).map(function (t) { return {term: t.name, synonyms: t.synonyms, columns: t.cols.map(function (c) { return c.col + (c.attr && c.attr !== c.col ? " (" + c.attr + ")" : ""); }).slice(0, 40), certified: t.certified}; }); }

// ---- AI glossary drafts ----
function aiDraftButton() { return localMode() ? '<button type="button" class="btn" data-aidraft="1"' + (AIX.busy ? " disabled" : "") + ">Draft with the local AI</button>" + (AIX.busy ? '<span class="count" role="status">' + esc(AIX.busy) + "</span>" : "") : ""; }
function aiDraftAll() {
  var sets = A.sets.filter(function (s) { return s.rows && !ONT.terms.some(function (t) { return t.dsId === s.id && t.ai; }); }), i = 0, made = 0;
  if (!sets.length) { ONT.msg = "Every open dataset already has an AI-drafted term."; render(); return; }
  (function next() {
    if (i >= sets.length) { AIX.busy = ""; ONT.msg = "The local AI drafted " + made + " term" + (made === 1 ? "" : "s") + ". They stay Suggested until you certify them."; auditLog("AI-drafted glossary terms", null, made + " terms"); render(); return; }
    var ds = sets[i++], prof = profileSet(ds); AIX.busy = "Drafting " + ds.name + "…"; render();
    aiPost("/api/ai/draft-terms", {table: ds.name, columns: ds.cols.map(function (c, j) { var hide = sensitive(c) || (prof[j].pii && prof[j].pii.status === "pii") || prof[j].unique; return {name: c.name, type: c.type, samples: hide ? [] : prof[j].top.map(function (t) { return t[0]; }).slice(0, 5)}; })})
      .then(function (r) {
        var term = {id: ontId(), kind: "entity", name: r.term_name, description: r.description, synonyms: r.synonyms, dsId: ds.id, ds: ds.name, cols: [], certified: false, descCertified: false, suggested: true, ai: true, formulas: []};
        r.columns.forEach(function (c) { term.cols.push({col: c.name, attr: c.attribute, description: c.description, certified: false}); });
        ONT.terms = ONT.terms.filter(function (t) { return !(t.dsId === ds.id && t.suggested && !t.ai); }); ONT.terms.push(term); made++; next();
      }).catch(function (e) { AIX.busy = ""; ONT.msg = "AI drafting stopped: " + e.message; render(); });
  })();
}
// ---- AI review of columns the personal-data rules cannot decide ----
var _catalogSectionL = catalogSection;
catalogSection = function () {
  var h = _catalogSectionL(); if (!localMode()) return h;
  var undecided = 0; A.sets.forEach(function (s) { if (s.rows) profileSet(s).forEach(function (p, j) { if (!p.pii && !(tagOf(s.cols[j]).pii || {}).source) undecided++; }); });
  return (undecided ? '<div class="slot"><button type="button" class="btn" data-aipii="1"' + (AIX.busy ? " disabled" : "") + ">Ask the local AI about " + undecided + " undecided column" + (undecided === 1 ? "" : "s") + '</button><span class="count">Only column and table names are sent. When unsure, the model must say personal (Auto Ontology\'s conservative policy); tags apply automatically only at 0.9 confidence.</span></div>' : "") + h;
};
function aiPiiAll() {
  var jobs = []; A.sets.forEach(function (s) { if (s.rows) profileSet(s).forEach(function (p, j) { if (!p.pii && !(tagOf(s.cols[j]).pii || {}).source) jobs.push([s, j]); }); });
  var i = 0, tagged = 0;
  (function next() {
    if (i >= jobs.length) { AIX.busy = ""; ONT.msg = "The local AI reviewed " + jobs.length + " columns; " + tagged + " tagged personal automatically (confidence ≥ 0.9). The rest are marked for review."; render(); return; }
    var s = jobs[i][0], j = jobs[i][1], c = s.cols[j]; i++; AIX.busy = "Reviewing " + c.name + "…"; render();
    aiPost("/api/ai/pii", {column: c.name, table: s.name, description: c.label || ""}).then(function (d) {
      var tg = Object.assign({}, tagOf(c)); tg.pii = d; if (d.status === "pii" && d.confidence >= 0.9) { tg.sens = "personal"; tagged++; delete tg.piiReview; } else if (d.status === "pii") tg.piiReview = true;
      var cols = s.cols.slice(); cols[j] = Object.assign({}, c, {tags: tg}); s.cols = cols; auditLog("AI personal-data review", s, c.name + ": " + d.status + " " + d.confidence.toFixed(2)); next();
    }).catch(function (e) { AIX.busy = ""; ONT.msg = "Review stopped: " + e.message; render(); });
  })();
}

// ---- Ask the data: coverage (rules), AI analysis choice, AI-written SQL ----
function askSection() {
  var ds = cur(); if (!ds || !ds.rows) return '<p class="nd">Add a dataset first.</p>';
  var cv = AIX.cov, ai = AIX.ai, sq = AIX.sql, route = AIX.q ? routeQuestion(ds, AIX.q) : null;
  var out = '<section class="card"><h2>Can this data answer it?</h2><label class="field" for="ax_q">Question<input id="ax_q" value="' + esc(AIX.q) + '" maxlength="300" placeholder="What was revenue for the sushi flash drive in Pennsylvania?"></label><div class="slot"><button type="button" class="btn btn-primary" data-axcov="1">Check coverage</button>' + (localMode() ? '<button type="button" class="btn" data-axai="1"' + (AIX.busy ? " disabled" : "") + '>Ask the local AI</button>' : "") + (AIX.busy ? '<span class="count" role="status">' + esc(AIX.busy) + "</span>" : "") + "</div>";
  if (cv) out += figs([["Coverage", Math.round(cv.score * 100) + "%"], ["Covered", cv.covered.length + " of " + cv.entities.length], ["Not covered", String(cv.missing.length)]], true) +
    (cv.covered.length ? '<p class="count">Covered: ' + cv.covered.map(function (c) { return "“" + esc(c.entity) + "” → " + esc(c.col || c.via) + " (" + c.via + ")"; }).join("; ") + "</p>" : "") +
    (cv.missing.length ? '<p class="warn">Nothing in “' + esc(ds.name) + '” covers ' + cv.missing.map(function (m) { return "“" + esc(m) + "”"; }).join(", ") + ". Add a glossary synonym if it is here under another name, or connect a source that has it.</p>" : "") +
    (route ? '<p class="how">EKM can answer this with <b>' + esc(KIND_HELP[route.kind].split(" (")[0]) + '</b>. <button type="button" class="linkbtn" data-axopen="rule">Open it</button></p>' : cv.score === 1 ? '<p class="count">Every term is covered, but the question does not name an analysis clearly. Try “Compare …”, “Relate …”, or “Predict … from …”.</p>' : "");
  if (ai) out += '<div class="aibox"><p class="label">AI-generated · not checked by EKM</p>' + (ai.kind === "none" ? "<p>The local AI found no analysis or column that fits.</p>" : "<p>Suggested analysis: <b>" + esc((KINDS.filter(function (k) { return k[0] === ai.kind; })[0] || [0, ai.kind])[1]) + "</b>" + [["outcome", ai.y], ["second column", ai.x], ["groups", ai.group]].filter(function (x) { return x[1]; }).map(function (x) { return " · " + x[0] + ": " + esc(x[1]); }).join("") + (ai.predictors.length ? " · predictors: " + ai.predictors.map(esc).join(", ") : "") + "</p><p class=\"count\">" + esc(ai.explanation) + '</p><button type="button" class="btn" data-axopen="ai">Run it with EKM\'s tested statistics</button>') + "</div>";
  out += "</section>";
  if (localMode()) {
    var dbSets = A.sets.filter(function (s) { return s.sourceSpec && (s.sourceSpec.kind === "sqlite" || s.sourceSpec.kind === "db"); });
    out += '<section class="card"><h2>Answer from a database with AI-written SQL</h2><p class="count">The local AI writes one read-only query from the database\'s tables and your glossary. EKM checks that it reads only, that it runs, and that its filter values exist, repairing it up to three times. The query and result are labelled AI-generated; check them before relying on them.</p>' +
      '<div class="toolbar">' + dbFields("ax") + '</div><div class="slot"><button type="button" class="btn" data-axsql="1"' + (AIX.busy ? " disabled" : "") + ">Write and run the query</button></div>" + (dbSets.length ? '<p class="count">Connected: ' + dbSets.map(function (s) { return esc(s.name); }).join(", ") + "</p>" : "");
    if (sq) out += '<div class="aibox"><p class="label">AI-generated query · checked: ' + esc((sq.checks || []).join(", ") || "not answerable") + "</p>" + (sq.answerable ? '<pre class="rules">' + esc(sq.sql) + "</pre>" + (sq.attempts.length ? '<p class="count">Repaired ' + sq.attempts.length + " time" + (sq.attempts.length > 1 ? "s" : "") + ": " + sq.attempts.map(function (a) { return esc(a.problem); }).join("; ") + "</p>" : "") + table(sq.columns.map(esc), sq.rows.slice(0, 12).map(function (r) { return r.map(function (v) { return v == null ? "—" : esc(String(v)); }); })) + '<p class="count">' + sq.rows.length + " rows" + (sq.truncated ? " (first 5,000)" : "") + '.</p><button type="button" class="btn" data-axsqladd="1">Add the result as a dataset</button>' : '<p class="warn">' + esc(sq.message) + "</p>") + "</div>";
    out += "</section>";
  }
  return out;
}
function dbFields(p) {
  var k = AIX.dbKind;
  return '<label class="field" for="' + p + '_kind">Database<select id="' + p + '_kind" data-axdb="kind">' + [["sqlite", "SQLite file"], ["duckdb", "DuckDB file"], ["postgres", "PostgreSQL"], ["mysql", "MySQL"]].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === k ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
    '<label class="field" for="' + p + '_target">' + (k === "sqlite" || k === "duckdb" ? "File on this computer" : "Connection string (kept only while this page is open)") + '<input id="' + p + '_target" data-axdb="target" value="' + esc(AIX.dbTarget) + '" placeholder="' + (k === "sqlite" ? "/Users/you/data/study.sqlite" : k === "duckdb" ? "/Users/you/data/study.duckdb" : k === "postgres" ? "postgresql://user:password@localhost:5432/db" : "mysql://user:password@localhost:3306/db") + '"' + (k === "postgres" || k === "mysql" ? ' type="password" autocomplete="off"' : "") + "></label>";
}
function dbSource() { var k = AIX.dbKind, t = AIX.dbTarget.trim(); if (!t) throw new Error("Enter the database file or connection string."); return k === "sqlite" || k === "duckdb" ? {kind: k, path: t} : {kind: k, dsn: t}; }
function safeDsn(dsn) { try { var u = new URL(dsn); u.password = u.password ? "****" : ""; return u.toString(); } catch (e) { return "(connection string)"; } }
function openRoute(kind, sel) { A.kind = kind; A.sel = Object.assign(Object.create(null), sel); nav("analyze"); }

// ---- More databases in Your data → Connect to a source ----
var _connectCardL = connectCard;
connectCard = function () {
  var h = _connectCardL(); if (!localMode()) return h;
  return h.replace(/(data-cn="sql">Run query<\/button><\/div>)/, '$1<h3 class="sub-h">Other databases (read-only)</h3><div class="toolbar">' + dbFields("cn") + '</div><label class="field" for="cn_q">Query (read-only)<textarea id="cn_q" data-axdb="query" rows="3">' + esc(AIX.dbQuery) + '</textarea></label><div class="slot"><button type="button" class="btn" data-cndb="1">Run query</button></div><p class="count">PostgreSQL needs <code>pip install "psycopg[binary]"</code>, MySQL <code>pip install pymysql</code>, DuckDB <code>pip install duckdb</code>; SQLite needs nothing. Connections are opened read-only and only SELECT or WITH statements run.</p>');
};
var _loadSpecL = loadSpec;
loadSpec = function (spec) {
  if (spec.kind !== "db") return _loadSpecL(spec);
  var src = spec.db.kind === "sqlite" || spec.db.kind === "duckdb" ? spec.db : {kind: spec.db.kind, dsn: AIX.secrets[spec.secretKey] || ""};
  if (!src.path && !src.dsn) return Promise.reject(new Error("Enter the connection string again (passwords are not saved)."));
  return aiPost("/api/db", {source: src, query: spec.query}).then(function (j) { return {header: j.columns, body: j.rows, truncated: j.truncated}; });
};
view.addEventListener("change", function (e) { var t = e.target, d = t.dataset || {}; if (t.id === "ax_q") AIX.q = t.value; if (d.axdb === "kind") { AIX.dbKind = t.value; AIX.dbTarget = ""; render(); } else if (d.axdb === "target") AIX.dbTarget = t.value; else if (d.axdb === "query") AIX.dbQuery = t.value; });
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset, ds = cur();
  if (d.aidraft) { aiDraftAll(); return; }
  if (d.aipii) { aiPiiAll(); return; }
  if (d.axcov) { AIX.q = ((document.getElementById("ax_q") || {}).value || "").trim(); AIX.cov = AIX.q ? coverage(ds, AIX.q) : null; AIX.ai = null; render(); return; }
  if (d.axai) {
    AIX.q = ((document.getElementById("ax_q") || {}).value || "").trim(); if (!AIX.q) return; AIX.cov = coverage(ds, AIX.q); AIX.busy = "The local AI is choosing an analysis…"; render();
    var help = {}; KINDS.forEach(function (k) { help[k[0]] = KIND_HELP[k[0]]; });
    aiPost("/api/ai/ask", {question: AIX.q, kinds: KINDS.map(function (k) { return k[0]; }), help: help, columns: ds.cols.filter(function (c) { return !sensitive(c) && tagOf(c).role !== "rowtag"; }).map(function (c) { return {name: c.name, type: c.type, label: c.label || ""}; }), glossary: glossaryHints()})
      .then(function (r) { AIX.ai = r; AIX.busy = ""; auditLog("Asked the local AI", ds, AIX.q + " → " + r.kind); render(); }).catch(function (err) { AIX.busy = ""; ONT.msg = "The local AI did not answer: " + err.message; render(); });
    return;
  }
  if (d.axopen === "rule") { var r = routeQuestion(ds, AIX.q); if (r) openRoute(r.kind, r.sel); return; }
  if (d.axopen === "ai" && AIX.ai) { var a = AIX.ai, sel = {y: a.y || undefined, x: a.x || undefined, g: a.group || undefined, mg: a.group || undefined, mt: a.y || undefined, o: a.y || undefined}; if (a.predictors.length) { sel.preds = a.predictors; sel.mp = a.predictors; sel.mx = a.predictors; sel.lp = a.predictors; } Object.keys(sel).forEach(function (k) { if (sel[k] === undefined) delete sel[k]; }); openRoute(a.kind, sel); return; }
  if (d.axsql) {
    AIX.q = ((document.getElementById("ax_q") || {}).value || AIX.q).trim(); var src; try { src = dbSource(); } catch (err) { ONT.msg = err.message; render(); return; }
    if (!AIX.q) { ONT.msg = "Type a question above first."; render(); return; }
    AIX.busy = "The local AI is writing and checking a query…"; AIX.sql = null; render();
    aiPost("/api/ai/sql", {source: src, question: AIX.q, glossary: glossaryHints()}).then(function (r) { AIX.sql = r; AIX.sqlSource = src.path || safeDsn(src.dsn); AIX.busy = ""; auditLog("AI-written SQL", null, AIX.q + (r.answerable ? " → " + r.sql.slice(0, 200) : " → not answerable")); render(); })
      .catch(function (err) { AIX.busy = ""; ONT.msg = "Query failed: " + err.message; render(); });
    return;
  }
  if (d.axsqladd && AIX.sql && AIX.sql.answerable) { var n = makeSet("AI query · " + AIX.q.slice(0, 40), AIX.sql.columns, AIX.sql.rows); n.source = AIX.sqlSource + " · AI-generated SQL: " + AIX.sql.sql; n.note = "Produced by AI-written SQL (checked: " + AIX.sql.checks.join(", ") + "). Verify the query before relying on it."; n.tags = {status: "raw", topics: ["AI-generated"]}; A.sets.unshift(n); pickSet(n.id); saveSet(n); nav("data"); return; }
  if (d.cndb) {
    var src2; try { src2 = dbSource(); } catch (err) { CN.msg = err.message; render(); return; }
    var key = "s" + Date.now().toString(36), spec = {kind: "db", db: src2.path ? src2 : {kind: src2.kind, dsn: safeDsn(src2.dsn)}, query: AIX.dbQuery, secretKey: key};
    if (src2.dsn) AIX.secrets[key] = src2.dsn;
    importSpec(spec, (src2.path ? src2.path.split(/[\\/]/).pop().replace(/\.[^.]+$/, "") : src2.kind) + " query"); return;
  }
});
