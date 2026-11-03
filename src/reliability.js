// Shared validity gate: no interpretation, export or write-up for undefined results.
function invalidResult(kind, controls, message) {
  return {kind: kind, valid: false, controls: controls || '', head: '<p class="warn" role="status">' + esc(message) + '</p>', chart: '', extra: '', reading: [], caveats: [], summary: {}, apa: '', next: [], reason: message};
}
var _checkedAnalysis = runAnalysis;
runAnalysis = function (ds) {
  var c = defaults(ds), s = A.sel, rows = filterRows(ds), problem = '', controls = '';
  if (A.kind === 'relate' && c.nums.length >= 2) {
    controls = pick('x', 'First number (across)', c.nums, s.x) + pick('y', 'Second number (up)', c.nums, s.y);
    var pairs = rows.filter(function (r) { return localNumber(r[idxOf(ds, s.x)]) && localNumber(r[idxOf(ds, s.y)]); });
    if (pairs.length < 3) problem = 'Correlation needs at least three complete pairs. Choose columns with more shared observations.';
    else if ([s.x, s.y].some(function (name) { var v = getCol(ds, pairs, name); return v.every(function (x) { return x === v[0]; }); }))
      problem = 'Correlation is undefined because a selected column is constant in the complete pairs. Choose two columns that both vary. No association or confidence interval can be inferred.';
  }
  var R;
  if (problem) R = invalidResult(A.kind, controls, problem);
  else {
    try { R = _checkedAnalysis(ds); } catch (err) { R = invalidResult(A.kind, '', 'This analysis could not be calculated. Check column types, missing values and the number of independent observations.'); }
    // Undefined summaries in other inferential methods must never reach prose.
    function nonfinite(v) { return typeof v === 'number' ? !isFinite(v) : Array.isArray(v) ? v.some(nonfinite) : v && typeof v === 'object' ? Object.keys(v).some(function (k) { return nonfinite(v[k]); }) : false; }
    if (['describe', 'pivot', 'matrix'].indexOf(A.kind) < 0 && nonfinite(R.summary))
      R = invalidResult(A.kind, R.controls, 'This analysis has undefined estimates. Check for constant columns, insufficient observations or a singular model. No statistical conclusion is available.');
    if (R.valid !== false) {
      var undefinedText = function (text) { return /\b(NaN|Infinity|undefined)\b/.test(localText(text)); };
      if (undefinedText(R.head)) R = invalidResult(A.kind, R.controls, 'A required statistic is undefined for this selection. Choose columns with usable variation and enough observations.');
      else {
        if (undefinedText(R.extra)) R.extra = '<p class="count">Some supplementary checks are undefined for this selection.</p>';
        R.caveats = R.caveats.filter(function (t) { return !undefinedText(t); });
        R.reading = R.reading.filter(function (t) { return !undefinedText(t); });
        if (undefinedText(R.apa)) R.apa = '';
      }
    }
  }
  LAST_R = R; return R;
};
var _validExplanation = localExplanation;
localExplanation = function (ds, R, topic) { return R.valid === false ? [R.reason] : _validExplanation(ds, R, topic); };
var _validPaper = addToPaper;
addToPaper = function (ds, R) { if (R.valid === false || !R.reading.length) { XP.msg = 'No valid result is available to add to the write-up.'; render(); return; } return _validPaper(ds, R); };
