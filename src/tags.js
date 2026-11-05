// ---------- Tags: what each column is, notes on rows, and labels for whole datasets ----------
var TAGS = {
  roles: [["", "Not set"], ["id", "Identifier"], ["outcome", "Outcome"], ["predictor", "Predictor"], ["group", "Group or cluster"], ["time", "Time"], ["rater", "Rater"], ["item", "Questionnaire item"], ["weight", "Survey weight"], ["rowtag", "Row tag"], ["ignore", "Ignore"]],
  levels: [["", "Not set"], ["nominal", "Nominal (named groups)"], ["binary", "Binary (two values)"], ["ordinal", "Ordinal (ordered steps)"], ["interval", "Interval"], ["ratio", "Ratio (true zero)"]],
  sens: [["", "None"], ["personal", "Personal or identifying"], ["health", "Health or other sensitive"]],
  rowTags: ["Check", "Exclude", "Verified", "Entry error"],
  status: [["", "Not set"], ["raw", "Raw"], ["cleaning", "Being cleaned"], ["clean", "Clean"], ["final", "Final (analysis copy)"]],
  q: "", msg: "", picked: Object.create(null), rowTag: "Check", rowNote: "", dsq: ""
};
function tagOf(c) { return c && c.tags || {}; }
function roleOf(ds, name) { var j = idxOf(ds, name); return j >= 0 ? tagOf(ds.cols[j]).role || "" : ""; }
function sensitive(c) { return !!tagOf(c).sens; }
// ---- Suggestions from names and values ----
function suggestColumn(ds, c) {
  var t = {}, n = c.name, j = idxOf(ds, n), vals = ds.rows.map(function (r) { return r[j]; }).filter(function (v) { return v != null; });
  var uniq = Object.create(null); vals.forEach(function (v) { uniq[v] = 1; }); var k = Object.keys(uniq).length;
  var ints = isNum(c) && vals.every(function (v) { return v === Math.round(v); }), lo = isNum(c) ? amin(vals) : 0, hi = isNum(c) ? amax(vals) : 0;
  if (/^row tag$|^row note$/i.test(n)) t.role = "rowtag";
  else if (typeof likelyId === "function" && likelyId(ds, c)) t.role = "id";
  else if (c.type === "date" || c.type === "year" || /(^|\b|_)(date|time|year|wave|visit|week|month|day|period)(\b|_|$)/i.test(n)) t.role = "time";
  else if (/rater|judge|coder|observer|assessor|reader/i.test(n)) t.role = "rater";
  else if (/^(item|q)\s*_?\d+|item\s*\d|question/i.test(n)) t.role = "item";
  else if (/^(sample_?|survey_?|design_?)?(weight|wt|wgt)$/i.test(n)) t.role = "weight";
  else if (!isNum(c) && k >= 2 && k < vals.length / 2 && /school|site|class|clinic|hospital|group|team|cluster|region|district|ward|centre|center|country|state|city|household|family/i.test(n)) t.role = "group";
  else if (/outcome|result|target|passed|status|response|^y$|died|death|success|recovered|score$/i.test(n)) t.role = "outcome";
  if (c.type === "category" || c.type === "text") t.level = k === 2 ? "binary" : /likert|rating|agree|grade|stage|level|severity|rank|education/i.test(n) ? "ordinal" : "nominal";
  else if (isNum(c)) t.level = k === 2 ? "binary" : ints && lo >= 0 && hi <= 10 && k <= 11 && k >= 3 ? "ordinal" : lo < 0 || /temp|year|date|iq|z$|standardi[sz]ed/i.test(n) ? "interval" : "ratio";
  if (/(^|\b|_)(name|first|last|surname|email|e-mail|phone|mobile|address|street|ssn|social security|nhs|passport|licen[cs]e|dob|birth|zip|postcode|postal|ip)(\b|_|$)/i.test(n)) t.sens = "personal";
  else if (/diagnos|disease|hiv|medication|prescription|pregnan|mental|psychiatr|disabilit|religio|ethnic|sexual|criminal/i.test(n)) t.sens = "health";
  if (t.role === "id" || t.role === "rowtag") t.level = "nominal";
  t.suggested = true;
  return t;
}
function suggestAll(ds) {
  ds.cols = ds.cols.map(function (c) {
    // Upgrade old automatic integer-ID guesses without changing confirmed user roles.
    if (tagOf(c).suggested && tagOf(c).role === "id" && isNum(c) && _likelyIdT && !_likelyIdT(ds, c)) {
      var bare = Object.assign({}, c, {tags: null}), fresh = suggestColumn(ds, bare);
      return Object.assign({}, c, {tags: Object.assign({}, c.tags, fresh, {role: fresh.role || ""})});
    }
    return c.tags ? c : Object.assign({}, c, {tags: suggestColumn(ds, c)});
  }); return ds;
}
var _makeSetT = makeSet;
makeSet = function (name, header, body, origin, extra) { return suggestAll(_makeSetT(name, header, body, origin, extra)); };
var _addDerivedT = addDerived;
addDerived = function (name, cols, rows, note) { var ds = _addDerivedT(name, cols, rows, note); suggestAll(ds); return ds; };
// Steps that add columns: give new columns suggestions without touching confirmed ones
var _applyStepT = applyStep;
applyStep = function (ds, step, fn) { _applyStepT(ds, step, fn); if (ds.rows && ds.cols.some(function (c) { return !c.tags; })) suggestAll(ds); };

