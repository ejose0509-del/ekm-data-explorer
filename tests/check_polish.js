// Fixes from a real-data test run (diabetes, heart disease, wine judges): report wording, plain-word assistant, coded
// columns, ID columns kept out of choices, page order, long-format ratings, tick decimals, phone header and panel overflow.
// Run: node tests/check_polish.js   (same PLAYWRIGHT_MODULE / BROWSER_CHANNEL settings as the other suites)
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert"), path = require("path");
const URL = "file://" + (process.env.EKM_TEST_HTML || path.join(__dirname, "../dist/index.html"));
let seed = 11; const u = () => (seed = (seed * 16807) % 2147483647) / 2147483647, nz = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const diab = ["patient_id,age,sex_group,bmi,mean_bp,glucose,progression_1yr"];
for (let i = 0; i < 300; i++) { const bmi = 18 + u() * 24, bp = 70 + nz() * 12; diab.push([i + 1, 20 + Math.round(u() * 59), u() < .5 ? "Group 1" : "Group 2", bmi.toFixed(1), bp.toFixed(0), (90 + nz() * 10).toFixed(0), Math.round(Math.exp(3.4 + bmi / 30 + nz() * .35))].join(",")); }
const heart = ["age,sex,cp,chol,thalach,target"];
for (let i = 0; i < 200; i++) heart.push([30 + Math.round(u() * 45), u() < .65 ? 1 : 0, Math.floor(u() * 4), Math.round(200 + nz() * 40), Math.round(150 + nz() * 20), u() < .5 ? 1 : 0].join(","));
const wine = ["Wine,Judge,Scores"]; for (let w = 1; w <= 8; w++) { const q = 5 + nz() * 2; for (const j of "ABCD") wine.push([w, j, (q + nz() * .8).toFixed(1)].join(",")); }
let page, count = 0, fails = 0, errors = [];
async function check(name, fn) { const b = errors.length; try { await fn(); assert.equal(errors.length, b, "page errors: " + errors.slice(b).join(" | ")); count++; console.log("PASS " + name); } catch (e) { fails++; console.log("FAIL " + name + ": " + (e.message || e).split("\n")[0]); } }
async function upload(name, lines) { await page.evaluate(() => nav("data")); await page.locator("#afile").setInputFiles({name, mimeType: "text/csv", buffer: Buffer.from(lines.join("\n"))}); await page.waitForFunction((n) => !A.busy && cur() && cur().name === n, name.replace(/\.csv$/, "")); }
async function ask(q) { await page.locator(".assistant-fold").evaluate((el) => { el.open = true; }); await page.locator("#askq").fill(q); await page.getByRole("button", {name: "Answer", exact: true}).click(); return page.evaluate(() => ({msg: A.askmsg, kind: A.kind, sel: JSON.parse(JSON.stringify(A.sel))})); }

