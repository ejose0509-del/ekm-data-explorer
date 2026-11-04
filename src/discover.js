// ---------- Discover: scan every column combination, then confirm each pattern on held-out rows ----------
// Half the rows (chosen at random, seeded) are used to find candidates; candidates that survive a false-discovery-rate
// correction are re-tested on the other half. Only patterns that hold up in both halves are marked Confirmed.
var DSC = {job: null, res: null, key: "", type: "all", q: "", showFailed: false, pins: [], web: Object.create(null), outcome: ""};
var DSC_TYPES = [["all", "All"], ["link", "Links between numbers"], ["curve", "Curved links"], ["group", "Group differences"], ["assoc", "Linked categories"], ["trend", "Over time"], ["reversal", "Reversals"], ["subgroup", "Subgroups"], ["cluster", "Natural groups"], ["unusual", "Unusual rows"]];
function bh(ps) { var m = ps.length, o = ps.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return a[0] - b[0]; }), q = new Array(m), run = 1; for (var r = m - 1; r >= 0; r--) { run = Math.min(run, o[r][0] * m / (r + 1)); q[o[r][1]] = run; } return q; }
function rankVec(v) { var idx = [], out = new Float64Array(v.length).fill(NaN); v.forEach(function (x, i) { if (typeof x === "number" && isFinite(x)) idx.push(i); }); idx.sort(function (a, b) { return v[a] - v[b]; }); for (var i = 0; i < idx.length;) { var j = i; while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++; for (var k = i; k <= j; k++) out[idx[k]] = (i + j) / 2 + 1; i = j + 1; } return out; }
function okNum(v) { return typeof v === "number" && v === v; }
function corrPair(a, b) { var n = 0, sa = 0, sb = 0; for (var i = 0; i < a.length; i++) if (okNum(a[i]) && okNum(b[i])) { n++; sa += a[i]; sb += b[i]; } if (n < 8) return null; var ma = sa / n, mb = sb / n, c = 0, va = 0, vb = 0; for (i = 0; i < a.length; i++) if (okNum(a[i]) && okNum(b[i])) { var x = a[i] - ma, y = b[i] - mb; c += x * y; va += x * x; vb += y * y; } if (!va || !vb) return null; var r = c / Math.sqrt(va * vb); r = Math.max(-0.999999, Math.min(0.999999, r)); var t = r * Math.sqrt((n - 2) / (1 - r * r)); return {r: r, n: n, p: 2 * (1 - S3.pt(Math.abs(t), n - 2))}; }
function etaBinned(x, y) {   // share of y's variance explained by deciles of x (catches curved links)
  var pts = []; for (var i = 0; i < x.length; i++) if (typeof x[i] === "number" && typeof y[i] === "number") pts.push([x[i], y[i]]); if (pts.length < 40) return null;
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
  if (cand.type === "link") { var c = corrPair(rankVec(col(cand.a)), rankVec(col(cand.b))); return c && {p: c.p, eff: Math.abs(c.r), dir: Math.sign(c.r), r: c.r, n: c.n}; }
  if (cand.type === "curve") { var e = etaBinned(col(cand.a), col(cand.b)), l = corrPair(col(cand.a), col(cand.b)); if (!e || !l) return null; var gain = e.eta2 - l.r * l.r; return {p: e.p, eff: Math.sqrt(Math.max(0, gain)), dir: 1, gain: gain, eta2: e.eta2, r2: l.r * l.r, n: e.n}; }
  if (cand.type === "group") { var y = col(cand.b), g = col(cand.a), G = Object.create(null); y.forEach(function (v, i) { if (typeof v === "number" && g[i] != null) (G[g[i]] = G[g[i]] || []).push(v); }); var names = Object.keys(G).filter(function (k) { return G[k].length >= 3; }); if (names.length < 2) return null; var kw = S2.kruskal(names.map(function (k) { return G[k]; })), n = names.reduce(function (s, k) { return s + G[k].length; }, 0); if (!kw || !isFinite(kw.p)) return null; var med = names.map(function (k) { return [k, S2.median(G[k]), G[k].length]; }).sort(function (a, b) { return b[1] - a[1]; }); return {p: kw.p, eff: Math.sqrt(Math.max(0, kw.H / (n - 1))), dir: 1, top: med[0], bottom: med[med.length - 1], n: n, order: med.map(function (m) { return m[0]; }).join("|")}; }
  if (cand.type === "assoc") { var a = col(cand.a), b = col(cand.b), ra = [], rb = [], ix = Object.create(null); a.forEach(function (v, i) { if (v != null && b[i] != null) { if (!(v in ix)) { ix[v] = ra.length; ra.push(v); } if (rb.indexOf(b[i]) < 0) rb.push(b[i]); } }); if (ra.length < 2 || rb.length < 2) return null; var T = ra.map(function () { return rb.map(function () { return 0; }); }); a.forEach(function (v, i) { if (v != null && b[i] != null) T[ix[v]][rb.indexOf(b[i])]++; }); var ch = S.chisq(T); return ch && isFinite(ch.p) ? {p: ch.p, eff: ch.v, dir: 1, n: ch.n} : null; }
  if (cand.type === "trend") { var tj = idxOf(ds, cand.a), tv = rows.map(function (i) { var v = ds.rows[i][tj]; return typeof v === "number" ? v : v ? Date.parse(String(v)) : null; }); var c2 = corrPair(rankVec(tv), rankVec(col(cand.b))); return c2 && {p: c2.p, eff: Math.abs(c2.r), dir: Math.sign(c2.r), r: c2.r, n: c2.n}; }
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
    return {type: "subgroup", b: yName, label: label, rule: function (r) { return path.every(function (s) { var v = r[s.m.j]; if (s.m.num) return typeof v === "number" && (s.le ? v <= s.thr : v > s.thr); var is = String(v) === s.m.lv; return v != null && (s.le ? !is : is); }); }};
  });
}
function clusterScan(ds, rows, cols) {   // k-means (k-means++ seeding) on standardized numbers; silhouette chooses k
  var use = cols.nums.slice(0, 15); if (use.length < 2) return null;
  var idx = use.map(function (c) { return idxOf(ds, c.name); }), X = [], at = [];
  if (rows.length > 5000) { var stp = rows.length / 5000; rows = rows.filter(function (_, i) { return Math.floor(i / stp) !== Math.floor((i - 1) / stp); }); }
  rows.forEach(function (i) { var r = ds.rows[i], v = idx.map(function (j) { return r[j]; }); if (v.every(function (x) { return typeof x === "number"; })) { X.push(v); at.push(i); } });
  if (X.length < 60) return null;
  var st = ML.standardize(X), Z = st.Z, rnd = S3.rngN(99), best = null, sample = Z.length > 1500 ? Z.filter(function (_, i) { return i % Math.ceil(Z.length / 1500) === 0; }) : Z;
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
    var sl = sample.map(function (z) { var dists = C.map(function (c) { return Math.sqrt(d2(z, c)); }), o = dists.slice().sort(function (a, b) { return a - b; }); return (o[1] - o[0]) / Math.max(o[1], 1e-12); }), sil = sl.reduce(function (a, b) { return a + b; }, 0) / sl.length;
    if (!best || sil > best.sil) best = {k: k, C: C, lab: lab.slice(), sil: sil};
  }
  var sizes = best.C.map(function (_, ci) { return best.lab.filter(function (l) { return l === ci; }).length; });
  var desc = best.C.map(function (c, ci) { var top = c.map(function (v, q) { return [use[q].name, v]; }).sort(function (a, b) { return Math.abs(b[1]) - Math.abs(a[1]); }).slice(0, 2); return {size: sizes[ci], traits: top}; });
  return {k: best.k, sil: best.sil, desc: desc, use: use.map(function (c) { return c.name; }), centers: best.C, st: st, at: at, lab: best.lab};
}
function runDiscover(ds, done, progress) {
  var cols = scanColumns(ds), n = ds.rows.length, all = [];
  for (var i = 0; i < n; i++) all.push(i);
  if (n > 50000) { var rs = S3.rngN(5); all = all.filter(function () { return rs.u() < 50000 / n; }); }
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
    while (pos < cands.length && Date.now() - start < 25) { var c = cands[pos++], r = null; try { r = testFor(ds, c, A1); } catch (e) {} if (r && r.p < 1) found.push({c: c, a: r}); }
    if (pos < cands.length) { if (progress) progress(pos, cands.length); setTimeout(step, 0); return; }
    finish();
  }
  function finish() {
    // Reversals: strongest links × each grouping column
    var links = found.filter(function (f) { return f.c.type === "link" && f.a.eff >= 0.1; }).sort(function (x, y) { return y.a.eff - x.a.eff; }).slice(0, 15);
    links.forEach(function (f) { cols.cats.filter(function (g) { var u = Object.create(null), k = 0; colVals(ds, idxOf(ds, g.name)).forEach(function (v) { if (v != null && !u[v]) { u[v] = 1; k++; } }); return k <= 12; }).forEach(function (g) { var c = {type: "reversal", a: f.c.a, b: f.c.b, g: g.name}, r = testFor(ds, c, A1); if (r && r.eff > 0) found.push({c: c, a: r}); }); });
    if (outcome) subgroupCandidates(ds, A1, cols, outcome).forEach(function (c) { var r = testFor(ds, c, A1); if (r) found.push({c: c, a: r}); });
    // Curved links count only when the shape adds clearly beyond a straight line
    found = found.filter(function (f) { return f.c.type !== "curve" || f.a.gain > 0.08; });
    var q = bh(found.map(function (f) { return f.a.p; })), out = [];
    found.forEach(function (f, i) {
      if (q[i] > 0.1 || f.a.eff < 0.08) return;
      var r2 = testFor(ds, f.c, B1), confirmed = !!(r2 && r2.p < 0.05 && (f.c.type === "group" || f.c.type === "assoc" || f.c.type === "curve" ? true : r2.dir === f.a.dir));
      var fullRows = all, full = testFor(ds, f.c, fullRows) || f.a;
      if (f.c.type === "curve" && !(full.gain > 0.05)) return;
      out.push({c: f.c, disc: f.a, conf: r2, confirmed: confirmed, full: full, q: q[i]});
    });
    // Keep one of each link/curve pair (the curve only when it confirmed and the line did not explain it)
    var seen = Object.create(null); out = out.filter(function (o) { if (o.c.type !== "curve") return true; var k = [o.c.a, o.c.b].sort().join("|"); if (seen[k]) return false; seen[k] = 1; return true; });
    var cl = null; try { cl = clusterScan(ds, all, cols); } catch (e) {}
    if (cl && cl.sil > 0.25) { var clB = null; try { clB = clusterScan(ds, B1, cols); } catch (e) {} out.push({c: {type: "cluster"}, cl: cl, confirmed: !!(clB && clB.sil > 0.2 && clB.k === cl.k), full: {eff: cl.sil}, disc: {p: 0}}); }
    var un = null; try { var use = cols.nums.slice(0, 15); if (use.length >= 2 && typeof isoForest === "function") { var idx = use.map(function (c) { return idxOf(ds, c.name); }), med = idx.map(function (j) { return S.describe(colVals(ds, j)); }), X = ds.rows.map(function (r) { return idx.map(function (j, q) { return typeof r[j] === "number" ? (r[j] - med[q].median) / (med[q].sd || 1) : 0; }); }), sc = isoForest(X, 100, 256), cut = sc.slice().sort(function (a, b) { return b - a; })[Math.max(0, Math.floor(sc.length * 0.01) - 1)]; var rowsU = []; sc.forEach(function (v, i) { if (v >= cut && v > 0.6) rowsU.push(i); }); if (rowsU.length) { var drive = use.map(function (c, q) { return [c.name, rowsU.reduce(function (s, i) { return s + Math.abs(X[i][q]); }, 0) / rowsU.length]; }).sort(function (a, b) { return b[1] - a[1]; }); un = {rows: rowsU, drive: drive.slice(0, 3)}; } } } catch (e) {}
    if (un) out.push({c: {type: "unusual"}, un: un, confirmed: false, full: {eff: 0.3}, disc: {p: 0}});
    var roleIs = function (n, r) { return roleOf(ds, n) === r; }, expected = out.filter(function (o) { return o.c.type === "link" && ((roleIs(o.c.a, "item") && roleIs(o.c.b, "item")) || (roleIs(o.c.a, "rater") && roleIs(o.c.b, "rater")) || (["item", "rater"].indexOf(roleOf(ds, o.c.a)) >= 0 && ["item", "rater"].indexOf(roleOf(ds, o.c.b)) >= 0)); });
    if (expected.length >= 3) { out = out.filter(function (o) { return expected.indexOf(o) < 0; }); var cs = []; expected.forEach(function (o) { [o.c.a, o.c.b].forEach(function (n) { if (cs.indexOf(n) < 0) cs.push(n); }); }); out.push({c: {type: "expected"}, ex: {cols: cs, n: expected.length, rmin: amin(expected.map(function (o) { return Math.abs(o.full.r); })), rmax: amax(expected.map(function (o) { return Math.abs(o.full.r); }))}, confirmed: true, full: {eff: 0.05}, disc: {p: 0}}); }
    out.sort(function (x, y) { return (y.confirmed - x.confirmed) || (y.full.eff - x.full.eff); });
    done({items: out, tested: found.length ? cands.length + found.filter(function (f) { return f.c.type === "reversal" || f.c.type === "subgroup"; }).length : cands.length, halves: [A1.length, B1.length], cols: cols, outcome: outcome, ms: Date.now() - t0});
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
    case "cluster": var cl = p.cl; return ["The rows fall into " + cl.k + " natural groups", cl.desc.map(function (d, i) { return "group " + (i + 1) + " (" + d.size + " rows): " + d.traits.map(function (t) { return (t[1] > 0 ? "high " : "low ") + esc(nameOf(t[0])); }).join(", "); }).join("; ") + " · separation " + fz(cl.sil)];
    case "expected": return ["The " + p.ex.cols.length + " questionnaire items and rater columns move together, as expected", p.ex.n + " links, ρ from " + fz(p.ex.rmin) + " to " + fz(p.ex.rmax) + ". Check them as a scale (Scale reliability) or as agreement (Rater agreement) rather than one pair at a time"];
    case "unusual": return [p.un.rows.length + (p.un.rows.length === 1 ? " row stands" : " rows stand") + " out from the rest", "mostly through " + p.un.drive.map(function (d) { return esc(nameOf(d[0])); }).join(", ") + " (Isolation Forest, top 1%)"];
  }
  return ["", ""];
}
function openSpec(p) {
  var c = p.c;
  return {link: ["relate", {x: c.a, y: c.b}], curve: ["relate", {x: c.a, y: c.b}], group: ["compare", {y: c.b, g: c.a}], assoc: ["cross", {g: c.a, g2: c.b}], trend: ["trend", {y: c.b, t: c.a}], reversal: ["mixed", {y: c.b, mg: c.g, mx: [c.a]}], subgroup: ["describe", {y: c.b}], expected: p.ex ? (p.ex.cols.every(function (n) { return roleOf(cur(), n) === "rater"; }) ? ["agree", {raters: p.ex.cols}] : ["reliability", {items: p.ex.cols.filter(function (n) { return roleOf(cur(), n) === "item"; })}]) : null, cluster: ["factor", {fitems: p.cl ? p.cl.use : []}]}[c.type];
}
function patternCard(p, i) {
  var t = patternText(p), pinned = DSC.pins.indexOf(i) >= 0, web = DSC.web[i];
  var status = p.c.type === "unusual" || p.c.type === "expected" ? '<span class="chip q-reported">' + (p.c.type === "expected" ? "Expected" : "Descriptive") + "</span>" : p.confirmed ? '<span class="chip q-verified">Confirmed on held-out rows</span>' : '<span class="chip q-estimated">Did not hold up</span>';
  var type = (DSC_TYPES.filter(function (x) { return x[0] === p.c.type; })[0] || [0, ""])[1];
  return '<li class="pcard' + (p.confirmed ? "" : " weak") + '"><div class="pc-top"><span class="label">' + type + "</span>" + status + (pinned ? ' <span class="chip">Pinned</span>' : "") + '</div><p class="pc-head">' + t[0] + '.</p><p class="count">' + t[1] + "</p>" +
    '<div class="slot">' + (openSpec(p) ? '<button type="button" class="btn" data-dopen="' + i + '">Analyse it</button>' : "") + (p.c.type === "subgroup" || p.c.type === "unusual" ? '<button type="button" class="btn" data-dtagrows="' + i + '">Tag these rows</button>' : "") +
    '<button type="button" class="linkbtn" data-dpin="' + i + '">' + (pinned ? "Unpin" : "Pin") + "</button>" + (p.c.type === "expected" ? "" : '<button type="button" class="linkbtn" data-dweb="' + i + '" aria-expanded="' + !!web + '">Look for context on the web</button>') + "</div>" + (web ? webPanel(p, i) : "") + "</li>";
}
function discoverView() {
  var ds = cur(); if (!ds) return noData("Discover", "Add a dataset under Your data, then let EKM scan every column combination for patterns.");
  if (!ds.rows) { loadRows(ds).then(render); return '<p class="count" role="status">Loading…</p>'; }
  var key = ds.id + ":" + ds.rows.length + ":" + ds.cols.length + ":" + (DSC.outcome || "") + ":" + (typeof dataFingerprint === "function" ? dataFingerprint(ds) : "");
  if (DSC.key !== key && !DSC.job) startDiscover(ds, key);
  var res = DSC.key === key ? DSC.res : null, nums = ds.cols.filter(isNum);
  var head = '<h1 class="vt">Discover</h1><p class="lede">EKM tests every pair of columns, curved links, group differences, trends, reversals within groups, subgroups, natural groupings and unusual rows. To avoid chance findings, it searches half of the rows and confirms on the other half.</p>' +
    '<div class="toolbar"><label class="field" for="d_out">Outcome for subgroup search<select id="d_out" data-dout="1"><option value="">' + (res && res.outcome ? "Tagged outcome (" + esc(res.outcome) + ")" : "None") + "</option>" + nums.map(function (c) { return '<option value="' + esc(c.name) + '"' + (c.name === DSC.outcome ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + '</select></label><label class="field" for="d_q">Find<input id="d_q" type="search" value="' + esc(DSC.q) + '" placeholder="a column name"></label></div>' +
    '<div class="pills" role="group" aria-label="Pattern type">' + DSC_TYPES.map(function (x) { return '<button type="button" class="pill' + (DSC.type === x[0] ? " on" : "") + '" aria-pressed="' + (DSC.type === x[0]) + '" data-dtype="' + x[0] + '">' + x[1] + "</button>"; }).join("") + "</div>";
  if (!res) return head + '<p class="count" role="status" id="d-status">' + esc(DSC.status || "Scanning…") + "</p>";
  var items = res.items.map(function (p, i) { return [p, i]; }).filter(function (pi) { var p = pi[0]; if (DSC.type !== "all" && p.c.type !== DSC.type) return false; if (DSC.q) { var hay = [p.c.a, p.c.b, p.c.g, p.c.label].concat(p.cl ? p.cl.use : []).join(" ").toLowerCase(); if (hay.indexOf(DSC.q.toLowerCase()) < 0) return false; } return true; });
  var pins = items.filter(function (pi) { return DSC.pins.indexOf(pi[1]) >= 0; }), good = items.filter(function (pi) { return DSC.pins.indexOf(pi[1]) < 0 && (pi[0].confirmed || pi[0].c.type === "unusual"); }), weak = items.filter(function (pi) { return DSC.pins.indexOf(pi[1]) < 0 && !pi[0].confirmed && pi[0].c.type !== "unusual"; });
  var conf = res.items.filter(function (p) { return p.confirmed; }).length;
  return head + figs([["Combinations tested", res.tested.toLocaleString("en-US")], ["Confirmed patterns", String(conf)], ["Did not hold up", String(res.items.length - conf - res.items.filter(function (p) { return p.c.type === "unusual"; }).length)], ["Rows: search / confirm", res.halves[0] + " / " + res.halves[1]]], true) +
    (pins.length ? '<h2 class="sub-h">Pinned</h2><ul class="plain pcards">' + pins.map(function (pi) { return patternCard(pi[0], pi[1]); }).join("") + "</ul>" : "") +
    '<ul class="plain pcards">' + (good.length ? good.map(function (pi) { return patternCard(pi[0], pi[1]); }).join("") : '<li class="nd">No confirmed patterns of this type. That is a result too: these columns show no relationship strong enough to repeat in both halves.</li>') + "</ul>" +
    (weak.length ? '<details class="dt"' + (DSC.showFailed ? " open" : "") + ' data-dfailed="1"><summary>' + weak.length + " pattern" + (weak.length > 1 ? "s" : "") + " that did not hold up on the held-out rows</summary><ul class=\"plain pcards\">" + weak.map(function (pi) { return patternCard(pi[0], pi[1]); }).join("") + "</ul></details>" : "") +
    '<div class="caveats"><h3>Keep in mind</h3><ul class="plain"><li>Confirmed means the pattern appeared in a random half of the rows and repeated in the other half; it is still an association in these data, not a cause.</li><li>Candidates were filtered with the Benjamini–Hochberg false-discovery rate (10%) across all ' + res.tested.toLocaleString("en-US") + " combinations before confirmation.</li>" + (ds.rows.length > 50000 ? "<li>The scan used a random 50,000 rows; open a pattern to analyse every row.</li>" : "") + "</ul></div>";
}
function startDiscover(ds, key) {
  var job = {}; DSC.job = job; DSC.status = "Scanning…";
  setTimeout(function () { runDiscover(ds, function (res) { if (DSC.job !== job) return; DSC.job = null; DSC.res = res; DSC.key = key; DSC.pins = []; DSC.web = Object.create(null); auditLog("Scanned for patterns", ds, res.items.filter(function (p) { return p.confirmed; }).length + " confirmed of " + res.tested + " combinations"); if (st.tab === "discover") render(); }, function (a, b) { DSC.status = "Scanning… " + Math.round(a / b * 100) + "% of " + b.toLocaleString("en-US") + " combinations"; var el = document.getElementById("d-status"); if (el) el.textContent = DSC.status; }); }, 30);
}
GROUPS.discover = ["discover"]; VIEWS.discover = discoverView;
var _navD = nav; nav = function (t) { if (t !== "discover" && DSC.job && !DSC.res) { /* keep scanning in the background */ } _navD(t); };
view.addEventListener("change", function (e) {
  var t = e.target; if (st.tab !== "discover") return;
  if (t.dataset.dout) { DSC.outcome = t.value; DSC.key = ""; DSC.job = null; render(); return; }
  if (t.id === "d_q") { DSC.q = t.value; render(); refocus("#d_q"); return; }
});
view.addEventListener("click", function (e) {
  var b = e.target.closest("button"), sm = e.target.closest("summary"); if (sm && sm.parentElement.dataset.dfailed) { DSC.showFailed = !sm.parentElement.open; return; }
  if (!b || st.tab !== "discover") return; var d = b.dataset, ds = cur(), res = DSC.res; if (!ds) return;
  if (d.dtype) { DSC.type = d.dtype; render(); refocus('[data-dtype="' + d.dtype + '"]'); return; }
  if (d.dpin != null) { var i = +d.dpin, k = DSC.pins.indexOf(i); if (k >= 0) DSC.pins.splice(k, 1); else DSC.pins.push(i); render(); return; }
  if (d.dopen != null) { var sp = openSpec(res.items[+d.dopen]); A.kind = sp[0]; Object.keys(sp[1]).forEach(function (kk) { A.sel[kk] = sp[1][kk]; }); nav("analyze"); return; }
  if (d.dtagrows != null) { var p = res.items[+d.dtagrows], rows = []; if (p.c.type === "unusual") rows = p.un.rows; else ds.rows.forEach(function (r, ix) { if (p.c.rule(r)) rows.push(ix); }); tagRows(ds, rows, p.c.type === "unusual" ? "Check" : "Subgroup", p.c.type === "subgroup" ? p.c.label.replace(/<[^>]+>/g, "") : "Flagged by Discover", "from Discover"); DSC.key = ""; nav("data"); return; }
  if (d.dweb != null) { var j = +d.dweb; if (DSC.web[j]) delete DSC.web[j]; else DSC.web[j] = {query: defaultQuery(res.items[j]), results: null, busy: false, msg: ""}; render(); return; }
});
