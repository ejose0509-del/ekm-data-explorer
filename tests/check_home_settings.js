// Home, Settings and layout checks: the welcoming start page, the settings page in the top right,
// and no overlapping or clipped chart labels in any analysis or chart at desktop and phone width.
// Run: node tests/check_home_settings.js   (same PLAYWRIGHT_MODULE / BROWSER_CHANNEL settings as the other suites)
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert"), path = require("path"), cp = require("child_process");
const child = cp.spawn("python3", ["local_ai/server.py", "--port", "0"], {cwd: path.join(__dirname, "..")});
const appURL = new Promise((ok, no) => { const t = setTimeout(() => no(Error("service startup timeout")), 5000); child.stdout.on("data", (d) => { const m = /http:\/\/127\.0\.0\.1:\d+/.exec(String(d)); if (m) { clearTimeout(t); ok(m[0]); } }); });
let seed = 9; const u = () => (seed = (seed * 16807) % 2147483647) / 2147483647, nz = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const rows = ["patient_id,hospital,treatment,age,systolic_bp,cholesterol_mg_dl,length_of_stay_days,readmitted,visit_date,pain_t1,pain_t2,pain_t3,item1,item2,item3,item4,rater_a,rater_b,annual_income_usd"];
for (let i = 0; i < 300; i++) { const f = nz(), age = 30 + Math.round(u() * 50); rows.push([1000 + i, "General Hospital " + (i % 5), ["Placebo", "Drug A", "Drug B"][i % 3], age, (110 + age * 0.5 + nz() * 12).toFixed(1), (180 + nz() * 35).toFixed(0), Math.max(1, Math.round(4 + nz() * 2)), u() < 0.3 ? "yes" : "no", `2024-${String(1 + i % 12).padStart(2, "0")}-${String(1 + i % 28).padStart(2, "0")}`, (6 + f).toFixed(1), (5 + f + nz() * .5).toFixed(1), (4.2 + f + nz() * .8).toFixed(1), ...[1, 2, 3, 4].map(() => Math.max(1, Math.min(5, Math.round(3 + f + nz() * .7)))), Math.max(1, Math.min(5, Math.round(3 + f))), Math.max(1, Math.min(5, Math.round(3 + f + nz() * .6))), Math.round(45000 + nz() * 30000 + (i === 7 ? 9e6 : 0))].join(",")); }
let page, width, errors = [], count = 0, fails = 0;
async function check(name, fn) { const before = errors.length; try { await fn(); assert.equal(errors.length, before, "page errors: " + errors.slice(before).join(" | ")); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow"); count++; console.log("PASS " + width + " " + name); } catch (e) { fails++; console.log("FAIL " + width + " " + name + ": " + (e.message || e).split("\n")[0]); } }
function overlaps() {   // runs in the page: overlapping or clipped SVG labels, overflowing figures
  const out = [], box = (e) => e.getBoundingClientRect();
  document.querySelectorAll("#view svg").forEach((svg) => {
    const ts = [...svg.querySelectorAll("text")].map((t) => ({t: t.textContent.trim().slice(0, 30), r: box(t)})).filter((x) => x.t && x.r.width > 0), sb = box(svg);
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) { const a = ts[i].r, c = ts[j].r; if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 1.5 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 1.5) out.push("'" + ts[i].t + "' overlaps '" + ts[j].t + "'"); }
    ts.forEach((x) => { if (x.r.left < sb.left - 1 || x.r.right > sb.right + 1) out.push("'" + x.t + "' clipped"); });
  });
  document.querySelectorAll("#view .fig b").forEach((e) => { if (e.scrollWidth > e.clientWidth + 2) out.push("figure overflows: " + e.textContent.slice(0, 30)); });
  return out;
}

