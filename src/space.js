// ---------- 3D view: points in a box with a fitted surface, drawn on a canvas and turned by hand ----------
var SP = {yaw: -0.75, pitch: 0.42, surface: "plane", spec: null};
function fitSurface(xs, ys, zs, curved) {   // z = b0 + b1 x + b2 y (+ b3 xy + b4 x² + b5 y²)
  var rows = xs.map(function (x, i) { var y = ys[i]; return curved ? [1, x, y, x * y, x * x, y * y] : [1, x, y]; }), k = rows[0].length, n = rows.length; if (n <= k + 1) return null;
  var XtX = [], Xtz = []; for (var a = 0; a < k; a++) { XtX.push([]); var sz = 0; for (var b = 0; b < k; b++) { var s = 0; for (var i = 0; i < n; i++) s += rows[i][a] * rows[i][b]; XtX[a].push(s); } for (var j = 0; j < n; j++) sz += rows[j][a] * zs[j]; Xtz.push(sz); }
  var inv = invertM(XtX); if (!inv) return null;
  var beta = inv.map(function (r) { return sum(r.map(function (v, q) { return v * Xtz[q]; })); }), mz = S.mean(zs), sse = 0, sst = 0;
  rows.forEach(function (r, i) { var f = sum(r.map(function (v, q) { return v * beta[q]; })); sse += (zs[i] - f) * (zs[i] - f); sst += (zs[i] - mz) * (zs[i] - mz); });
  return {beta: beta, r2: 1 - sse / sst, f: function (x, y) { var r = curved ? [1, x, y, x * y, x * x, y * y] : [1, x, y]; return sum(r.map(function (v, q) { return v * beta[q]; })); }};
}
function spaceSpec(ds, xn, yn, zn, surface) {
  var xi = idxOf(ds, xn), yi = idxOf(ds, yn), zi = idxOf(ds, zn), P = []; filterRows(ds).forEach(function (r) { if ([r[xi], r[yi], r[zi]].every(function (v) { return typeof v === "number"; })) P.push([r[xi], r[yi], r[zi]]); });
  if (P.length < 5) return null;
  var rng = [0, 1, 2].map(function (c) { var v = P.map(function (p) { return p[c]; }); return [amin(v), amax(v)]; });
  var plane = fitSurface(P.map(function (p) { return p[0]; }), P.map(function (p) { return p[1]; }), P.map(function (p) { return p[2]; }), false), curved = fitSurface(P.map(function (p) { return p[0]; }), P.map(function (p) { return p[1]; }), P.map(function (p) { return p[2]; }), true);
  return {P: P, rng: rng, names: [xn, yn, zn], plane: plane, curved: curved, surface: surface};
}
function drawSpace(cv, sp) {
  if (!cv || !sp) return; var dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr;
  var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  var cs = getComputedStyle(document.documentElement), col = function (v) { return cs.getPropertyValue(v).trim(); };
  var nrm = function (v, c) { var r = sp.rng[c]; return r[1] === r[0] ? 0 : (v - r[0]) / (r[1] - r[0]) * 2 - 1; };
  var cy = Math.cos(SP.yaw), sy = Math.sin(SP.yaw), cp = Math.cos(SP.pitch), spi = Math.sin(SP.pitch), s = Math.min(W, H) * 0.3;
  var proj = function (x, y, z) { var X = x * cy - y * sy, D = x * sy + y * cy, Y = z * cp - D * spi, Z = z * spi + D * cp, f = 3.2 / (3.2 + Z); return [W / 2 + X * s * f, H / 2 - Y * s * f, Z]; };
  var line = function (a, b, color, w) { var p = proj.apply(null, a), q = proj.apply(null, b); g.strokeStyle = color; g.lineWidth = w || 1; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); g.stroke(); };
  var rule = "rgba(237,240,232,.22)", C = [-1, 1];
  C.forEach(function (a) { C.forEach(function (b) { line([-1, a, b], [1, a, b], rule); line([a, -1, b], [a, 1, b], rule); line([a, b, -1], [a, b, 1], rule); }); });
  g.font = "12px " + col("--ui"); g.fillStyle = col("--chalk-2");
  [[[1.18, -1, -1], sp.names[0]], [[-1, 1.18, -1], sp.names[1]], [[-1, -1, 1.18], sp.names[2]]].forEach(function (t) { var p = proj.apply(null, t[0]); g.fillText(t[1], p[0] - 20, p[1]); });
  var fitM = sp.surface === "curved" ? sp.curved : sp.surface === "plane" ? sp.plane : null;
  var pts = sp.P.map(function (p) { return {n: [nrm(p[0], 0), nrm(p[1], 1), nrm(p[2], 2)], above: fitM ? p[2] >= fitM.f(p[0], p[1]) : true}; });
  var drawPts = function (filter) { pts.filter(filter).map(function (p) { var q = proj(p.n[0], p.n[1], p.n[2]); return {q: q}; }).sort(function (a, b) { return b.q[2] - a.q[2]; }).forEach(function (p) { g.globalAlpha = 0.45 + 0.4 * (1 - (p.q[2] + 1.8) / 3.6); g.fillStyle = col("--blue"); g.beginPath(); g.arc(p.q[0], p.q[1], 2.6, 0, 6.283); g.fill(); }); g.globalAlpha = 1; };
  drawPts(function (p) { return !p.above; });
  if (fitM) { var N = 16; g.globalAlpha = 0.75; for (var i = 0; i <= N; i++) { var path = function (fx) { var seg = []; for (var j = 0; j <= N * 3; j++) { var u = -1 + 2 * i / N, v = -1 + 2 * j / (N * 3), pr = fx(u, v); seg.push(pr); } g.strokeStyle = col("--yellow"); g.lineWidth = 1; g.beginPath(); var pen = false; seg.forEach(function (pq) { if (pq[1] < -1.02 || pq[1] > 1.02) { pen = false; return; } var q = proj(pq[0], pq[2], pq[1]); pen ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); pen = true; }); g.stroke(); };
    var real = function (u, c) { var r = sp.rng[c]; return r[0] + (u + 1) / 2 * (r[1] - r[0]); };
    path(function (u, v) { return [u, nrm(fitM.f(real(u, 0), real(v, 1)), 2), v]; }); path(function (u, v) { return [v, nrm(fitM.f(real(v, 0), real(u, 1)), 2), u]; }); } g.globalAlpha = 1; }
  drawPts(function (p) { return p.above; });
}
function spaceBlock(sp, label) {
  SP.spec = sp; if (!sp) return '<p class="nd">At least five rows with all three values are needed for a 3D view.</p>';
  var m = sp.surface === "curved" ? sp.curved : sp.plane, b = sp.plane ? sp.plane.beta : null;
  return '<div class="space"><canvas data-space="1" tabindex="0" role="img" aria-label="' + esc(label) + '. Drag or use the arrow keys to turn it."></canvas></div>' +
    '<div class="toolbar"><label class="field" for="spsurf">Surface<select id="spsurf" data-spsurf="1">' + [["plane", "Flat (linear model)"], ["curved", "Curved (with interaction and squares)"], ["none", "None"]].map(function (o) { return '<option value="' + o[0] + '"' + (sp.surface === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + '</select></label><button type="button" class="btn" data-spreset="1">Reset view</button><span class="count">Drag the box or use the arrow keys to turn it.</span></div>' +
    (b ? figs([["Flat surface R²", fz(sp.plane.r2)], ["Curved surface R²", sp.curved ? fz(sp.curved.r2) : "—"]]) + '<p class="count">Flat surface: ' + esc(sp.names[2]) + " = " + f3(b[0]) + " + " + f3(b[1]) + " × " + esc(sp.names[0]) + " + " + f3(b[2]) + " × " + esc(sp.names[1]) + ". " + (sp.curved && sp.curved.r2 - sp.plane.r2 > 0.03 ? "The curved surface explains noticeably more, so the effect of one predictor depends on the other or bends." : "The curved surface adds little, so a flat (linear) model is a fair description.") + " Points above the surface are drawn over it, points below under it.</p>" : "");
}
function spacePanel(ds, R) { var p = (A.sel.preds || []).filter(function (q) { return q !== A.sel.y; }); return spaceBlock(spaceSpec(ds, p[0], p[1], A.sel.y, SP.surface), A.sel.y + " against " + p[0] + " and " + p[1]); }

// Charts: a 3D scatter type beside the 2D ones
function add3dPill(h) { return h.replace(/data-ctype="line">Line<\/button>/, 'data-ctype="line">Line</button><button type="button" class="pill' + (A.chart.type === "3d" ? " on" : "") + '" aria-pressed="' + (A.chart.type === "3d") + '" data-ctype="3d">3D</button>'); }
function chart3d(ds) {
  var nums = ds.cols.filter(function (c) { return c.type === "number"; }), s = A.sel;
  var head = '<h1 class="vt">' + esc(ds.name) + '</h1><p class="lede">Three number columns at once, with a fitted surface.</p>' + add3dPill('<div class="pills" role="group" aria-label="Chart type">' + [["histogram", "Histogram"], ["bar", "Bar"], ["box", "Box plot"], ["scatter", "Scatter"], ["line", "Line"]].map(function (t) { return '<button type="button" class="pill" aria-pressed="false" data-ctype="' + t[0] + '">' + t[1] + "</button>"; }).join("") + "</div>");
  if (nums.length < 3) return head + '<p class="nd">A 3D chart needs three number columns.</p>';
  if (idxOf(ds, s.x3) < 0) s.x3 = nums[0].name; if (idxOf(ds, s.y3) < 0) s.y3 = nums[1].name; if (idxOf(ds, s.z3) < 0) s.z3 = nums[2].name;
  return head + '<div class="toolbar">' + pick("x3", "Across", nums, s.x3) + pick("y3", "Depth", nums, s.y3) + pick("z3", "Up", nums, s.z3) + '</div><section class="card">' + spaceBlock(spaceSpec(ds, s.x3, s.y3, s.z3, SP.surface), s.z3 + " against " + s.x3 + " and " + s.y3) + "</section>";
}
VIEWS.charts = (function (orig) { return function () { var ds = cur(); if (!ds || !ds.rows) return orig(); return A.chart.type === "3d" ? chart3d(ds) : add3dPill(orig()); }; })(VIEWS.charts);
var _render3 = render; render = function () { _render3(); var cv = view.querySelector("canvas[data-space]"); if (cv && SP.spec) drawSpace(cv, SP.spec); };
(function () {
  var drag = null;
  view.addEventListener("pointerdown", function (e) { var cv = e.target.closest && e.target.closest("canvas[data-space]"); if (!cv) return; drag = {x: e.clientX, y: e.clientY, yaw: SP.yaw, pitch: SP.pitch}; cv.setPointerCapture(e.pointerId); });
  view.addEventListener("pointermove", function (e) { if (!drag) return; SP.yaw = drag.yaw + (e.clientX - drag.x) * 0.01; SP.pitch = Math.max(-1.4, Math.min(1.4, drag.pitch + (e.clientY - drag.y) * 0.01)); drawSpace(view.querySelector("canvas[data-space]"), SP.spec); });
  view.addEventListener("pointerup", function () { drag = null; });
  view.addEventListener("keydown", function (e) { if (!e.target.matches || !e.target.matches("canvas[data-space]")) return; var k = e.key; if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].indexOf(k) < 0) return; e.preventDefault(); if (k === "ArrowLeft") SP.yaw -= 0.12; if (k === "ArrowRight") SP.yaw += 0.12; if (k === "ArrowUp") SP.pitch = Math.min(1.4, SP.pitch + 0.1); if (k === "ArrowDown") SP.pitch = Math.max(-1.4, SP.pitch - 0.1); drawSpace(e.target, SP.spec); });
  view.addEventListener("change", function (e) { if (e.target.dataset && e.target.dataset.spsurf) { SP.surface = e.target.value; render(); } });
  view.addEventListener("click", function (e) { var b = e.target.closest("button[data-spreset]"); if (b) { SP.yaw = -0.75; SP.pitch = 0.42; drawSpace(view.querySelector("canvas[data-space]"), SP.spec); } });
  window.addEventListener("resize", function () { var cv = view.querySelector("canvas[data-space]"); if (cv && SP.spec) drawSpace(cv, SP.spec); });
})();
