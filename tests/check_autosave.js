// Private autosave: on by default, survives a reload, falls back to IndexedDB for large projects, keeps a private copy
// in the person's own Claude storage (data/users/<id>) and restores it on a new device, and "Delete my saved copies"
// removes every copy. Run: node tests/check_autosave.js   (same PLAYWRIGHT_MODULE / BROWSER_CHANNEL settings as the other suites)
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert"), path = require("path");
const URL = "file://" + (process.env.EKM_TEST_HTML || path.join(__dirname, "../dist/index.html"));
const CSV = "Score,Hours,Group\n" + Array.from({length: 40}, (_, i) => `${i},${(i * 3) % 11},${i % 2 ? "A" : "B"}`).join("\n");
let page, count = 0, fails = 0, errors = [];
async function check(name, fn) { const b = errors.length; try { await fn(); assert.equal(errors.length, b, "page errors: " + errors.slice(b).join(" | ")); count++; console.log("PASS " + name); } catch (e) { fails++; console.log("FAIL " + name + ": " + (e.message || e).split("\n")[0]); } }
async function open(ctx, hash) { page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message)); await page.goto(URL + "#" + (hash || "data")); await page.waitForFunction(() => typeof VIEWS !== "undefined"); return page; }
async function addData(name) { await page.evaluate(() => nav("data")); await page.locator("#afile").setInputFiles({name: (name || "Autosave study") + ".csv", mimeType: "text/csv", buffer: Buffer.from(CSV)}); await page.waitForFunction(() => cur() && !A.busy); }
async function reload() { await page.goto("about:blank"); await page.goto(URL + "#data"); await page.waitForFunction(() => typeof VIEWS !== "undefined"); }
const names = () => page.evaluate(() => A.sets.map((s) => s.name));

// A stand-in for Claude's private storage: one in-memory store shared by every page in the browser (like one account)
const cloudInit = (store) => {
  const docs = store; const snap = (k) => ({exists: k in docs, data: () => docs[k] && JSON.parse(docs[k])});
  const col = (p) => ({doc: (id) => ({get: async () => snap(p + "/" + id), set: async (v) => { docs[p + "/" + id] = JSON.stringify(v); window.__cloudWrites = (window.__cloudWrites || 0) + 1; }, delete: async () => { delete docs[p + "/" + id]; }}),
    where: (f, op, v) => ({get: async () => ({docs: Object.keys(docs).filter((k) => k.startsWith(p + "/") && JSON.parse(docs[k])[f] === v).map((k) => ({data: () => JSON.parse(docs[k])}))})})});
  window.claude = {use: async (n) => n === "db" ? {collection: col} : n === "user" ? {id: async () => "person-1"} : null};
};

