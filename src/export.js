// ---------- Export (figures, reports, data, steps) and results shared with the team ----------
var XP = {msg: "", shares: [], shareOn: false, shareView: null};
function today() { return new Date().toISOString().slice(0, 10); }
function slug(s) { return String(s || "ekm").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ekm"; }
function saveFile(filename, data) {
  if (!window.claude || !window.claude.use) { XP.msg = "Downloads work when the page is opened in Claude."; render(); return; }
  window.claude.use("downloads").then(function (dl) {
    if (!dl) throw {code: "off"};
    return dl.save({filename: filename, data: data});
  }).then(function () { XP.msg = "Saved " + filename + "."; render(); })
    .catch(function (e) { XP.msg = e && e.code === "cancelled" ? "Download cancelled." : e && e.code === "off" ? "Downloads are not available in this view." : "Could not save the file."; render(); });
}
// A chart as a standalone SVG: theme colours written in, on the board or on white paper
var PAPER = {"--board": "#ffffff", "--board-2": "#ffffff", "--chalk": "#1b2620", "--chalk-2": "#3e4b44", "--chalk-3": "#5b6862", "--blue": "#1f5fa8", "--yellow": "#a86b00", "--pink": "#b0346a", "--green": "#2e7d32", "--orange": "#b35c00", "--violet": "#5e3fa8", "--rule": "#d5dbd7"};
function svgText(svg, paper) {
  var cl = svg.cloneNode(true), src = svg.querySelectorAll("*"), dst = cl.querySelectorAll("*"), root = getComputedStyle(document.documentElement), swap = {};
  if (paper) Object.keys(PAPER).forEach(function (k) { var v = root.getPropertyValue(k).trim(), c = document.createElement("i"); c.style.color = v; document.body.appendChild(c); swap[getComputedStyle(c).color] = PAPER[k]; c.remove(); });
  var fix = function (v) { return paper && swap[v] ? swap[v] : v; };
  [svg].concat([].slice.call(src)).forEach(function (el, i) {
    var cs = getComputedStyle(el), d = i ? dst[i - 1] : cl;
    ["fill", "stroke"].forEach(function (p) { var v = cs.getPropertyValue(p); if (v && v !== "none") d.setAttribute(p, fix(v)); else if (v === "none") d.setAttribute(p, "none"); });
    if (cs.opacity !== "1") d.setAttribute("opacity", cs.opacity);
    if (el.tagName === "text") { d.setAttribute("font-family", cs.fontFamily); d.setAttribute("font-size", cs.fontSize); d.setAttribute("font-style", cs.fontStyle); }
    d.removeAttribute("class");
  });
  var vb = (svg.getAttribute("viewBox") || "0 0 640 320").split(" ");
  cl.setAttribute("xmlns", "http://www.w3.org/2000/svg"); cl.setAttribute("width", vb[2]); cl.setAttribute("height", vb[3]);
  var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect"); bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", paper ? "#ffffff" : getComputedStyle(document.body).backgroundColor); cl.insertBefore(bg, cl.firstChild);
  return new XMLSerializer().serializeToString(cl);
}
function svgToPng(text, w, h) {
  return new Promise(function (ok, no) {
    var img = new Image(), url = URL.createObjectURL(new Blob([text], {type: "image/svg+xml"}));
    img.onload = function () { var c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2; var g = c.getContext("2d"); g.scale(2, 2); g.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); c.toBlob(function (b) { b ? ok(b) : no(); }, "image/png"); };
    img.onerror = no; img.src = url;
  });
}
function firstChart() { return view.querySelector(".poster .achart, .chartwrap .achart"); }
function exportChart(kind, paper) {
  var svg = firstChart(); if (!svg) { XP.msg = "There is no chart to save yet."; render(); return; }
  var t = svgText(svg, paper), vb = svg.getAttribute("viewBox").split(" "), name = slug(cur().name) + "-" + (A.kind || "chart") + (paper ? "" : "-board");
  if (kind === "svg") saveFile(name + ".svg", t);
  else svgToPng(t, +vb[2], +vb[3]).then(function (b) { saveFile(name + ".png", b); }).catch(function () { XP.msg = "Could not draw the PNG; try SVG."; render(); });
}
// A one-page report on white paper, readable in any browser or in Word
function reportHTML(ds, R) {
  var svg = firstChart(), fig = svg ? svgText(svg, true) : "", math = (view.querySelector(".poster .math") || {}).innerHTML || "";
  var head = (R.head || "").replace(/ class="[^"]*"/g, ""), strip = function (h) { return h.replace(/<button[\s\S]*?<\/button>/g, ""); };
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(ds.name) + " – " + esc(KIND_HELP[A.kind].split(" (")[0]) + "</title>" +
    "<style>body{font:15px/1.55 Georgia,'STIX Two Text',serif;color:#1b2620;max-width:760px;margin:40px auto;padding:0 20px}h1{font-size:26px;margin:0 0 4px}h2{font-size:17px;margin:26px 0 8px;border-bottom:1px solid #ccd3cf;padding-bottom:4px}" +
    ".meta{color:#5b6862;font-size:13px}table{border-collapse:collapse;font:13px Arial,sans-serif;margin:8px 0}td,th{border-bottom:1px solid #d5dbd7;padding:5px 10px 5px 0;text-align:left}" +
    ".figs,.fig{display:inline-block;margin-right:18px}span{display:block;font:12px Arial,sans-serif;color:#5b6862}b{font:600 17px Arial,sans-serif}.apa{background:#f3f5f4;padding:10px 12px;border-radius:4px}svg{max-width:100%;height:auto}</style></head><body>" +
    "<h1>" + esc(ds.name) + '</h1><p class="meta">' + esc(KIND_HELP[A.kind]) + " · " + (ds.rows ? ds.rows.length : ds.nRows) + " rows" + (ds.source ? " · Source: " + esc(ds.source) : "") + " · " + today() + "</p>" +
    "<h2>1 Method</h2><p>" + esc(R.summary.test || KIND_HELP[A.kind]) + ".</p>" + (math ? "<div>" + math + "</div>" : "") +
    "<h2>2 Result</h2>" + strip(head) + (fig ? "<figure>" + fig + "<figcaption><b>Fig. 1</b> " + esc(caption(ds)) + "</figcaption></figure>" : "") + strip((R.extra || "").replace(/ class="[^"]*"/g, "")) +
    "<h2>3 Conclusion</h2><ul>" + R.reading.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>" + (R.caveats.length ? "<p><b>Keep in mind</b></p><ul>" + R.caveats.map(function (t) { return "<li>" + t + "</li>"; }).join("") + "</ul>" : "") +
    (R.apa ? '<h2>Report it</h2><p class="apa">' + R.apa + "</p>" : "") +
    '<p class="meta">Prepared with EKM. Calculations ran on the analyst\'s device.</p></body></html>';
}
function csvText(ds) {
  var q = function (v) { if (v == null) return ""; var s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [ds.cols.map(function (c) { return q(c.name); }).join(",")].concat(ds.rows.map(function (r) { return r.map(q).join(","); })).join("\n") + "\n";
}
function plain(h) { var d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent.replace(/\s+/g, " ").trim(); }

// Shared with your team: text-only snapshots, one document per person, readable by everyone who can open the page
function shareStart() {
  if (XP.shareOn || !ST.on || !ST.db) return; XP.shareOn = true;
  ST.db.collection("shares").onSnapshot(function (s) {
    var all = []; s.docs.forEach(function (d) { ((d.data() || {}).items || []).forEach(function (it) { if (it && it.id) all.push(Object.assign({owner: d.id}, it)); }); });
    XP.shares = all.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).slice(0, 30); if (st.tab === "analyze") render();
  }, function () {});
}
function shareResult(ds, R) {
  if (!ST.on || !ST.db || !ST.uid) { XP.msg = "Sign in to Claude to share results with your team."; render(); return; }
  var item = {id: Date.now().toString(36), at: new Date().toISOString(), dataset: ds.name, analysis: KIND_HELP[A.kind].split(" (")[0], title: caption(ds), apa: plain(R.apa), reading: R.reading.map(plain).slice(0, 8), caveats: R.caveats.map(plain).slice(0, 6)};
  var ref = ST.db.doc("shares/" + ST.uid);
  ref.get().then(function (s) { var items = ((s.exists && s.data().items) || []).concat([item]).slice(-40); return ref.set({items: items}); })
    .then(function () { XP.msg = "Shared. Everyone who can open this page sees it under Shared with your team."; render(); })
    .catch(function (e) { XP.msg = e && e.code === "permission_denied" ? "You can view this page but not share to it. Ask the owner for access." : "Could not share. Try again."; render(); });
}
function unshare(id) { var ref = ST.db.doc("shares/" + ST.uid); ref.get().then(function (s) { return ref.set({items: ((s.exists && s.data().items) || []).filter(function (it) { return it.id !== id; })}); }).catch(function () {}); }
function sharedPanel() {
  shareStart();
  if (!XP.shares.length) return "";
  return '<section class="card"><h2>Shared with your team <span class="count">' + XP.shares.length + "</span></h2><ul class=\"plain shared\">" + XP.shares.map(function (it) {
    var open = XP.shareView === it.owner + it.id;
    return '<li><button type="button" class="linkbtn" data-shview="' + esc(it.owner + it.id) + '" aria-expanded="' + open + '">' + esc(it.title) + '</button> <span class="count">' + esc(it.dataset) + " · " + esc(String(it.at).slice(0, 10)) + "</span>" +
      (open ? '<div class="shared-body">' + (it.apa ? '<p class="apa-t">' + esc(it.apa) + "</p>" : "") + '<ul class="plain">' + (it.reading || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" + ((it.caveats || []).length ? '<div class="caveats"><h3>Keep in mind</h3><ul class="plain">' + it.caveats.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>" : "") +
        (it.owner === ST.uid ? '<button type="button" class="btn" data-unshare="' + esc(it.id) + '">Stop sharing</button>' : "") + "</div>" : "") + "</li>";
  }).join("") + "</ul></section>";
}

// The tools under a result, and the APA and next-step blocks in its conclusion
function toolsBar(ds, R) {
  return '<div class="tools" role="group" aria-label="Save or share this result"><span class="label">Save this result</span>' +
    '<button type="button" class="btn" data-exp="html">Report (.html)</button><button type="button" class="btn" data-exp="doc">For Word (.doc)</button>' +
    (R.chart ? '<button type="button" class="btn" data-exp="svg">Figure (.svg)</button><button type="button" class="btn" data-exp="png">Figure (.png)</button>' : "") +
    '<button type="button" class="btn" data-share="1">Share with your team</button>' + (XP.msg ? '<span class="count" role="status">' + esc(XP.msg) + "</span>" : "") + "</div>";
}
function conclusionExtras(R) {
  return (R.apa ? '<div class="apa"><h3>Report it (APA style)</h3><p class="apa-t">' + R.apa + '</p><button type="button" class="btn" data-copyapa="1">Copy</button></div>' : "") +
    (R.next.length ? '<div class="next"><h3>Next, you could</h3><ul class="plain">' + R.next.map(function (n, i) { return '<li><button type="button" class="linkbtn" data-next="' + i + '">' + esc(n.label) + " →</button></li>"; }).join("") + "</ul></div>" : "");
}
function askBox() {
  return '<form class="ask" id="askform" role="search"><label class="sr" for="askq">Ask a question about your data</label><input id="askq" maxlength="300" value="' + esc(A.askq || "") + '" placeholder="Ask in plain English, for example: does body_mass_g differ by species?" autocomplete="off"><button type="submit" class="btn btn-primary">Answer</button></form>' +
    (A.askmsg ? '<p class="count" role="status">' + esc(A.askmsg) + "</p>" : "");
}
var LAST_R = null;
var _runA2 = runAnalysis; runAnalysis = function (ds) { var R = _runA2(ds); LAST_R = R; return R; };

// Your data and Charts get their own save buttons
var _dataView = VIEWS.data;
VIEWS.data = function () { var h = _dataView(), ds = cur(); if (!ds || !ds.rows) return h; return h + '<div class="tools" role="group" aria-label="Save this dataset"><span class="label">Save this dataset</span><button type="button" class="btn" data-exp="csv">Data (.csv)</button>' + ((ds.recipe || []).length ? '<button type="button" class="btn" data-exp="steps">Cleaning steps (.json)</button>' : "") + (XP.msg ? '<span class="count" role="status">' + esc(XP.msg) + "</span>" : "") + "</div>"; };
var _chartsView = VIEWS.charts;
VIEWS.charts = function () { var h = _chartsView(), ds = cur(); if (!ds || !ds.rows || h.indexOf("achart") < 0) return h; return h + '<div class="tools" role="group" aria-label="Save this chart"><span class="label">Save this chart</span><button type="button" class="btn" data-exp="svg">Figure (.svg)</button><button type="button" class="btn" data-exp="png">Figure (.png)</button><button type="button" class="btn" data-exp="svgb">On the board (.svg)</button>' + (XP.msg ? '<span class="count" role="status">' + esc(XP.msg) + "</span>" : "") + "</div>"; };
var _render2 = render; render = function () { var t = st.tab; if (XP.lastTab && XP.lastTab !== t) XP.msg = ""; XP.lastTab = t; _render2(); };

view.addEventListener("submit", function (e) { if (e.target.id === "askform") { e.preventDefault(); var ds = cur(); if (ds && ds.rows) askAnswer(ds); } });
view.addEventListener("change", function (e) { var d = e.target.dataset || {}; if (d.lpred != null) { var p = A.sel.lp || []; A.sel.lp = e.target.checked ? p.concat([d.lpred]) : p.filter(function (x) { return x !== d.lpred; }); render(); } });
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset, ds = cur();
  if (d.exp) {
    if (d.exp === "csv") return saveFile(slug(ds.name) + ".csv", csvText(ds));
    if (d.exp === "steps") return saveFile(slug(ds.name) + "-steps.json", JSON.stringify({ekm: "steps", dataset: ds.name, steps: ds.recipe || []}, null, 1));
    if (d.exp === "svg" || d.exp === "png") return exportChart(d.exp, true);
    if (d.exp === "svgb") return exportChart("svg", false);
    if ((d.exp === "html" || d.exp === "doc") && LAST_R) return saveFile(slug(ds.name) + "-" + A.kind + (d.exp === "html" ? ".html" : ".doc"), reportHTML(ds, LAST_R));
  }
  if (d.share && LAST_R) return shareResult(ds, LAST_R);
  if (d.unshare) return unshare(d.unshare);
  if (d.shview) { XP.shareView = XP.shareView === d.shview ? null : d.shview; render(); return; }
  if (d.copyapa) { var t = plain((LAST_R || {}).apa); var done = function (ok) { b.textContent = ok ? "Copied" : "Select and copy the text"; }; try { navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); }); } catch (x) { done(false); } return; }
  if (d.next != null && LAST_R) { var n = LAST_R.next[+d.next]; if (!n) return; if (n.tab) { nav(n.tab); return; } A.kind = n.kind; A.sel = Object.assign({}, n.sel); A.ai = {}; A.askmsg = ""; render(); refocus('[data-akind="' + n.kind + '"]'); return; }
});
