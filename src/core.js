// ---------- Page core: one view at a time, chosen by the tab strip ----------
var st = {tab: "data"};
var GROUPS = Object.create(null), VIEWS = Object.create(null);
var view = document.getElementById("view");
// Min and max without spreading arguments (safe for arrays of any length)
function amin(a) { var m = Infinity; for (var i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
function amax(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]; }); }
function go2(t, label) { return '<a class="more-link" href="#' + t + '" data-go="' + t + '">' + label + " →</a>"; }
function refocus(sel, alt) { var el = view.querySelector(sel) || (alt && view.querySelector(alt)); if (el) el.focus(); }
function render() {
  [].forEach.call(document.querySelectorAll("#tabs a"), function (a) { a.setAttribute("aria-current", a.getAttribute("href").slice(1) === st.tab ? "page" : "false"); });
  view.innerHTML = (VIEWS[st.tab] || VIEWS.data)();
}
function nav(t) { try { history.replaceState(null, "", "#" + t); } catch (x) {} st.tab = VIEWS[t] ? t : "data"; render(); window.scrollTo(0, 0); }
document.getElementById("tabs").addEventListener("click", function (e) { var a = e.target.closest("a"); if (!a) return; e.preventDefault(); nav(a.getAttribute("href").slice(1)); });
view.addEventListener("click", function (e) { var a = e.target.closest("a[data-go]"); if (a) { e.preventDefault(); nav(a.dataset.go); } });