// ---- Tags steer analyses ----
var _likelyIdT = typeof likelyId === "function" ? likelyId : null;
if (_likelyIdT) likelyId = function (ds, c) { var r = tagOf(c).role; if (r === "id" || r === "rowtag" || r === "ignore") return true; if (r && !tagOf(c).suggested) return false; return _likelyIdT(ds, c); };
var _defaultsT = defaults;
defaults = function (ds) {   // tags fill only choices that are not made yet; explicit selections always win
  var s = A.sel, has = function (n) { return n && idxOf(ds, n) >= 0; }, by = function (role, ok) { return ds.cols.filter(function (c) { return tagOf(c).role === role && (!ok || ok(c)); }); };
  var outc = by("outcome", function (c) { return c.type === "number"; })[0], grp = by("group", function (c) { return c.type === "category"; })[0], tm = by("time", function (c) { return c.type === "year" || c.type === "date"; })[0];
  if (outc && !has(s.y)) { s.y = outc.name; if (!Array.isArray(s.preds)) s.preds = ds.cols.filter(function (c) { return c.type === "number" && c.name !== outc.name && ["id", "rowtag", "ignore", "weight", "outcome"].indexOf(tagOf(c).role) < 0; }).slice(0, 3).map(function (c) { return c.name; }); }
  if (grp && !has(s.g)) s.g = grp.name;
  if (tm && !has(s.t)) s.t = tm.name;
  if (grp && !has(s.mg)) s.mg = grp.name;
  var hadX = has(s.x), out = _defaultsT(ds);
  if (!hadX && s.x === s.y) { var other = out.nums.filter(function (c) { return c.name !== s.y; })[0]; if (other) s.x = other.name; }   // two-number analyses need two different columns
  return out;
};
// Rows tagged Exclude leave every analysis and chart, and each result says so
function excludeIndex(ds) { var j = -1; ds.cols.forEach(function (c, i) { if (tagOf(c).role === "rowtag" && /tag/i.test(c.name)) j = i; }); return j; }
var _filterRowsT = filterRows;
filterRows = function (ds) { var rows = _filterRowsT(ds), j = excludeIndex(ds); if (j < 0 || A.sel.keepExcluded) return rows; return rows.filter(function (r) { return r[j] !== "Exclude"; }); };
var _runAnalysisT = runAnalysis;
runAnalysis = function (ds) {
  var R = _runAnalysisT(ds), j = excludeIndex(ds);
  if (j >= 0 && !A.sel.keepExcluded && R.valid !== false) { var n = ds.rows.filter(function (r) { return r[j] === "Exclude"; }).length; if (n) R.caveats.unshift(n + " row" + (n > 1 ? "s" : "") + " tagged Exclude " + (n > 1 ? "were" : "was") + " left out. See the Row tag column under Your data."); }
  var lv = function (name) { var c = colMeta(ds, name); return c ? tagOf(c).level : ""; };
  if (R.valid !== false && ["compare", "relate", "regress", "paired"].indexOf(R.kind) >= 0 && (lv(A.sel.y) === "ordinal" || (R.kind === "relate" && lv(A.sel.x) === "ordinal")))
    R.caveats.unshift("This column is tagged ordinal: its steps are ordered but not necessarily equal, so the rank-based result (Spearman, Mann–Whitney, Kruskal–Wallis, Wilcoxon) is the primary one to report.");
  LAST_R = R; return R;
};
// Sensitive columns stay out of exports and sharing unless included on purpose
function withoutSensitive(ds) { var keep = ds.cols.map(function (c, j) { return sensitive(c) ? -1 : j; }).filter(function (j) { return j >= 0; }); if (keep.length === ds.cols.length) return ds; return {cols: keep.map(function (j) { return ds.cols[j]; }), rows: ds.rows.map(function (r) { return keep.map(function (j) { return r[j]; }); }), dropped: ds.cols.length - keep.length}; }
var _csvTextT = csvText;
csvText = function (ds) { if (ds && ds.cols && !A.includeSensitive) { var w = withoutSensitive(ds); if (w.dropped) { XP.msg = w.dropped + " column" + (w.dropped > 1 ? "s" : "") + " tagged personal or sensitive " + (w.dropped > 1 ? "were" : "was") + " left out of the file. Tick “Include sensitive columns” under Variable details to export them."; } return _csvTextT(w); } return _csvTextT(ds); };
function projectHasSensitive(p) {
  function has(x) {
    if (!x || typeof x !== "object") return false;
    if (x.tags && x.tags.sens) return true;
    if (Array.isArray(x)) return x.some(has);
    return Object.keys(x).some(function (k) { return k !== "rows" && k !== "rawRows" && has(x[k]); });
  }
  return has(p);
}
if (typeof wsShare === "function") { var _wsShareT = wsShare; wsShare = function () {
  var hasSensitive; try { hasSensitive = projectHasSensitive(projectSnapshot()); } catch (e) { CN.wsMsg = e.message || "Load the datasets before sharing the full project."; render(); return; }
  if (!A.includeSensitive && hasSensitive) { CN.wsMsg = "This full project contains tagged sensitive columns, originals or history. Export a redacted working CSV instead, or explicitly include sensitive columns under Variable details before sharing the full project."; render(); return; }
  return _wsShareT();
}; }

