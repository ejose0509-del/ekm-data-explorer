// Browser checks for tags, plain-language takeaways, the Discover scan and local-mode web context.
// Run: node tests/check_tags_patterns.js   (same PLAYWRIGHT_MODULE / BROWSER_CHANNEL settings as the other suites)
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert"), fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ekm-tags-"));
// The local service runs with a built-in test search provider: no network, fixed results (one contains a prompt-injection sentence).
const child = cp.spawn("python3", ["local_ai/server.py", "--port", "0"], {cwd: path.join(__dirname, ".."), env: Object.assign({}, process.env, {EKM_SEARCH_MOCK: "1"})});
const appURL = new Promise((ok, no) => { const t = setTimeout(() => no(Error("service startup timeout")), 5000); child.stdout.on("data", (d) => { const m = /http:\/\/127\.0\.0\.1:\d+/.exec(String(d)); if (m) { clearTimeout(t); ok(m[0]); } }); });
let seed = 3; const u = () => (seed = (seed * 16807) % 2147483647) / 2147483647, nz = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
// Planted patterns: Score rises with Hours; Score differs by Track; within each Site, Dose and Response fall together although
// across sites they rise together (a reversal); Satisfaction 1–5 is ordinal; Email is personal; two noise columns.
const head = ["Student ID", "Email", "Site", "Track", "Hours", "Score", "Dose", "Response", "Satisfaction", "Noise A", "Noise B"], rows = [];
for (let i = 0; i < 400; i++) { const site = i % 4, h = 1 + 4 * u(), tr = ["Arts", "Science"][i % 2], dose = site * 3 + u() * 2, resp = site * 6 - 2.5 * (dose - site * 3) + nz() * 0.6;
  rows.push(["P" + i, "p" + i + "@mail.org", "Site " + site, tr, h.toFixed(2), (50 + 6 * h + (tr === "Science" ? 5 : 0) + nz() * 4).toFixed(2), dose.toFixed(3), resp.toFixed(3), Math.max(1, Math.min(5, Math.round(3 + nz()))), nz().toFixed(3), nz().toFixed(3)]); }
