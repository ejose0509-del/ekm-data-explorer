// ---------- External context from the web (local mode only) ----------
// Only the words in the query box are sent, after the person presses Search. Results are shown as external,
// unverified context with their sources; page text is data, never instructions, and never changes EKM's numbers.
function searchReady() { return localMode() && window.EKM_LOCAL && window.EKM_LOCAL.search; }
function defaultQuery(p) {
  var c = p.c, n = function (x) { var m = colMeta(cur(), x); return m && sensitive(m) ? "" : (m && m.label) || x; };
  var q = {link: n(c.a) + " " + n(c.b) + " relationship study", curve: n(c.a) + " " + n(c.b) + " nonlinear relationship", group: n(c.b) + " differences by " + n(c.a), assoc: n(c.a) + " " + n(c.b) + " association", trend: n(c.b) + " trend over time", reversal: n(c.a) + " " + n(c.b) + " Simpson's paradox " + n(c.g), subgroup: n(c.b) + " subgroup differences study", cluster: (p.cl ? p.cl.use.slice(0, 3).map(n).join(" ") : "") + " profiles clusters", unusual: (p.un ? p.un.drive.map(function (d) { return n(d[0]); }).join(" ") : "") + " outliers"}[c.type] || "";
  return q.replace(/\s+/g, " ").trim();
}
function webPanel(p, i) {
  var w = DSC.web[i], prov = searchReady() ? window.EKM_LOCAL.search : "";
  if (!localMode()) return '<div class="webctx"><p class="count">Web context runs in EKM\'s local mode, because pages opened elsewhere cannot reach the web. Start it with <code>python3 local_ai/server.py --search-provider brave</code> (or tavily, or searxng) and open the address it prints. Only the search words are sent. Review them for sensitive names or values before searching.</p></div>';
  if (!prov) return '<div class="webctx"><p class="count">Local mode is running without a search provider. Restart it with a provider, for example <code>EKM_SEARCH_KEY=… python3 local_ai/server.py --search-provider brave</code>. See README → Web context.</p></div>';
  return '<div class="webctx"><label class="field" for="wq' + i + '">Search words (only these are sent to ' + esc(prov) + ')<input id="wq' + i + '" data-wq="' + i + '" value="' + esc(w.query) + '" maxlength="200"></label><div class="slot"><button type="button" class="btn" data-wsearch="' + i + '"' + (w.busy ? " disabled" : "") + '>Search</button><button type="button" class="btn" data-wsearch="' + i + '" data-deep="1"' + (w.busy ? " disabled" : "") + ">Search and read the top pages</button>" + (w.busy ? '<span class="count" role="status">Searching…</span>' : "") + "</div>" +
    (w.msg ? '<p class="warn" role="status">' + esc(w.msg) + "</p>" : "") +
    (w.results ? '<p class="count"><b>External context, not checked by EKM.</b> Judge each source yourself; these pages do not change any result.</p><ol class="webres">' + w.results.map(function (r) { return '<li><a href="' + esc(/^https?:\/\//i.test(r.url) ? r.url : "#") + '" target="_blank" rel="noopener noreferrer">' + esc(r.title || r.url) + '</a><div class="count">' + esc(r.host || "") + "</div>" + (r.snippet ? "<p>" + esc(r.snippet) + "</p>" : "") + ((r.excerpts || []).length ? '<ul class="plain excerpts">' + r.excerpts.map(function (x) { return "<li>“" + esc(x) + "”</li>"; }).join("") + "</ul>" : "") + "</li>"; }).join("") + "</ol>" : "") + "</div>";
}
function runSearch(i, deep) {
  var w = DSC.web[i]; if (!w) return; var q = ((document.getElementById("wq" + i) || {}).value || w.query).trim(); w.query = q;
  if (q.length < 3) { w.msg = "Type at least a few search words."; render(); return; }
  w.busy = true; w.msg = ""; render();
  fetch("/api/search", {method: "POST", headers: {"Content-Type": "application/json", "X-EKM-Token": window.EKM_LOCAL.token}, body: JSON.stringify({query: q, deep: !!deep})})
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Search failed."); return j; }); })
    .then(function (j) { w.results = (j.results || []).slice(0, 10); w.busy = false; if (!w.results.length) w.msg = "No results. Try different words."; auditLog("Searched the web", cur(), (deep ? "search and read: " : "search: ") + q); render(); })
    .catch(function (e) { w.busy = false; w.msg = e.message || "Search failed."; render(); });
}
view.addEventListener("change", function (e) { var t = e.target; if (t.dataset && t.dataset.wq != null && DSC.web[+t.dataset.wq]) DSC.web[+t.dataset.wq].query = t.value; });
view.addEventListener("click", function (e) { var b = e.target.closest("button[data-wsearch]"); if (!b) return; runSearch(+b.dataset.wsearch, !!b.dataset.deep); });
