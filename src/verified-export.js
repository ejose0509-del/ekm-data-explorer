// ASCII JSON literals avoid interpreter line-buffer splits inside UTF-8 characters.
function replayLiteral(text) { var encoded = JSON.stringify(text), out = ""; for (var i = 0; i < encoded.length; i++) { var n = encoded.charCodeAt(i); out += n > 127 ? String.fromCharCode(92) + "u" + ("0000" + n.toString(16)).slice(-4) : encoded[i]; } return q(out); }
function rReplayLiteral(text) { var encoded = JSON.parse(replayLiteral(text)), chunks = []; for (var i = 0; i < encoded.length; i += 3000) chunks.push(q(encoded.slice(i, i + 3000))); return "paste0(" + chunks.join(",\n") + ")"; }
// Exact model replay: Python/R orchestrate the same versioned numerical engine in Node.
// scikit-learn's RNGs and tree defaults differ; equivalent estimators are not exact replay.
function replayProgram(stp, cols) {
  var spec = {sel: stp.sel, cols: cols, expected: stp.summary};
  var helpers = [amin, amax, idxOf, isNum, validDateValue, modelSetup, foldsFor, pickRows, tune, fitModel, scoreOf, mainMetric, crossValidate, syncCV].map(function (f) { return f.toString(); }).join("\n");
  return EKM_METHOD_SOURCE + "\n" + helpers + "\n" +
    "var fs = require('fs'), window = globalThis, spec = " + JSON.stringify(spec) + ";\n" +
    "var input = JSON.parse(fs.readFileSync(0, 'utf8')), A = {sel: spec.sel};\n" +
    "function filterRows(ds) { var j=-1; ds.cols.forEach(function(c,i){if(c.tags&&c.tags.role==='rowtag'&&/tag/i.test(c.name))j=i;}); return A.sel.keepExcluded||j<0 ? ds.rows : ds.rows.filter(function(r){return r[j]!=='Exclude';}); }\n" +
    "var ds = {cols: spec.cols, rows: input.rows}, setup = modelSetup(ds);\n" +
    "if (setup.err) throw new Error(setup.err);\n" +
    "var result = syncCV(setup, A.sel.mm, A.sel.mv);\n" +
    "if (!result || result.err) throw new Error(result && result.err || 'Validation failed');\n" +
    "var metric = mainMetric(setup), values = result.folds.map(function (f) { return f[metric[0]]; }), mean = S.mean(values);\n" +
    "var sd = values.length > 1 ? Math.sqrt(values.reduce(function (a, v) { return a + (v - mean) * (v - mean); }, 0) / (values.length - 1)) : null;\n" +
    "if (values.length!==result.nFolds||values.some(function(v){return !isFinite(v);})||!isFinite(mean)) throw new Error('Undefined validation score; all requested folds must be valid');\n" +
    "var actual = {cv_mean: mean, folds: result.nFolds}; if (sd != null) actual.cv_sd = sd;\n" +
    "Object.keys(actual).forEach(function (k) { var want = spec.expected[k]; if (typeof want === 'number' && Math.abs(want - actual[k]) > 1e-9 * Math.max(1, Math.abs(want))) throw new Error('Replay differs for ' + k + ': recorded ' + want + ', computed ' + actual[k]); });\n" +
    "console.log(JSON.stringify({verified: true, metric: metric[1], cv_mean: mean, cv_sd: sd, classes: setup.classes, folds: result.nFolds, sizes: result.sizes, overall: result.overall}));\n";
}
function replayCols(stp) {
  var ds = A.sets.filter(function (d) { return d.id === stp.dsId; })[0] || cur();
  var cols = stp.cols || (ds && ds.cols);
  if (!cols) throw new Error("Open the recorded dataset before exporting a model.");
  return cols.map(function (c) { return {name: c.name, type: c.type, tags: c.tags || null}; });
}
function exactModelScript(stp, lang) {
  var cols = replayCols(stp), code = replayProgram(stp, cols), names = cols.map(function (c) { return c.name; });
  if (lang === "py") return [
    "# Exact EKM model replay. Requires Node.js on PATH; no network or model service.",
    "# Encodings, folds, time gaps, tuning and random seeds use the embedded engine.",
    "import json, subprocess, tempfile, os", pyMask(stp.sel),
    "_engine = json.loads(" + replayLiteral(code) + ")",
    "_rows = d[" + JSON.stringify(names) + "].astype(object).where(pd.notna(d[" + JSON.stringify(names) + "]), None).values.tolist()",
    "_wire = json.dumps({'rows': _rows}, allow_nan=False, default=str)",
    "_fd, _path = tempfile.mkstemp(suffix='.js')",
    "try:\n    with os.fdopen(_fd, 'w', encoding='utf-8') as _f:\n        _f.write(_engine)\n    _run = subprocess.run(['node', _path], input=_wire, capture_output=True, text=True)\n    if _run.returncode:\n        raise RuntimeError('EKM replay failed or differs from the recorded result: ' + _run.stderr)\n    _verified = json.loads(_run.stdout)\n    print(_verified)\nfinally:\n    os.unlink(_path)"
  ].join("\n");
  return ["# Exact EKM model replay. Requires Node.js and jsonlite; no network.", "library(jsonlite)", rMask(stp.sel),
    ".engine <- jsonlite::fromJSON(" + rReplayLiteral(code) + ")", ".path <- tempfile(fileext = '.js')", "writeLines(.engine, .path, useBytes = TRUE)",
    ".rows <- lapply(seq_len(nrow(d)), function(i) unname(lapply(d[i, c(" + names.map(q).join(", ") + "), drop = FALSE], function(v) if (is.na(v)) NULL else v[[1]])))",
    ".wire <- jsonlite::toJSON(list(rows = .rows), auto_unbox = TRUE, na = 'null', null = 'null', digits = NA)",
    ".answer <- system2('node', shQuote(.path), input = .wire, stdout = TRUE, stderr = TRUE)", "unlink(.path)",
    "if (!is.null(attr(.answer, 'status')) && attr(.answer, 'status') != 0) stop(paste('EKM replay failed or differs:', paste(.answer, collapse = '\\n')))",
    "print(jsonlite::fromJSON(paste(.answer, collapse = '\\n')))"].join("\n");
}
var _verifiedPy = pyAnalysis, _verifiedR = rAnalysis;
pyAnalysis = function (stp) { return stp.kind === "model" ? exactModelScript(stp, "py") : _verifiedPy(stp); };
rAnalysis = function (stp) { return stp.kind === "model" ? exactModelScript(stp, "r") : _verifiedR(stp); };

