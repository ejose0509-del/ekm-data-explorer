// Browser import regressions. Requires Playwright and a Chromium browser.
// PLAYWRIGHT_MODULE can point to an existing installation; no project dependency is added.
var chromium = require(process.env.PLAYWRIGHT_MODULE || "playwright").chromium;
var fs = require("fs"), path = require("path"), assert = require("assert");
var pathToFileURL = require("url").pathToFileURL;
var fixtureDir = path.join(__dirname, "fixtures", "imports");
var appURL = pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).href;
var tests=[
 {name:'CSV quoted delimiters, escaped quotes, multiline',file:'quoted.csv',data:'Score,Group,Note\r\n10,A,"one, two"\r\n20,B,"a ""quote""\nand line"\r\n',rows:[[10,'A','one, two'],[20,'B','a "quote"\nand line']]},
 {name:'UTF-8 BOM and semicolon CSV',file:'bom.csv',data:'\ufeffScore;Group\n10;A\n20;B',rows:[[10,'A'],[20,'B']]},
 {name:'TSV file',file:'table.tsv',data:'Score\tGroup\n10\tA\n20\tB',rows:[[10,'A'],[20,'B']]},
 {name:'Pipe delimiter',file:'pipe.txt',data:'Score|Group\n10|A\n20|B',rows:[[10,'A'],[20,'B']]},
 {name:'Quoted comma inside semicolon header',file:'header.csv',data:'"Last, First, Middle";Score\nSmith;10\nJones;20',rows:[['Smith',10],['Jones',20]]},
 {name:'JSON object array with union of keys',file:'objects.json',data:JSON.stringify([{Score:10,Group:'A'},{Score:20,Group:'B',Note:'two'}]),rows:[[10,'A',null],[20,'B','two']]},
 {name:'JSON data wrapper',file:'wrapped.json',data:JSON.stringify({data:[{Score:10},{Score:20}]}),rows:[[10],[20]]},
 {name:'JSON rows wrapper',file:'rows.json',data:JSON.stringify({rows:[{Score:10},{Score:20}]}),rows:[[10],[20]]},
 {name:'JSON nested values',file:'nested.json',data:JSON.stringify([{Score:10,Meta:{site:'A'}},{Score:20,Meta:['B']}]),rows:[[10,'{"site":"A"}'],[20,'["B"]']]},
 {name:'Excel XLSX first worksheet',file:'measurements.xlsx',rows:[[10,'A','one'],[20,'B','two']]},
 {name:'Excel XLS',file:'measurements.xls',rows:[[10,'A','one'],[20,'B','two']]},
 {name:'Duplicate and blank column names',file:'names.csv',data:'Score,Score,,Score (2)\n1,2,3,4',unique:true},
 {name:'Missing trailing cells become null',file:'short.csv',data:'Score,Group\n10,A\n20',rows:[[10,'A'],[20,null]]},
 {name:'Markup is displayed as data',file:'markup.csv',data:'Score,Group\n10,<img src=x onerror=alert(1)>\n20,<script>alert(1)</script>',rows:[[10,'<img src=x onerror=alert(1)>'],[20,'<script>alert(1)</script>']]},
 {name:'Empty CSV rejection',file:'empty.csv',data:'',reject:true},
 {name:'Header-only CSV rejection',file:'header-only.csv',data:'Score,Group\n',reject:true},
 {name:'Invalid JSON rejection',file:'broken.json',data:'[{"Score":',reject:true},
 {name:'Scalar JSON rejection',file:'scalar.json',data:'42',reject:true},
 {name:'Primitive JSON array rejection',file:'primitives.json',data:'[1,2,3]',reject:true},
 {name:'Ragged CSV rejects surplus values',file:'ragged.csv',data:'Score,Group\n10,A,LOST\n20,B',reject:true},
 {name:'Unclosed CSV quote rejection',file:'unclosed.csv',data:'Score,Group\n10,"A\n20,B',reject:true},
 {name:'Corrupt Excel rejection',file:'broken.xlsx',data:Buffer.from([0x50,0x4b,0x03,0x04,0xff,0,0xff]),reject:true},
 {name:'Oversized file rejection',file:'large.csv',data:Buffer.alloc(25000001,32),reject:true}
];
(async function () {
  var browser = await chromium.launch({headless: true, channel: process.env.BROWSER_CHANNEL || undefined});
  var page = await browser.newPage(), errors = [], count = 0;
  page.on("pageerror", function (e) { errors.push(e.message); });
  page.on("dialog", function (d) { errors.push("Unexpected dialog: " + d.message()); d.dismiss(); });
  async function settled() { await page.waitForFunction(function () { return !A.busy; }, null, {timeout: 15000}); }
  async function load() { await page.goto(appURL); errors.length = 0; assert.equal(await page.title(), "EKM Data Explorer"); }
  async function noOverflow() { assert(await page.evaluate(function () { return document.documentElement.scrollWidth <= innerWidth; }), "page overflow"); }
  async function upload(t) {
    var buffer = t.data === undefined ? fs.readFileSync(path.join(fixtureDir, t.file)) : Buffer.from(t.data);
    await page.locator("#afile").setInputFiles({name: t.file, mimeType: "application/octet-stream", buffer: buffer});
    await settled();
  }
  function pass(name) { count++; console.log("PASS " + name); }
  try {
    for (var width of [1440, 400]) {
      await page.setViewportSize({width: width, height: 900});
      for (var t of tests) {
        await load(); await upload(t);
        var got = await page.evaluate(function () { var ds = cur(); return {msg: A.msg, ds: ds ? {cols: ds.cols.map(function (c) { return c.name; }), rows: ds.rows} : null}; });
        assert.deepEqual(errors, [], t.name);
        if (t.reject) { assert.equal(got.ds, null, t.name); assert(got.msg, t.name); assert(await page.getByRole("alert").isVisible()); }
        else {
          assert(got.ds, t.name);
          if (t.unique) assert.equal(new Set(got.ds.cols).size, got.ds.cols.length, t.name);
          else assert.deepEqual(got.ds.rows, t.rows, t.name);
          assert.equal(await page.locator("#view img, #view script").count(), 0, "unescaped markup");
        }
        await noOverflow(); pass(width + "px " + t.name);
      }
      await load();
      await page.locator("summary").filter({hasText: "Paste from"}).click();
      await page.locator("#apaste").fill('Score,Group\n10,"A');
      await page.getByRole("button", {name: "Use pasted data", exact: true}).click();
      assert((await page.getByRole("alert").innerText()).includes("not closed"));
      await page.locator("summary").filter({hasText: "Paste from"}).click();
      await page.locator("#apaste").fill("Score\tGroup\n10\tA\n20\tB");
      await page.getByRole("button", {name: "Use pasted data", exact: true}).click();
      assert.deepEqual(await page.evaluate(function () { return cur().rows; }), [[10, "A"], [20, "B"]]);
      await noOverflow(); pass(width + "px paste error and retry");
      await load();
      await page.locator("#drop").evaluate(function (el) {
        var data = new DataTransfer(); data.items.add(new File(["Score,Group\n10,A\n20,B"], "drop.csv", {type: "text/csv"}));
        el.dispatchEvent(new DragEvent("drop", {bubbles: true, cancelable: true, dataTransfer: data}));
      });
      await settled(); assert.deepEqual(await page.evaluate(function () { return cur().rows; }), [[10, "A"], [20, "B"]]);
      await page.locator('#tabs a[href="#analyze"]').click();
      assert(await page.locator(".poster").isVisible()); await noOverflow();
      assert.deepEqual(errors, []); pass(width + "px drag-drop to analysis");
    }
    await load();
    await page.route("**/xlsx.full.min.js", function (r) { r.abort(); });
    await upload(tests.find(function (t) { return t.file === "measurements.xlsx"; }));
    assert((await page.getByRole("alert").innerText()).includes("CSV"));
    await page.unroute("**/xlsx.full.min.js");
    await upload(tests.find(function (t) { return t.file === "measurements.xlsx"; }));
    assert.deepEqual(await page.evaluate(function () { return cur().rows; }), [[10, "A", "one"], [20, "B", "two"]]);
    assert.deepEqual(errors, []); pass("Excel reader failure then retry in the same tab");
    // A rejected upload must preserve the dataset already being used.
    await upload(tests.find(function (t) { return t.file === "unclosed.csv"; }));
    assert.deepEqual(await page.evaluate(function () { return cur().rows; }), [[10, "A", "one"], [20, "B", "two"]]);
    assert(await page.getByRole("alert").isVisible()); pass("failed upload preserves current dataset");
    console.log(count + " browser import checks passed");
  } finally { await browser.close(); }
})().catch(function (e) { console.error(e); process.exitCode = 1; });
