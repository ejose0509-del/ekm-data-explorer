// ---------- Analysis menu: kinds grouped by what they are for ----------
var KIND_GROUPS = [["Describe", ["describe", "pivot", "matrix", "missing"]], ["Compare", ["compare", "paired", "rmanova", "cross"]], ["Relate and predict", ["relate", "trend", "regress", "logistic", "mixed", "model"]], ["Measure", ["reliability", "factor", "agree"]]];
function kindMenu() {
  var label = Object.create(null), placed = Object.create(null); KINDS.forEach(function (k) { label[k[0]] = k[1]; });
  var btn = function (k) { placed[k] = 1; return '<button type="button" class="pill' + (A.kind === k ? " on" : "") + '" aria-pressed="' + (A.kind === k) + '" data-akind="' + k + '">' + esc(label[k]) + "</button>"; };
  var groups = KIND_GROUPS.map(function (g) { var ks = g[1].filter(function (k) { return label[k]; }); return ks.length ? '<div class="kg"><span class="label">' + g[0] + '</span><div class="pills">' + ks.map(btn).join("") + "</div></div>" : ""; }).join("");
  var rest = KINDS.filter(function (k) { return !placed[k[0]]; }).map(function (k) { return btn(k[0]); }).join("");
  return '<details class="analysis-picker"><summary>Analysis: ' + esc(label[A.kind] || A.kind) + ' · Change method</summary><div class="kindgroups" role="group" aria-label="Analysis">' + groups + (rest ? '<div class="kg"><span class="label">More</span><div class="pills">' + rest + "</div></div>" : "") + "</div></details>";
}
var _analyzeViewL = VIEWS.analyze;
VIEWS.analyze = function () { return _analyzeViewL().replace(/<div class="pills" role="group" aria-label="Analysis">[\s\S]*?<\/div>/, kindMenu()); };

// Keep the question assistant available without pushing the current result down.
var _askBoxL = askBox;
askBox = function () { return '<details class="assistant-fold"' + (A.askmsg ? ' open' : '') + '><summary>Ask the offline assistant</summary>' + _askBoxL() + '</details>'; };

view.addEventListener("click", function (e) {
  if (e.target.closest("[data-akind]")) refocus(".analysis-picker > summary");
});
