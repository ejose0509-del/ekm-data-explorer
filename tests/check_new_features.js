// Browser checks for planning, new analyses, editing, workflows, connectors and publishing.
// Run: node tests/check_new_features.js   (same PLAYWRIGHT_MODULE / BROWSER_CHANNEL settings as the other suites)
// Optional: EKM_PYTHON=/path/to/python with pandas, scipy, statsmodels, pingouin runs the exported Python script.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert"), fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ekm-new-"));
const child = cp.spawn("python3", ["local_ai/server.py", "--port", "0"], {cwd: path.join(__dirname, "..")});
const appURL = new Promise((ok, no) => { const t = setTimeout(() => no(Error("service startup timeout")), 5000); child.stdout.on("data", (d) => { const m = /http:\/\/127\.0\.0\.1:\d+/.exec(String(d)); if (m) { clearTimeout(t); ok(m[0]); } }); });
// Synthetic study: 8 schools, a 4-item scale, two raters, three time points, some missing values
let seed = 11; const u = () => (seed = (seed * 16807) % 2147483647) / 2147483647, nz = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const head = ["Student", "School", "Score", "Hours", "Sleep", "item1", "item2", "item3", "item4", "Rater A", "Rater B", "Passed", "T1", "T2", "T3"], rows = [];
for (let i = 0; i < 160; i++) { const f = nz(), h = 2 + Math.abs(nz()) * 3, sl = 7 + nz(), sc = 40 + 4 * h + 2 * sl + (i % 8) * 1.5 + nz() * 5; const it = [0, 1, 2, 3].map(() => Math.max(1, Math.min(5, Math.round(3 + f + nz() * 0.7))));
  rows.push(["S" + String(i).padStart(3, "0"), "School " + (i % 8), i % 17 === 0 ? "" : sc.toFixed(2), h.toFixed(2), i % 23 === 0 ? "" : sl.toFixed(2), ...it, Math.max(1, Math.min(5, Math.round(3 + f))), Math.max(1, Math.min(5, Math.round(3 + f + nz() * 0.6))), sc > 62 ? "yes" : "no", (10 + f).toFixed(2), (10.6 + f + nz() * 0.5).toFixed(2), (11.1 + f + nz() * 0.8).toFixed(2)]); }