const csv = [head.join(","), ...rows.map((r) => r.join(","))].join("\n");
const noise = ["a,b,c,d,e,f,g,h,i,j,k,l"].concat(Array.from({length: 300}, () => Array.from({length: 12}, () => nz().toFixed(3)).join(","))).join("\n");
let page, width, errors = [], count = 0, fails = 0;
async function check(name, fn) { const before = errors.length; try { await fn(); assert.equal(errors.length, before, "page errors: " + errors.slice(before).join(" | ")); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow"); count++; console.log("PASS " + width + " " + name); } catch (e) { fails++; console.log("FAIL " + width + " " + name + ": " + (e.message || e).split("\n")[0]); } }
const nav = (t) => page.locator('#tabs a[href="#' + t + '"]').click();
const select = async (id, v) => { if (await page.locator("#" + id).count()) await page.locator("#" + id).selectOption(v); };
async function upload(text = csv, name = "Cohort.csv") { await nav("data"); await page.locator("#afile").setInputFiles({name, mimeType: "text/csv", buffer: Buffer.from(text)}); await page.waitForFunction(() => !A.busy && cur()); }
const colTag = (name) => page.evaluate((n) => cur().cols[idxOf(cur(), n)].tags, name);
async function scan() { await nav("discover"); await page.locator("[data-drun]").click(); await page.waitForFunction(() => DSC.res && !DSC.job, null, {timeout: 120000}); return page.evaluate(() => DSC.res.items.map((p) => ({type: p.c.type, a: p.c.a, b: p.c.b, g: p.c.g, confirmed: p.confirmed}))); }

(async () => {
  const url = await appURL, browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || undefined, headless: true});
  try {
    for (width of [1440, 400]) {
      const context = await browser.newContext({viewport: {width, height: 1000}, acceptDownloads: true});
      page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(((u) => u.includes('#') ? u : u + '#data')(url)); await page.waitForFunction(() => typeof VIEWS !== "undefined"); await upload();
      await check("column tags are suggested from names and values", async () => {
        assert.equal((await colTag("Student ID")).role, "id"); assert.equal((await colTag("Email")).sens, "personal"); assert.equal((await colTag("Site")).role, "group");
        assert.equal((await colTag("Satisfaction")).level, "ordinal"); assert.equal((await colTag("Score")).role, "outcome"); assert((await colTag("Hours")).suggested);
      });
      await check("sensitive columns stay out of CSV exports unless included", async () => {
        const p = page.waitForEvent("download"); await page.locator('[data-exp="csv"]').click(); const f = path.join(TMP, "a" + width + ".csv"); await (await p).saveAs(f);
        assert(!fs.readFileSync(f, "utf8").split("\n")[0].includes("Email")); await page.locator("[data-incsens]").check();
        const p2 = page.waitForEvent("download"); await page.locator('[data-exp="csv"]').click(); const f2 = path.join(TMP, "b" + width + ".csv"); await (await p2).saveAs(f2);
        assert(fs.readFileSync(f2, "utf8").split("\n")[0].includes("Email")); await page.locator("[data-incsens]").uncheck();
      });
      await check("tags steer defaults and ordinal columns get the rank-based caveat", async () => {
        const j = await page.evaluate(() => idxOf(cur(), "Hours")); await page.locator('[data-ctag="role"][data-vcol="' + j + '"]').selectOption("outcome");
        const k = await page.evaluate(() => idxOf(cur(), "Score")); await page.locator('[data-ctag="role"][data-vcol="' + k + '"]').selectOption("predictor");
        await page.evaluate(() => { A.sel = Object.create(null); }); await nav("analyze"); await selectAnalysis(page, '[data-akind="describe"]'); assert.equal(await page.evaluate(() => A.sel.y), "Hours");
        await selectAnalysis(page, '[data-akind="compare"]'); await select("y", "Satisfaction"); await select("g", "Track"); assert(await page.evaluate(() => LAST_R.summary.primary && /Mann/.test(LAST_R.summary.primary.test) && LAST_R.reading.some(c=>/ordinal/.test(c)) && LAST_R.summary.p===LAST_R.summary.primary.p));
        await page.locator("[data-ctconfirm]").count();
      });
      await check("row tags: tag in the grid, Exclude leaves analyses, and replays", async () => {
        await nav("analyze"); await selectAnalysis(page, '[data-akind="describe"]'); await select("y", "Score"); const n0 = await page.evaluate(() => LAST_R.summary.n);
        await nav("data"); for (const i of [0, 1, 2]) await page.locator('[data-rtpick="' + i + '"]').check(); await page.locator("#rt_tag").fill("Exclude"); await page.locator("#rt_note").fill("withdrew consent");
        await page.locator('[data-rtgo="picked"]').click(); assert.deepEqual(await page.evaluate(() => cur().rows.slice(0, 3).map((r) => r[idxOf(cur(), "Row tag")])), ["Exclude", "Exclude", "Exclude"]);
        assert.equal(await page.evaluate(() => cur().rows[0][idxOf(cur(), "Row note")]), "withdrew consent");
        await nav("analyze"); await selectAnalysis(page, '[data-akind="describe"]'); await select("y", "Score"); assert.equal(await page.evaluate(() => LAST_R.summary.n), n0 - 3); assert(await page.evaluate(() => LAST_R.caveats.some((c) => /3 rows tagged Exclude/.test(c))));
        const py = await page.evaluate(() => pyStep(cur().recipe.filter((s) => s.op === "rowtag")[0], cur())); assert(py.includes("Exclude"));
      });
      await check("dataset tags show in the list and survive a project round trip", async () => {
        await nav("data"); await select("dt_status", "clean"); await page.locator("#dt_project").fill("Sleep study"); await page.locator("#dt_project").press("Tab");
        assert((await page.locator(".dslist").innerText()).includes("Sleep study"));
        const back = await page.evaluate(() => { var v = validateProject(JSON.parse(JSON.stringify(projectSnapshot()))); return {ds: v.datasets[0].tags, email: v.datasets[0].cols[1].tags}; }); assert.equal(back.ds.project, "Sleep study"); assert.equal(back.email.sens, "personal");
      });
      await check("data overview summarises and its questions open analyses", async () => {
        await nav("data"); const t = await page.locator(".overview").innerText(); assert(/400 (students|rows)/.test(t) && t.includes("personal or sensitive"));
        await page.locator('[data-xlq="0"]').click(); assert.equal(await page.evaluate(() => st.tab), "analyze");
      });
      for (const k of ["describe", "compare", "relate", "regress", "cross", "mixed", "reliability", "model"])
        await check("takeaway and how-sure badge for " + k, async () => {
          await nav("analyze"); await selectAnalysis(page, '[data-akind="' + k + '"]');
          if (k === "compare") { await select("y", "Score"); await select("g", "Track"); } if (k === "relate") { await select("x", "Hours"); await select("y", "Score"); } if (k === "cross") { await select("g", "Track"); await select("g2", "Site"); }
          if (k === "mixed") { await select("y", "Response"); await select("mg", "Site"); await page.locator('[data-msel="mx"][value="Dose"]').check(); }
          if (k === "model") { await select("mt", "Score"); }
          if (await page.evaluate(() => LAST_R.valid === false)) return;
          const tk = await page.locator(".takeaway").innerText(); assert(tk.length > 30 && /Evidence:|Describes these rows/.test(tk), tk.slice(0, 120));
        });
      await check("everyday translation for a group difference", async () => { await nav("analyze"); await selectAnalysis(page, '[data-akind="compare"]'); await select("y", "Score"); await select("g", "Track"); const t = await page.locator(".takeaway").innerText(); assert(t.includes("Mann–Whitney") && t.includes("Rank-biserial r") && !t.includes("of the time"), t); assert(await page.evaluate(()=>takeaway(cur(),LAST_R).everyday.some(c=>/not estimated/.test(c)))); });
      await check("reading level folds the formula and tables; glossary explains terms", async () => {
        await page.locator('[data-xlvl="new"]').click(); assert(await page.locator(".mathfold").count()); await page.locator('[data-xlvl="researcher"]').click(); assert.equal(await page.locator(".mathfold").count(), 0);
        await page.locator('[data-xlvl="new"]').click(); const term = page.locator("button.term").first(); assert(await term.count(), "no glossary term"); await term.click(); assert((await page.locator(".termdef").innerText()).length > 20);
      });
      await check("example rows show the rows behind the result", async () => { await page.locator("[data-xlex]").click(); assert(await page.locator(".takeaway table tbody tr").count() >= 6); await page.locator("[data-xlex]").click(); });
      await check("Discover finds planted patterns, including the reversal, and confirms them", async () => {
        const items = await scan();
        const has = (f) => items.some((p) => p.confirmed && f(p));
        assert(has((p) => p.type === "link" && [p.a, p.b].sort().join() === "Hours,Score"), "Hours–Score link");
        assert(has((p) => p.type === "group" && p.a === "Track" && p.b === "Score"), "Score by Track");
        assert(has((p) => p.type === "reversal" && [p.a, p.b].sort().join() === "Dose,Response" && p.g === "Site"), "Dose–Response reversal within Site");
        assert(!items.some((p) => p.confirmed && [p.a, p.b].indexOf("Noise A") >= 0 && [p.a, p.b].indexOf("Noise B") >= 0), "noise pair confirmed");
      });
      await check("Discover cards open the matching analysis and tag subgroup rows", async () => {
        await nav("discover"); const i = await page.evaluate(() => DSC.res.items.findIndex((p) => p.c.type === "reversal")); await page.locator('[data-dopen="' + i + '"]').click();
        assert.equal(await page.evaluate(() => A.kind), "mixed"); await nav("discover");
        const s = await page.evaluate(() => DSC.res.items.findIndex((p) => p.c.type === "subgroup")); if (s >= 0) { await page.locator('[data-dtagrows="' + s + '"]').click(); assert(await page.evaluate(() => cur().rows.some((r) => r[idxOf(cur(), "Row tag")] === "Subgroup"))); }
      });
      await check("pure noise yields at most one confirmed pattern", async () => { await upload(noise, "Noise.csv"); const items = await scan(); assert(items.filter((p) => p.confirmed && p.type !== "expected").length <= 1, JSON.stringify(items.filter((p) => p.confirmed))); });
      await check("web context: only the query is sent; results are external and inert", async () => {
        await upload(); const items = await scan(); const i = items.findIndex((p) => p.type === "link"); await page.locator('[data-dweb="' + i + '"]').click();
        const q = await page.locator('[data-wq="' + i + '"]').inputValue(); assert(!q.includes("@") && !q.includes("Email"), q);
        await page.locator('[data-wq="' + i + '"]').fill("sleep hours exam points"); await page.locator('[data-wq="' + i + '"]').press("Tab");
        let sent = null; page.on("request", (r) => { if (r.url().endsWith("/api/search")) sent = r.postData(); });
        await page.locator('[data-wsearch="' + i + '"][data-deep]').click(); await page.waitForFunction(() => Object.values(DSC.web).some((w) => w.results));
        assert.deepEqual(Object.keys(JSON.parse(sent)).sort(), ["deep", "query"]); const txt = await page.locator(".webctx").innerText();
        assert(txt.includes("External context, not checked by EKM") && txt.includes("2.1 more points")); assert(await page.evaluate(() => AUD.log.some((e) => e.action === "Searched the web")));
        assert(!(await page.evaluate(() => JSON.stringify(LAST_R ? LAST_R.reading : []))).includes("causal"));
      });
      await context.close();
    }
  } finally { await browser.close(); child.kill(); }
  console.log(count + " tag, takeaway and pattern checks passed" + (fails ? ", " + fails + " failed" : "")); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); child.kill(); process.exit(1); });

async function selectAnalysis(page, selector) {
  var picker = page.locator('.analysis-picker');
  if (await picker.count() && !(await picker.evaluate(function (el) { return el.open; }))) await picker.locator('summary').click();
  await page.locator(selector).click();
}
