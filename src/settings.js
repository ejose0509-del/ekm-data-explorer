// ---------- Settings: local AI model, reading level, chart defaults, privacy and storage ----------
// Preferences live in this browser only (per-viewer conveniences); the local model choice is applied to the local service.
var SET = {models: null, active: "", msg: "", busy: false, search: null};
function setLoad() { try { return JSON.parse(localStorage.getItem("ekm-settings") || "{}") || {}; } catch (e) { return {}; } }
function setSave(patch) { var cur2 = setLoad(); Object.keys(patch).forEach(function (k) { cur2[k] = patch[k]; }); try { localStorage.setItem("ekm-settings", JSON.stringify(cur2)); } catch (e) {} return cur2; }
// Apply saved chart defaults now and after a project is opened
function applyChartDefaults() { var c = setLoad().chart || {}; ["pal", "font", "dpi", "width"].forEach(function (k) { if (c[k] != null && A.chart[k] == null) A.chart[k] = c[k]; }); }
applyChartDefaults();
var _restoreS = restoreProject; restoreProject = function (p) { _restoreS(p); applyChartDefaults(); };

function modelCall(path, body) { return aiPost(path, body || {}); }
function refreshModels(then) {
  if (!localMode()) return;
  SET.busy = true; render();
  modelCall("/api/models").then(function (r) { SET.models = r.models; SET.active = r.active; SET.search = r.search; SET.busy = false; SET.msg = ""; if (then) then(); render(); })
    .catch(function (e) { SET.models = []; SET.busy = false; SET.msg = e.message; render(); });
}
// Re-apply the person's preferred local model when the local service starts with a different one
if (localMode()) { var pref = setLoad().model; if (pref && pref !== window.EKM_LOCAL.model) modelCall("/api/model", {model: pref}).then(function (r) { SET.active = r.active; window.EKM_LOCAL.model = r.active; }).catch(function () {}); }

