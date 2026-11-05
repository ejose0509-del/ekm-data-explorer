// ---------- Write-up: results collected into a draft paper, with a plain summary, limits and an offline reporting review ----------
var WP = {title: "Results", items: [], loaded: false, review: null, msg: ""};
function wpSave() {
  if (!ST.on || !ST.db || !ST.uid) return;
  var data = {kind: "writeup", title: WP.title, items: WP.items}, txt = JSON.stringify(data);
  if (txt.length > 240000) data.items = WP.items.map(function (it) { return Object.assign({}, it, {fig: ""}); });
  ST.db.collection("data/users/" + ST.uid).doc("writeup").set(data).catch(function () {});
}
function wpLoad() {
  if (WP.loaded || !ST.on || !ST.db || !ST.uid) return; WP.loaded = true;
  ST.db.collection("data/users/" + ST.uid).doc("writeup").get().then(function (s) { if (s.exists) { var d = s.data(); WP.title = d.title || WP.title; WP.items = (d.items || []).concat(WP.items.filter(function (x) { return !(d.items || []).some(function (y) { return y.id === x.id; }); })); if (st.tab === "writeup") render(); } }).catch(function () {});
}
function addToPaper(ds, R) {
  var svg = firstChart();
  WP.items.push({id: Date.now().toString(36), at: new Date().toISOString(), dataset: ds.name, rows: ds.rows ? ds.rows.length : ds.nRows, source: ds.source || "", kind: A.kind, test: R.summary.test || KIND_HELP[A.kind].split(" (")[0], title: caption(ds), apa: R.apa || "", reading: R.reading.slice(0, 8), caveats: R.caveats.slice(0, 8), evidence: localEvidence(ds, R), p: R.summary.p != null ? R.summary.p : R.summary.p_model, n: R.summary.n || null, fig: svg ? svgText(svg, true) : ""});
  WP.review = null; wpSave(); XP.msg = "Added to the write-up (" + WP.items.length + " result" + (WP.items.length === 1 ? "" : "s") + ")."; render();
}
function firstSentence(h) { var t = plain(h); var m = /^(.+?[.!?])(\s|$)/.exec(t); return m ? m[1] : t; }
function limitations() {
  var out = [], tests = WP.items.filter(function (it) { return it.p != null; }), sig = tests.filter(function (it) { return it.p < 0.05; }), seen = Object.create(null);
  if (tests.length >= 3) out.push(tests.length + " tests were run; at α = .05, about " + (tests.length * 0.05).toFixed(1) + " clear result" + (tests.length * 0.05 >= 1.5 ? "s" : "") + " would be expected by chance alone. " + (sig.length ? sig.length + " reached p < .05; consider a correction (for example Holm) before treating each as confirmed." : ""));
  var small = WP.items.filter(function (it) { return it.n && it.n < 30; }); if (small.length) out.push(small.length + " analys" + (small.length === 1 ? "is uses" : "es use") + " fewer than 30 rows, so estimates are imprecise.");
  WP.items.forEach(function (it) { it.reading.concat(it.caveats).forEach(function (c) { var t = plain(c); if (/not normally distributed|not normal|spreads differ|overfit|extrapolat|carried forward|small expected/i.test(t)) { var k = t.slice(0, 60); if (!seen[k]) { seen[k] = 1; out.push(t); } } }); });
  WP.items.forEach(function (it) { it.caveats.forEach(function (c) { var t = plain(c); if (/causation|confound|left out/i.test(t) && !seen.causal) { seen.causal = 1; out.push("These are observational associations; none of the results shows cause and effect, and unmeasured factors may explain them."); } }); });
  return out;
}
function paperHTML(forFile) {
  var methods = [], used = Object.create(null);
  WP.items.forEach(function (it) { if (!used[it.test]) { used[it.test] = 1; methods.push(it.test); } });
  var data = []; WP.items.forEach(function (it) { if (data.indexOf(it.dataset) < 0) data.push(it.dataset); });
  var figN = 0, res = WP.items.map(function (it, i) {
    var fig = it.fig ? (++figN, '<figure class="pfig">' + it.fig + "<figcaption><b>Figure " + figN + ".</b> " + esc(it.title) + ".</figcaption></figure>") : "";
    return '<section class="pitem"><h3>' + esc(it.title) + "</h3><p>" + it.reading.map(plain).map(esc).join(" ") + (it.apa ? " (" + it.apa + ")." : "") + (fig ? " See Figure " + figN + "." : "") + "</p>" + fig +
      (forFile ? "" : '<div class="pctl" role="group" aria-label="Arrange this result"><button type="button" class="btn" data-wpup="' + i + '"' + (i ? "" : " disabled") + '>Move up</button><button type="button" class="btn" data-wpdown="' + i + '"' + (i < WP.items.length - 1 ? "" : " disabled") + '>Move down</button><button type="button" class="btn" data-wprm="' + i + '">Remove</button></div>') + "</section>";
  }).join("");
  var lim = limitations();
  return "<h1 class=\"ptitle\">" + esc(WP.title) + '</h1><p class="pmeta">Draft prepared with EKM · ' + today() + "</p>" +
    "<h2>Summary in plain language</h2><p>" + WP.items.map(function (it) { return esc(it.plainLead || firstSentence(it.reading[0] || "")); }).join(" ") + "</p>" +
    "<h2>Methods</h2><p>Data: " + data.map(esc).join("; ") + ". Analyses: " + methods.map(esc).join("; ") + ". Calculations ran in EKM; its statistical implementations are checked against SciPy. Only the analyses listed above are included; see each result for its available statistics.</p>" +
    "<h2>Results</h2>" + res + (lim.length ? "<h2>Limitations</h2><ul>" + lim.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "");
}
// Offline review and self-check rules are supplied by assistant.js.
function writeupView() {
  wpLoad();
  if (!WP.items.length) return '<h1 class="vt">Write-up</h1><p class="lede">Collect results into a draft results section. Run an analysis, then press Add to write-up under it. EKM writes the plain-language summary, methods and limitations, numbers the figures and offers an offline review of reporting gaps.</p>' +
    '<p class="slot"><a class="btn btn-primary" href="#analyze" data-go="analyze">Go to Analyze</a></p><div class="paper ghost" aria-hidden="true"><p class="ghost-line w60"></p><p class="ghost-line w90"></p><p class="ghost-line w85"></p><p class="ghost-line w75"></p><div class="ghost-fig">Figure 1</div><p class="ghost-line w90"></p><p class="ghost-line w60"></p></div>';
  return '<h1 class="vt">Write-up</h1><div class="toolbar"><label class="field" for="wptitle">Title<input id="wptitle" maxlength="120" value="' + esc(WP.title) + '"></label></div>' +
    '<div class="agrid"><div class="amain"><article class="paper">' + paperHTML(false) + "</article>" +
    '<div class="tools" role="group" aria-label="Save the write-up"><span class="label">Save the draft</span><button type="button" class="btn" data-wpexp="doc">For Word (.doc)</button><button type="button" class="btn" data-wpexp="html">Web page (.html)</button><button type="button" class="btn" data-wpcopy="1">Copy text</button>' + (XP.msg ? '<span class="count" role="status">' + esc(XP.msg) + "</span>" : "") + "</div></div>" +
    '<div class="aside"><section class="card"><h2>Self-check</h2>' + selfCheck() + '</section>' + reviewPanel() + "</div></div>";
}
GROUPS.writeup = ["writeup"]; VIEWS.writeup = writeupView;
var _toolsBar = toolsBar;
toolsBar = function (ds, R) { return _toolsBar(ds, R).replace('<button type="button" class="btn" data-share="1">', '<button type="button" class="btn btn-primary" data-paper="1">Add to write-up</button><button type="button" class="btn" data-share="1">'); };
function paperFile() { return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(WP.title) + "</title><style>body{font:15px/1.6 Georgia,serif;color:#1b2620;max-width:760px;margin:40px auto;padding:0 20px}h1{font-size:26px}h2{font-size:18px;margin-top:28px}h3{font-size:16px;margin:18px 0 6px}.pmeta{color:#5b6862;font-size:13px}figure{margin:12px 0}svg{max-width:100%;height:auto}figcaption{font-size:13px}</style></head><body>" + paperHTML(true) + "</body></html>"; }
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset;
  if (d.paper && LAST_R) { addToPaper(cur(), LAST_R); return; }
  if (st.tab !== "writeup") return;
  if (d.wpup != null) { var i = +d.wpup, t = WP.items[i]; WP.items[i] = WP.items[i - 1]; WP.items[i - 1] = t; WP.review = null; wpSave(); render(); return; }
  if (d.wpdown != null) { var j = +d.wpdown, u = WP.items[j]; WP.items[j] = WP.items[j + 1]; WP.items[j + 1] = u; WP.review = null; wpSave(); render(); return; }
  if (d.wprm != null) { WP.items.splice(+d.wprm, 1); WP.review = null; wpSave(); render(); return; }
  if (d.wpexp) return saveFile(slug(WP.title) + (d.wpexp === "doc" ? ".doc" : ".html"), paperFile());
  if (d.wpcopy) { var x = document.createElement("div"); x.innerHTML = paperHTML(true); var txt = x.innerText || x.textContent; try { navigator.clipboard.writeText(txt).then(function () { b.textContent = "Copied"; }, function () { b.textContent = "Select and copy the text"; }); } catch (err) { b.textContent = "Select and copy the text"; } return; }
  if (d.wpr2) { reviewWriteup(); return; }
});
view.addEventListener("change", function (e) { if (e.target.id === "wptitle") { WP.title = e.target.value.trim() || "Results"; wpSave(); render(); } });