const csv = [head.join(","), ...rows.map((r) => r.join(","))].join("\n");
let page, browser, width, errors = [], count = 0, fails = 0;
async function check(name, fn) {
  const before = errors.length;
  try { await fn(); assert.equal(errors.length, before, "page errors: " + errors.slice(before).join(" | ")); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow"); count++; console.log("PASS " + width + " " + name); }
  catch (e) { fails++; console.log("FAIL " + width + " " + name + ": " + (e.message || e).split("\n")[0]); }
}
const nav = (t) => page.locator('#tabs a[href="#' + t + '"]').click();
const select = async (id, v) => { if (await page.locator("#" + id).count()) await page.locator("#" + id).selectOption(v); };
async function upload(text = csv, name = "Study.csv") { await nav("data"); await page.locator("#afile").setInputFiles({name, mimeType: "text/csv", buffer: Buffer.from(text)}); await page.waitForFunction(() => !A.busy && cur()); }
async function setChecks(key, want) { for (let g = 0; g < 60; g++) { const vals = await page.$$eval('[data-msel="' + key + '"]', (els) => els.map((e) => [e.value, e.checked])); const bad = vals.find(([v, c]) => c !== want.includes(v)); if (!bad) return; await page.locator('[data-msel="' + key + '"][value="' + bad[0] + '"]').click(); } throw Error("could not set " + key); }
async function kind(k) { await nav("analyze"); await selectAnalysis(page, '[data-akind="' + k + '"]'); }
const R = () => page.evaluate(() => ({valid: LAST_R.valid !== false, reading: LAST_R.reading.length, summary: LAST_R.summary}));
async function finite() { const bad = await page.evaluate(() => [].slice.call(view.querySelectorAll("svg *")).some((el) => [].slice.call(el.attributes).some((a) => /NaN|Infinity/.test(a.value)))); assert(!bad, "non-finite SVG geometry"); }
async function download(sel) { const p = page.waitForEvent("download", {timeout: 20000}); await page.locator(sel).first().click(); const d = await p; const file = path.join(TMP, d.suggestedFilename()); await d.saveAs(file); return file; }

(async () => {
  const url = await appURL; browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || undefined, headless: true});
  try {
    for (width of [1440, 400]) {
      const context = await browser.newContext({viewport: {width, height: 1000}, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"]});
      page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url); await page.waitForFunction(() => typeof VIEWS !== "undefined");

      await check("plan: sample size, power and ANOVA match statsmodels", async () => {
        await nav("plan"); assert.equal(await page.locator(".fig.key b").first().innerText(), "64");
        await select("pl_design", "anova"); await page.locator("#es").fill("0.25"); await page.locator("#es").press("Tab"); assert.equal(await page.locator(".fig.key b").first().innerText(), "158");
        await select("pl_solve", "power"); await page.locator("#n").fill("120"); await page.locator("#n").press("Tab"); assert.equal(await page.locator(".fig.key b").first().innerText(), "67.6%");
        await select("pl_design", "tind"); await select("pl_solve", "n"); await page.locator("summary", {hasText: "dropout"}).click(); await page.locator("#drop").fill("10"); await page.locator("#drop").press("Tab");
        assert((await page.locator("#pl-sentence").innerText()).includes("recruit 143"));
        await page.locator("[data-pladd]").click(); await nav("writeup"); assert((await page.locator(".paper").innerText()).includes("64 per group"));
        await page.evaluate(() => { WP.items = []; wpSave(); });
      });
      await upload();
      for (const [k, setup] of [["rmanova", async () => setChecks("rm", ["T1", "T2", "T3"])], ["mixed", async () => { await select("y", "Score"); await select("mg", "School"); await setChecks("mx", ["Hours", "Sleep"]); }],
        ["reliability", async () => setChecks("items", ["item1", "item2", "item3", "item4"])], ["factor", async () => setChecks("fitems", ["item1", "item2", "item3", "item4", "T1", "T2", "T3"])],
        ["agree", async () => setChecks("raters", ["Rater A", "Rater B"])], ["missing", async () => {}], ["model", async () => { await select("mt", "Score"); await setChecks("mp", ["Hours", "Sleep", "School"]); }]])
        await check("analysis " + k + " gives a valid, readable result", async () => { await kind(k); await setup(); const r = await R(); assert(r.valid && r.reading > 0, JSON.stringify(r.summary).slice(0, 200)); await finite(); });
      await check("rater agreement switches to weighted kappa", async () => { await kind("agree"); await setChecks("raters", ["Rater A", "Rater B"]); await select("agmode", "kappa"); await select("agw", "quadratic"); const r = await R(); assert(/Weighted kappa/.test(r.summary.test) && r.summary.kappa > 0.3); });
      await check("model: forest trains, compare table, calibration and prediction column", async () => {
        await kind("model"); await select("mt", "Passed"); await setChecks("mp", ["Hours", "Sleep", "School"]); await select("mm", "forest");
        // Only four negative complete cases remain: use feasible 2-fold validation.
        await select("mv", "k2");
        if (await page.locator("[data-mtrain]").innerText() !== "Retrain") { await page.locator("[data-mtrain]").click(); await page.waitForFunction(() => !MOD.busy && MOD.res, null, {timeout: 60000}); }
        let r = await R(); assert(Number.isFinite(r.summary.cv_mean) && r.summary.metric === "AUC", JSON.stringify(await page.evaluate(()=>({summary:LAST_R.summary,reason:LAST_R.reason,head:localText(LAST_R.head),sel:A.sel,res:MOD.res}))).slice(0,3000));
        // Check the AUC definition, not an arbitrary demand that this tiny class predicts well.
        const pairAUC = await page.evaluate(() => { var st=modelSetup(cur()), result=MOD.res;return S.mean(foldsFor(st,A.sel.mv).map(f=>{var yes=f.test.filter(i=>st.y[i]===1),no=f.test.filter(i=>st.y[i]===0),wins=0;yes.forEach(i=>no.forEach(j=>{wins+=result.oof[i]>result.oof[j]?1:result.oof[i]===result.oof[j]?.5:0;}));return wins/(yes.length*no.length);})); });
        assert(Math.abs(r.summary.cv_mean-pairAUC)<1e-12, 'mean AUC differs from independent positive/negative pair counts');
        await page.locator("[data-mcompare]").click(); await page.waitForFunction(() => !MOD.busy && MOD.compare, null, {timeout: 90000});
        assert((await page.locator(".poster").innerText()).includes("All models, same folds")); assert(await page.locator("text=Calibration slope").count());
        const n = await page.evaluate(() => cur().cols.length); await page.locator("[data-mpredcol]").click(); assert.equal(await page.evaluate(() => cur().cols.length), n + 1);
        await page.locator("[data-eundo]").count(); await page.evaluate(() => { var ds = cur(); ds.rows = E.undo[ds.id].pop().rows; ds.cols = ds.cols.slice(0, -1); ds.recipe.pop(); });
      });
      await check("multiple imputation pools 20 imputations and saves them", async () => {
        await kind("missing"); await select("miy", "Score"); await setChecks("mix", ["Hours", "Sleep"]); await page.locator("[data-mirun]").click(); await page.waitForFunction(() => MI.res);
        assert((await page.locator(".poster").innerText()).includes("Pooled estimate")); const sets = await page.evaluate(() => A.sets.length);
        await page.locator("[data-misave]").click(); assert.equal(await page.evaluate(() => A.sets.length), sets + 1); assert.equal(await page.evaluate(() => cur().rows.length), 20 * 160);
        await page.evaluate(() => { A.sets.shift(); pickSet(A.sets[0].id); });
      });
      await check("scale score and factor score columns are recorded steps", async () => {
        await kind("reliability"); await setChecks("items", ["item1", "item2", "item3", "item4"]); await page.locator("[data-mscale]").click();
        assert(await page.evaluate(() => idxOf(cur(), "Scale score") >= 0 && cur().recipe.some((s) => s.op === "scale")));
        await kind("factor"); await setChecks("fitems", ["item1", "item2", "item3", "item4"]); await select("fk", "1"); await page.locator("[data-mscores]").click();
        assert(await page.evaluate(() => idxOf(cur(), "Factor 1") >= 0));
      });
      await check("grid: edit a cell, undo, and keep numbers numeric", async () => {
        await nav("data"); await page.locator("[data-gedit]").click(); const cell = page.locator('[data-cell="0,2"]'); await cell.fill("99.5"); await cell.press("Tab");
        assert.equal(await page.evaluate(() => cur().rows[0][2]), 99.5); await page.locator('[data-cell="0,2"]').fill("abc"); await page.locator('[data-cell="0,2"]').press("Tab");
        assert((await page.locator(".how").first().innerText()).includes("is not a number")); await nav("enhance"); await page.locator("[data-eundo]").click(); assert.notEqual(await page.evaluate(() => cur().rows[0][2]), 99.5);
        await nav("data"); await page.locator("[data-gedit]").click();
      });
      await check("labels and units reach chart axes and survive a project round trip", async () => {
        await nav("data"); const inp = page.locator('[data-vmeta="unit"][data-vcol="3"]'); await inp.fill("h/week"); await inp.press("Tab");
        await nav("charts"); await page.locator('[data-ctype="histogram"]').click(); await select("y", "Hours"); assert((await page.locator(".achart .ax").first().textContent()).includes("Hours (h/week)"));
        const back = await page.evaluate(() => { var v = validateProject(JSON.parse(JSON.stringify(projectSnapshot()))); return v.datasets[0].cols[3].unit; }); assert.equal(back, "h/week");
      });
      await check("filter conditions change n and can become a step", async () => {
        await kind("describe"); await select("y", "Score"); const n0 = (await R()).summary.n; await page.locator("details.subset summary").click();
        await page.locator("[data-wadd]").click(); await page.locator('[data-wcol="0"]').selectOption("Hours"); await page.locator('[data-wop="0"]').selectOption("gt"); await page.locator('[data-wv="0"]').fill("3"); await page.locator('[data-wv="0"]').press("Tab");
        const n1 = (await R()).summary.n; assert(n1 > 0 && n1 < n0, n0 + " → " + n1); await page.locator("[data-wclear]").click(); assert.equal((await R()).summary.n, n0);
      });
      await check("recode ranges, typed joins and append", async () => {
        await nav("enhance"); await page.locator('[data-dtsec="recode"] summary').click(); await select("rccol", "Hours"); await select("rcmode", "bins");
        await page.locator("#rcbreaks").fill("3, 5"); await page.locator("#rcbreaks").press("Tab"); await page.locator("#rcinto").fill("Hours band"); await page.locator("#rcinto").press("Tab"); await page.locator('[data-ed="recode"]').click();
        assert(await page.evaluate(() => { var j = idxOf(cur(), "Hours band"); return j >= 0 && cur().rows.every((r) => r[j] == null || /under|more/.test(r[j])); }));
        const main = await page.evaluate(() => A.cur);
        await upload("School,Region\nSchool 0,East\nSchool 1,West\nSchool 1,North\nSchool 9,South", "Schools.csv"); const other = await page.evaluate(() => A.cur);
        await page.evaluate((id) => { pickSet(id); }, main); await nav("enhance"); await page.locator('[data-dtsec="join"] summary').click(); await select("jwith", other); await select("jl", "School"); await select("jr", "School"); await select("jtype", "full"); await select("jmany", "every");
        await page.locator('[data-dt="join"]').click(); const j = await page.evaluate(() => ({n: cur().rows.length, south: cur().rows.some((r) => r.includes("South"))})); assert(j.south && j.n === 160 + 20 + 1, JSON.stringify(j));
        await page.evaluate((id) => { pickSet(id); }, main); await nav("enhance"); await page.locator('[data-dtsec="append"] summary').click(); await select("apwith", other); await page.locator('[data-ed="append"]').click();
        assert.equal(await page.evaluate(() => cur().rows.length), 164); await page.evaluate((id) => { A.sets = A.sets.filter((s) => s.id === id); pickSet(id); }, main);
      });
      await check("workflow reruns exactly, flags changed data, and exports scripts", async () => {
        await kind("reliability"); await setChecks("items", ["item1", "item2", "item3", "item4"]); await page.locator("[data-wfadd]").click();
        await kind("mixed"); await select("y", "Score"); await select("mg", "School"); await setChecks("mx", ["Hours", "Sleep"]); await page.locator("[data-wfadd]").click();
        await nav("writeup"); await page.locator("[data-wfrun]").click(); assert((await page.locator("#wf-h").locator("..").innerText()).includes("2 of 2 steps reproduced exactly"));
        await page.evaluate(() => { var ds = cur(); applyStep(ds, {op: "edit", row: 1, col: "Score", value: 10, text: "Edited"}, function () { return opEdit(ds, 1, "Score", 10); }); }); await nav("writeup"); await page.locator("[data-wfrun]").click();
        assert(await page.locator("text=Data changed since recorded").count());
        const py = fs.readFileSync(await download('[data-wfexp="py"]'), "utf8"), r = fs.readFileSync(await download('[data-wfexp="r"]'), "utf8");
        assert(py.includes("csv.reader") && py.includes("subprocess.run") && py.includes("Replay differs")); assert(r.includes("system2") && r.includes("Replay differs"));
        await page.evaluate(() => { var ds = cur(); E.undo[ds.id] = []; });
      });
      await check("exported Python script reproduces EKM's numbers", async () => {
        if (!process.env.EKM_PYTHON) { console.log("      (skipped: set EKM_PYTHON to a Python with pandas, statsmodels and pingouin)"); return; }
        await page.evaluate(() => { WF.steps = []; A.sets = []; }); await upload(); await kind("reliability"); await setChecks("items", ["item1", "item2", "item3", "item4"]); await page.locator("[data-wfadd]").click();
        await kind("compare"); await select("y", "Score"); await select("g", "Passed"); await page.locator("[data-wfadd]").click();
        const alpha = (await page.evaluate(() => WF.steps[0].summary.alpha)), t = await page.evaluate(() => WF.steps[1].summary.t);
        await nav("writeup"); const dir = fs.mkdtempSync(path.join(TMP, "py-")); fs.copyFileSync(await download('[data-wfexp="py"]'), path.join(dir, "workflow.py")); fs.copyFileSync(await download("[data-wfdata]"), path.join(dir, "study-original.csv"));
        const out = cp.execFileSync(process.env.EKM_PYTHON, ["-I", "workflow.py"], {cwd: dir, encoding: "utf8"});
        assert(out.includes(alpha.toFixed(6).slice(0, 7)), "alpha " + alpha + " not in output"); assert(out.includes(Math.abs(t).toFixed(4).slice(0, 5)), "t " + t + " not in output");
      });
      await check("audit trail is chained and detects tampering", async () => {
        await nav("writeup"); await page.locator("[data-auver]").click(); assert((await page.locator("#au-h").locator("..").innerText()).includes("is intact"));
        await page.evaluate(() => { AUD.log[0].detail = "edited later"; }); await page.locator("[data-auver]").click(); assert((await page.locator("#au-h").locator("..").innerText()).includes("history was altered"));
      });
      await check("Word document is a valid .docx with the figure", async () => {
        await kind("describe"); await select("y", "Score"); await page.locator("[data-paper]").click(); await nav("writeup");
        const f = await download('[data-wpx="docx"]'); const listing = cp.execFileSync("python3", ["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;import xml.dom.minidom as m;m.parseString(z.read('word/document.xml'));print(' '.join(z.namelist()))", f], {encoding: "utf8"});
        assert(listing.includes("word/document.xml") && listing.includes("word/media/figure1.png"), listing);
      });
      await check("figure options: palette, axis titles and print resolution", async () => {
        await nav("charts"); await page.locator('[data-ctype="scatter"]').click(); await page.locator(".figopts summary").click(); await select("fg_pal", "okabe"); await page.locator("#fg_yl").fill("Exam score"); await page.locator("#fg_yl").press("Tab"); await select("fg_dpi", "3");
        assert((await page.locator(".chartwrap svg").first().getAttribute("style")).includes("#56B4E9")); assert((await page.locator(".achart .ax").nth(1).textContent()) === "Exam score");
        const png = fs.readFileSync(await download('[data-exp="png"], [data-cexp="png"], button:has-text("Figure (.png)")')); const vbw = +(await page.locator(".chartwrap svg.achart").first().getAttribute("viewBox")).split(" ")[2]; assert.equal(png.readUInt32BE(16), vbw * 3, "PNG width at 3×");
      });
      await check("Parquet import", async () => {
        await nav("data"); await page.locator("#afile").setInputFiles(path.join(__dirname, "fixtures/imports/measurements.parquet")); await page.waitForFunction(() => !A.busy && cur() && cur().name === "measurements");
        const d = await page.evaluate(() => ({cols: cur().cols.map((c) => c.name + ":" + c.type), first: cur().rows[0], missing: cur().rows[3][1]}));
        assert.deepEqual(d.cols, ["Site:category", "Weight kg:number", "Visits:number", "Measured:date"]); assert.deepEqual(d.first, ["North", 61.5, 3, "2025-01-03"]); assert.equal(d.missing, null);
      });
      await check("SQLite source imports, refreshes and replays cleaning steps; private links are refused", async () => {
        const db = path.join(TMP, "w" + width + ".sqlite"); cp.execFileSync("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('create table t(name text, v real)');c.executemany('insert into t values(?,?)',[(' a ',1),('b',2),('c',3)]);c.commit()", db]);
        await nav("data"); await page.locator("#cnpath").fill(db); await page.locator("#cnsql").fill("SELECT * FROM t"); await page.locator('[data-cn="sql"]').click(); await page.waitForFunction(() => !CN.busy);
        assert.equal(await page.evaluate(() => cur().rows.length), 3); await page.evaluate(() => { var ds = cur(); applyStep(ds, {op: "trim", col: "name", text: "Trimmed"}, function () { return opTrim(ds, 0); }); });
        cp.execFileSync("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute(\"insert into t values(' d ',4)\");c.commit()", db]);
        await nav("data"); await page.locator('[data-cn="refresh"]').click(); await page.waitForFunction(() => !CN.busy);
        assert.deepEqual(await page.evaluate(() => cur().rows.map((r) => r[0])), ["a", "b", "c", "d"]);
        await page.locator("#cnsql").fill("DELETE FROM t"); await page.locator('[data-cn="sql"]').click(); await page.waitForFunction(() => !CN.busy); assert(/not authorized|Database error/i.test(await page.evaluate(() => CN.msg)));
        await page.locator("#cnurl").fill("http://127.0.0.1:9/x.csv"); await page.locator('[data-cn="url"]').click(); await page.waitForFunction(() => !CN.busy, null, {timeout: 20000}); assert((await page.evaluate(() => CN.msg)).includes("private network"));
      });
      await context.close();
    }
  } finally { await browser.close(); child.kill(); }
  console.log(count + " new-feature checks passed" + (fails ? ", " + fails + " failed" : "")); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); child.kill(); process.exit(1); });

async function selectAnalysis(page, selector) {
  var picker = page.locator('.analysis-picker');
  if (await picker.count() && !(await picker.evaluate(function (el) { return el.open; }))) await picker.locator('summary').click();
  await page.locator(selector).click();
}
