// ---------- Discover: bounded exploratory screening with a separate row-split check ----------
// Random row splits do not establish independent replication. Cluster/curve cards stay descriptive.
var DSC = {job: null, res: null, key: "", type: "all", q: "", showFailed: false, pins: [], web: Object.create(null), outcome: "", limit: 5000, detail: null, optionsOpen: false, scopeOpen: false};
var DSC_TYPES = [["all", "All"], ["link", "Links between numbers"], ["curve", "Curved links"], ["group", "Group differences"], ["assoc", "Linked categories"], ["trend", "Over time"], ["reversal", "Reversals"], ["subgroup", "Subgroups"], ["cluster", "Row partitions"], ["unusual", "Unusual rows"]];
function bh(ps) { var m = ps.length, o = ps.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return a[0] - b[0]; }), q = new Array(m), run = 1; for (var r = m - 1; r >= 0; r--) { run = Math.min(run, o[r][0] * m / (r + 1)); q[o[r][1]] = run; } return q; }
function rankVec(v) { var idx = [], out = new Float64Array(v.length).fill(NaN); v.forEach(function (x, i) { if (typeof x === "number" && isFinite(x)) idx.push(i); }); idx.sort(function (a, b) { return v[a] - v[b]; }); for (var i = 0; i < idx.length;) { var j = i; while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++; for (var k = i; k <= j; k++) out[idx[k]] = (i + j) / 2 + 1; i = j + 1; } return out; }
function okNum(v) { return typeof v === "number" && isFinite(v); }
function corrPair(a, b) {
  var x = [], y = []; for (var i = 0; i < a.length; i++) if (okNum(a[i]) && okNum(b[i])) { x.push(a[i]); y.push(b[i]); }
  if (x.length < 8) return null;
  var c = S.screenPair(x, y); if (!isFinite(c.r)) return null;
  return {r: c.r, n: c.n, p: Math.abs(c.r) === 1 ? 0 : S.pT(c.r * Math.sqrt((c.n - 2) / (1 - c.r * c.r)), c.n - 2)};
}
function etaBinned(x, y) {   // share of y's variance explained by deciles of x (catches curved links)
  var pts = []; for (var i = 0; i < x.length; i++) if (okNum(x[i]) && okNum(y[i])) pts.push([x[i], y[i]]); if (pts.length < 40) return null;
  var normalized = S.normalize(pts.map(function (p) { return p[1]; })); pts.forEach(function (p, i) { p[1] = normalized[i]; });
  pts.sort(function (a, b) { return a[0] - b[0]; }); var k = 10, n = pts.length, m = pts.reduce(function (s, p) { return s + p[1]; }, 0) / n, sst = 0, ssb = 0;
  pts.forEach(function (p) { sst += (p[1] - m) * (p[1] - m); });
  for (var b = 0; b < k; b++) { var seg = pts.slice(Math.floor(b * n / k), Math.floor((b + 1) * n / k)); if (!seg.length) continue; var mm = seg.reduce(function (s, p) { return s + p[1]; }, 0) / seg.length; ssb += seg.length * (mm - m) * (mm - m); }
  var eta2 = sst ? ssb / sst : 0, F = (ssb / (k - 1)) / ((sst - ssb) / (n - k)); return {eta2: eta2, p: 1 - S3.pf(F, k - 1, n - k), n: n};
}
function scanColumns(ds) {
  var skip = ["id", "rowtag", "ignore", "weight"];
  var usable = ds.cols.filter(function (c) { return skip.indexOf(tagOf(c).role) < 0 && c.type !== "empty" && c.type !== "text"; });
  var nums = usable.filter(function (c) { return isNum(c) && c.type !== "year"; }).slice(0, 60), cats = usable.filter(function (c) { if (c.type !== "category") return false; var u = Object.create(null), k = 0; colVals(ds, idxOf(ds, c.name)).forEach(function (v) { if (v != null && !u[v]) { u[v] = 1; k++; } }); return k >= 2 && k <= 20; }).slice(0, 30);
  var time = ds.cols.filter(function (c) { return c.type === "year" || c.type === "date" || tagOf(c).role === "time"; })[0];
  return {nums: nums, cats: cats, time: time};
}
function splitHalves(n, seed) { var rnd = S3.rngN(seed), a = [], b = []; for (var i = 0; i < n; i++) (rnd.u() < 0.5 ? a : b).push(i); return [a, b]; }
// Each test returns {p, eff, dir, detail} on a set of row indices
function testFor(ds, cand, rows) {
  var col = function (name) { var j = idxOf(ds, name); return rows.map(function (i) { return ds.rows[i][j]; }); };
  if (cand.type === "link") { var ca = col(cand.a), cb = col(cand.b), ax = [], bx = []; ca.forEach(function (v, i) { if (okNum(v) && okNum(cb[i])) { ax.push(v); bx.push(cb[i]); } }); var c = corrPair(rankVec(ax), rankVec(bx)); return c && {p: c.p, eff: Math.abs(c.r), dir: Math.sign(c.r), r: c.r, n: c.n}; }
  if (cand.type === "curve") { var e = etaBinned(col(cand.a), col(cand.b)), l = corrPair(col(cand.a), col(cand.b)); if (!e || !l) return null; var gain = e.eta2 - l.r * l.r; return {p: e.p, eff: Math.sqrt(Math.max(0, gain)), dir: 1, gain: gain, eta2: e.eta2, r2: l.r * l.r, n: e.n}; }
  if (cand.type === "group") { var y = col(cand.b), g = col(cand.a), G = Object.create(null); y.forEach(function (v, i) { if (typeof v === "number" && g[i] != null) (G[g[i]] = G[g[i]] || []).push(v); }); var names = Object.keys(G).filter(function (k) { return G[k].length >= 3; }); if (names.length < 2) return null; var kw = S2.kruskal(names.map(function (k) { return G[k]; })), n = names.reduce(function (s, k) { return s + G[k].length; }, 0); if (!kw || !isFinite(kw.p)) return null; var med = names.map(function (k) { return [k, S2.median(G[k]), G[k].length]; }).sort(function (a, b) { return b[1] - a[1]; }); return {p: kw.p, eff: Math.sqrt(Math.max(0, kw.H / (n - 1))), dir: 1, top: med[0], bottom: med[med.length - 1], n: n, order: med.map(function (m) { return m[0]; }).join("|")}; }
  if (cand.type === "assoc") { var a = col(cand.a), b = col(cand.b), ra = [], rb = [], ix = Object.create(null); a.forEach(function (v, i) { if (v != null && b[i] != null) { if (!(v in ix)) { ix[v] = ra.length; ra.push(v); } if (rb.indexOf(b[i]) < 0) rb.push(b[i]); } }); if (ra.length < 2 || rb.length < 2) return null; var T = ra.map(function () { return rb.map(function () { return 0; }); }); a.forEach(function (v, i) { if (v != null && b[i] != null) T[ix[v]][rb.indexOf(b[i])]++; }); var ch = S.chisq(T); return ch && isFinite(ch.p) ? {p: ch.p, eff: ch.v, dir: 1, n: ch.n} : null; }
  if (cand.type === "trend") { var tj = idxOf(ds, cand.a), tv = rows.map(function (i) { var v = ds.rows[i][tj]; return typeof v === "number" ? v : v ? Date.parse(String(v)) : null; }); var yv = col(cand.b), tx = [], ty = []; tv.forEach(function (v, i) { if (okNum(v) && okNum(yv[i])) { tx.push(v); ty.push(yv[i]); } }); var c2 = corrPair(rankVec(tx), rankVec(ty)); return c2 && {p: c2.p, eff: Math.abs(c2.r), dir: Math.sign(c2.r), r: c2.r, n: c2.n}; }
  if (cand.type === "reversal") { var x = col(cand.a), yy = col(cand.b), gg = col(cand.g), all = corrPair(x, yy); if (!all) return null; var by = Object.create(null); x.forEach(function (v, i) { if (gg[i] != null) (by[gg[i]] = by[gg[i]] || []).push(i); }); var num = 0, den = 0, k = 0; Object.keys(by).forEach(function (key) { var id = by[key]; if (id.length < 8) return; var w = corrPair(id.map(function (i) { return x[i]; }), id.map(function (i) { return yy[i]; })); if (!w) return; var z = Math.atanh(w.r); num += z * (w.n - 3); den += w.n - 3; k++; }); if (k < 2 || !den) return null; var rw = Math.tanh(num / den), zt = (num / den) * Math.sqrt(den); var pw = 2 * (1 - S2.pnorm(Math.abs(zt))); if (Math.sign(rw) === Math.sign(all.r) || Math.abs(rw) < 0.1) return {p: 1, eff: 0, dir: 0}; return {p: Math.max(pw, all.p), eff: Math.min(Math.abs(rw), Math.abs(all.r)), dir: Math.sign(rw), rAll: all.r, rWithin: rw, n: all.n, groups: k}; }
  if (cand.type === "subgroup") { var yi = idxOf(ds, cand.b), inR = [], outR = []; rows.forEach(function (i) { var v = ds.rows[i][yi]; if (typeof v !== "number") return; (cand.rule(ds.rows[i]) ? inR : outR).push(v); }); if (inR.length < 5 || outR.length < 5) return null; var t = S.ttest(inR, outR); return isFinite(t.p) ? {p: t.p, eff: Math.abs(t.d), dir: Math.sign(t.diff), diff: t.diff, nIn: inR.length, n: inR.length + outR.length} : null; }
  return null;
}
function subgroupCandidates(ds, rows, cols, yName) {   // a depth-2 regression tree on the discovery half; each leaf becomes a rule
  var yi = idxOf(ds, yName), preds = cols.nums.filter(function (c) { return c.name !== yName; }).concat(cols.cats).slice(0, 25); if (preds.length < 1) return [];
  var parts = preds.map(function (c) { var j = idxOf(ds, c.name); if (isNum(c)) return {c: c, j: j, num: true}; var u = Object.create(null); rows.forEach(function (i) { var v = ds.rows[i][j]; if (v != null) u[v] = 1; }); return {c: c, j: j, lv: Object.keys(u)}; });
  var X = [], y = [], keep = []; rows.forEach(function (i) { var r = ds.rows[i]; if (typeof r[yi] !== "number") return; var x = []; var ok = parts.every(function (p) { var v = r[p.j]; if (p.num) { if (typeof v !== "number") return false; x.push(v); } else { if (v == null) return false; p.lv.forEach(function (l) { x.push(String(v) === l ? 1 : 0); }); } return true; }); if (ok) { X.push(x); y.push(r[yi]); keep.push(i); } });
  if (y.length < 60) return [];
  var names = [], map = []; parts.forEach(function (p) { if (p.num) { names.push(p.c.name); map.push({j: p.j, num: true, name: p.c.name}); } else p.lv.forEach(function (l) { names.push(p.c.name + " = " + l); map.push({j: p.j, lv: l, name: p.c.name}); }); });
  var t = ML.tree(X, y, {maxDepth: 2, minLeaf: Math.max(10, Math.round(y.length * 0.08))}), out = [];
  (function walk(nd, path) { if (!nd.left) { if (path.length) out.push(path); return; } var m = map[nd.f]; walk(nd.left, path.concat([{m: m, le: true, thr: nd.thr}])); walk(nd.right, path.concat([{m: m, le: false, thr: nd.thr}])); })(t.root, []);
  return out.map(function (path) {
    var parts2 = [], byCol = Object.create(null);
    path.forEach(function (s) { if (!s.m.num) { parts2.push(nameOf(s.m.name) + (s.le ? " is not " : " is ") + "“" + s.m.lv + "”"); return; } var r = byCol[s.m.name] = byCol[s.m.name] || {lo: -Infinity, hi: Infinity, at: parts2.length}; if (r.at === parts2.length) parts2.push(null); if (s.le) r.hi = Math.min(r.hi, s.thr); else r.lo = Math.max(r.lo, s.thr); });
    Object.keys(byCol).forEach(function (k) { var r = byCol[k]; parts2[r.at] = nameOf(k) + (r.lo > -Infinity && r.hi < Infinity ? " is between " + f3(r.lo) + " and " + f3(r.hi) : r.lo > -Infinity ? " > " + f3(r.lo) : " ≤ " + f3(r.hi)); });
    var label = parts2.join(" and ");
    return {type: "subgroup", b: yName, label: label, path: path, rule: function (r) { return path.every(function (s) { var v = r[s.m.j]; if (s.m.num) return typeof v === "number" && (s.le ? v <= s.thr : v > s.thr); var is = String(v) === s.m.lv; return v != null && (s.le ? !is : is); }); }};
  });
}
// Standard Euclidean silhouette, including the singleton convention (Rousseeuw 1987).
function discoverSilhouette(X, labels) {
  var groups = Object.create(null), total = 0;
  labels.forEach(function (l) { groups[l] = (groups[l] || 0) + 1; });
  var keys = Object.keys(groups); if (keys.length < 2 || keys.length >= X.length) return null;
  X.forEach(function (x, i) {
    if (groups[labels[i]] === 1) return;
    var sums = Object.create(null);
    X.forEach(function (y, j) { if (i === j) return; var d = 0; for (var q = 0; q < x.length; q++) d += (x[q] - y[q]) * (x[q] - y[q]); sums[labels[j]] = (sums[labels[j]] || 0) + Math.sqrt(d); });
    var a = (sums[labels[i]] || 0) / (groups[labels[i]] - 1), b = Infinity;
    keys.forEach(function (k) { if (String(labels[i]) !== k) b = Math.min(b, sums[k] / groups[k]); });
    total += Math.max(a, b) ? (b - a) / Math.max(a, b) : 0;
  });
  return total / X.length;
}
function subgroupRule(path, row) { return path.every(function (s) { var v = row[s.m.j]; if (s.m.num) return okNum(v) && (s.le ? v <= s.thr : v > s.thr); return v != null && (s.le ? String(v) !== s.m.lv : String(v) === s.m.lv); }); }
function clusterScan(ds, rows, cols) {   // Descriptive k-means partition, never independent confirmation.
  var use = cols.nums.slice(0, 15); if (use.length < 2) return null;
  var idx = use.map(function (c) { return idxOf(ds, c.name); }), X = [], at = [];
  if (rows.length > 1000) { var stp = rows.length / 1000; rows = rows.filter(function (_, i) { return Math.floor(i / stp) !== Math.floor((i - 1) / stp); }); }
  rows.forEach(function (i) { var r = ds.rows[i], v = idx.map(function (j) { return r[j]; }); if (v.every(function (x) { return typeof x === "number"; })) { X.push(v); at.push(i); } });
  if (X.length < 60) return null;
  var st = ML.standardize(X), Z = st.Z, rnd = S3.rngN(99), best = null, sample = Z.length > 400 ? Z.filter(function (_, i) { return i % Math.ceil(Z.length / 400) === 0; }) : Z;
  var d2 = function (a, b) { var s = 0; for (var q = 0; q < a.length; q++) { var t = a[q] - b[q]; s += t * t; } return s; };
  for (var k = 2; k <= 5; k++) {
    var C = [Z[Math.floor(rnd.u() * Z.length)]];
    while (C.length < k) { var ds2 = Z.map(function (z) { return Math.min.apply(null, C.map(function (c) { return d2(z, c); })); }), tot = ds2.reduce(function (a, b) { return a + b; }, 0), r0 = rnd.u() * tot, acc = 0; for (var i = 0; i < Z.length; i++) { acc += ds2[i]; if (acc >= r0) { C.push(Z[i]); break; } } }
    var lab = new Array(Z.length);
    for (var it = 0; it < 50; it++) {
      var moved = 0; Z.forEach(function (z, i) { var bi = 0, bd = Infinity; C.forEach(function (c, ci) { var dd = d2(z, c); if (dd < bd) { bd = dd; bi = ci; } }); if (lab[i] !== bi) { lab[i] = bi; moved++; } });
      C = C.map(function (c, ci) { var mem = Z.filter(function (_, i) { return lab[i] === ci; }); return mem.length ? c.map(function (_, q) { return mem.reduce(function (s, m) { return s + m[q]; }, 0) / mem.length; }) : c; });
      if (!moved) break;
    }
    var stride = Math.ceil(Z.length / 400), sampleLabels = lab.filter(function (_, i) { return Z.length <= 400 || i % stride === 0; });
    var sil = discoverSilhouette(sample, sampleLabels); if (sil == null) continue;
    if (!best || sil > best.sil) best = {k: k, C: C, lab: lab.slice(), sil: sil};
  }
  if (!best) return null;
  var sizes = best.C.map(function (_, ci) { return best.lab.filter(function (l) { return l === ci; }).length; });
  var desc = best.C.map(function (c, ci) { var top = c.map(function (v, q) { return [use[q].name, v]; }).sort(function (a, b) { return Math.abs(b[1]) - Math.abs(a[1]); }).slice(0, 2); return {size: sizes[ci], traits: top}; });
  return {k: best.k, sil: best.sil, silhouetteN: sample.length, desc: desc, use: use.map(function (c) { return c.name; }), centers: best.C, st: st, at: at, lab: best.lab};
}
function discoverScan(ds, done, progress) {
  var cols = scanColumns(ds), n = ds.rows.length, all = [];
  for (var i = 0; i < n; i++) all.push(i);

  var halves = splitHalves(all.length, 2024).map(function (h) { return h.map(function (i) { return all[i]; }); }), A1 = halves[0], B1 = halves[1], cands = [];
  for (var a = 0; a < cols.nums.length; a++) for (var b = a + 1; b < cols.nums.length; b++) { cands.push({type: "link", a: cols.nums[a].name, b: cols.nums[b].name}); cands.push({type: "curve", a: cols.nums[a].name, b: cols.nums[b].name}); cands.push({type: "curve", a: cols.nums[b].name, b: cols.nums[a].name}); }
  cols.cats.forEach(function (c) { cols.nums.forEach(function (nm) { cands.push({type: "group", a: c.name, b: nm.name}); }); });
  for (a = 0; a < cols.cats.length; a++) for (b = a + 1; b < cols.cats.length; b++) cands.push({type: "assoc", a: cols.cats[a].name, b: cols.cats[b].name});
  if (cols.time) cols.nums.filter(function (c) { return c.name !== cols.time.name; }).forEach(function (nm) { cands.push({type: "trend", a: cols.time.name, b: nm.name}); });
  var outcome = DSC.outcome && idxOf(ds, DSC.outcome) >= 0 ? DSC.outcome : (ds.cols.filter(function (c) { return tagOf(c).role === "outcome" && isNum(c); })[0] || {}).name;
  var pos = 0, found = [], t0 = Date.now(), job = DSC.job;
  function step() {
    if (DSC.job !== job) return;
    var start = Date.now();
    while (pos < cands.length && Date.now() - start < 25) { var c = cands[pos++], r = null; try { r = testFor(ds, c, A1); } catch (e) {} found.push({c: c, a: r || {p: 1, eff: 0}}); }
    if (pos < cands.length) { if (progress) progress(pos, cands.length); setTimeout(step, 0); return; }
    finish();
  }
  function finish() {
    // Reversals: strongest links × each grouping column
    var links = found.filter(function (f) { return f.c.type === "link" && f.a.eff >= 0.1; }).sort(function (x, y) { return y.a.eff - x.a.eff; }).slice(0, 15);
    links.forEach(function (f) { cols.cats.filter(function (g) { var u = Object.create(null), k = 0; colVals(ds, idxOf(ds, g.name)).forEach(function (v) { if (v != null && !u[v]) { u[v] = 1; k++; } }); return k <= 12; }).forEach(function (g) { var c = {type: "reversal", a: f.c.a, b: f.c.b, g: g.name}, r = testFor(ds, c, A1); if (r && r.eff > 0) found.push({c: c, a: r}); }); });
    if (outcome) subgroupCandidates(ds, A1, cols, outcome).forEach(function (c) { var r = testFor(ds, c, A1); if (r) found.push({c: c, a: r}); });
    // BH includes every prespecified test, including null/invalid results. Adaptive rules
    // have no valid discovery p-value; they are screened separately and checked on B only.
    var base = found.slice(0, cands.length), q = bh(base.map(function (f) { return f.a.p; })), out = [];
    var selected = found.filter(function (f, i) { return f.a.eff >= 0.08 && (i >= base.length || q[i] <= 0.1) && (f.c.type !== "curve" || f.a.gain > 0.08); });
    selected.forEach(function (f) {
      var i = base.indexOf(f);
      var r2 = testFor(ds, f.c, B1), confirmed = !!(r2 && r2.p * selected.length <= 0.05 && f.c.type !== "curve" && (f.c.type === "group" || f.c.type === "assoc" || f.c.type === "curve" ? true : r2.dir === f.a.dir));
      var fullRows = all, full = testFor(ds, f.c, fullRows) || f.a;
      if (f.c.type === "curve" && !(full.gain > 0.05)) return;
      out.push({c: f.c, disc: f.a, conf: r2, confirmed: confirmed, full: full, q: i >= 0 ? q[i] : null, holdoutAdjusted: r2 ? Math.min(1, r2.p * selected.length) : null});
    });
    // Keep one of each link/curve pair (the curve only when it confirmed and the line did not explain it)
    var seen = Object.create(null); out = out.filter(function (o) { if (o.c.type !== "curve") return true; var k = [o.c.a, o.c.b].sort().join("|"); if (seen[k]) return false; seen[k] = 1; return true; });
    var cl = null; try { cl = clusterScan(ds, all, cols); } catch (e) {}
    if (cl) out.push({c: {type: "cluster"}, cl: cl, confirmed: false, descriptive: true, full: {eff: cl.sil}, disc: {}});
    var un = null; try { var use = cols.nums.slice(0, 15); if (use.length >= 2 && typeof isoForest === "function") { var idx = use.map(function (c) { return idxOf(ds, c.name); }), med = idx.map(function (j) { return S.describe(colVals(ds, j)); }), outRows = all.slice(0, 5000), X = outRows.map(function (ri) { return ds.rows[ri]; }).map(function (r) { return idx.map(function (j, q) { return typeof r[j] === "number" ? (r[j] - med[q].median) / (med[q].sd || 1) : 0; }); }), sc = isoForest(X, 100, 256), cut = sc.slice().sort(function (a, b) { return b - a; })[Math.max(0, Math.floor(sc.length * 0.01) - 1)]; var rowsU = []; sc.forEach(function (v, i) { if (v >= cut && v > 0.6) rowsU.push(i); }); if (rowsU.length) { var drive = use.map(function (c, q) { return [c.name, rowsU.reduce(function (s, i) { return s + Math.abs(X[i][q]); }, 0) / rowsU.length]; }).sort(function (a, b) { return b[1] - a[1]; }); un = {rows: rowsU.map(function (i) { return outRows[i]; }), drive: drive.slice(0, 3), tested: X.length}; } } } catch (e) {}
    if (un) out.push({c: {type: "unusual"}, un: un, confirmed: false, full: {eff: 0.3}, disc: {p: 0}});
    var roleIs = function (n, r) { return roleOf(ds, n) === r; }, expected = out.filter(function (o) { return o.c.type === "link" && ((roleIs(o.c.a, "item") && roleIs(o.c.b, "item")) || (roleIs(o.c.a, "rater") && roleIs(o.c.b, "rater")) || (["item", "rater"].indexOf(roleOf(ds, o.c.a)) >= 0 && ["item", "rater"].indexOf(roleOf(ds, o.c.b)) >= 0)); });
    if (expected.length >= 3) { out = out.filter(function (o) { return expected.indexOf(o) < 0; }); var cs = []; expected.forEach(function (o) { [o.c.a, o.c.b].forEach(function (n) { if (cs.indexOf(n) < 0) cs.push(n); }); }); out.push({c: {type: "expected"}, ex: {cols: cs, n: expected.length, rmin: amin(expected.map(function (o) { return Math.abs(o.full.r); })), rmax: amax(expected.map(function (o) { return Math.abs(o.full.r); }))}, confirmed: false, descriptive: true, full: {eff: 0.05}, disc: {p: 0}}); }
    out.sort(function (x, y) { return (y.confirmed - x.confirmed) || (y.full.eff - x.full.eff); });
    done({items: out, tested: found.length, baseTests: cands.length, holdoutTests: selected.length, halves: [A1.length, B1.length], cols: cols, outcome: outcome, ms: Date.now() - t0});
  }
  step();
}
// ---- Pattern cards ----
function strength(e) { return e >= 0.5 ? "strong" : e >= 0.3 ? "moderate" : e >= 0.1 ? "weak" : "slight"; }
function patternText(p) {
  var c = p.c, f = p.full || {}, N = function (n) { return "<b>" + esc(nameOf(n)) + "</b>"; };
  switch (c.type) {
    case "link": return ["Higher " + N(c.a) + " goes with " + (f.r >= 0 ? "higher " : "lower ") + N(c.b), strength(Math.abs(f.r)) + " link · rank correlation ρ = " + fz(f.r) + " · " + f.n + " rows"];
    case "curve": return [N(c.b) + " follows a curved pattern across " + N(c.a), "the shape explains " + pct(f.eta2 || 0) + " of the variation, against " + pct(f.r2 || 0) + " for a straight line"];
    case "group": return [N(c.b) + " differs across groups of " + N(c.a), "highest in “" + esc(f.top[0]) + "” (median " + f3(f.top[1]) + "), lowest in “" + esc(f.bottom[0]) + "” (median " + f3(f.bottom[1]) + ") · " + strength(f.eff) + " effect"];
    case "assoc": return [N(c.a) + " and " + N(c.b) + " are linked", strength(f.eff) + " association · Cramér's V = " + fz(f.eff) + " · " + f.n + " rows"];
    case "trend": return [N(c.b) + " has been " + (f.r >= 0 ? "rising" : "falling") + " over " + N(c.a), strength(Math.abs(f.r)) + " trend · ρ = " + fz(f.r)];
    case "reversal": return ["The link between " + N(c.a) + " and " + N(c.b) + " reverses within groups of " + N(c.g), "overall r = " + fz(f.rAll) + ", but within groups r = " + fz(f.rWithin) + ": the overall pattern comes from differences between groups (Simpson's paradox)"];
    case "subgroup": return [N(c.b) + " is " + (f.diff >= 0 ? "higher" : "lower") + " when " + esc(c.label), "by " + f3(Math.abs(f.diff)) + " on average · " + f.nIn + " rows match · effect d = " + fz(f.eff)];
    case "cluster": var cl = p.cl; return ["A descriptive k-means partition divides these rows into " + cl.k + " groups", cl.desc.map(function (d, i) { return "group " + (i + 1) + " (" + d.size + " rows): " + d.traits.map(function (t) { return (t[1] > 0 ? "high " : "low ") + esc(nameOf(t[0])); }).join(", "); }).join("; ") + " · sampled silhouette " + fz(cl.sil) + " (" + cl.silhouetteN + " rows); this does not establish natural groups"];
    case "expected": return ["The " + p.ex.cols.length + " questionnaire items and rater columns move together, as expected", p.ex.n + " links, ρ from " + fz(p.ex.rmin) + " to " + fz(p.ex.rmax) + ". Check them as a scale (Scale reliability) or as agreement (Rater agreement) rather than one pair at a time"];
    case "unusual": return [p.un.rows.length + (p.un.rows.length === 1 ? " row stands" : " rows stand") + " out from the rest", "mostly through " + p.un.drive.map(function (d) { return esc(nameOf(d[0])); }).join(", ") + " (Isolation Forest, top 1%)"];
  }
  return ["", ""];
}
function openSpec(p) {
  var c = p.c;
  return {link: ["relate", {x: c.a, y: c.b}], curve: null, group: ["compare", {y: c.b, g: c.a}], assoc: ["cross", {g: c.a, g2: c.b}], trend: ["trend", {y: c.b, t: c.a}], reversal: ["mixed", {y: c.b, mg: c.g, mx: [c.a]}], subgroup: null, expected: p.ex ? (p.ex.cols.every(function (n) { return roleOf(cur(), n) === "rater"; }) ? ["agree", {raters: p.ex.cols}] : ["reliability", {items: p.ex.cols.filter(function (n) { return roleOf(cur(), n) === "item"; })}]) : null, cluster: null}[c.type];
}
function patternCard(p, i) {
  var t = patternText(p), pinned = DSC.pins.indexOf(i) >= 0, web = DSC.web[i];
  var status = p.descriptive || p.c.type === "curve" || p.c.type === "unusual" || p.c.type === "expected" ? '<span class="chip q-reported">' + (p.c.type === "expected" ? "Expected" : "Descriptive") + "</span>" : p.confirmed ? '<span class="chip q-verified">Repeated in split rows</span>' : '<span class="chip q-estimated">Not repeated</span>';
  var type = (DSC_TYPES.filter(function (x) { return x[0] === p.c.type; })[0] || [0, ""])[1];
  return '<li class="pcard' + (p.confirmed ? "" : " weak") + '"><div class="pc-top"><span class="label">' + type + "</span>" + status + (pinned ? ' <span class="chip">Pinned</span>' : "") + '</div><p class="pc-head">' + t[0] + '.</p><p class="count">' + t[1] + "</p>" +
    '<div class="slot">' + (openSpec(p) || ["curve", "cluster", "subgroup"].indexOf(p.c.type) >= 0 ? '<button type="button" class="btn" data-dopen="' + i + '">Inspect / analyse</button>' : "") + (p.c.type === "subgroup" || p.c.type === "unusual" ? '<button type="button" class="btn" data-dtagrows="' + i + '">Tag these rows</button>' : "") +
    '<button type="button" class="linkbtn" data-dpin="' + i + '">' + (pinned ? "Unpin" : "Pin") + "</button>" + (p.c.type === "expected" ? "" : '<button type="button" class="linkbtn" data-dweb="' + i + '" aria-expanded="' + !!web + '">Look for context on the web</button>') + "</div>" + (web ? webPanel(p, i) : "") + "</li>";
}
function discoverView() {
  var ds = cur(); if (!ds) return noData("Discover", "Add a dataset under Your data, then choose a scope to explore patterns locally.");
  if (!ds.rows) { loadRows(ds).then(render); return '<p class="count" role="status">Loading…</p>'; }
  var key = discoverKey(ds);
  if (DSC.job && DSC.job.key !== key) cancelDiscover("Settings changed. Run a new scan.");
  if (DSC.detail != null && DSC.key === key && DSC.res) return discoverDetail(ds, DSC.res.items[DSC.detail], DSC.detail);
  var res = DSC.key === key ? DSC.res : null, nums = ds.cols.filter(isNum);
  var head = '<h1 class="vt">Find patterns</h1><p class="lede">EKM checks every pair of columns for links and group differences. Treat what it finds as ideas to test, not conclusions, even when a pattern repeats in a second half of the rows.</p>' +
    '<details class="dt discover-options"' + (DSC.optionsOpen ? ' open' : '') + '><summary>Outcome and pattern filters</summary><div class="toolbar"><label class="field" for="d_out">Outcome for subgroup search<select id="d_out" data-dout="1"><option value="">' + (res && res.outcome ? "Tagged outcome (" + esc(res.outcome) + ")" : "None") + "</option>" + nums.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === DSC.outcome ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + '</select></label><label class="field" for="d_q">Find<input id="d_q" type="search" value="' + esc(DSC.q) + '" placeholder="a column name"></label></div>' +
    '<div class="pills" role="group" aria-label="Pattern type">' + DSC_TYPES.map(function (x) { return '<button type="button" class="pill' + (DSC.type === x[0] ? " on" : "") + '" aria-pressed="' + (DSC.type === x[0]) + '" data-dtype="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div></details>";
  head += '<div class="toolbar"><label class="field" for="d_limit">Scan at most<select id="d_limit" data-dlimit="1">' + [5000, 10000, 50000].map(function (n) { return '<option value="' + n + '"' + (DSC.limit === n ? ' selected' : '') + '>' + n.toLocaleString("en-US") + ' eligible rows</option>'; }).join("") + '</select></label><button type="button" class="btn btn-primary" data-drun="1"' + (DSC.job ? ' disabled' : '') + '>Run scan</button>' + (DSC.job ? '<button type="button" class="btn" data-dstop="1">Stop scan</button>' : '') + '</div><details class="dt discover-scope"' + (DSC.scopeOpen ? ' open' : '') + '><summary>Scope and limits</summary><p class="count">Scope: first 60 numerical and 30 categorical columns (2–20 levels). Partitions: first 15 numbers, up to 1,000 rows; silhouette up to 400 rows. Unusual-row screening: up to 5,000 rows. Active filters and Exclude tags apply.</p></details>';
  if (!res) return head + '<p class="count" role="status" id="d-status">' + esc(DSC.status || "Choose a scope and press Run scan.") + "</p>";
  var items = res.items.map(function (p, i) { return [p, i]; }).filter(function (pi) { var p = pi[0]; if (DSC.type !== "all" && p.c.type !== DSC.type) return false; if (DSC.q) { var hay = [p.c.a, p.c.b, p.c.g, p.c.label].concat(p.cl ? p.cl.use : []).join(" ").toLowerCase(); if (hay.indexOf(DSC.q.toLowerCase()) < 0) return false; } return true; });
  var pins = items.filter(function (pi) { return DSC.pins.indexOf(pi[1]) >= 0; }), good = items.filter(function (pi) { return DSC.pins.indexOf(pi[1]) < 0 && (pi[0].confirmed || pi[0].descriptive || ["unusual", "curve"].indexOf(pi[0].c.type) >= 0); }), weak = items.filter(function (pi) { return DSC.pins.indexOf(pi[1]) < 0 && !pi[0].confirmed && !pi[0].descriptive && ["unusual", "curve"].indexOf(pi[0].c.type) < 0; });
  var conf = res.items.filter(function (p) { return p.confirmed; }).length;
  return head + figs([["Combinations tested", res.tested.toLocaleString("en-US")], ["Repeated in row split", String(conf)], ["Not repeated", String(weak.length)], ["Rows: search / check", res.halves[0] + " / " + res.halves[1]], ["Eligible / total rows", res.eligible + " / " + ds.rows.length]], true) +
    (pins.length ? '<h2 class="sub-h">Pinned</h2><ul class="plain pcards">' + pins.map(function (pi) { return patternCard(pi[0], pi[1]); }).join("") + "</ul>" : "") +
    '<ul class="plain pcards">' + (good.length ? good.map(function (pi) { return patternCard(pi[0], pi[1]); }).join("") : '<li class="nd">No repeated or descriptive patterns of this type in this scan. This does not prove that no relationship exists.</li>') + "</ul>" +
    (weak.length ? '<details class="dt"' + (DSC.showFailed ? " open" : "") + ' data-dfailed="1"><summary>' + weak.length + " pattern" + (weak.length > 1 ? "s" : "") + " that did not hold up on the held-out rows</summary><ul class=\"plain pcards\">" + weak.map(function (pi) { return patternCard(pi[0], pi[1]); }).join("") + "</ul></details>" : "") +
    '<div class="caveats"><h3>Keep in mind</h3><ul class="plain"><li>Repeated means a selected test met a Bonferroni-adjusted 5% threshold across ' + res.holdoutTests + ' selected checks on split rows, with the same direction where applicable. It does not establish causation or independent replication; people, sites and time periods may span both halves, and the tests assume independent observations.</li><li>Discovery BH adjustment includes all ' + res.baseTests + ' prespecified tests before effect filtering. Adaptive subgroup and reversal screening has no discovery-stage error guarantee. Curves and partitions remain descriptive.</li><li>Effects shown on cards use the full scanned sample and can be optimistic after selection. Inspect split estimates and uncertainty before reporting.</li><li>Used ' + res.sampled + ' of ' + res.eligible + ' eligible rows (seeded sample when capped). Scanning limits can miss patterns.</li></ul></div>';

}
function startDiscover(ds, key) {
  cancelDiscover(); DSC.res = null; DSC.key = ""; DSC.pins = []; DSC.web = Object.create(null); var job = {key: key}; DSC.job = job; DSC.status = "Scanning…"; DSC.detail = null;
  setTimeout(function () {
    if (DSC.job !== job) return;
    runDiscover(ds, function (res) { if (DSC.job !== job || discoverKey(ds) !== key) return; DSC.job = null; DSC.res = res; DSC.key = key; DSC.pins = []; DSC.web = Object.create(null); auditLog("Scanned for exploratory patterns", ds, res.items.filter(function (p) { return p.confirmed; }).length + " repeated row-split checks of " + res.tested + " tests"); if (st.tab === "discover") render(); }, function (a, b) { DSC.status = "Scanning… " + Math.round(a / Math.max(1, b) * 100) + "% of " + b.toLocaleString("en-US") + " combinations"; var el = document.getElementById("d-status"); if (el) el.textContent = DSC.status; });
  }, 30);
}
GROUPS.discover = ["discover"]; VIEWS.discover = discoverView;
var _navD = nav; nav = function (t) { if (t !== "discover" && DSC.job) cancelDiscover("Scan stopped when leaving Discover."); _navD(t); };
view.addEventListener("change", function (e) {
  var t = e.target; if (st.tab !== "discover") return;
  if (t.dataset.dlimit) { cancelDiscover("Scope changed. Run a new scan."); DSC.limit = +t.value; DSC.key = ""; render(); return; }
  if (t.dataset.dout) { cancelDiscover("Outcome changed. Run a new scan."); DSC.outcome = t.value; DSC.key = ""; render(); return; }
  if (t.id === "d_q") { DSC.q = t.value; render(); refocus("#d_q"); return; }
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"), sm = e.target.closest("summary"); if (sm && sm.parentElement.dataset.dfailed) { DSC.showFailed = !sm.parentElement.open; return; }
  if (!b || st.tab !== "discover") return; var d = b.dataset, ds = cur(), res = DSC.res; if (!ds) return;
  if (d.drun) { startDiscover(ds, discoverKey(ds)); render(); return; }
  if (d.dstop) { cancelDiscover("Scan stopped. No partial results published."); render(); refocus('[data-drun]'); return; }
  if (d.dback) { DSC.detail = null; render(); refocus('[data-dopen="' + d.dback + '"]'); return; }
  if (d.dtype) { DSC.type = d.dtype; render(); refocus('[data-dtype="' + d.dtype + '"]'); return; }
  if (d.dpin != null) { var i = +d.dpin, k = DSC.pins.indexOf(i); if (k >= 0) DSC.pins.splice(k, 1); else DSC.pins.push(i); render(); return; }
  if (d.dopen != null) { if (!res || DSC.key !== discoverKey(ds)) return; var sp = openSpec(res.items[+d.dopen]); if (!sp) { DSC.detail = +d.dopen; render(); refocus("#pattern-detail"); return; } A.kind = sp[0]; Object.keys(sp[1]).forEach(function (kk) { A.sel[kk] = sp[1][kk]; }); nav("analyze"); return; }
  if (d.dtagrows != null) { var p = res.items[+d.dtagrows], rows = []; if (p.c.type === "unusual") rows = p.un.rows; else { var eligible = new Set(filterRows(ds)); ds.rows.forEach(function (r, ix) { if (eligible.has(r) && p.c.rule(r)) rows.push(ix); }); } tagRows(ds, rows, p.c.type === "unusual" ? "Check" : "Subgroup", p.c.type === "subgroup" ? p.c.label.replace(/<[^>]+>/g, "") : "Flagged by Discover", "from Discover"); DSC.key = ""; nav("data"); return; }
  if (d.dweb != null) { var j = +d.dweb; if (DSC.web[j]) delete DSC.web[j]; else DSC.web[j] = {query: defaultQuery(res.items[j]), results: null, busy: false, msg: ""}; render(); return; }
});

// Cache the exact analysis scope, including metadata-only changes and active row filters.
function discoverKey(ds) {
  return JSON.stringify([ds.id, dataVersion(ds), ds.cols.map(function (c) { return [c.name, c.type, c.tags || null, c.label || ""]; }), A.sel.f || "", A.sel.fv || "", A.sel.where || null, !!A.sel.keepExcluded, DSC.outcome, DSC.limit]);
}
function cancelDiscover(message) {
  var job = DSC.job; if (job && job.worker) job.worker.terminate();
  DSC.job = null; if (message) DSC.status = message;
}
// A worker runs the same local statistics without blocking input. No network or model is used.
function discoverWorkerSource() {
  var helpers = [amin, amax, idxOf, isNum, f3, rng, cN, isoForest, bh, rankVec, okNum, corrPair, etaBinned, scanColumns, splitHalves, testFor, subgroupCandidates, subgroupRule, discoverSilhouette, clusterScan, discoverScan];
  return EKM_METHOD_SOURCE + "\n" + helpers.map(function (f) { return f.toString(); }).join("\n") + '\n' +
    'var DSC = {job:{}, outcome:""}, current;\n' +
    'function tagOf(c){return c && c.tags || {};}\n' +
    'function roleOf(ds,n){var j=idxOf(ds,n);return j<0?"":tagOf(ds.cols[j]).role || "";}\n' +
    'function colVals(ds,j){return ds.rows.map(function(r){return r[j];});}\n' +
    'function nameOf(n){var j=idxOf(current,n);return j<0?n:current.cols[j].label || n;}\n' +
    'onmessage=function(e){current=e.data.ds;DSC.outcome=e.data.outcome;discoverScan(current,function(res){res.items.forEach(function(p){delete p.c.rule;});postMessage({result:res});},function(a,b){postMessage({progress:[a,b]});});};';
}
function runDiscover(ds, done, progress) {
  var key = discoverKey(ds), job = DSC.job || {}; DSC.job = job;
  var eligibleSet = new Set(filterRows(ds)), eligible = [];
  ds.rows.forEach(function (r, i) { if (eligibleSet.has(r)) eligible.push(i); });
  var eligibleN = eligible.length, indices = eligible.slice(), limit = [5000, 10000, 50000].indexOf(DSC.limit) >= 0 ? DSC.limit : 5000;
  if (indices.length > limit) { // Exact-size reservoir sample with a fixed seed.
    var random = rng(5); indices = eligible.slice(0, limit);
    for (var i = limit; i < eligible.length; i++) { var j = Math.floor(random() * (i + 1)); if (j < limit) indices[j] = eligible[i]; }
    indices.sort(function (a, b) { return a - b; });
  }
  var cols = scanColumns({cols: ds.cols, rows: indices.map(function (i) { return ds.rows[i]; })});
  var names = cols.nums.concat(cols.cats, cols.time ? [cols.time] : []).map(function (c) { return c.name; });
  if (DSC.outcome) names.push(DSC.outcome);
  var colIdx = []; ds.cols.forEach(function (c, j) { if (names.indexOf(c.name) >= 0) colIdx.push(j); });
  var table = {id: ds.id, cols: colIdx.map(function (j) { return ds.cols[j]; }), rows: indices.map(function (i) { return colIdx.map(function (j) { return ds.rows[i][j]; }); })};
  function fail(text) { if (DSC.job !== job) return; cancelDiscover(text); if (st.tab === "discover") render(); }
  if (typeof Worker === "undefined") { fail("Discover requires browser workers. Enable workers or use a current browser; ordinary analyses remain available."); return; }
  var url, worker;
  try { url = URL.createObjectURL(new Blob([discoverWorkerSource()], {type: "text/javascript"})); worker = new Worker(url); URL.revokeObjectURL(url); job.worker = worker; }
  catch (e) { if (url) URL.revokeObjectURL(url); fail("Could not start the local scan worker. Check browser restrictions and try again."); return; }
  worker.onerror = function (e) { e.preventDefault(); fail("The local scan failed. Reduce the scan scope and try again."); };
  worker.onmessage = function (e) {
    if (DSC.job !== job) { worker.terminate(); return; }
    if (discoverKey(ds) !== key || cur() !== ds) { fail("Data or settings changed. Run a new scan."); return; }
    if (e.data.progress) { if (progress) progress(e.data.progress[0], e.data.progress[1]); return; }
    var res = e.data.result; if (!res) return;
    worker.terminate(); delete job.worker;
    res.eligible = eligibleN; res.sampled = indices.length; res.rows = indices;
    res.items.forEach(function (p) {
      if (p.c.path) { p.c.path.forEach(function (s) { s.m.j = idxOf(ds, s.m.name); }); p.c.rule = function (r) { return subgroupRule(p.c.path, r); }; }
      if (p.cl) p.cl.at = p.cl.at.map(function (i) { return indices[i]; });
      if (p.un) p.un.rows = p.un.rows.map(function (i) { return indices[i]; });
    });
    done(res);
  };
  worker.postMessage({ds: table, outcome: DSC.outcome});
}

// Complex cards retain their exact question and scanned row set rather than opening a different model.
function discoverDetail(ds, p, i) {
  var t = patternText(p), h = '<h1 class="vt" id="pattern-detail" tabindex="-1">Inspect pattern</h1><button class="btn" type="button" data-dback="' + i + '">Back to patterns</button><section class="card"><h2>' + t[0] + '</h2><p>' + t[1] + '</p><p class="count">Same eligible, scanned rows as this card. Exploratory estimates after selection; no causal or independent-replication claim.</p>';
  if (p.c.type === "curve") {
    var at = DSC.res.rows, xj = idxOf(ds, p.c.a), yj = idxOf(ds, p.c.b), pairs = at.map(function (i) { return ds.rows[i]; }).filter(function (r) { return okNum(r[xj]) && okNum(r[yj]); });
    h += '<div class="chartwrap">' + scatter(pairs.map(function (r) { return r[xj]; }), pairs.map(function (r) { return r[yj]; }), p.c.a, p.c.b) + '</div><p>Descriptive equal-count bins of X summarize Y. Bin boundaries are refitted within each half; this is not validation of a fixed nonlinear prediction model. A binned association test does not establish curvature beyond a straight line.</p>';
  } else if (p.c.type === "subgroup") {
    var inside = [], outside = [], j = idxOf(ds, p.c.b);
    DSC.res.rows.forEach(function (i) { var r = ds.rows[i]; if (okNum(r[j])) (p.c.rule(r) ? inside : outside).push(r[j]); });
    var tt = S.ttest(inside, outside);
    h += figs([["Matching rows", inside.length], ["Other eligible scanned rows", outside.length]], true);
    if (tt && isFinite(tt.diff)) h += '<p>Matching minus other rows: ' + esc(f3(tt.diff)) + '. Descriptive Welch 95% CI [' + esc(f3(tt.ciLo)) + ', ' + esc(f3(tt.ciHi)) + ']; Cohen’s d = ' + esc(fz(tt.d)) + '. This interval is not adjusted for selecting the subgroup.</p>';
    h += '<p>Rule: ' + esc(p.c.label) + '. The comparison retains both matching rows and the remaining eligible scanned rows; excluded rows are omitted.</p>';
  } else if (p.c.type === "cluster") {
    h += '<p>K-means partitions standardized complete rows and chooses k = 2–5 using the largest sampled Euclidean silhouette. The same rows select and describe the partition. A Gaussian cloud can also be partitioned: these groups are not confirmed or necessarily natural.</p><div class="tablewrap"><table><thead><tr><th>Original row</th><th>Partition</th></tr></thead><tbody>' + p.cl.at.slice(0, 20).map(function (at, j) { return '<tr><td>' + (at + 1) + '</td><td>' + (p.cl.lab[j] + 1) + '</td></tr>'; }).join("") + '</tbody></table></div><p class="count">First 20 of ' + p.cl.at.length + ' complete rows used for this partition. Silhouette uses ' + p.cl.silhouetteN + ' of those rows.</p>';
  }
  if (p.disc && p.conf) h += '<div class="tablewrap"><table><thead><tr><th>Estimate</th><th>Search half</th><th>Check half</th></tr></thead><tbody><tr><td>Effect</td><td>' + esc(f3(p.disc.eff)) + '</td><td>' + esc(f3(p.conf.eff)) + '</td></tr><tr><td>Rows</td><td>' + esc(p.disc.n) + '</td><td>' + esc(p.conf.n) + '</td></tr></tbody></table></div><p class="count">Held-out Bonferroni-adjusted p = ' + esc(f3(p.holdoutAdjusted)) + (p.c.type === "curve" ? ' (association only, not a test of curvature).' : '.') + '</p>';
  return h + '</section>';
}

view.addEventListener("toggle", function (e) {
  if (e.target.classList.contains("discover-options")) DSC.optionsOpen = e.target.open;
  if (e.target.classList.contains("discover-scope")) DSC.scopeOpen = e.target.open;
}, true);