// ---- Row tags (a real column, so they survive steps, refreshes, exports and scripts) ----
function opRowTag(ds, rows, tag, note) {
  var cols = ds.cols.slice(), names = cols.map(function (c) { return c.name; }), ti = excludeIndex(ds), ni = -1;
  cols.forEach(function (c, i) { if (tagOf(c).role === "rowtag" && /note/i.test(c.name)) ni = i; });
  var data = ds.rows;
  if (ti < 0) { cols.push({name: uniqueColumnName("Row tag", names), type: "category", tags: {role: "rowtag", level: "nominal"}}); ti = cols.length - 1; data = data.map(function (r) { return r.concat([null]); }); names.push(cols[ti].name); }
  if (note && ni < 0) { cols.push({name: uniqueColumnName("Row note", names), type: "text", tags: {role: "rowtag"}}); ni = cols.length - 1; data = data.map(function (r) { return r.concat([null]); }); }
  var set = Object.create(null), n = 0; rows.forEach(function (i) { set[i] = 1; });
  data = data.map(function (r, i) { if (!set[i]) return r; var r2 = r.slice(); r2[ti] = tag || null; if (ni >= 0 && note != null) r2[ni] = note || null; n++; return r2; });
  return {rows: data, cols: cols, changed: n};
}
// Record identity at the moment of tagging, not after a source has reordered.
function tagIdentity(ds, indices) {
  var choices = ds.cols.filter(function (c) { return tagOf(c).role === "id"; });
  for (var q = 0; q < choices.length; q++) {
    var name = choices[q].name, j = idxOf(ds, name), seen = Object.create(null), valid = true;
    ds.rows.forEach(function (r) { var v = r[j], key = JSON.stringify([typeof v, v]); if (v == null || seen[key]) valid = false; seen[key] = true; });
    if (valid) return {col: name, values: indices.map(function (i) { return ds.rows[i][j]; })};
  }
  return null;
}
function tagRowIndices(ds, step) {
  if (!step.identity) return step.rows || [];
  var j = idxOf(ds, step.identity.col); if (j < 0) throw new Error("The row-tag identifier column is missing: " + step.identity.col);
  var at = Object.create(null);
  ds.rows.forEach(function (r, i) { var v = r[j], key = JSON.stringify([typeof v, v]); if (v == null || Object.prototype.hasOwnProperty.call(at, key)) throw new Error("Row-tag identifiers must be present and unique."); at[key] = i; });
  return step.identity.values.map(function (v) { var key = JSON.stringify([typeof v, v]); if (!Object.prototype.hasOwnProperty.call(at, key)) throw new Error("A tagged record is missing from the refreshed source. Review its identifier before refreshing."); return at[key]; });
}
function tagRows(ds, idx, tag, note, how) {
  if (!idx.length) { TAGS.msg = "No rows to tag."; render(); return; }
  applyStep(ds, {op: "rowtag", rows: idx.slice(), identity: tagIdentity(ds, idx), tag: tag, note: note || "", text: (tag ? "Tagged " + idx.length + " row" + (idx.length > 1 ? "s" : "") + " “" + tag + "”" : "Cleared the tag on " + idx.length + " rows") + (how ? " (" + how + ")" : "") + (note ? ": " + note : ""), unit: "rows"}, function () { return opRowTag(ds, idx, tag, note); });
  TAGS.picked = Object.create(null);
}
var _replayStepT = replayStep;
replayStep = function (ds, s2) { if (s2.op === "rowtag") return opRowTag(ds, tagRowIndices(ds, s2), s2.tag, s2.note); return _replayStepT(ds, s2); };
if (typeof pyStep === "function") {
  var _pyStepT = pyStep; pyStep = function (s2, ds) { if (s2.op !== "rowtag") return _pyStepT(s2, ds); return "if \"Row tag\" not in df: df[\"Row tag\"] = None\ndf.loc[df.index[" + JSON.stringify(s2.rows || []) + "], \"Row tag\"] = " + (s2.tag ? JSON.stringify(s2.tag) : "None") + (s2.tag === "Exclude" ? "\ndf = df[df[\"Row tag\"] != \"Exclude\"]  # EKM leaves Exclude rows out of analyses" : ""); };
  var _rStepT = rStep; rStep = function (s2, ds) { if (s2.op !== "rowtag") return _rStepT(s2, ds); return "if (!\"Row tag\" %in% names(df)) df[[\"Row tag\"]] <- NA\ndf[c(" + (s2.rows || []).map(function (i) { return i + 1; }).join(", ") + "), \"Row tag\"] <- " + (s2.tag ? JSON.stringify(s2.tag) : "NA") + (s2.tag === "Exclude" ? "\ndf <- df[is.na(df[[\"Row tag\"]]) | df[[\"Row tag\"]] != \"Exclude\", , drop = FALSE]" : ""); };
}
function rowTagBar(ds, where) {
  var picked = Object.keys(TAGS.picked).length;
  return '<div class="tagbar toolbar"><label class="field" for="rt_tag">Row tag<input id="rt_tag" data-rt="tag" list="rt_list" value="' + esc(TAGS.rowTag) + '" maxlength="40"><datalist id="rt_list">' + TAGS.rowTags.map(function (t) { return '<option value="' + t + '">'; }).join("") + '</datalist></label><label class="field" for="rt_note">Note (optional)<input id="rt_note" data-rt="note" value="' + esc(TAGS.rowNote) + '" maxlength="200"></label>' +
    (where === "grid" ? '<button type="button" class="btn" data-rtgo="picked"' + (picked ? "" : " disabled") + ">Tag " + picked + " selected row" + (picked === 1 ? "" : "s") + '</button><button type="button" class="btn" data-rtclear="picked"' + (picked ? "" : " disabled") + ">Clear their tags</button>" : '<button type="button" class="btn" data-rtgo="filter">Tag the matching rows</button>') + "</div>";
}