// Whole workflows replay the actual import/cleaning/analysis implementation instead
// of approximate translations whose package defaults can change the conclusion.
function workflowReplayProgram(step) {
  var spec = {kind: step.kind, sel: step.sel, recipe: step.recipe || [], summary: step.summary, sourceCols: step.sourceCols, sourceHeaders: step.sourceHeaders, importOptions: step.importOptions || {decimal: ".", missing: "blank"}, fp: step.fp, replayFp: step.replayFp, replayColumns: step.replayColumns, sourceFp: step.sourceFp, name: step.dsName};
  return 'var fs=require("fs"), window=globalThis, innerWidth=1440, navigator={}, location={hash:""}, history={replaceState:function(){}};\n' +
    'function element(){return {addEventListener:function(){},querySelectorAll:function(){return [];},querySelector:function(){return null;},classList:{add:function(){},remove:function(){}},style:{},setAttribute:function(){},innerHTML:"",contains:function(){return false;}};}\n' +
    'var document={getElementById:element,querySelectorAll:function(){return [];},querySelector:function(){return null;},createElement:element,documentElement:element(),body:element(),addEventListener:function(){}};\n' +
    'var localStorage={getItem:function(){return null;},setItem:function(){},removeItem:function(){}};\n' +
    'window.addEventListener=function(){};window.scrollTo=function(){};window.matchMedia=function(){return {matches:false};};window.fetch=function(){throw new Error("Network is disabled during replay");};\n' +
    'var EKM_STATS_SOURCE="", EKM_METHOD_SOURCE="";\n' + EKM_REPLAY_SOURCE + '\n' +
    'var spec=' + JSON.stringify(spec) + ', input=JSON.parse(fs.readFileSync(0,"utf8"));\n' +
    'if([".",","].indexOf(spec.importOptions.decimal)<0||["blank","tokens"].indexOf(spec.importOptions.missing)<0)throw new Error("Invalid recorded import settings");IMPORT.decimal=spec.importOptions.decimal;IMPORT.missing=spec.importOptions.missing;\n' +
    'var ds=makeSet(spec.name,input.header,input.body);A.sets=[ds];A.cur=ds.id;PROJECT.remember=false;\n' +
    'if(spec.sourceCols){if(JSON.stringify(input.header)!==JSON.stringify(spec.sourceHeaders||spec.sourceCols.map(function(c){return c.name;})))throw new Error("Original data columns differ from recorded source");ds.cols=spec.sourceCols;ds.rows=input.body.map(function(r){return ds.cols.map(function(c,j){if(r.length!==ds.cols.length)throw new Error("Source row width differs from recorded schema");var v=importedValue(r[j],spec.importOptions);if(isMissing(v))return null;if(isNum(c)){var n=parseNum(v);if(typeof n!=="number"||!isFinite(n))throw new Error("Invalid numeric source value in "+c.name);return n;}return String(v);});});}\n' +
    'if(spec.sourceFp&&dataFingerprint(ds)!==spec.sourceFp)throw new Error("Original data values differ from recorded source");\n' +
    'spec.recipe.forEach(function(step){var result=replayStep(ds,step);if(!result||!result.rows)throw new Error("Cannot replay data step: "+step.op);ds.rows=result.rows;if(result.cols)ds.cols=result.cols;ds.recipe=(ds.recipe||[]).concat([step]);});\n' +
    'verifyWorkingReplay(ds,spec);\n' +
    'A.kind=spec.kind;A.sel=spec.sel;MOD.force=true;var result=runAnalysis(ds);if(result.valid===false||!result.reading.length)throw new Error(result.reason||"No valid result");\n' +
    'var differences=[];sameNumbers(spec.summary,result.summary,"",differences);if(differences.length)throw new Error("Replay differs from recorded result: "+differences.join("; "));\n' +
    'var output={verified:true,kind:spec.kind,summary:result.summary};if(spec.kind==="missing"&&(A.sel.mix||[]).length){runMI(ds);output.imputation=MI.res;}\n' +
    'console.log(JSON.stringify(output));\n';
}
wfScript = function (lang) {
  var py = lang === "py", out = [py ? '# EKM verified workflow replay. Python 3 standard library + Node.js on PATH.\nimport csv, json, subprocess, tempfile, os' : '# EKM verified workflow replay. R + jsonlite + Node.js on PATH.\nlibrary(jsonlite)'];
  WF.steps.forEach(function (step, i) {
    var engine = workflowReplayProgram(step), filename = slug(step.dsName) + '-original.csv';
    out.push('# Step ' + (i + 1) + ': ' + String(step.test).replace(/[\r\n]/g, ' ') + '\n# Original inputs are fingerprinted exactly. New computed numeric columns are checked cell by cell with relative tolerance 1e-12 + absolute 1e-300; all other cells are fingerprinted exactly. Summaries have relative/absolute 1e-9 checks. Changed results fail explicitly.');
    if (py) out.push('_engine = json.loads(' + replayLiteral(engine) + ')' ,
      'with open(' + q(filename) + ', newline="", encoding="utf-8-sig") as _f:\n    _table = list(csv.reader(_f))',
      '_wire = json.dumps({"header": _table[0], "body": _table[1:]}, allow_nan=False)',
      '_fd, _path = tempfile.mkstemp(suffix=".js")',
      'try:\n    with os.fdopen(_fd, "w", encoding="utf-8") as _f:\n        _f.write(_engine)\n    _run = subprocess.run(["node", _path], input=_wire, capture_output=True, text=True)\n    if _run.returncode:\n        raise RuntimeError(_run.stderr)\n    print(json.dumps(json.loads(_run.stdout), indent=2))\nfinally:\n    os.unlink(_path)');
    else out.push('.engine <- jsonlite::fromJSON(' + rReplayLiteral(engine) + ')' ,
      '.data <- read.csv(' + q(filename) + ', colClasses = "character", check.names = FALSE, na.strings = character(), strip.white = FALSE, blank.lines.skip = FALSE, stringsAsFactors = FALSE, fileEncoding = "UTF-8")',
      '.rows <- lapply(seq_len(nrow(.data)), function(i) unname(as.list(.data[i, , drop = FALSE])))',
      '.wire <- toJSON(list(header = as.list(names(.data)), body = .rows), auto_unbox = TRUE, na = "null", null = "null", digits = NA)',
      '.path <- tempfile(fileext = ".js"); writeLines(.engine, .path, useBytes = TRUE)',
      '.answer <- system2("node", shQuote(.path), input = .wire, stdout = TRUE, stderr = TRUE); unlink(.path)',
      'if (!is.null(attr(.answer, "status")) && attr(.answer, "status") != 0) stop(paste(.answer, collapse = "\\n"))',
      'print(fromJSON(paste(.answer, collapse = "\\n")))');
  });
  return out.join('\n\n') + '\n';
};
