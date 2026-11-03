// Same-origin loopback bridge with independent evidence validation and cancellation.
var LM = {key: '', state: '', lines: [], request: 0, question: '', ctl: null, health: 'Check connection to confirm Ollama and the configured model are available.'};
function modelEvidence(ds, R) {
  var evidence = {};
  ['result', 'uncertainty', 'assumptions', 'pvalue', 'next'].forEach(function (topic) { evidence[topic] = localExplanation(ds, R, topic); });
  return evidence;
}
function modelKey(ds, R) { return JSON.stringify([ds.id, A.sel, R.kind, R.summary, modelEvidence(ds, R)]); }
function completeModelLines(data, evidence) {
  if (!data || Object.keys(data).sort().join(',') !== 'lines,status,topic' || data.status !== 'validated' || !Object.prototype.hasOwnProperty.call(evidence, data.topic) || !Array.isArray(data.lines)) return false;
  var expected = evidence[data.topic].slice(), actual = data.lines.slice();
  if (actual.length !== expected.length) return false;
  // Multiset equality allows reordering, not omissions, duplicates or cross-topic mixing.
  return actual.every(function (line) { var i = expected.indexOf(line); if (typeof line !== 'string' || i < 0) return false; expected.splice(i, 1); return true; });
}
function cancelLocalModel() {
  LM.request++; if (LM.ctl) LM.ctl.abort(); LM.ctl = null;
  LM.state = 'Request cancelled. No model response was applied. Local inference may take a moment to release.'; LM.lines = []; render();
}
var _localModelPanel = explanationPanel;
explanationPanel = function (ds, R) {
  var html = _localModelPanel(ds, R);
  if (!window.EKM_LOCAL) return html;
  var key = modelKey(ds, R), current = LM.key === key;
  return html + '<section class="card assistant"><h2>Local language model</h2><p class="count">The model selects evidence for supported statistical questions. EKM retains all statements and limitations for that topic. Questions and computed summaries stay on this computer; rows are not sent. This mode does not run new analyses or support open-ended chat.</p>' +
    '<div class="slot"><button type="button" class="btn" data-model-health="1">Check connection</button><span class="count" id="model-health" role="status">' + esc(LM.health) + '</span></div>' +
    '<form class="ask" id="local-model-form"><label class="field assistant-question" for="local-model-question">Question about this result<input id="local-model-question" maxlength="300" value="' + esc(LM.question) + '" placeholder="How uncertain is this result?" required></label><button type="submit" class="btn btn-primary"' + (LM.ctl ? ' disabled' : '') + '>Ask local model</button>' + (LM.ctl ? '<button type="button" class="btn" data-model-cancel="1">Cancel request</button>' : '') + '</form>' +
    '<div id="local-model-answer" class="assistant-answer" role="status">' + (current ? (LM.state === 'wait' ? '<p>Selecting evidence locally…</p>' : '<p class="count">' + esc(LM.state) + '</p>' + localList(LM.lines)) : '') + '</div></section>';
};
view.addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b || !window.EKM_LOCAL) return;
  if (b.dataset.modelCancel) cancelLocalModel();
  if (b.dataset.modelHealth) {
    LM.health = 'Checking local Ollama…'; render();
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 5000);
    fetch('/health', {signal: ctl.signal}).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (data) {
      LM.health = (data.ready ? 'Ready: ' : 'Not ready: ') + String(data.model || '') + '. ' + String(data.message || '');
    }).catch(function () { LM.health = 'Local service unavailable. Start Python and Ollama, then check again.'; }).finally(function () { clearTimeout(timer); render(); });
  }
});
view.addEventListener('submit', function (e) {
  if (e.target.id !== 'local-model-form' || !window.EKM_LOCAL) return;
  e.preventDefault();
  var ds = cur(), R = LAST_R, question = document.getElementById('local-model-question').value.trim();
  if (!ds || !R || R.valid === false || !question || LM.ctl) return;
  var key = modelKey(ds, R), evidence = modelEvidence(ds, R), request = ++LM.request;
  var ctl = new AbortController(), timedout = false, timer = setTimeout(function () { timedout = true; ctl.abort(); }, 95000);
  LM.ctl = ctl; LM.key = key; LM.question = question; LM.state = 'wait'; LM.lines = []; render();
  var messages = {busy: 'The local model is busy. Try again shortly.', timeout: 'The local model timed out. Try a shorter question or a smaller model.', rejected: 'Model response rejected. Showing the offline explanation.', missing_model: 'The configured model is not installed. Check connection for setup instructions.', offline: 'Ollama is not running. Start Ollama and check connection.', unavailable: 'The local model is unavailable. Check connection and try again.'};
  fetch('/api/explain', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-EKM-Token': window.EKM_LOCAL.token}, body: JSON.stringify({question: question, evidence: evidence}), signal: ctl.signal}).then(function (r) {
    if (r.status === 429) throw new Error('busy'); if (!r.ok) throw new Error('unavailable'); return r.json();
  }).then(function (data) {
    if (request !== LM.request) return;
    if (completeModelLines(data, evidence)) { LM.state = 'Evidence selection validated. Text and numbers come from EKM.'; LM.lines = data.lines; }
    else if (data.status === 'refused') { LM.state = 'Unsupported question.'; LM.lines = ['Ask about the displayed result, uncertainty, assumptions, p-values or next steps. This mode cannot establish causes, diagnose conditions or answer unrelated questions.']; }
    else if (data.status === 'fallback') { LM.state = messages[data.code] || messages.rejected; LM.lines = evidence.result; }
    else throw new Error('rejected');
  }).catch(function (err) {
    if (request !== LM.request) return;
    LM.state = timedout ? messages.timeout : messages[err.message] || messages.unavailable; LM.lines = evidence.result;
  }).finally(function () {
    clearTimeout(timer); if (request !== LM.request) return; LM.ctl = null;
    if (cur() && key === modelKey(cur(), LAST_R)) { render(); refocus('#local-model-question'); }
    else render();
  });
});