(async () => {
  const browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || undefined, headless: true});
  try {
    // ---- 1. Standalone: browser storage ----
    let ctx = await browser.newContext({viewport: {width: 1200, height: 900}});
    await open(ctx);
    await check("autosave is on by default and the setting says it is private", async () => {
      assert.equal(await page.evaluate(() => PROJECT.remember), true);
      await page.evaluate(() => nav("settings")); assert(await page.locator("[data-autosave]").isChecked());
      const t = await page.locator("#view").innerText(); assert(t.includes("Save my work automatically") && t.includes("neither can the owner of this page"), t.slice(0, 400));
      assert.equal(await page.locator("#project-remember").count(), 0, "the old browser-only checkbox should not be duplicated in Settings");
    });
    await check("a dataset survives a reload without saving a file", async () => {
      await addData(); await page.evaluate(() => render()); await reload(); assert.deepEqual(await names(), ["Autosave study"]);
      await page.evaluate(() => nav("settings")); assert((await page.locator("#view").innerText()).includes("Last saved"));
    });
    await check("turning autosave off is remembered and nothing new is kept", async () => {
      await page.evaluate(() => nav("settings")); await page.locator("[data-autosave]").uncheck(); assert.equal(await page.evaluate(() => localStorage.getItem("ekm-remember")), "off");
      assert((await page.locator("#view").innerText()).includes("Automatic saving is off"));
      await page.locator("[data-autosave]").check(); assert.equal(await page.evaluate(() => PROJECT.remember), true);
    });
    await check("delete my saved copies asks first in the page, then removes every copy", async () => {
      await page.evaluate(() => nav("settings")); await page.locator('[data-autodel="ask"]').click();
      assert(await page.locator('[data-autodel="no"]').evaluate((b) => b === document.activeElement), "focus should land on the safe choice");
      await page.locator('[data-autodel="no"]').click(); assert(await page.evaluate(() => !!localStorage.getItem(PROJECT.key)), "keeping should not delete");
      await page.locator('[data-autodel="ask"]').click(); await page.locator('[data-autodel="yes"]').click();
      assert(await page.evaluate(() => !Object.keys(localStorage).some((k) => k.indexOf(PROJECT.key) === 0)), "browser copies remain");
      assert.equal(await page.evaluate(() => PROJECT.remember), false); assert.deepEqual(await names(), ["Autosave study"], "the open work should stay");
      await reload(); assert.deepEqual(await names(), []);
    });
    await ctx.close();

    // ---- 2. Large project: localStorage refuses it, IndexedDB keeps it ----
    ctx = await browser.newContext({viewport: {width: 400, height: 900}});
    await ctx.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k.indexOf("ekm-project-v1") === 0) throw new DOMException("full", "QuotaExceededError"); return set.call(this, k, v); }; });
    await open(ctx);
    await check("a project too large for browser storage is kept in IndexedDB and restored", async () => {
      await addData("Large study"); await page.evaluate(() => render());
      await page.waitForFunction(() => localStorage.getItem("ekm-project-in-idb"), null, {timeout: 8000});
      await reload(); await page.waitForFunction(() => A.sets.length === 1, null, {timeout: 8000}); assert.deepEqual(await names(), ["Large study"]);
      await page.evaluate(() => nav("settings")); assert((await page.locator("#view").innerText()).includes("large-project storage"));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "horizontal overflow at 400px");
    });
    await check("deleting also clears the IndexedDB copy", async () => {
      await page.locator('[data-autodel="ask"]').click(); await page.locator('[data-autodel="yes"]').click();
      await page.waitForFunction(() => new Promise((ok) => { const r = indexedDB.open("ekm", 1); r.onsuccess = () => { const g = r.result.transaction("projects").objectStore("projects").get("current"); g.onsuccess = () => ok(!g.result); }; }));
      await reload(); assert.deepEqual(await names(), []);
    });
    await ctx.close();

    // ---- 3. Inside Claude: a private copy in data/users/<id>, restored on another device ----
    const store = {};
    ctx = await browser.newContext(); await ctx.addInitScript(cloudInit, store);   // the store lives in the page; it is carried to the "new device" below
    await open(ctx);
    await check("inside Claude the project is saved privately under data/users/<id>", async () => {
      await page.waitForFunction(() => ST.on); await addData("Cloud study"); await page.evaluate(() => render());
      await page.waitForFunction(() => AUTO.cloudAt, null, {timeout: 10000});
      const meta = await page.evaluate(() => ST.db.collection("data/users/" + ST.uid).doc("project").get().then((s) => s.data()));
      assert(meta && meta.parts >= 1 && meta.kind === "project", JSON.stringify(meta));
      await page.evaluate(() => nav("settings")); assert((await page.locator("#view").innerText()).includes("your own private Claude storage"));
    });
    const saved = await page.evaluate(() => { const out = {}; return Promise.all(["project"].concat(Array.from({length: 50}, (_, k) => "project_p" + k)).map((id) => ST.db.collection("data/users/person-1").doc(id).get().then((s) => { if (s.exists) out["data/users/person-1/" + id] = JSON.stringify(s.data()); }))).then(() => out); });
    await ctx.close();
    ctx = await browser.newContext(); await ctx.addInitScript(cloudInit, saved); await open(ctx);
    await check("a new device with empty browser storage restores the private Claude copy", async () => {
      await page.waitForFunction(() => A.sets.some((s) => s.name === "Cloud study" && s.rows && s.rows.length === 40), null, {timeout: 10000});
      assert((await page.evaluate(() => PROJECT.message)).includes("restored from your private storage"));
    });
    await check("delete my saved copies removes the private Claude copy too", async () => {
      await page.evaluate(() => nav("settings")); await page.locator('[data-autodel="ask"]').click();
      assert((await page.locator("#view").innerText()).includes("browser and private Claude storage")); await page.locator('[data-autodel="yes"]').click();
      await page.waitForFunction(() => ST.db.collection("data/users/person-1").doc("project").get().then((s) => !s.exists));
      assert.equal(await page.evaluate(() => ST.db.collection("data/users/person-1").doc("project_p0").get().then((s) => s.exists)), false);
    });
    await ctx.close();
  } finally { await browser.close(); }
  console.log(count + " autosave checks passed" + (fails ? ", " + fails + " failed" : "")); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