(async () => {
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || undefined, headless: true});
  try {
    const ctx = await browser.newContext({viewport: {width: 1100, height: 900}}); page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(URL + "#data"); await page.waitForFunction(() => typeof VIEWS !== "undefined");
    await upload("Diabetes.csv", diab);

    await check("data comes first: the page title precedes the project-file card", async () => {
      const t = await page.locator("#view").innerText(); assert(t.indexOf("Your data") >= 0 && t.indexOf("Your data") < t.indexOf("Project file"), t.slice(0, 200));
      assert.equal(await page.locator("#project-remember").count(), 1); assert(!t.includes("CSV redaction does not apply"));
    });
    await check("rank results state the statistic once, and p < .001 never reads p = <", async () => {
      await page.evaluate(() => { A.kind = "relate"; A.sel = Object.assign(Object.create(null), {x: "bmi", y: "progression_1yr"}); nav("analyze"); });
      const R = await page.evaluate(() => ({reading: LAST_R.reading.join(" "), apa: LAST_R.apa, primary: !!LAST_R.summary.primary}));
      assert(R.primary, "fixture should take the rank-based path");
      for (const s of [R.reading, R.apa]) { assert(!/ρ = ([\d.]+), Spearman ρ = \1/.test(s), s); assert(!/p = </.test(s), s); assert(!/= >/.test(s), s); assert(!/estimated a /.test(s), s); }
      assert((R.apa.match(/Spearman/g) || []).length <= 2, R.apa);
      assert.equal(await page.locator(".poster .fig").filter({hasText: "Spearman ρ"}).count(), 1, "the rank statistic should appear once in the result figures");
    });
    await check("write-up: plain-language summary, one lead-in for supporting checks", async () => {
      await page.getByRole("button", {name: "Add to write-up"}).first().click(); await page.evaluate(() => nav("writeup"));
      const t = await page.locator("#view").innerText();
      assert(!t.includes("Secondary/assumption checks"), "old prefix still present"); assert.equal((t.match(/Supporting analyses \(they make different assumptions\)/g) || []).length, 1);
      const summary = t.split("Summary in plain language")[1].split("Methods")[0]; assert(/show|link/.test(summary) && !/Spearman rank correlation:/.test(summary), summary);
    });
    await check("assistant: everyday words and medical abbreviations find the right columns", async () => {
      await page.evaluate(() => nav("analyze"));
      let r = await ask("Does BMI affect diabetes progression?"); assert.equal(r.kind, "relate", r.msg); assert.deepEqual([r.sel.x, r.sel.y].sort(), ["bmi", "progression_1yr"]); assert(/cannot show that one affects the other/.test(r.msg), r.msg);
      r = await ask("Is progression different between sex groups?"); assert.equal(r.kind, "compare", r.msg); assert.equal(r.sel.y, "progression_1yr"); assert.equal(r.sel.g, "sex_group");
      r = await ask("Is blood pressure related to glucose?"); assert.equal(r.kind, "relate", r.msg); assert.deepEqual([r.sel.x, r.sel.y].sort(), ["glucose", "mean_bp"]);
      r = await ask("Does age cause progression?"); assert(/cannot establish causes/.test(r.msg), r.msg);
    });
    await check("ID columns are left out of suggestions and variable lists; measurements are not groups", async () => {
      const ex = await page.locator("[data-local-question]").allInnerTexts(); assert(ex.length && !ex.some((x) => /patient_id/.test(x)), ex.join(" | "));
      await page.evaluate(() => { A.kind = "regress"; A.sel = Object.create(null); nav("analyze"); });
      assert.equal(await page.locator('[data-msel] [value="patient_id"], input[data-msel][value="patient_id"]').count(), 0, "patient_id offered as a predictor");
      assert.equal(await page.locator('select[data-asel="y"] option[value="patient_id"]').count(), 0, "patient_id offered as an outcome");
      await page.evaluate(() => { A.kind = "mixed"; A.sel = Object.create(null); nav("analyze"); });
      const groups = await page.locator('select[data-asel="mg"] option').allInnerTexts(); assert(!groups.includes("bmi") && !groups.includes("mean_bp"), groups.join(","));
    });
    await check("chart tick labels share one number of decimals", async () => {
      await page.evaluate(() => { A.chart.type = "histogram"; A.chart.y = "bmi"; nav("charts"); });
      const sets = await page.evaluate(() => [...document.querySelectorAll("#view svg")].map((svg) => [...svg.querySelectorAll("text")].map((t) => t.textContent.trim()).filter((s) => /^-?[\d,]+(\.\d+)?$/.test(s))));
      for (const s of sets) { const d = new Set(s.map((x) => (x.split(".")[1] || "").length)); assert(d.size <= 2, s.join(" ")); }   // x and y axes may differ; never a mix like 50.00 / 100.0 on one axis
      assert(!sets.flat().some((x) => /^\d{2}\.00$/.test(x)), "whole numbers shown with .00: " + sets.flat().join(" "));
    });
    await check("analysis panels keep wide tables inside their own column", async () => {
      await page.evaluate(() => { A.kind = "regress"; A.sel = Object.assign(Object.create(null), {y: "progression_1yr", preds: ["bmi", "mean_bp", "glucose", "age"]}); nav("analyze"); });
      const over = await page.evaluate(() => [...document.querySelectorAll(".poster > section")].map((s) => s.scrollWidth - s.clientWidth)); assert(over.every((o) => o <= 1), over.join(","));
    });

    await upload("Heart.csv", heart);
    await check("coded 0/1 columns are spotted and can become categories in one step", async () => {
      const card = page.locator(".coded"); assert(await card.isVisible()); const t = await card.innerText(); assert(/sex/.test(t) && /target/.test(t) && /cp/.test(t) && !/chol|thalach|age/.test(t), t);
      await page.locator('[data-coded="all"]').click(); const types = await page.evaluate(() => Object.fromEntries(cur().cols.map((c) => [c.name, c.type])));
      assert.equal(types.sex, "category"); assert.equal(types.target, "category"); assert.equal(types.cp, "category"); assert.equal(types.chol, "number"); assert.equal(await page.locator(".coded").count(), 0);
    });

    await upload("Wine judges.csv", wine);
    await check("ratings stored one row per rating point to a prefilled reshape, then agreement runs", async () => {
      await page.evaluate(() => { A.kind = "agree"; A.sel = Object.create(null); nav("analyze"); });
      const btn = page.locator("[data-longfix]"); assert(await btn.isVisible(), await page.locator(".poster").innerText()); assert(/one column per Judge/.test(await btn.innerText()));
      await btn.click(); assert.equal(await page.evaluate(() => st.tab), "enhance"); assert.deepEqual(await page.evaluate(() => [pw1.value, pw2.value, pw3.value]), ["Wine", "Judge", "Scores"]);
      await page.locator('[data-dt="widen"]').click(); await page.waitForFunction(() => /wide/.test(cur().name));
      await page.evaluate(() => { A.kind = "agree"; A.sel = Object.assign(Object.create(null), {raters: ["A", "B", "C", "D"], agmode: "icc"}); nav("analyze"); });
      assert(/ICC/.test(await page.locator(".tk-head").innerText()));
    });
    await ctx.close();

    const phone = await browser.newContext({viewport: {width: 375, height: 800}}); page = await phone.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(URL + "#glossary"); await page.waitForFunction(() => typeof VIEWS !== "undefined");
    await check("phone: Settings shares the brand row, tabs scroll and the current tab is visible", async () => {
      const brand = await page.locator(".brand").boundingBox(), gear = await page.locator(".ledge-settings").boundingBox(), tabs = await page.locator("#tabs").boundingBox();
      assert(Math.abs((gear.y + gear.height / 2) - (brand.y + brand.height / 2)) < 20, "gear not on the brand row"); assert(tabs.y >= brand.y + brand.height - 2);
      const a = await page.locator('#tabs a[aria-current="page"]').boundingBox(); assert(a.x >= 0 && a.x + a.width <= 375 + 1, "current tab off screen: " + JSON.stringify(a));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow");
      assert((await page.locator(".ledge").boundingBox()).height < 140, "header too tall on a phone");
    });
    await phone.close();
  } finally { await browser.close(); }
  console.log(count + " polish checks passed" + (fails ? ", " + fails + " failed" : "")); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
