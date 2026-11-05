// ---------- Reproducible workflows: recorded analyses, rerun checks, Python and R scripts, audit trail ----------
var WF = {steps: [], msg: "", results: null};
var AUD = {log: [], msg: "", verified: null};

// Data fingerprint: FNV-1a over column names, types and every value
function fnv(str, h) { h = h == null ? 0x811c9dc5 : h; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
function dataFingerprint(ds, omitted) {
  if (!ds || !ds.rows) return "";
  var h = fnv(JSON.stringify(ds.cols.map(function (c) { return [c.name, c.type]; })));
  for (var i = 0; i < ds.rows.length; i++) h = fnv(JSON.stringify(omitted ? ds.rows[i].map(function (v, j) { return omitted.indexOf(j) >= 0 ? null : v; }) : ds.rows[i]), h);
  return ("00000000" + h.toString(16)).slice(-8) + "·" + ds.rows.length + "×" + ds.cols.length;
}
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function who() { return ST.uid ? "user " + String(ST.uid).slice(0, 8) : "this browser"; }

// ---- Audit trail: append-only, each entry chained to the previous by hash ----
function auditLog(action, ds, detail) {
  var prev = AUD.log.length ? AUD.log[AUD.log.length - 1].hash : "00000000", e = {at: new Date().toISOString(), who: who(), action: action, dataset: ds ? ds.name : "", fp: ds && ds.rows ? dataFingerprint(ds) : "", detail: String(detail || "").slice(0, 400), prev: prev};
  e.hash = ("00000000" + fnv(JSON.stringify([e.at, e.who, e.action, e.dataset, e.fp, e.detail, e.prev])).toString(16)).slice(-8);
  AUD.log.push(e); AUD.verified = null;
  if (AUD.log.length > 5000) AUD.log = AUD.log.slice(-5000);
}
function auditVerify() {
  for (var i = 0; i < AUD.log.length; i++) {
    var e = AUD.log[i], h = ("00000000" + fnv(JSON.stringify([e.at, e.who, e.action, e.dataset, e.fp, e.detail, e.prev])).toString(16)).slice(-8);
    if (h !== e.hash || (i && e.prev !== AUD.log[i - 1].hash)) return {ok: false, at: i};
  }
  return {ok: true};
}
var _applyStepA = applyStep;
applyStep = function (ds, step, fn) { var n = (ds.recipe || []).length; _applyStepA(ds, step, fn); if ((ds.recipe || []).length > n) auditLog("Changed data", ds, step.text); };
var _makeSetA = makeSet;
makeSet = function (name, header, body, origin, extra) { var ds = _makeSetA(name, header, body, origin, extra); auditLog("Imported data", ds, (origin === "sample" ? "Example " : "") + body.length + " rows, " + ds.cols.length + " columns"); return ds; };
var _addDerivedA = addDerived;
addDerived = function (name, cols, rows, note) { var ds = _addDerivedA(name, cols, rows, note); auditLog("Created dataset", ds, note); return ds; };
var _deleteSetA = deleteSet;
deleteSet = function (ds) { auditLog("Deleted dataset", ds, ""); return _deleteSetA(ds); };
var _addToPaperA = addToPaper;
addToPaper = function (ds, R) { var n = WP.items.length; _addToPaperA(ds, R); if (WP.items.length > n) auditLog("Added to write-up", ds, R.summary && R.summary.test || A.kind); };
if (typeof saveFile === "function") { var _saveFileA = saveFile; saveFile = function (filename, data) { auditLog("Downloaded file", cur(), filename); return _saveFileA(filename, data); }; }
if (typeof nativeDownload === "function") { var _nativeA = nativeDownload; nativeDownload = function (filename, data) { auditLog("Downloaded file", cur(), filename); return _nativeA(filename, data); }; }

// ---- Workflow steps ----
function replayColumns(ds, source) {
  var names = source.cols.map(function (c) { return c.name; }), out = [];
  ds.cols.forEach(function (c, j) { if (isNum(c) && names.indexOf(c.name) < 0) out.push({index: j, name: c.name, values: ds.rows.map(function (r) { return r[j] == null ? null : +r[j].toPrecision(14); })}); });
  return out;
}
function verifyWorkingReplay(ds, spec) {
  if (!spec.fp || dataFingerprint(ds) === spec.fp) return;
  var refs = spec.replayColumns || [], omitted = refs.map(function (c) { return c.index; });
  if (!refs.length || !spec.replayFp || dataFingerprint(ds, omitted) !== spec.replayFp) throw new Error("Working data differ from the recorded version");
  refs.forEach(function (c) {
    if (!ds.cols[c.index] || ds.cols[c.index].name !== c.name || c.values.length !== ds.rows.length) throw new Error("Computed column schema differs from the recorded version");
    c.values.forEach(function (expected, i) { var actual = ds.rows[i][c.index];
      if (expected == null ? actual !== null : typeof actual !== "number" || !isFinite(actual) || Math.abs(actual - expected) > 1e-12 * Math.max(Math.abs(actual), Math.abs(expected)) + 1e-300) throw new Error("Computed value differs from the recorded version at row " + (i + 1) + ", column " + c.name);
    });
  });
}
function wfAdd(ds, R) {
  if (!R || R.valid === false || !R.reading.length) { XP.msg = "Only a valid result can be added to the workflow."; render(); return; }
  var source = E.orig[ds.id] || ds, refs = replayColumns(ds, source);
  WF.steps.push({id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: new Date().toISOString(), dsId: ds.id, dsName: ds.name, fp: dataFingerprint(ds), replayFp: dataFingerprint(ds, refs.map(function (c) { return c.index; })), replayColumns: refs, sourceFp: dataFingerprint(E.orig[ds.id] || ds), recipe: clone(ds.recipe || []), kind: A.kind, cols: clone(ds.cols), sourceCols: clone((E.orig[ds.id] || ds).cols), sourceHeaders: clone(ds.sourceHeaders || (E.orig[ds.id] || ds).cols.map(function (c) { return c.name; })), importOptions: clone(ds.importOptions || {decimal: ".", missing: "blank"}), sel: clone(A.sel), summary: clone(R.summary), title: caption(ds), test: R.summary.test || KIND_HELP[A.kind].split(" (")[0]});
  WF.results = null; auditLog("Recorded analysis", ds, R.summary.test || A.kind);
  XP.msg = "Recorded in the workflow (" + WF.steps.length + " step" + (WF.steps.length === 1 ? "" : "s") + "). See Write-up → Reproducible workflow."; render();
}
function sameNumbers(a, b, path, out) {
  if (typeof a === "number" && typeof b === "number") { if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))) out.push(path + ": " + f3(a) + " → " + f3(b)); return; }
  if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) { out.push(path + ": length changed"); return; } a.forEach(function (v, i) { sameNumbers(v, b[i], path + "[" + i + "]", out); }); return; }
  if (a && b && typeof a === "object" && typeof b === "object") { Object.keys(a).forEach(function (k) { if (k in b) sameNumbers(a[k], b[k], path ? path + "." + k : k, out); else out.push((path ? path + "." : "") + k + ": missing now"); }); return; }
  if (a !== b && (typeof a !== "object" || typeof b !== "object")) out.push(path + ": “" + a + "” → “" + b + "”");
}
function wfRerun() {
  var saveKind = A.kind, saveSel = A.sel, saveCur = A.cur, out = [];
  MOD.force = true;
  WF.steps.forEach(function (stp) {
    var ds = A.sets.filter(function (d) { return d.id === stp.dsId; })[0] || A.sets.filter(function (d) { return d.name === stp.dsName; })[0];
    if (!ds || !ds.rows) { out.push({status: "missing", note: "Dataset “" + stp.dsName + "” is not open."}); return; }
    var fpNow = dataFingerprint(ds), diffs = [];
    try { A.cur = ds.id; A.kind = stp.kind; A.sel = clone(stp.sel); var R = runAnalysis(ds); sameNumbers(stp.summary, R.summary, "", diffs); if (R.valid === false) diffs.unshift("no longer valid: " + (R.reason || "")); }
    catch (e) { diffs.push("could not run: " + e.message); }
    out.push({status: diffs.length ? "changed" : "same", dataChanged: fpNow !== stp.fp, fpNow: fpNow, diffs: diffs.slice(0, 6)});
  });
  MOD.force = false; A.kind = saveKind; A.sel = saveSel; A.cur = saveCur;
  WF.results = out; auditLog("Reran workflow", null, out.filter(function (r) { return r.status === "same"; }).length + " of " + out.length + " reproduced");
}

