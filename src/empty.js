// ---------- First-run board: each tab previews its work in faint chalk until data arrives ----------
function sketch(kind) {
  var s = '<svg viewBox="0 0 120 80" class="sketch" aria-hidden="true">', axes = '<path d="M14 8 V68 H112"/>';
  if (kind === "table") { s += '<rect x="10" y="10" width="100" height="60" rx="2"/><path d="M10 26 H110 M10 41 H110 M10 56 H110 M42 10 V70 M76 10 V70"/><path class="hl" d="M12 18 H40"/>'; }
  else if (kind === "clean") { s += '<path d="M14 68 H112"/><path d="M24 68 V30 M36 68 V44 M48 68 V22"/><path class="hl" d="M72 68 V30 M84 68 V36 M96 68 V26"/><path d="M58 46 l6 0 m-3 -3 l3 3 l-3 3"/>'; }
  else if (kind === "formula") { s += '<text x="10" y="34" class="sk-t">r =</text><path d="M40 40 H112"/><text x="48" y="32" class="sk-t sm">Σ(x−x̄)(y−ȳ)</text><path d="M44 58 l4 6 l6 -16 H112"/><text x="58" y="60" class="sk-t sm">Σ(x−x̄)²Σ(y−ȳ)²</text>'; }
  else if (kind === "scatter") { s += axes; [[24, 58], [32, 52], [38, 55], [46, 46], [52, 42], [60, 44], [66, 34], [74, 36], [82, 28], [90, 24], [98, 22]].forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.2"/>'; }); s += '<path class="hl" d="M20 60 L104 18"/>'; }
  else if (kind === "histogram") { s += axes; [[20, 50], [32, 34], [44, 20], [56, 26], [68, 42], [80, 54], [92, 60]].forEach(function (b) { s += '<rect x="' + b[0] + '" y="' + b[1] + '" width="10" height="' + (68 - b[1]) + '"/>'; }); }
  else if (kind === "bar") { s += '<path d="M30 8 V70"/>'; [[16, 70], [28, 48], [40, 58], [52, 30]].forEach(function (b, i) { s += '<rect x="30" y="' + b[0] + '" width="' + b[1] + '" height="8"/>'; }); }
  else if (kind === "box") { s += '<path d="M14 68 H112"/><path d="M20 26 H40 M70 26 H100"/><rect x="40" y="18" width="30" height="16"/><path class="hl" d="M54 18 V34"/><path d="M30 52 H50 M82 52 H106"/><rect x="50" y="44" width="32" height="16"/><path class="hl" d="M64 44 V60"/>'; }
  else if (kind === "line") { s += axes + '<path d="M18 56 L34 50 L50 52 L66 38 L82 34 L98 22 L110 20"/><path class="hl" d="M18 62 L34 60 L50 54 L66 50 L82 44 L98 40 L110 34"/>'; }
  return s + "</svg>";
}
var STEPS = [["table", "Add your table", "CSV, Excel or JSON. Column types are read from the values."],
  ["clean", "Check and clean", "A health check finds gaps, duplicates and stray spellings, with fixes you can undo."],
  ["formula", "Analyze", "Correlation, group comparisons, chi-square, trends and regression, with the formula shown."],
  ["scatter", "Read the result", "Each result comes with a chart and a plain-language reading of what it does and does not show."]];
function emptyData(add) {
  return '<div class="first"><div class="first-main"><h1 class="vt">Your data</h1><p class="lede">Add a dataset to begin. EKM checks every column, helps you clean it, then runs the statistics and explains what they show.</p>' + add +
    '<p class="count first-note">Calculations run on your device; results match SciPy. The offline assistant explains results on your device.</p></div>' +
    '<ol class="board-steps" aria-label="How EKM works">' + STEPS.map(function (s, i) {
      return '<li><span class="sn">' + (i + 1) + "</span>" + sketch(s[0]) + "<div><h2>" + s[1] + '</h2><p class="count">' + s[2] + "</p></div></li>";
    }).join("") + "</ol></div>";
}
function noData(title, text) {
  var cta = '<p class="slot"><a class="btn btn-primary" href="#data" data-go="data">Add a dataset</a></p>', ghost = "";
  if (title === "Analyze") ghost = '<div class="poster ghost" aria-hidden="true"><section><h3 class="step"><i>1</i> Method</h3><p class="count">The test and why it fits your columns.</p>' +
    '<div class="math"><math display="block"><mrow><mi>r</mi><mo>=</mo><mfrac><mrow><mo>∑</mo><mo>(</mo><mi>x</mi><mo>−</mo><mover accent="true"><mi>x</mi><mo>¯</mo></mover><mo>)</mo><mo>(</mo><mi>y</mi><mo>−</mo><mover accent="true"><mi>y</mi><mo>¯</mo></mover><mo>)</mo></mrow><msqrt><mrow><mo>∑</mo><msup><mrow><mo>(</mo><mi>x</mi><mo>−</mo><mover accent="true"><mi>x</mi><mo>¯</mo></mover><mo>)</mo></mrow><mn>2</mn></msup><mo>⋅</mo><mo>∑</mo><msup><mrow><mo>(</mo><mi>y</mi><mo>−</mo><mover accent="true"><mi>y</mi><mo>¯</mo></mover><mo>)</mo></mrow><mn>2</mn></msup></mrow></msqrt></mfrac></mrow></math></div></section>' +
    '<section><h3 class="step"><i>2</i> Result</h3><div class="ghost-fig">r = ?</div>' + sketch("scatter") + '<p class="figcap"><b>Fig. 1</b> your two columns, with the fitted line</p></section>' +
    '<section><h3 class="step"><i>3</i> Conclusion</h3><p class="ghost-line w90"></p><p class="ghost-line w75"></p><p class="ghost-line w85"></p><h3>Keep in mind</h3><p class="ghost-line w60"></p></section></div>';
  else if (title === "Charts") ghost = '<ul class="chart-row" aria-label="Chart types">' + [["histogram", "Histogram"], ["bar", "Bar"], ["box", "Box plot"], ["scatter", "Scatter"], ["line", "Line"]].map(function (c) { return "<li>" + sketch(c[0]) + "<span>" + c[1] + "</span></li>"; }).join("") + "</ul>";
  else ghost = '<div class="halves ghost" aria-hidden="true"><div><h3>Before</h3><dl><dt>Rows</dt><dt>Columns</dt><dt>Missing</dt><dt>Findings</dt><dd>—</dd><dd>—</dd><dd>—</dd><dd>—</dd></dl></div><div><h3>Now</h3><dl><dt>Rows</dt><dt>Columns</dt><dt>Missing</dt><dt>Findings</dt><dd>—</dd><dd>—</dd><dd>—</dd><dd>—</dd></dl></div></div>' +
    '<div class="agrid"><div class="amain"><section class="card ghost-card"><h2>Health check</h2><ul class="plain ghost-checks" aria-hidden="true">' + ["q-excluded", "q-estimated", "q-reported"].map(function (c, i) { return '<li><span class="chip ' + c + '">' + ["Fix first", "Check", "Note"][i] + '</span><p class="ghost-line w' + [75, 60, 85][i] + '"></p><span class="ghost-btn"></span></li>'; }).join("") + '</ul><h3>It looks for</h3><ul class="looks">' + [["q-excluded", "Numbers stored as text"], ["q-estimated", "Missing values"], ["q-estimated", "Duplicate rows"], ["q-estimated", "Stray spaces"], ["q-estimated", "Near-identical spellings"], ["q-reported", "Unusual values"], ["q-reported", "Lopsided columns"], ["q-reported", "Columns that repeat each other"]].map(function (x) { return '<li><span class="chip ' + x[0] + '">' + x[1] + "</span></li>"; }).join("") + '</ul></section></div><div class="aside"><section class="card ghost-card"><h2>Change history</h2><ol class="recipe ghost-hist" aria-hidden="true"><li><p class="ghost-line w85"></p></li><li><p class="ghost-line w60"></p></li></ol><p class="count">Every fix is listed in order, with undo.</p></section></div></div>';
  return '<h1 class="vt">' + title + '</h1><p class="lede">' + text + "</p>" + cta + ghost;
}
