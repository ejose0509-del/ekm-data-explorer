// All relationship pairs are screened off the UI thread, with a yielding fallback.
var REL = {cache: new WeakMap(), baseline: new WeakMap(), current: null};
function relationshipScan(rows, indices, emit, cancelled) {
  var columns = indices.map(function (j) { return rows.map(function (r) { return r[j]; }); }), a = 0, b = 1, done = 0, total = indices.length * (indices.length - 1) / 2, matches = [], count = 0;
  function chunk() {
    if (cancelled && cancelled()) return;
    var until = Date.now() + 8;
    while (a < indices.length - 1 && Date.now() < until) {
      var co = S.screenPair(columns[a], columns[b]);
      if (co.n > 5 && Math.abs(co.r) > .9) { count++; if (matches.length < 100) matches.push({a: indices[a], b: indices[b], r: co.r}); }
      done++; b++; if (b >= indices.length) { a++; b = a + 1; }
    }
    emit({done: done, total: total, complete: done === total, matches: matches, count: count});
    if (done < total) setTimeout(chunk, 0);
  }
  chunk();
}
function stopRelationships(job) { if (!job || job.state !== 'running') return; job.state = 'cancelled'; if (job.worker) job.worker.terminate(); job.worker = null; }
// Background progress must not replace controls while people type or click.
function relationshipPanel(job) {
  var ds = cur(), status = view.querySelector('[data-relationship-status]');
  if (st.tab !== 'enhance' || !ds || REL.cache.get(ds.rows) !== job || ds.cols !== job.cols || !status) return;
  var complete = job.state === 'complete', cancelled = job.state === 'cancelled';
  status.textContent = complete ? 'Relationship scan complete: ' + job.done + ' pairs checked. Choose Show scan findings to review the results.' : cancelled ? 'Relationship scan cancelled. Column checks remain available.' : 'Relationship scan: ' + job.done + ' of ' + job.total + ' pairs checked. Column checks are available now.';
  var button = status.parentNode.querySelector('button');
  if (!button) { button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; status.parentNode.appendChild(button); }
  button.removeAttribute('data-relationship-cancel'); button.removeAttribute('data-relationship-start'); button.removeAttribute('data-relationship-show');
  button.setAttribute(complete ? 'data-relationship-show' : cancelled ? 'data-relationship-start' : 'data-relationship-cancel', '1');
  button.textContent = complete ? 'Show scan findings' : cancelled ? 'Run relationship scan' : 'Cancel relationship scan';
}
function startRelationships(ds, job) {
  if (REL.current !== job) stopRelationships(REL.current);
  REL.current = job; job.state = 'running'; job.done = 0;
  var indices = ds.cols.map(function (_, j) { return j; }).filter(function (j) { return ds.cols[j].type === 'number'; });
  job.total = indices.length * (indices.length - 1) / 2; var last = 0;
  function receive(e) {
    if (job.state !== 'running') return;
    job.done = e.done;
    if (e.complete) {
      job.state = 'complete'; if (job.worker) job.worker.terminate(); job.worker = null;
      job.findings = e.matches.map(function (m) { return {sev:'info', col: ds.cols[m.a].name, title: 'Nearly duplicates ' + ds.cols[m.b].name, detail:'Correlation ' + m.r.toFixed(2) + '. Using both as predictors makes a regression unstable; keep one.', fix:null, src:'Rule adapted from ydata-profiling'}; });
      if (e.count > e.matches.length) job.findings.push({sev:'info', col:'Relationships', title:e.count + ' strongly correlated pairs', detail:'All ' + e.total + ' pairs were screened. Showing the first 100 relationships; choose individual pairs under Analyze for full estimates.', fix:null, src:'Pairwise Pearson screening'});
    }
    if (st.tab === 'enhance' && cur() && cur().rows === ds.rows && cur().cols === ds.cols && (e.complete || Date.now() - last > 250)) { last = Date.now(); relationshipPanel(job); }
  }
  if (!job.total) { receive({complete:true,done:0,total:0,matches:[],count:0}); return; }
  try {
    var code = EKM_STATS_SOURCE + '\nonmessage=function(e){(' + relationshipScan.toString() + ')(e.data.rows,e.data.indices,function(p){postMessage(p);});};', url = URL.createObjectURL(new Blob([code], {type:'application/javascript'}));
    job.worker = new Worker(url); URL.revokeObjectURL(url);
    job.worker.onmessage = function (e) { receive(e.data); };
    job.worker.onerror = function (event) { event.preventDefault(); if (job.worker) job.worker.terminate(); job.worker = null; relationshipScan(ds.rows, indices, receive, function () { return job.state !== 'running'; }); };
    job.worker.postMessage({rows:ds.rows, indices:indices});
  } catch (err) { if (url) URL.revokeObjectURL(url); setTimeout(function () { relationshipScan(ds.rows, indices, receive, function () { return job.state !== 'running'; }); }, 0); }
}
var _baseChecks = checks;
checks = function (ds) {
  // A metadata-only step can share rows with the baseline. Never replace the live
  // scan with that baseline's different columns, which otherwise restarts forever.
  if (cur() !== ds) {
    var base = REL.baseline.get(ds.rows);
    if (!base || base.cols !== ds.cols) { base = {cols: ds.cols, findings: _baseChecks(ds)}; REL.baseline.set(ds.rows, base); }
    return base.findings;
  }
  var job = REL.cache.get(ds.rows);
  if (!job || job.cols !== ds.cols) { job = {cols:ds.cols, findings:[], base:_baseChecks(ds), state:'ready', done:0, total:0, worker:null}; REL.cache.set(ds.rows, job); }
  // Baseline comparisons reuse their base checks; only the current table starts a scan.
  if (cur() === ds && st.tab === 'enhance' && job.state === 'ready') setTimeout(function () { if (cur() === ds && st.tab === 'enhance' && job.state === 'ready' && REL.cache.get(ds.rows) === job && ds.cols === job.cols) startRelationships(ds, job); }, 0);
  return job.base.concat(job.findings);
};
var _responsiveEnhance = VIEWS.enhance;
VIEWS.enhance = function () {
  var html = _responsiveEnhance(), ds = cur(), job = ds && ds.rows && REL.cache.get(ds.rows);
  if (!job) return html;
  var text = job.state === 'complete' ? 'Relationship scan complete: ' + job.done + ' pairs checked.' : job.state === 'cancelled' ? 'Relationship scan cancelled. Column checks remain available.' : 'Relationship scan: ' + job.done + ' of ' + job.total + ' pairs checked. Column checks are available now.';
  return '<section class="card"><h2>Relationship scan</h2><p class="count" role="status" tabindex="-1" data-relationship-status="1">' + esc(text) + '</p>' + (job.state === 'running' ? '<button type="button" class="btn" data-relationship-cancel="1">Cancel relationship scan</button>' : job.state === 'cancelled' ? '<button type="button" class="btn" data-relationship-start="1">Run relationship scan</button>' : '') + '</section>' + html;
};
view.addEventListener('click', function (e) { var b = e.target.closest('button'), ds = cur(); if (!b || !ds) return; var job = REL.cache.get(ds.rows); if (b.dataset.relationshipCancel) { stopRelationships(job); relationshipPanel(job); } else if (b.dataset.relationshipStart && job) { startRelationships(ds, job); relationshipPanel(job); } if (b.dataset.relationshipShow) { render(); refocus('[data-relationship-status]'); } });
// Keep the keyboard user's position when innerHTML is replaced by any module.
var _focusRender = render, focusTab = st.tab;
render = function () {
  if (REL.current && (st.tab !== 'enhance' || !cur() || REL.current.cols !== cur().cols || REL.cache.get(cur().rows) !== REL.current)) stopRelationships(REL.current);
  var active = document.activeElement, id = active && active.id, tag = active && active.tagName, attrs = [], start = null, end = null, restore = active && view.contains(active) && focusTab === st.tab;
  if (restore) { [].forEach.call(active.attributes, function (a) { if (a.name.indexOf('data-') === 0) attrs.push([a.name,a.value]); }); try { start = active.selectionStart; end = active.selectionEnd; } catch (err) {} }
  _focusRender(); focusTab = st.tab;
  if (!restore) return;
  var next = id ? document.getElementById(id) : null;
  if (!next && attrs.length) next = [].filter.call(view.querySelectorAll('button,input,select,textarea,a'), function (el) { return el.tagName === tag && attrs.every(function (a) { return el.getAttribute(a[0]) === a[1]; }); })[0];
  if (next && !next.disabled) { next.focus({preventScroll:true}); if (start != null && next.setSelectionRange) try { next.setSelectionRange(start,end); } catch (err) {} }
};
// Worked arithmetic must agree with the stable engine, including extreme magnitudes.
var _arithmeticSteps = workedSteps;
workedSteps = function (ds, R) {
  if (A.kind === 'relate') {
    var p = rowsXY(ds, A.sel.x, A.sel.y), co = S.correlate(p.x,p.y), c = co.calculation;
    if (!c) return '';
    return stepsTable([
      step('n','complete pairs',co.n),
      step('S<sub>xy</sub>','sum of products of scaled, centered values',f3(c.xy)),
      step('S<sub>xx</sub>, S<sub>yy</sub>','sums of squared scaled, centered values',f3(c.xx)+', '+f3(c.yy)),
      step('r',f3(c.xy)+' / √'+f3(c.xx)+' / √'+f3(c.yy),f3(co.r)),
      step('slope','slope in original units',f3(co.slope)),
      step('intercept','intercept in original units',f3(co.intercept)),
      step('t','r√(n − 2) / √(1 − r²)',Math.abs(co.r) === 1 ? 'Exact linear relationship (limiting statistic)' : f3(co.r*Math.sqrt((co.n-2)/(1-co.r*co.r)))+' on '+(co.n-2)+' df')
    ],'Centered differences are scaled separately for each column before computing products. This avoids overflow and underflow without changing r. The fitted slope and intercept are converted back to the original units.');
  }
  if (['describe','compare','paired'].indexOf(A.kind) >= 0) {
    var names = A.kind === 'paired' ? [A.sel.x,A.sel.y] : [A.sel.y], indices = names.map(function(n){return idxOf(ds,n);}), max = 0;
    filterRows(ds).forEach(function(r){indices.forEach(function(j){if(typeof r[j]==='number')max=Math.max(max,Math.abs(r[j]));});});
    if (max > 1e70 || max > 0 && max < 1e-70) {
      var scaled = Object.assign({},ds,{rows:ds.rows.map(function(r){return r.map(function(v,j){return indices.indexOf(j)>=0 && typeof v==='number' ? v/max : v;});})});
      return '<p class="count">The arithmetic below uses measurements divided by '+f3(max)+'. Multiply averages, differences and standard deviations by this factor to return to the original units. Test statistics and standardized effects are unchanged.</p>'+_arithmeticSteps(scaled,R);
    }
  }
  return _arithmeticSteps(ds,R);
};
