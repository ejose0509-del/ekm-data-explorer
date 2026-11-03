// Optional same-origin bridge, available only when the user starts local_ai/server.py.
var LM = {key: '', state: '', lines: [], request: 0, question: ''};
function modelEvidence(ds, R) {
  var evidence = {};
  ['result', 'uncertainty', 'assumptions', 'pvalue', 'next'].forEach(function (topic) { evidence[topic] = localExplanation(ds, R, topic); });
  return evidence;
}
function modelKey(ds, R) { return JSON.stringify([ds.id, A.sel, R.kind, R.summary, modelEvidence(ds, R)]); }
var _localModelPanel = explanationPanel;
explanationPanel = function (ds, R) {
  var html = _localModelPanel(ds, R);
  if (!window.EKM_LOCAL) return html;
  var key = modelKey(ds, R), current = LM.key === key;
  return html + '<section class="card assistant"><h2>Local language model</h2><p class="count">Ask about the result above. The model selects evidence; EKM displays only supplied statements with their limitations. Questions and computed summaries stay on this computer. Rows are not sent.</p>' +
    '<form class="ask" id="local-model-form"><label class="field assistant-question" for="local-model-question">Question about this result<input id="local-model-question" maxlength="300" value="' + esc(LM.question) + '" placeholder="How uncertain is this result?" required></label><button type="submit" class="btn btn-primary"' + (current && LM.state === 'wait' ? ' disabled' : '') + '>Ask local model</button></form>' +
    '<div id="local-model-answer" class="assistant-answer" role="status">' + (current ? (LM.state === 'wait' ? '<p>Selecting evidence locally…</p>' : '<p class="count">' + esc(LM.state) + '</p>' + localList(LM.lines)) : '') + '</div></section>';
};
view.addEventListener('submit', function (e) {
  if (e.target.id !== 'local-model-form' || !window.EKM_LOCAL) return;
  e.preventDefault();
  var ds = cur(), R = LAST_R, question = document.getElementById('local-model-question').value.trim();
  if (!ds || !R || !question) return;
  var key = modelKey(ds, R), evidence = modelEvidence(ds, R), request = ++LM.request;
  LM.key = key; LM.question = question; LM.state = 'wait'; LM.lines = []; render();
  var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 95000);
  fetch('/api/explain', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-EKM-Token': window.EKM_LOCAL.token},
    body: JSON.stringify({question: question, evidence: evidence}), signal: ctl.signal}).then(function (r) {
    if (!r.ok) throw new Error('Local service unavailable'); return r.json();
  }).then(function (data) {
    if (request !== LM.request) return;
    // Validate again at the display boundary. Never accept arbitrary model text.
    var allowed = [].concat.apply([], Object.keys(evidence).map(function (t) { return evidence[t]; }));
    if (data.status === 'validated' && Array.isArray(data.lines) && data.lines.length && data.lines.every(function (line) { return allowed.indexOf(line) >= 0; })) {
      LM.state = 'Evidence selection validated. Text and numbers come from EKM.'; LM.lines = data.lines;
    } else if (data.status === 'refused') {
      LM.state = 'Unsupported question.'; LM.lines = ['This mode cannot establish causes or diagnoses. Ask about the displayed statistics, uncertainty, assumptions or next steps.'];
    } else throw new Error('No valid evidence selection');
  }).catch(function () {
    if (request !== LM.request) return;
    LM.state = 'Local model unavailable or response rejected. Showing the offline explanation.'; LM.lines = evidence.result;
  }).finally(function () {
    clearTimeout(timer);
    if (request === LM.request && cur() && key === modelKey(cur(), LAST_R)) { render(); refocus('#local-model-question'); }
  });
});