function radioRow(name, value, label, hint, checked) { return '<label class="set-choice"><input type="radio" name="' + name + '" value="' + esc(value) + '"' + (checked ? " checked" : "") + ' data-set="' + name + '"><span><b>' + esc(label) + "</b>" + (hint ? '<span class="count">' + esc(hint) + "</span>" : "") + "</span></label>"; }
function settingsView() {
  var c = A.chart, level = typeof XL !== "undefined" ? XL.level : "new", out = '<h1 class="vt">Settings</h1><p class="lede">Choose how EKM explains results, which local AI model it uses, and how charts and files are saved. These preferences stay in this browser.</p>';
  // Local AI model
  var ai = '<section class="set-sec" aria-labelledby="s-ai"><h2 id="s-ai">Local AI model</h2>';
  if (!localMode()) ai += '<p>AI features (drafting glossary terms, checking columns for personal data, choosing analyses and writing database queries) run on your own computer through <a href="https://ollama.com" target="_blank" rel="noopener noreferrer">Ollama</a>. They are off in this copy of EKM.</p><p class="count">To turn them on, install Ollama, download a model (for example <code>ollama pull qwen2.5:1.5b</code>), then start EKM\'s local mode and open the address it prints:</p><pre class="rules">python3 local_ai/server.py</pre><p class="count">Every statistic is still calculated by EKM itself. AI output is always labelled and checked.</p>';
  else {
    if (SET.models === null && !SET.busy) setTimeout(function () { refreshModels(); }, 0);
    ai += '<p class="count">Runs on this computer; your data is never sent to an online AI service. Smaller models answer faster; larger ones follow instructions more reliably.</p>';
    if (SET.busy) ai += '<p class="count" role="status">Checking your installed models…</p>';
    else if (SET.models && SET.models.length) ai += '<fieldset class="set-group"><legend class="sr-only">Model</legend>' + SET.models.map(function (m) { return radioRow("model", m.name, m.name, [m.parameters && m.parameters + " parameters", m.size_gb + " GB", m.family].filter(Boolean).join(" · ") + (m.name === SET.active ? " · in use" : ""), m.name === SET.active); }).join("") + "</fieldset>";
    else if (SET.models) ai += '<p class="warn">' + esc(SET.msg || "No local models found.") + '</p><p class="count">Install one with <code>ollama pull qwen2.5:1.5b</code>, then check again.</p>';
    ai += '<div class="slot"><button type="button" class="btn" data-setmodels="1">Check again</button></div>';
    ai += '<p class="count">Web search for Find patterns: ' + (SET.search || window.EKM_LOCAL.search ? "<b>" + esc(SET.search || window.EKM_LOCAL.search) + "</b>" : "off. Start local mode with <code>--search-provider brave</code> (or tavily, or searxng) and your key in <code>EKM_SEARCH_KEY</code>.") + "</p>";
  }
  ai += "</section>";
  // Reading level
  var read = '<section class="set-sec" aria-labelledby="s-read"><h2 id="s-read">How results are explained</h2><fieldset class="set-group"><legend class="sr-only">Reading level</legend>' +
    radioRow("level", "new", "New to statistics", "Plain-language summary first; formulas and detailed tables folded away.", level !== "researcher") +
    radioRow("level", "researcher", "Researcher", "Every test statistic, formula and table shown in full.", level === "researcher") + "</fieldset></section>";
  // Charts
  var sel = function (key, label, opts, val) { return '<label class="field" for="set_' + key + '">' + label + '<select id="set_' + key + '" data-setchart="' + key + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(val == null ? "" : val) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>"; };
  var charts = '<section class="set-sec" aria-labelledby="s-ch"><h2 id="s-ch">Charts and figures</h2><div class="toolbar">' +
    sel("pal", "Colours", [["chalk", "Chalk (screen)"], ["okabe", "Colour-blind safe"], ["gray", "Greyscale (print)"]], c.pal || "chalk") +
    sel("font", "Text size", [["sm", "Small"], ["md", "Standard"], ["lg", "Large"], ["xl", "Poster"]], c.font || "md") +
    sel("dpi", "Picture resolution", [["1", "Screen"], ["2", "Standard"], ["3", "Print (about 300 dpi)"], ["4", "High"]], String(c.dpi || 2)) +
    sel("width", "Saved width", [["", "As shown"], ["480", "One journal column"], ["960", "Full page width"], ["1400", "Slide"]], String(c.width || "")) + "</div></section>";
  // Privacy and storage
  var priv = '<section class="set-sec" aria-labelledby="s-pr"><h2 id="s-pr">Privacy and storage</h2>' +
    '<label class="chk"><input type="checkbox" id="project-remember"' + (typeof PROJECT !== "undefined" && PROJECT.remember ? " checked" : "") + '> Keep my project in this browser between visits</label>' +
    '<label class="chk"><input type="checkbox" data-incsens="1"' + (A.includeSensitive ? " checked" : "") + "> Include columns tagged personal or sensitive in CSV files I save</label>" +
    '<p class="count">Columns are tagged personal automatically when a rule is at least 90% confident (for example email, date of birth or a national ID). Full project backups always keep every column so work can be restored exactly.</p>' +
    '<div class="slot"><button type="button" class="btn" data-project-clear="1">Forget the copy saved in this browser</button></div></section>';
  var about = '<section class="set-sec" aria-labelledby="s-ab"><h2 id="s-ab">About</h2><p class="count">EKM calculates everything on this device. Its statistics are checked against SciPy, statsmodels, scikit-learn and pingouin. Includes hyparquet (MIT) and rules from NVIDIA Auto Ontology (Apache-2.0).</p></section>';
  return out + (SET.msg && SET.models !== null && SET.models.length ? '<p class="how" role="status">' + esc(SET.msg) + "</p>" : "") + read + ai + charts + priv + about;
}
GROUPS.settings = ["settings"]; VIEWS.settings = settingsView;
var _renderS = render;
render = function () { _renderS(); var l = document.querySelector(".ledge-settings"); if (l) l.setAttribute("aria-current", st.tab === "settings" ? "page" : "false"); };
view.addEventListener("change", function (e) {
  if (st.tab !== "settings") return; var t = e.target, d = t.dataset || {};
  if (d.set === "level") { XL.level = t.value; try { localStorage.setItem("ekm-level", t.value); } catch (err) {} SET.msg = "Results will be explained for " + (t.value === "new" ? "people new to statistics." : "researchers."); render(); refocus('[data-set="level"]:checked'); return; }
  if (d.set === "model") {
    SET.busy = true; render();
    modelCall("/api/model", {model: t.value}).then(function (r) { SET.active = r.active; SET.models = r.models; SET.busy = false; window.EKM_LOCAL.model = r.active; setSave({model: r.active}); SET.msg = "EKM now uses " + r.active + "."; auditLog("Changed local AI model", null, r.active); render(); })
      .catch(function (err) { SET.busy = false; SET.msg = err.message; render(); });
    return;
  }
  if (d.setchart) { var k = d.setchart, v = k === "dpi" ? +t.value : t.value; if (v === "" || v == null) delete A.chart[k]; else A.chart[k] = v; var ch = setLoad().chart || {}; if (v === "") delete ch[k]; else ch[k] = v; setSave({chart: ch}); SET.msg = "Chart default saved."; render(); refocus("#set_" + k); return; }
});
view.addEventListener("click", function (e) { var b = e.target.closest("button[data-setmodels]"); if (b && st.tab === "settings") { SET.models = null; refreshModels(); } });
document.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("a.ledge-settings"); if (a) { e.preventDefault(); nav("settings"); } });