(async () => {
  const url = await appURL, browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || undefined, headless: true});
  try {
    for (width of [1300, 400]) {
      const context = await browser.newContext({viewport: {width, height: 900}}); page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/models", (r) => r.fulfill({json: {active: "small:1b", models: [{name: "small:1b", size_gb: 1, parameters: "1B", family: "test"}, {name: "large:8b", size_gb: 8, parameters: "8B", family: "test"}], search: null}}));
      await page.route("**/api/model", (r) => r.fulfill({json: {active: JSON.parse(r.request().postData()).model, models: [{name: "small:1b", size_gb: 1}, {name: "large:8b", size_gb: 8}], search: null}}));
      await page.goto(url); await page.waitForFunction(() => typeof VIEWS !== "undefined");
      await check("opens on a simple Home page with clear first steps", async () => {
        assert.equal(await page.evaluate(() => st.tab), "home"); const t = await page.locator("#view").innerText();
        assert(t.includes("Make sense of your data") && t.includes("Add your data") && t.includes("Plan a new study"));
        await page.locator('.home-actions [data-hgo="plan"]').click(); assert.equal(await page.evaluate(() => st.tab), "plan");
        await page.locator('#tabs a[href="#home"]').click(); await page.locator('.home-actions [data-hgo="data"]').click(); assert.equal(await page.evaluate(() => st.tab), "data");
      });
      await check("settings sits in the top right and opens", async () => {
        const link = page.locator(".ledge-settings"); const b = await link.boundingBox(), tabs = await page.locator("#tabs").boundingBox();
        assert(b.x + b.width >= tabs.x + tabs.width - 2 || b.y > tabs.y, "settings link is not at the right end"); await link.click(); assert.equal(await page.evaluate(() => st.tab), "settings");
        assert.equal(await link.getAttribute("aria-current"), "page");
      });
      await check("settings: switch the local model, remembered", async () => {
        await page.waitForFunction(() => SET.models && SET.models.length === 2); await page.locator('input[data-set="model"][value="large:8b"]').check();
        await page.waitForFunction(() => SET.active === "large:8b"); assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("ekm-settings")).model), "large:8b");
      });
      await check("settings: reading level and chart defaults persist", async () => {
        await page.locator('input[data-set="level"][value="researcher"]').check(); assert.equal(await page.evaluate(() => XL.level), "researcher");
        await page.locator("#set_pal").selectOption("okabe"); assert.equal(await page.evaluate(() => A.chart.pal), "okabe");
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("ekm-settings")).chart.pal), "okabe");
        await page.locator('input[data-set="level"][value="new"]').check(); await page.locator("#set_pal").selectOption("chalk");
      });
      await check("plain names for analyses; an ID column is never the default variable", async () => {
        await page.locator('#tabs a[href="#data"]').click(); await page.locator("#afile").setInputFiles({name: "Cardiology cohort.csv", mimeType: "text/csv", buffer: Buffer.from(rows.join("\n"))}); await page.waitForFunction(() => !A.busy && cur());
        assert(await page.evaluate(() => KINDS.some((k) => k[1] === "Patients within sites") && KINDS.some((k) => k[1] === "Do raters agree?")));
        await page.evaluate(() => { A.kind = "relate"; A.sel = Object.create(null); nav("analyze"); }); assert(await page.evaluate(() => A.sel.x !== "patient_id" && A.sel.y !== "patient_id"));
        assert((await page.locator(".tk-head").innerText()).length > 20);
      });
      await check("no overlapping or clipped labels in any analysis", async () => {
        const bad = []; for (const k of await page.evaluate(() => KINDS.map((x) => x[0]))) { await page.evaluate((k) => { A.kind = k; render(); }, k); (await page.evaluate(overlaps)).forEach((x) => bad.push(k + ": " + x)); }
        assert.deepEqual(bad, []);
      });
      await check("no overlapping or clipped labels in any chart or the plan", async () => {
        const bad = []; await page.evaluate(() => nav("charts")); for (const c of ["histogram", "bar", "box", "scatter", "line"]) { await page.evaluate((c) => { A.chart.type = c; render(); }, c); (await page.evaluate(overlaps)).forEach((x) => bad.push(c + ": " + x)); }
        await page.evaluate(() => nav("plan")); (await page.evaluate(overlaps)).forEach((x) => bad.push("plan: " + x)); assert.deepEqual(bad, []);
      });
      await context.close();
    }
  } finally { await browser.close(); child.kill(); }
  console.log(count + " home, settings and layout checks passed" + (fails ? ", " + fails + " failed" : "")); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); child.kill(); process.exit(1); });