// ---- Variable details card (replaces the labels card): labels, units, value labels and tags ----
function sel(attr, j, opts, val, label) { return '<select data-ctag="' + attr + '" data-vcol="' + j + '" aria-label="' + label + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (val || "") ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>"; }
function variableCard(ds) {
  var q = TAGS.q.toLowerCase(), sugg = ds.cols.filter(function (c) { return tagOf(c).suggested; }).length, sens = ds.cols.filter(sensitive).length;
  var list = ds.cols.map(function (c, j) { return [c, j]; }).filter(function (p) { var c = p[0], t = tagOf(c); return !q || (c.name + " " + (c.label || "") + " " + (t.role || "") + " " + (t.topics || []).join(" ")).toLowerCase().indexOf(q) >= 0; });
  return '<section class="card" aria-labelledby="vd-h"><h2 id="vd-h">Variable details</h2><p class="count">Tags tell EKM what each column is: the outcome and groups set analysis defaults, ordinal columns get rank-based results, and tagged personal or sensitive columns are omitted from working-table CSV exports unless included. Original-data CSVs and project backups preserve all values, history and notes; reports may quote sensitive values. Review these before sharing. Suggested tags are marked; check them.</p>' +
    '<div class="toolbar"><label class="field" for="vd_q">Find a column<input id="vd_q" type="search" value="' + esc(TAGS.q) + '" placeholder="name, label, role or topic"></label>' + (sugg ? '<button type="button" class="btn" data-ctconfirm="1">Confirm ' + sugg + " suggested</button>" : "") + '<label class="chk"><input type="checkbox" data-incsens="1"' + (A.includeSensitive ? " checked" : "") + "> Include sensitive columns in working CSV / full project sharing" + (sens ? " (" + sens + ")" : "") + "</label></div>" +
    '<div class="tablewrap"><table class="nosort vartable"><thead><tr><th>Column</th><th>Role</th><th>Level</th><th>Sensitivity</th><th>Label</th><th>Unit</th><th>Value labels</th><th>Topics</th></tr></thead><tbody>' + list.map(function (p) {
      var c = p[0], j = p[1], t = tagOf(c), vl = c.values ? Object.keys(c.values).map(function (k) { return k + " = " + c.values[k]; }).join("; ") : "";
      return "<tr><td><b>" + esc(c.name) + "</b>" + (t.suggested ? ' <span class="chip q-reported">Suggested</span>' : "") + (t.sens ? ' <span class="chip q-excluded">' + (t.sens === "health" ? "Sensitive" : "Personal") + "</span>" : "") + "</td><td>" + sel("role", j, TAGS.roles, t.role, "Role of " + esc(c.name)) + "</td><td>" + sel("level", j, TAGS.levels, t.level, "Level of " + esc(c.name)) + "</td><td>" + sel("sens", j, TAGS.sens, t.sens, "Sensitivity of " + esc(c.name)) +
        '</td><td><input data-vmeta="label" data-vcol="' + j + '" value="' + esc(c.label || "") + '" maxlength="80" aria-label="Label for ' + esc(c.name) + '"></td><td><input data-vmeta="unit" data-vcol="' + j + '" value="' + esc(c.unit || "") + '" maxlength="24" aria-label="Unit for ' + esc(c.name) + '" class="short"></td><td><input data-vmeta="values" data-vcol="' + j + '" value="' + esc(vl) + '" maxlength="600" aria-label="Value labels for ' + esc(c.name) + '">' + (c.values ? ' <button type="button" class="linkbtn" data-vapply="' + j + '">Apply</button>' : "") +
        '</td><td><input data-ctag="topics" data-vcol="' + j + '" value="' + esc((t.topics || []).join(", ")) + '" maxlength="120" placeholder="e.g. baseline" aria-label="Topics for ' + esc(c.name) + '"></td></tr>';
    }).join("") + "</tbody></table></div>" + (TAGS.msg ? '<p class="how" role="status">' + esc(TAGS.msg) + "</p>" : "") + "</section>";
}
labelsCard = variableCard;
// Grid: a selection column and the row-tag bar
var _gridCardT = gridCard;
gridCard = function (ds) {
  var h = _gridCardT(ds);
  h = h.replace("<tr><th>#</th>", '<tr><th><span class="sr-only">Select</span></th><th>#</th>').replace(/<tr><td class="num count">(\d+)<\/td>/g, function (m, n) { var i = +n - 1; return '<tr' + (TAGS.picked[i] ? ' class="picked"' : "") + '><td><input type="checkbox" data-rtpick="' + i + '"' + (TAGS.picked[i] ? " checked" : "") + ' aria-label="Select row ' + n + '"></td><td class="num count">' + n + "</td>"; });
  return h.replace(/(<div class="tablewrap gridwrap">)/, rowTagBar(ds, "grid") + "$1");
};
// Filter card: tag every row that matches
var _filterCardT = filterCard;
filterCard = function (ds) { var h = _filterCardT(ds), w = A.sel.where; if (!(w && w.conds && w.conds.length) && !(A.sel.f && A.sel.fv)) return h; return h.replace(/(<\/details>)$/, rowTagBar(ds, "filter") + "$1"); };

// ---- Dataset tags ----
function dsTags(ds) { return ds.tags || {}; }
var _dataViewT = VIEWS.data;
VIEWS.data = function () {
  var h = _dataViewT(), ds = cur(); if (!ds || !ds.rows) return h;
  var t = dsTags(ds), card = '<section class="card" aria-labelledby="dt-h"><h2 id="dt-h">Dataset tags</h2><div class="toolbar">' +
    '<label class="field" for="dt_status">Status<select id="dt_status" data-dtag="status">' + TAGS.status.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === (t.status || "") ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
    '<label class="field" for="dt_project">Project<input id="dt_project" data-dtag="project" value="' + esc(t.project || "") + '" maxlength="60"></label><label class="field" for="dt_wave">Wave or version<input id="dt_wave" data-dtag="wave" value="' + esc(t.wave || "") + '" maxlength="30"></label></div>' +
    '<label class="field" for="dt_topics">Topics (comma separated)<input id="dt_topics" data-dtag="topics" value="' + esc((t.topics || []).join(", ")) + '" maxlength="160"></label></section>';
  h = h.replace(/(<section class="card"><h2>About this dataset<\/h2>)/, card + "$1");
  // Chips and a search box in the dataset list
  h = h.replace(/(<button type="button" class="linkbtn" data-ads="([^"]+)"[^>]*>[\s\S]*?<\/button>)/g, function (m, btn, id) { var s = A.sets.filter(function (x) { return x.id === id; })[0], tt = s ? dsTags(s) : {}; var chips = (tt.status ? '<span class="chip q-reported">' + esc((TAGS.status.filter(function (o) { return o[0] === tt.status; })[0] || [0, tt.status])[1]) + "</span>" : "") + (tt.project ? ' <span class="chip">' + esc(tt.project) + "</span>" : "") + (tt.wave ? ' <span class="chip">' + esc(tt.wave) + "</span>" : ""); return btn + (chips ? " " + chips : ""); });
  if (A.sets.length > 4) h = h.replace(/(<section class="card"><h2>Datasets<\/h2>)/, '$1<label class="field" for="ds_q">Find a dataset<input id="ds_q" type="search" value="' + esc(TAGS.dsq) + '" placeholder="name, project, wave or topic"></label>');
  if (TAGS.dsq) { var qq = TAGS.dsq.toLowerCase(); h = h.replace(/<li class="(on)?">([\s\S]*?)<\/li>/g, function (m, on, inner) { var id = (/data-ads="([^"]+)"/.exec(inner) || [])[1], s = A.sets.filter(function (x) { return x.id === id; })[0], tt = s ? dsTags(s) : {}; var hay = s ? (s.name + " " + (tt.project || "") + " " + (tt.wave || "") + " " + (tt.status || "") + " " + (tt.topics || []).join(" ")).toLowerCase() : ""; return hay.indexOf(qq) >= 0 ? m : ""; }); }
  return h;
};
var _saveMetaT = saveMeta;
saveMeta = function (ds) { _saveMetaT(ds); if (ST.on && ds.saved) col().doc(ds.id).update({tags: ds.tags || {}}).catch(function () {}); };

// ---- Projects keep every tag ----
var COLMETA = ["label", "unit", "values", "tags"];
function cleanTags(t) { if (!t || typeof t !== "object") return null; var ok = function (list, v) { return list.some(function (o) { return o[0] === v; }) ? v : ""; }; var o = {role: ok(TAGS.roles, t.role), level: ok(TAGS.levels, t.level), sens: ok(TAGS.sens, t.sens)}; if (Array.isArray(t.topics)) o.topics = t.topics.filter(function (x) { return typeof x === "string"; }).slice(0, 12).map(function (x) { return x.slice(0, 40); }); if (t.suggested) o.suggested = true; return o; }
var _snapT = projectSnapshot;
projectSnapshot = function () { var p = _snapT(); p.tags = A.sets.map(function (ds) { return {id: ds.id, ds: ds.tags || null, cols: ds.cols.map(function (c) { return {name: c.name, tags: c.tags || null}; })}; }); return p; };
var _validT = validateProject;
validateProject = function (p) {
  var out = _validT(p), by = Object.create(null); (Array.isArray(p && p.tags) ? p.tags : []).forEach(function (t) { if (t && typeof t.id === "string") by[t.id] = t; });
  out.datasets.forEach(function (ds) {
    var t = by[ds.id]; if (!t) { suggestAll(ds); return; }
    if (t.ds && typeof t.ds === "object") ds.tags = {status: TAGS.status.some(function (o) { return o[0] === t.ds.status; }) ? t.ds.status : "", project: String(t.ds.project || "").slice(0, 60), wave: String(t.ds.wave || "").slice(0, 30), topics: Array.isArray(t.ds.topics) ? t.ds.topics.filter(function (x) { return typeof x === "string"; }).slice(0, 12) : []};
    var cm = Object.create(null); (Array.isArray(t.cols) ? t.cols : []).forEach(function (c) { if (c && typeof c.name === "string") cm[c.name] = cleanTags(c.tags); });
    ds.cols = ds.cols.map(function (c) { return cm[c.name] ? Object.assign({}, c, {tags: cm[c.name]}) : c; }); suggestAll(ds);
  });
  function copyTags(source, dest) { if (!source || !dest) return; dest.cols.forEach(function (c) { var old = (source.cols || []).filter(function (v) { return v.name === c.name; })[0], t = old && cleanTags(old.tags); if (t) c.tags = t; }); }
  out.datasets.forEach(function (ds) { var h = p.history || {}; copyTags((h.original || {})[ds.id], out.history.original[ds.id]); (out.history.undo[ds.id] || []).forEach(function (u, i) { copyTags(((h.undo || {})[ds.id] || [])[i], u); }); });
  return out;
};

// ---- Events ----
view.addEventListener("change", function (e) {
  var t = e.target, d = t.dataset || {}, ds = cur(); if (!ds) return;
  if (d.ctag) {
    var j = +d.vcol, c = ds.cols[j]; if (!c) return; var tg = Object.assign({}, tagOf(c)); delete tg.suggested;
    if (d.ctag === "topics") tg.topics = t.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12); else tg[d.ctag] = t.value;
    var cols = ds.cols.slice(); cols[j] = Object.assign({}, c, {tags: tg}); ds.cols = cols; saveMeta(ds);
    auditLog("Tagged column", ds, c.name + ": " + d.ctag + " = " + (d.ctag === "topics" ? tg.topics.join(", ") : t.value || "not set")); render(); refocus('[data-ctag="' + d.ctag + '"][data-vcol="' + j + '"]'); return;
  }
  if (t.id === "vd_q") { TAGS.q = t.value; render(); refocus("#vd_q"); return; }
  if (t.id === "ds_q") { TAGS.dsq = t.value; render(); refocus("#ds_q"); return; }
  if (d.incsens) { A.includeSensitive = t.checked; auditLog("Sensitive columns " + (t.checked ? "included in" : "excluded from") + " exports", ds, ""); render(); return; }
  if (d.dtag) { var tags = Object.assign({}, dsTags(ds)); tags[d.dtag] = d.dtag === "topics" ? t.value.split(",").map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12) : t.value.trim(); ds.tags = tags; saveMeta(ds); auditLog("Tagged dataset", ds, d.dtag + " = " + (Array.isArray(tags[d.dtag]) ? tags[d.dtag].join(", ") : tags[d.dtag])); render(); refocus('[data-dtag="' + d.dtag + '"]'); return; }
  if (d.rt) { TAGS[d.rt === "tag" ? "rowTag" : "rowNote"] = t.value; return; }
  if (d.rtpick != null) { if (t.checked) TAGS.picked[+d.rtpick] = 1; else delete TAGS.picked[+d.rtpick]; render(); refocus('[data-rtpick="' + d.rtpick + '"]'); return; }
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"); if (!b) return; var d = b.dataset, ds = cur(); if (!ds) return;
  if (d.ctconfirm) { ds.cols = ds.cols.map(function (c) { if (!tagOf(c).suggested) return c; var tg = Object.assign({}, c.tags); delete tg.suggested; return Object.assign({}, c, {tags: tg}); }); saveMeta(ds); auditLog("Confirmed suggested tags", ds, ""); TAGS.msg = "Tags confirmed."; render(); return; }
  var tag = ((document.getElementById("rt_tag") || {}).value || TAGS.rowTag).trim(), note = ((document.getElementById("rt_note") || {}).value || "").trim();
  if (d.rtgo === "picked" || d.rtclear === "picked") { tagRows(ds, Object.keys(TAGS.picked).map(Number).sort(function (a, b) { return a - b; }), d.rtclear ? "" : tag, d.rtclear ? "" : note, "chosen in the grid"); return; }
  if (d.rtgo === "filter") { var keep = A.sel.keepExcluded; A.sel.keepExcluded = true; var rows = filterRows(ds), at = new Map(); A.sel.keepExcluded = keep; ds.rows.forEach(function (r, i) { at.set(r, i); }); tagRows(ds, rows.map(function (r) { return at.get(r); }), tag, note, "rows where " + (A.sel.where ? whereText(A.sel.where) : A.sel.f + " is " + A.sel.fv)); return; }
});