// ---- Script generation ----
function q(s) { return JSON.stringify(String(s)); }
function pyCol(c) { return "df[" + q(c) + "]"; }
function pyQ(c) { return 'Q(' + q(c).replace(/^"|"$/g, "'").replace(/'/g, "\\'").replace(/^\\'|\\'$/g, "'") + ")"; }
function pyQname(c) { return "Q('" + String(c).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "')"; }
function rTick(c) { return "`" + String(c).replace(/`/g, "\\`") + "`"; }
function rCol(c) { return "df[[" + q(c) + "]]"; }
function exprTo(lang, expr, ds) {   // translate an EKM formula to pandas or R
  var names = ds ? ds.cols.map(function (c) { return c.name; }).sort(function (a, b) { return b.length - a.length; }) : [];
  var s = String(expr).replace(/\[([^\]]+)\]/g, function (_, n) { return "\u0000" + n + "\u0001"; });
  names.forEach(function (n) { if (/^[A-Za-z_][\w.]*$/.test(n)) s = s.replace(new RegExp("(^|[^\\w\\u0000.])" + n.replace(/[.]/g, "\\.") + "(?![\\w(\\u0001])", "g"), function (m, a) { return a + "\u0000" + n + "\u0001"; }); });
  var fn = lang === "py" ? {log: "np.log10", ln: "np.log", sqrt: "np.sqrt", abs: "np.abs", exp: "np.exp", round: "np.round", min: "np.minimum", max: "np.maximum"} : {log: "log10", ln: "log", sqrt: "sqrt", abs: "abs", exp: "exp", round: "round", min: "pmin", max: "pmax"};
  s = s.replace(/\b(log|ln|sqrt|abs|exp|round|min|max)\s*\(/g, function (_, f) { return fn[f] + "("; });
  if (lang === "py") s = s.replace(/\^/g, "**");
  return s.replace(/\u0000([^\u0001]*)\u0001/g, function (_, n) { return lang === "py" ? pyCol(n) : rCol(n); });
}
function pyMask(sel) {
  var parts = [];
  if (sel.f && sel.fv) parts.push("(" + pyCol(sel.f) + ".astype(str) == " + q(sel.fv) + ")");
  var w = sel.where; if (w && w.conds && w.conds.length) {
    var cs = w.conds.map(function (c) { var col = pyCol(c.col), v = isFinite(+c.v) && c.v !== "" ? String(+c.v) : q(c.v);
      return {missing: col + ".isna()", present: col + ".notna()", eq: "(" + col + " == " + v + ")", ne: "(" + col + " != " + v + ")", lt: "(" + col + " < " + v + ")", le: "(" + col + " <= " + v + ")", gt: "(" + col + " > " + v + ")", ge: "(" + col + " >= " + v + ")",
        between: col + ".between(" + Math.min(+c.v, +c.v2) + ", " + Math.max(+c.v, +c.v2) + ")", is: "(" + col + ".astype(str) == " + q(c.v) + ")", isnot: "(" + col + ".astype(str) != " + q(c.v) + ")", "in": col + ".astype(str).isin(" + JSON.stringify(String(c.v).split(",").map(function (x) { return x.trim(); })) + ")", contains: col + ".astype(str).str.contains(" + q(c.v) + ", case=False, regex=False)"}[c.op] || "True"; });
    parts.push("(" + cs.join(w.any ? " | " : " & ") + ")");
  }
  return parts.length ? "d = df[" + parts.join(" & ") + "]" : "d = df";
}
function rMask(sel) {
  var parts = [];
  if (sel.f && sel.fv) parts.push("as.character(" + rCol(sel.f) + ") == " + q(sel.fv));
  var w = sel.where; if (w && w.conds && w.conds.length) {
    var cs = w.conds.map(function (c) { var col = rCol(c.col), v = isFinite(+c.v) && c.v !== "" ? String(+c.v) : q(c.v);
      return {missing: "is.na(" + col + ")", present: "!is.na(" + col + ")", eq: col + " == " + v, ne: col + " != " + v, lt: col + " < " + v, le: col + " <= " + v, gt: col + " > " + v, ge: col + " >= " + v, between: "(" + col + " >= " + Math.min(+c.v, +c.v2) + " & " + col + " <= " + Math.max(+c.v, +c.v2) + ")",
        is: "as.character(" + col + ") == " + q(c.v), isnot: "as.character(" + col + ") != " + q(c.v), "in": "as.character(" + col + ") %in% c(" + String(c.v).split(",").map(function (x) { return q(x.trim()); }).join(", ") + ")", contains: "grepl(" + q(c.v) + ", " + col + ", ignore.case = TRUE, fixed = FALSE)"}[c.op] || "TRUE"; });
    parts.push("(" + cs.map(function (x) { return "(" + x + ")"; }).join(w.any ? " | " : " & ") + ")");
  }
  return parts.length ? "d <- df[which(" + parts.join(" & ") + "), , drop = FALSE]" : "d <- df";
}
function pyStep(s2, ds) {
  var c = s2.col ? pyCol(s2.col) : "";
  switch (s2.op) {
    case "trim": return c + " = " + c + ".str.strip().str.replace(r\"\\s{2,}\", \" \", regex=True)";
    case "tonum": return c + " = pd.to_numeric(" + c + ".astype(str).str.replace(r\"[%$€£¥\\s,]\", \"\", regex=True), errors=\"coerce\")";
    case "type": return s2.type === "number" || s2.type === "year" ? c + " = pd.to_numeric(" + c + ", errors=\"coerce\")" : s2.type === "date" ? c + " = pd.to_datetime(" + c + ", errors=\"coerce\")" : c + " = " + c + ".astype(\"string\")";
    case "dedupe": return "df = df.drop_duplicates().reset_index(drop=True)";
    case "drop": return "df = df.drop(columns=[" + q(s2.col) + "])";
    case "fill": return (s2.how === "knn" ? "from sklearn.impute import KNNImputer  # EKM: mean of 5 nearest rows on standardized numbers\nnum = df.select_dtypes(\"number\").columns\ndf[num] = KNNImputer(n_neighbors=5).fit_transform((df[num] - df[num].mean()) / df[num].std()) * df[num].std().values + df[num].mean().values" : (/marking/.test(s2.text || "") ? "df[" + q(s2.col + " was missing") + "] = np.where(" + c + ".isna(), \"yes\", \"no\")\n" : "") + c + " = " + c + ".fillna(" + c + "." + (s2.how === "median" ? "median()" : s2.how === "mean" ? "mean()" : "mode().iloc[0]") + ")");
    case "outliers": return "q1, q3 = " + c + ".quantile([0.25, 0.75]); lo, hi = q1 - 1.5 * (q3 - q1), q3 + 1.5 * (q3 - q1)\n" + (s2.how === "cap" ? c + " = " + c + ".clip(lo, hi)" : s2.how === "flag" ? "df[" + q(s2.col + " unusual") + "] = np.where((" + c + " < lo) | (" + c + " > hi), \"yes\", \"no\")" : "df = df[~((" + c + " < lo) | (" + c + " > hi))].reset_index(drop=True)");
    case "derive": return s2.how === "log" ? "df[" + q("log10 of " + s2.col) + "] = np.log10(" + c + ".where(" + c + " > 0))" : s2.how === "z" ? "df[" + q(s2.col + " (standardized)") + "] = (" + c + " - " + c + ".mean()) / " + c + ".std()" : "df[" + q(s2.col + " (quarter)") + "] = pd.qcut(" + c + ", 4, labels=[\"Q1 lowest\", \"Q2\", \"Q3\", \"Q4 highest\"])";
    case "merge": var m = {}; (s2.groups || []).forEach(function (g) { g.values.forEach(function (v) { if (v !== g.into) m[v] = g.into; }); }); return c + " = " + c + ".replace(" + JSON.stringify(m) + ")";
    case "isolation-forest": return "from sklearn.ensemble import IsolationForest  # scores differ from EKM's seeded forest\niso = IsolationForest(n_estimators=100, max_samples=256, contamination=" + (s2.share || 0.05) + ", random_state=0)\nX = df[" + JSON.stringify(s2.cols || []) + "].fillna(df[" + JSON.stringify(s2.cols || []) + "].median())\ndf[\"Anomaly score\"] = -iso.fit(X).score_samples(X)\ndf[\"Anomaly\"] = np.where(iso.predict(X) == -1, \"yes\", \"no\")";
    case "formula": return "df[" + q(s2.name) + "] = " + exprTo("py", s2.expr, ds);
    case "scale": return "items = " + JSON.stringify(s2.items) + "\nlo, hi = df[items].min().min(), df[items].max().max()\nscored = df[items].copy()\n" + ((s2.rev || []).length ? "scored[" + JSON.stringify(s2.rev) + "] = lo + hi - scored[" + JSON.stringify(s2.rev) + "]\n" : "") + "df[" + q(s2.name || "Scale score") + "] = scored.mean(axis=1, skipna=False)";
    case "scores": return "from factor_analyzer import FactorAnalyzer\nitems = " + JSON.stringify(s2.items) + "\nfa = FactorAnalyzer(n_factors=" + s2.k + ", method=" + q(s2.meth === "pca" ? "principal" : "minres") + ", rotation=" + (s2.k > 1 && s2.rot !== "none" ? q(s2.rot) : "None") + ").fit(df[items].dropna())\nsc = fa.transform(df[items].dropna())\nfor j in range(" + s2.k + "): df.loc[df[items].dropna().index, f\"" + (s2.prefix || "Factor") + " {j + 1}\"] = sc[:, j]";
    case "edit": return "df.loc[df.index[" + s2.row + "], " + q(s2.col) + "] = " + (s2.value == null ? "np.nan" : typeof s2.value === "number" ? s2.value : q(s2.value));
    case "addrow": return "df.loc[len(df)] = [np.nan] * df.shape[1]";
    case "delrow": return "df = df.drop(df.index[" + s2.row + "]).reset_index(drop=True)";
    case "filter": return pyMask({where: s2.where}).replace("d = df[", "df = df[") + ".reset_index(drop=True)";
    case "recode": var sp = s2.spec || {}; return sp.mode === "bins" ? "df[" + q(sp.into || sp.col) + "] = pd.cut(" + pyCol(sp.col) + ", [-np.inf, " + sp.breaks.join(", ") + ", np.inf], right=False" + (sp.labels ? ", labels=" + JSON.stringify(sp.labels) : "") + ")" : "df[" + q(sp.into || sp.col) + "] = " + pyCol(sp.col) + ".astype(\"string\").replace(" + JSON.stringify(sp.map) + ")";
    case "predict": return "# Out-of-fold predictions of " + q(s2.sel && s2.sel.mt) + ": see the model section below (cross_val_predict)";
  }
  return "# Step not translated: " + (s2.text || s2.op);
}
function rStep(s2, ds) {
  var c = s2.col ? rCol(s2.col) : "";
  switch (s2.op) {
    case "trim": return c + " <- gsub(\"\\\\s{2,}\", \" \", trimws(" + c + "))";
    case "tonum": return c + " <- suppressWarnings(as.numeric(gsub(\"[%$€£¥[:space:],]\", \"\", " + c + ")))";
    case "type": return s2.type === "number" || s2.type === "year" ? c + " <- suppressWarnings(as.numeric(" + c + "))" : s2.type === "date" ? c + " <- as.Date(" + c + ")" : c + " <- as.character(" + c + ")";
    case "dedupe": return "df <- df[!duplicated(df), , drop = FALSE]";
    case "drop": return "df[[" + q(s2.col) + "]] <- NULL";
    case "fill": return s2.how === "knn" ? "# KNN fill: VIM::kNN(df, variable = " + q(s2.col) + ", k = 5)" : (/marking/.test(s2.text || "") ? "df[[" + q(s2.col + " was missing") + "]] <- ifelse(is.na(" + c + "), \"yes\", \"no\")\n" : "") + c + "[is.na(" + c + ")] <- " + (s2.how === "median" ? "median(" + c + ", na.rm = TRUE)" : s2.how === "mean" ? "mean(" + c + ", na.rm = TRUE)" : "names(sort(table(" + c + "), decreasing = TRUE))[1]");
    case "outliers": return "qs <- quantile(" + c + ", c(.25, .75), na.rm = TRUE, type = 7); lo <- qs[1] - 1.5 * diff(qs); hi <- qs[2] + 1.5 * diff(qs)\n" + (s2.how === "cap" ? c + " <- pmin(pmax(" + c + ", lo), hi)" : s2.how === "flag" ? "df[[" + q(s2.col + " unusual") + "]] <- ifelse(" + c + " < lo | " + c + " > hi, \"yes\", \"no\")" : "df <- df[is.na(" + c + ") | (" + c + " >= lo & " + c + " <= hi), , drop = FALSE]");
    case "derive": return s2.how === "log" ? "df[[" + q("log10 of " + s2.col) + "]] <- ifelse(" + c + " > 0, log10(" + c + "), NA)" : s2.how === "z" ? "df[[" + q(s2.col + " (standardized)") + "]] <- as.numeric(scale(" + c + "))" : "df[[" + q(s2.col + " (quarter)") + "]] <- cut(" + c + ", quantile(" + c + ", 0:4 / 4, na.rm = TRUE), include.lowest = TRUE, labels = c(\"Q1 lowest\", \"Q2\", \"Q3\", \"Q4 highest\"))";
    case "merge": var m = []; (s2.groups || []).forEach(function (g) { g.values.forEach(function (v) { if (v !== g.into) m.push(q(v) + " = " + q(g.into)); }); }); return "map <- c(" + m.join(", ") + ")\n" + c + " <- ifelse(" + c + " %in% names(map), map[" + c + "], " + c + ")";
    case "isolation-forest": return "# Isolation Forest: isotree::isolation.forest(df[, " + JSON.stringify(s2.cols || []).replace(/^\[/, "c(").replace(/\]$/, ")") + "], ntrees = 100, sample_size = 256)";
    case "formula": return "df[[" + q(s2.name) + "]] <- " + exprTo("r", s2.expr, ds);
    case "scale": return "items <- c(" + s2.items.map(q).join(", ") + ")\nlo <- min(df[items], na.rm = TRUE); hi <- max(df[items], na.rm = TRUE)\nsc <- df[items]\n" + ((s2.rev || []).length ? "sc[c(" + s2.rev.map(q).join(", ") + ")] <- lo + hi - sc[c(" + s2.rev.map(q).join(", ") + ")]\n" : "") + "df[[" + q(s2.name || "Scale score") + "]] <- rowMeans(sc)";
    case "scores": return "items <- c(" + s2.items.map(q).join(", ") + ")\nfa <- psych::" + (s2.meth === "pca" ? "principal(df[items], nfactors = " + s2.k + ", rotate = " + q(s2.k > 1 ? s2.rot : "none") + ", scores = TRUE)" : "fa(df[items], nfactors = " + s2.k + ", fm = \"pa\", rotate = " + q(s2.k > 1 ? s2.rot : "none") + ", scores = \"regression\")") + "\ndf <- cbind(df, fa$scores)";
    case "edit": return "df[" + (s2.row + 1) + ", " + q(s2.col) + "] <- " + (s2.value == null ? "NA" : typeof s2.value === "number" ? s2.value : q(s2.value));
    case "addrow": return "df[nrow(df) + 1, ] <- NA";
    case "delrow": return "df <- df[-" + (s2.row + 1) + ", , drop = FALSE]";
    case "filter": return rMask({where: s2.where}).replace("d <- df[", "df <- df[");
    case "recode": var sp = s2.spec || {}; return sp.mode === "bins" ? "df[[" + q(sp.into || sp.col) + "]] <- cut(" + rCol(sp.col) + ", c(-Inf, " + sp.breaks.join(", ") + ", Inf), right = FALSE" + (sp.labels ? ", labels = c(" + sp.labels.map(q).join(", ") + ")" : "") + ")" : "map <- c(" + Object.keys(sp.map).map(function (k) { return q(k) + " = " + q(sp.map[k]); }).join(", ") + ")\nx <- as.character(" + rCol(sp.col) + ")\ndf[[" + q(sp.into || sp.col) + "]] <- ifelse(x %in% names(map), map[x], x)";
    case "predict": return "# Out-of-fold predictions: see the model section below";
  }
  return "# Step not translated: " + (s2.text || s2.op);
}
function pyAnalysis(stp) {
  var s = stp.sel, L = [pyMask(s)], P = s.preds || [];
  switch (stp.kind) {
    case "describe": L.push("print(d[" + q(s.y) + "].describe())", "print(stats.shapiro(d[" + q(s.y) + "].dropna()))"); break;
    case "compare": L.push("groups = [g[" + q(s.y) + "].dropna() for _, g in d.groupby(" + q(s.g) + ") if g[" + q(s.y) + "].notna().sum() >= 2]", "if len(groups) == 2:\n    print(stats.ttest_ind(*groups, equal_var=False)); print(stats.mannwhitneyu(*groups))\nelse:\n    print(stats.f_oneway(*groups)); print(stats.kruskal(*groups))", "print(stats.levene(*groups, center=\"median\"))"); break;
    case "relate": L.push("xy = d[[" + q(s.x) + ", " + q(s.y) + "]].dropna()", "print(stats.pearsonr(xy.iloc[:, 0], xy.iloc[:, 1])); print(stats.spearmanr(xy.iloc[:, 0], xy.iloc[:, 1]))", "print(stats.linregress(xy.iloc[:, 0], xy.iloc[:, 1]))"); break;
    case "cross": L.push("tab = pd.crosstab(d[" + q(s.g) + "], d[" + q(s.g2) + "])", "print(tab); print(stats.chi2_contingency(tab, correction=False))"); break;
    case "trend": L.push("for name, g in (d.groupby(" + q(s.g) + ") if " + (s.g ? "True" : "False") + " else [(\"all\", d)]):\n    t = g[[" + q(s.t) + ", " + q(s.y) + "]].dropna()\n    print(name, stats.linregress(t.iloc[:, 0], t.iloc[:, 1]))"); break;
    case "regress": L.push("print(smf.ols(" + q(pyQname(s.y) + " ~ " + (P.filter(function (p) { return p !== s.y; }).map(pyQname).join(" + ") || "1")) + ", data=d).fit().summary())"); break;
    case "paired": L.push("pr = d[[" + q(s.x) + ", " + q(s.y) + "]].dropna()", "print(stats.ttest_rel(pr.iloc[:, 1], pr.iloc[:, 0])); print(stats.wilcoxon(pr.iloc[:, 1], pr.iloc[:, 0]))"); break;
    case "logistic": L.push("y = (d[" + q(s.o) + "].astype(str) == " + q(s.ov || "") + ").astype(int)", "X = sm.add_constant(d[" + JSON.stringify(s.lp || []) + "])", "print(sm.Logit(y, X, missing=\"drop\").fit().summary())"); break;
    case "pivot": L.push("print(pd.pivot_table(d, values=" + q(s.y) + ", index=" + q(s.g) + (s.g2 ? ", columns=" + q(s.g2) : "") + ", aggfunc=" + q(s.agg || "mean") + "))"); break;
    case "matrix": L.push("print(d.select_dtypes(\"number\").corr())"); break;
    case "rmanova": if (s.rmfmt === "long") L.push("long = d[[" + q(s.rmsub) + ", " + q(s.rmcond) + ", " + q(s.y) + "]].dropna()", "print(pg.rm_anova(long, dv=" + q(s.y) + ", within=" + q(s.rmcond) + ", subject=" + q(s.rmsub) + ", correction=True, effsize=\"np2\"))", "print(pg.friedman(long, dv=" + q(s.y) + ", within=" + q(s.rmcond) + ", subject=" + q(s.rmsub) + "))", "print(pg.pairwise_tests(long, dv=" + q(s.y) + ", within=" + q(s.rmcond) + ", subject=" + q(s.rmsub) + ", padjust=\"holm\"))");
      else L.push("wide = d[" + JSON.stringify(s.rm || []) + "].dropna()", "long = wide.reset_index().melt(id_vars=\"index\", var_name=\"condition\", value_name=\"value\")", "print(pg.rm_anova(long, dv=\"value\", within=\"condition\", subject=\"index\", correction=True, effsize=\"np2\"))", "print(stats.friedmanchisquare(*[wide[c] for c in wide]))", "print(pg.pairwise_tests(long, dv=\"value\", within=\"condition\", subject=\"index\", padjust=\"holm\"))"); break;
    case "mixed": var fx = (s.mx || []).map(pyQname).join(" + ") || "1"; L.push("m = smf.mixedlm(" + q(pyQname(s.y) + " ~ " + fx) + ", d.dropna(subset=" + JSON.stringify([s.y, s.mg].concat(s.mx || [])) + "), groups=" + q(s.mg) + (s.mslope ? ", re_formula=" + q("~" + pyQname(s.mslope)) : "") + ").fit(reml=True)", "print(m.summary())", "ols = smf.ols(" + q(pyQname(s.y) + " ~ " + fx) + ", d.dropna(subset=" + JSON.stringify([s.y, s.mg].concat(s.mx || [])) + ")).fit(cov_type=\"cluster\", cov_kwds={\"groups\": d.dropna(subset=" + JSON.stringify([s.y, s.mg].concat(s.mx || [])) + ")[" + q(s.mg) + "]}, use_t=True)", "print(ols.summary())"); break;
    case "reliability": L.push("items = d[" + JSON.stringify(s.items || []) + "].dropna()", (s.rev || []).length ? "items[" + JSON.stringify(s.rev) + "] = items.min().min() + items.max().max() - items[" + JSON.stringify(s.rev) + "]" : "", "print(pg.cronbach_alpha(items))"); break;
    case "factor": L.push("from factor_analyzer import FactorAnalyzer, calculate_kmo, calculate_bartlett_sphericity", "X = d[" + JSON.stringify(s.fitems || []) + "].dropna()", "print(calculate_kmo(X)[1], calculate_bartlett_sphericity(X))", "k = " + ((stp.summary || {}).factors || 2), "fa = FactorAnalyzer(n_factors=k, method=" + q(s.fmeth === "pca" ? "principal" : "minres") + ", rotation=" + (s.frot === "none" ? "None" : q(s.frot || "promax")) + ").fit(X)", "print(pd.DataFrame(fa.loadings_, index=X.columns))"); break;
    case "agree": if (s.agmode === "icc") L.push("r = d[" + JSON.stringify(s.raters || []) + "].dropna().reset_index()", "long = r.melt(id_vars=\"index\", var_name=\"rater\", value_name=\"rating\")", "print(pg.intraclass_corr(long, targets=\"index\", raters=\"rater\", ratings=\"rating\"))");
      else if ((s.raters || []).length === 2) L.push("from sklearn.metrics import cohen_kappa_score", "r = d[" + JSON.stringify(s.raters) + "].dropna().astype(str)", "print(cohen_kappa_score(r.iloc[:, 0], r.iloc[:, 1]" + (s.agw && s.agw !== "none" ? ", weights=" + q(s.agw) : "") + "))");
      else L.push("from statsmodels.stats.inter_rater import fleiss_kappa, aggregate_raters", "r = d[" + JSON.stringify(s.raters || []) + "].dropna().astype(str).to_numpy()", "print(fleiss_kappa(aggregate_raters(r)[0]))"); break;
    case "missing": L.push("print(d[" + JSON.stringify(s.mcols || []) + "].isna().value_counts())", "# Multiple imputation (chained equations) with pooled OLS:", "from statsmodels.imputation import mice", "num = d[" + JSON.stringify([s.miy].concat(s.mix || [], s.miaux || []).filter(Boolean)) + "]", "md = mice.MICEData(num)", "res = mice.MICE(" + q(pyQname(s.miy) + " ~ " + (s.mix || []).map(pyQname).join(" + ")) + ", sm.OLS, md).fit(10, " + (s.mim || 20) + ")", "print(res.summary())"); break;
    case "model": L.push(pyModel(s)); break;
  }
  return L.filter(Boolean).join("\n");
}
function pyModel(s) { return exactModelScript({kind: "model", sel: s, summary: LAST_R && LAST_R.kind === "model" ? LAST_R.summary : {}}, "py"); }

function rAnalysis(stp) {
  var s = stp.sel, L = [rMask(s)], P = (s.preds || []).filter(function (p) { return p !== s.y; });
  switch (stp.kind) {
    case "describe": L.push("summary(d[[" + q(s.y) + "]]); shapiro.test(d[[" + q(s.y) + "]])"); break;
    case "compare": L.push("f <- " + rTick(s.y) + " ~ " + rTick(s.g), "if (length(unique(na.omit(d[[" + q(s.g) + "]]))) == 2) { print(t.test(f, data = d)); print(wilcox.test(f, data = d, exact = FALSE)) } else { print(oneway.test(f, data = d, var.equal = TRUE)); print(kruskal.test(f, data = d)) }", "car::leveneTest(f, data = d)"); break;
    case "relate": L.push("cor.test(d[[" + q(s.x) + "]], d[[" + q(s.y) + "]]); cor.test(d[[" + q(s.x) + "]], d[[" + q(s.y) + "]], method = \"spearman\", exact = FALSE)", "summary(lm(" + rTick(s.y) + " ~ " + rTick(s.x) + ", data = d))"); break;
    case "cross": L.push("tab <- table(d[[" + q(s.g) + "]], d[[" + q(s.g2) + "]]); print(tab); chisq.test(tab, correct = FALSE)"); break;
    case "trend": L.push("summary(lm(" + rTick(s.y) + " ~ " + rTick(s.t) + (s.g ? " * " + rTick(s.g) : "") + ", data = d))"); break;
    case "regress": L.push("summary(lm(" + rTick(s.y) + " ~ " + (P.map(rTick).join(" + ") || "1") + ", data = d))"); break;
    case "paired": L.push("t.test(d[[" + q(s.y) + "]], d[[" + q(s.x) + "]], paired = TRUE); wilcox.test(d[[" + q(s.y) + "]], d[[" + q(s.x) + "]], paired = TRUE, exact = FALSE)"); break;
    case "logistic": L.push("d$.y <- as.integer(as.character(d[[" + q(s.o) + "]]) == " + q(s.ov || "") + ")", "summary(glm(.y ~ " + ((s.lp || []).map(rTick).join(" + ") || "1") + ", family = binomial, data = d))"); break;
    case "pivot": L.push("aggregate(" + rTick(s.y) + " ~ " + rTick(s.g) + (s.g2 ? " + " + rTick(s.g2) : "") + ", data = d, FUN = " + (s.agg || "mean") + ")"); break;
    case "matrix": L.push("round(cor(Filter(is.numeric, d), use = \"pairwise.complete.obs\"), 3)"); break;
    case "rmanova": if (s.rmfmt === "long") L.push("long <- na.omit(d[c(" + [s.rmsub, s.rmcond, s.y].map(q).join(", ") + ")]); names(long) <- c(\"id\", \"condition\", \"value\")"); else L.push("wide <- na.omit(d[c(" + (s.rm || []).map(q).join(", ") + ")]); wide$id <- seq_len(nrow(wide))", "long <- reshape(wide, direction = \"long\", varying = c(" + (s.rm || []).map(q).join(", ") + "), v.names = \"value\", timevar = \"condition\", times = c(" + (s.rm || []).map(q).join(", ") + "), idvar = \"id\")");
      L.push("long$id <- factor(long$id); long$condition <- factor(long$condition)", "afex::aov_ez(\"id\", \"value\", long, within = \"condition\", anova_table = list(correction = \"GG\", es = \"pes\"))", "friedman.test(value ~ condition | id, data = long)", "pairwise.t.test(long$value, long$condition, paired = TRUE, p.adjust.method = \"holm\")"); break;
    case "mixed": L.push("library(lmerTest)", "m <- lmer(" + rTick(s.y) + " ~ " + ((s.mx || []).map(rTick).join(" + ") || "1") + " + (" + (s.mslope ? "1 + " + rTick(s.mslope) : "1") + " | " + rTick(s.mg) + "), data = d, REML = TRUE)", "summary(m)", "performance::icc(m)", "lmtest::coeftest(lm(" + rTick(s.y) + " ~ " + ((s.mx || []).map(rTick).join(" + ") || "1") + ", data = d), vcov = sandwich::vcovCL, cluster = ~" + rTick(s.mg) + ")"); break;
    case "reliability": L.push("items <- na.omit(d[c(" + (s.items || []).map(q).join(", ") + ")])", "psych::alpha(items" + ((s.rev || []).length ? ", keys = c(" + s.rev.map(q).join(", ") + ")" : "") + ")", "psych::omega(items, nfactors = 1)"); break;
    case "factor": L.push("X <- na.omit(d[c(" + (s.fitems || []).map(q).join(", ") + ")])", "psych::KMO(X); psych::cortest.bartlett(cor(X), n = nrow(X))", "psych::fa.parallel(X, fa = \"fa\")", "psych::" + (s.fmeth === "pca" ? "principal(X, nfactors = " + ((stp.summary || {}).factors || 2) + ", rotate = " + q(s.frot || "promax") + ")" : "fa(X, nfactors = " + ((stp.summary || {}).factors || 2) + ", fm = \"pa\", rotate = " + q(s.frot || "promax") + ")")); break;
    case "agree": L.push("r <- na.omit(d[c(" + (s.raters || []).map(q).join(", ") + ")])", s.agmode === "icc" ? "psych::ICC(r)" : (s.raters || []).length === 2 ? "irr::kappa2(r, weight = " + q(s.agw === "linear" ? "equal" : s.agw === "quadratic" ? "squared" : "unweighted") + ")" : "irr::kappam.fleiss(r)"); break;
    case "missing": L.push("mice::md.pattern(d[c(" + (s.mcols || []).map(q).join(", ") + ")])", "naniar::mcar_test(Filter(is.numeric, d[c(" + (s.mcols || []).map(q).join(", ") + ")]))", "imp <- mice::mice(d[c(" + [s.miy].concat(s.mix || [], s.miaux || []).filter(Boolean).map(q).join(", ") + ")], m = " + (s.mim || 20) + ", method = \"pmm\", seed = 4242, printFlag = FALSE)", "summary(mice::pool(with(imp, lm(" + rTick(s.miy) + " ~ " + (s.mix || []).map(rTick).join(" + ") + "))), conf.int = TRUE)"); break;
    case "model": L.push(exactModelScript(stp, "r")); break;
  }
  return L.filter(Boolean).join("\n");
}
function wfScript(lang) {
  var py = lang === "py", out = [], byDs = [];
  WF.steps.forEach(function (stp) { if (byDs.indexOf(stp.dsName) < 0) byDs.push(stp.dsName); });
  out.push(py ? "# EKM reproducible workflow · " + today() + "\n# Python 3 with: pip install pandas numpy scipy statsmodels scikit-learn pingouin factor_analyzer\nimport numpy as np, pandas as pd\nfrom scipy import stats\nimport statsmodels.api as sm, statsmodels.formula.api as smf\nimport pingouin as pg\n"
    : "# EKM reproducible workflow · " + today() + "\n# R packages used: car, afex, lmerTest, performance, sandwich, lmtest, psych, irr, mice, naniar, rsample, yardstick\n");
  WF.steps.forEach(function (stp, i) {
    var ds = A.sets.filter(function (d) { return d.id === stp.dsId; })[0];
    out.push("# Step " + (i + 1) + ": " + stp.test + " — " + stp.title + "\n# Data: " + stp.dsName + " · fingerprint " + stp.fp + " · recorded " + stp.at.slice(0, 16).replace("T", " "));
    out.push(py ? "df = pd.read_csv(" + q(slug(stp.dsName) + "-original.csv") + ")  # the file you imported" : "df <- read.csv(" + q(slug(stp.dsName) + "-original.csv") + ", check.names = FALSE, stringsAsFactors = FALSE)  # the file you imported");
    (stp.recipe || []).forEach(function (s2) { out.push("# " + (s2.text || s2.op) + "\n" + (py ? pyStep(s2, ds) : rStep(s2, ds))); });
    out.push(py ? pyAnalysis(stp) : rAnalysis(stp));
    out.push("# EKM's result: " + JSON.stringify(stp.summary, function (k, v) { return typeof v === "number" ? +v.toPrecision(6) : v; }).slice(0, 600) + "\n");
  });
  return out.join("\n\n") + "\n";
}

// ---- Project files carry the workflow, audit trail and variable metadata ----
if (typeof projectSnapshot === "function") {
  var _snapA = projectSnapshot;
  projectSnapshot = function () { var p = _snapA(); p.workflow = WF.steps; p.audit = AUD.log; p.meta = A.sets.map(function (ds) { return {id: ds.id, cols: ds.cols.map(function (c) { return {name: c.name, label: c.label || "", unit: c.unit || "", values: c.values || null}; }), source: ds.sourceSpec || null}; }); return p; };
  var ARRAY_SEL = ["rm", "mx", "items", "rev", "fitems", "raters", "mcols", "mix", "miaux", "mp"];
  var _validA = validateProject;
  validateProject = function (p) {
    var extra = {}, sel = p && p.selection && typeof p.selection === "object" && !Array.isArray(p.selection) ? p.selection : null;
    if (sel) {
      var copy = {}; Object.keys(sel).forEach(function (k) {
        var v = sel[k];
        if (ARRAY_SEL.indexOf(k) >= 0) { if (!Array.isArray(v) || v.some(function (x) { return typeof x !== "string"; })) throw new Error("Invalid analysis selection: " + k + "."); extra[k] = v.slice(); }
        else if (k === "where") { if (v != null) { if (typeof v !== "object" || !Array.isArray(v.conds) || v.conds.some(function (c) { return !c || typeof c.col !== "string" || typeof c.op !== "string"; })) throw new Error("Invalid filter conditions."); extra.where = {any: !!v.any, conds: v.conds.map(function (c) { return {col: c.col, op: c.op, v: String(c.v == null ? "" : c.v), v2: String(c.v2 == null ? "" : c.v2)}; })}; } }
        else if (typeof v === "number" || typeof v === "boolean") { copy[k] = String(v); extra[k] = v; }
        else copy[k] = v;
      });
      p = Object.assign({}, p, {selection: copy});
    }
    var out = _validA(p); Object.assign(out.selection, extra);
    var metaById = Object.create(null); (Array.isArray(p.meta) ? p.meta : []).forEach(function (m) { if (m && typeof m.id === "string" && Array.isArray(m.cols)) metaById[m.id] = m; });
    out.datasets.forEach(function (ds) { var m = metaById[ds.id]; if (!m) return; ds.cols = ds.cols.map(function (c) { var mc = m.cols.filter(function (x) { return x && x.name === c.name; })[0]; if (!mc) return c; var nc = Object.assign({}, c); if (typeof mc.label === "string" && mc.label) nc.label = mc.label.slice(0, 80); if (typeof mc.unit === "string" && mc.unit) nc.unit = mc.unit.slice(0, 24); if (mc.values && typeof mc.values === "object") { var vv = {}; Object.keys(mc.values).slice(0, 200).forEach(function (k) { if (typeof mc.values[k] === "string") vv[String(k)] = mc.values[k].slice(0, 80); }); nc.values = vv; } return nc; }); if (m.source && typeof m.source === "object" && typeof m.source.kind === "string") ds.sourceSpec = {kind: m.source.kind, url: typeof m.source.url === "string" ? m.source.url : "", path: typeof m.source.path === "string" ? m.source.path : "", query: typeof m.source.query === "string" ? m.source.query : ""}; });
    out.workflow = Array.isArray(p.workflow) ? p.workflow.filter(function (s) { return s && typeof s.kind === "string" && typeof s.dsName === "string" && s.sel && typeof s.sel === "object"; }).map(function (s) { return {id: String(s.id || ""), at: String(s.at || ""), dsId: String(s.dsId || ""), dsName: s.dsName, fp: String(s.fp || ""), replayFp: String(s.replayFp || ""), replayColumns: Array.isArray(s.replayColumns) ? s.replayColumns.map(function (c) { if (!c || !Number.isInteger(c.index) || c.index < 0 || typeof c.name !== "string" || !Array.isArray(c.values) || c.values.some(function (v) { return v !== null && (typeof v !== "number" || !isFinite(v)); })) throw new Error("Invalid computed-column reference."); return c; }) : [], sourceFp: String(s.sourceFp || ""), recipe: Array.isArray(s.recipe) ? s.recipe : [], kind: s.kind, sourceHeaders: Array.isArray(s.sourceHeaders) ? s.sourceHeaders.map(function (h) { if (typeof h !== "string") throw new Error("Invalid original source header."); return h; }) : null, importOptions: s.importOptions || null, sourceCols: Array.isArray(s.sourceCols) ? s.sourceCols.map(function (c) { if (!c || typeof c.name !== "string" || ["number","year","date","category","text","empty"].indexOf(c.type) < 0) throw new Error("Invalid source column."); return {name: c.name, type: c.type, tags: c.tags ? cleanTags(c.tags) : null}; }) : undefined, cols: Array.isArray(s.cols) ? s.cols.map(function (c) { if (!c || typeof c.name !== "string" || ["number","year","date","category","text","empty"].indexOf(c.type) < 0) throw new Error("Invalid recorded column."); return {name: c.name, type: c.type, tags: c.tags ? cleanTags(c.tags) : null}; }) : undefined, sel: s.sel, summary: s.summary && typeof s.summary === "object" ? s.summary : {}, title: esc(String(s.title || "")), test: esc(String(s.test || ""))}; }) : [];
    out.audit = Array.isArray(p.audit) ? p.audit.filter(function (e) { return e && typeof e.hash === "string"; }).map(function (e) { return {at: String(e.at), who: String(e.who), action: String(e.action), dataset: String(e.dataset), fp: String(e.fp), detail: String(e.detail), prev: String(e.prev), hash: String(e.hash)}; }) : [];
    return out;
  };
  var _restoreA = restoreProject;
  restoreProject = function (p) { var v = validateProject(p); _restoreA(p); WF.steps = v.workflow; WF.results = null; AUD.log = v.audit; auditLog("Opened project", null, A.sets.length + " datasets"); };
}

// ---- UI: record button under results; workflow and audit cards in the write-up ----
var _toolsBarW = toolsBar;
toolsBar = function (ds, R) { var h = _toolsBarW(ds, R); return h.replace(/(<\/div>)\s*$/, '<button type="button" class="btn" data-wfadd="1">Add to workflow</button>$1'); };
function workflowCard() {
  var steps = WF.steps, res = WF.results;
  var list = steps.length ? '<ol class="wflist">' + steps.map(function (s2, i) {
    var r = res && res[i], chip = !r ? "" : r.status === "same" ? '<span class="chip q-verified">Reproduced</span>' : r.status === "missing" ? '<span class="chip q-excluded">Dataset missing</span>' : '<span class="chip q-estimated">Changed</span>';
    return "<li><b>" + s2.test + "</b> · " + s2.title + '<div class="count">' + esc(s2.dsName) + " · " + (s2.recipe || []).length + " cleaning step" + ((s2.recipe || []).length === 1 ? "" : "s") + " · data " + esc(s2.fp) + "</div>" + chip +
      (r && r.dataChanged ? ' <span class="chip q-reported">Data changed since recorded</span>' : "") + (r && r.diffs && r.diffs.length ? '<ul class="plain count">' + r.diffs.map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>" : r && r.note ? '<p class="count">' + esc(r.note) + "</p>" : "") +
      ' <button type="button" class="linkbtn" data-wfopen="' + i + '">Open</button> <button type="button" class="linkbtn" data-wfrm="' + i + '">Remove</button></li>';
  }).join("") + "</ol>" : '<p class="count">Press <b>Add to workflow</b> under any result. Each step records the dataset version, its cleaning steps and the exact settings, so the whole sequence can be rerun and checked, or exported as Python or R code.</p>';
  return '<section class="card" aria-labelledby="wf-h"><h2 id="wf-h">Reproducible workflow</h2>' + list + (WF.msg ? '<p class="how" role="status">' + esc(WF.msg) + "</p>" : "") +
    '<div class="slot">' + (steps.length ? '<button type="button" class="btn btn-primary" data-wfrun="1">Rerun and check</button><button type="button" class="btn" data-wfexp="py">Python script</button><button type="button" class="btn" data-wfexp="r">R script</button><button type="button" class="btn" data-wfexp="json">Workflow file</button><button type="button" class="btn" data-wfdata="1">Original data (CSV, unredacted)</button>' : "") +
    '<label class="btn" for="wffile">Load a workflow file</label><input type="file" id="wffile" accept=".json" class="sr-file"></div></section>';
}
function auditCard() {
  var last = AUD.log.slice(-12).reverse();
  return '<section class="card" aria-labelledby="au-h"><h2 id="au-h">Audit trail</h2><p class="count">Every import, change, analysis record, download and project open, in order. Each entry carries a hash of the one before it, so edits to the history are detectable.</p>' +
    (last.length ? '<ul class="plain audit">' + last.map(function (e) { return "<li><span class=\"count\">" + esc(e.at.slice(0, 19).replace("T", " ")) + "</span> <b>" + esc(e.action) + "</b>" + (e.dataset ? " · " + esc(e.dataset) : "") + (e.detail ? '<div class="count">' + esc(e.detail) + "</div>" : "") + "</li>"; }).join("") + "</ul>" : '<p class="nd">Nothing recorded yet.</p>') +
    (AUD.verified ? '<p class="' + (AUD.verified.ok ? "how" : "warn") + '" role="status">' + (AUD.verified.ok ? "The chain of " + AUD.log.length + " entries is intact." : "Entry " + (AUD.verified.at + 1) + " does not match its hash: the history was altered.") + "</p>" : "") +
    '<div class="slot"><button type="button" class="btn" data-auver="1"' + (AUD.log.length ? "" : " disabled") + '>Verify the chain</button><button type="button" class="btn" data-auexp="1"' + (AUD.log.length ? "" : " disabled") + ">Download as CSV</button></div></section>";
}
// Methods text: sample-size items belong in Methods, not Results
var _paperHTMLW = paperHTML;
paperHTML = function (forFile) {
  var plans = WP.items.filter(function (it) { return it.kind === "plan"; }); if (!plans.length) return _paperHTMLW(forFile);
  var keep = WP.items; WP.items = WP.items.filter(function (it) { return it.kind !== "plan"; });
  var h; try { h = WP.items.length ? _paperHTMLW(forFile) : "<h1 class=\"ptitle\">" + esc(WP.title) + '</h1><p class="pmeta">Draft prepared with EKM · ' + today() + "</p><h2>Methods</h2><p></p>"; } finally { WP.items = keep; }
  var add = plans.map(function (it) { return esc(plain(it.reading[0] || "")); }).join(" ") + (forFile ? "" : ' <button type="button" class="linkbtn" data-wprmplan="1">Remove</button>');
  return h.replace(/(<h2>Methods<\/h2><p>)/, "$1" + add + " ");
};
var _writeupViewW = VIEWS.writeup;
VIEWS.writeup = function () { var h = _writeupViewW(); var cards = workflowCard() + auditCard(); return /<div class="aside">/.test(h) ? h.replace(/(<div class="aside">)/, "$1" + cards) : h + '<div class="agrid"><div class="amain"></div><div class="aside">' + cards + "</div></div>"; };
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset;
  if (d.wfadd) { var ds = cur(); if (ds) wfAdd(ds, LAST_R); return; }
  if (d.wfrm != null) { WF.steps.splice(+d.wfrm, 1); WF.results = null; render(); return; }
  if (d.wfopen != null) { var s2 = WF.steps[+d.wfopen], ds2 = A.sets.filter(function (x) { return x.id === s2.dsId; })[0]; if (!ds2) { WF.msg = "Open “" + s2.dsName + "” first."; render(); return; } A.cur = ds2.id; A.kind = s2.kind; A.sel = clone(s2.sel); nav("analyze"); return; }
  if (d.wfrun) { wfRerun(); var ok = WF.results.filter(function (r) { return r.status === "same"; }).length; WF.msg = ok + " of " + WF.results.length + " steps reproduced exactly" + (ok < WF.results.length ? "; see the notes on the others." : "."); render(); refocus("[data-wfrun]"); return; }
  if (d.wfexp) {
    if (d.wfexp === "json") saveFile("ekm-workflow-" + today() + ".json", JSON.stringify({format: "ekm-workflow", version: 1, created: new Date().toISOString(), steps: WF.steps}, null, 2));
    else saveFile("ekm-workflow-" + today() + (d.wfexp === "py" ? ".py" : ".R"), wfScript(d.wfexp));
    WF.msg = "Save Original data (CSV) beside the script. Exact replay uses the embedded EKM engine through Node.js, with the recorded cleaning steps, filters and seeds. Python needs its standard library; R also needs jsonlite. Every reported summary is checked against the recorded result."; render(); return;
  }
  if (d.wfdata) {
    var seen = Object.create(null);
    WF.steps.forEach(function (s3) { if (seen[s3.dsId]) return; seen[s3.dsId] = 1; var ds3 = A.sets.filter(function (x) { return x.id === s3.dsId; })[0]; if (!ds3) return; saveFile(slug(s3.dsName) + "-original.csv", originalCSV(ds3)); });
    WF.msg = "Saved unmodified source values and headers, including all sensitive original columns. Keep the CSV beside the script."; render(); return;
  }
  if (d.auver) { AUD.verified = auditVerify(); render(); return; }
  if (d.auexp) { saveFile("ekm-audit-" + today() + ".csv", "time,who,action,dataset,data fingerprint,detail,previous hash,hash\n" + AUD.log.map(function (e) { return [e.at, e.who, e.action, e.dataset, e.fp, e.detail, e.prev, e.hash].map(function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\n") + "\n"); return; }
  if (d.wprmplan) { WP.items = WP.items.filter(function (it) { return it.kind !== "plan"; }); wpSave(); render(); return; }
});
view.addEventListener("change", function (e) {
  var t = e.target; if (t.id !== "wffile" || !t.files || !t.files[0]) return;
  t.files[0].text().then(function (txt) { var w = JSON.parse(txt); if (!w || w.format !== "ekm-workflow" || !Array.isArray(w.steps)) throw 0; var v = validateProject({format: "ekm-project", version: 1, datasets: [], writeup: {items: []}, workflow: w.steps}); WF.steps = WF.steps.concat(v.workflow); WF.results = null; WF.msg = "Loaded " + v.workflow.length + " steps. Open the matching datasets, then Rerun and check."; auditLog("Loaded workflow", null, v.workflow.length + " steps"); render(); })
    .catch(function () { WF.msg = "That file is not an EKM workflow."; render(); });
});
