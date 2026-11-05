// Browser checks for the Glossary features carried over from Auto Ontology, in local mode with a mock AI.
// Run: node tests/check_glossary.js   (same PLAYWRIGHT_MODULE / BROWSER_CHANNEL settings as the other suites)
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("assert"), fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ekm-gloss-")), ROOT = path.join(__dirname, "..");
const child = cp.spawn("python3", ["local_ai/server.py", "--port", "0"], {cwd: ROOT, env: Object.assign({}, process.env, {EKM_LLM_MOCK: "1"})});
const appURL = new Promise((ok, no) => { const t = setTimeout(() => no(Error("service startup timeout")), 5000); child.stdout.on("data", (d) => { const m = /http:\/\/127\.0\.0\.1:\d+/.exec(String(d)); if (m) { clearTimeout(t); ok(m[0]); } }); });
const customers = "customer_id,first_name,email,city,signup_date,segment\n" + Array.from({length: 40}, (_, i) => `C${i},Person ${i},p${i}@mail.org,${["Austin", "Boston", "Denver"][i % 3]},${String(1 + (i % 28)).padStart(2, "0")}/0${1 + (i % 9)}/2021,${["Retail", "Wholesale"][i % 2]}`).join("\n");
const orders = "order_id,customer_id,amount,cost,order_date\n" + Array.from({length: 120}, (_, i) => `O${i},C${i % 40},${(20 + (i * 7) % 90).toFixed(2)},${(10 + (i * 3) % 40).toFixed(2)},2022-0${1 + (i % 9)}-1${i % 9}`).join("\n");
let page, width, errors = [], count = 0, fails = 0;
async function check(name, fn) { const before = errors.length; try { await fn(); assert.equal(errors.length, before, "page errors: " + errors.slice(before).join(" | ")); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal overflow"); count++; console.log("PASS " + width + " " + name); } catch (e) { fails++; console.log("FAIL " + width + " " + name + ": " + (e.message || e).split("\n")[0] + " @" + ((e.stack || "").split("\n").filter((l) => /check_glossary/.test(l))[0] || "").replace(/.*check_glossary.js:/, "")); } }
const nav = (t) => page.locator('#tabs a[href="#' + t + '"]').click();
const sec = (s) => page.locator('[data-osec="' + s + '"]').click();
async function upload(text, name) { await nav("data"); await page.locator("#afile").setInputFiles({name, mimeType: "text/csv", buffer: Buffer.from(text)}); await page.waitForFunction((n) => !A.busy && cur() && cur().name === n, name.replace(/\.csv$/, "")); }
async function download(sel) { const p = page.waitForEvent("download", {timeout: 20000}); await page.locator(sel).first().click(); const d = await p; const f = path.join(TMP, width + "-" + d.suggestedFilename()); await d.saveAs(f); return f; }
async function selectAnalysis(page, selector) { const picker = page.locator(".analysis-picker"); if (await picker.count() && !(await picker.evaluate((el) => el.open))) await picker.locator("summary").click(); await page.locator(selector).click(); }
async function ask(q) { await page.locator(".assistant-fold").evaluate((el) => { el.open = true; }); await page.locator("#askq").fill(q); await page.locator('#askform button[type="submit"]').click(); }
async function waitIdle() { await page.waitForFunction(() => !AIX.busy, null, {timeout: 60000}); }

(async () => {
  const url = await appURL, browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || undefined, headless: true});
  const db = path.join(TMP, "shop.sqlite"); cp.execFileSync("python3", ["-c", "import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.execute('create table sales(region text, amount real)');c.executemany('insert into sales values(?,?)',[('North',10),('South',20),('North',5)]);c.commit()", db]);
  try {
    for (width of [1440, 400]) {
      const context = await browser.newContext({viewport: {width, height: 1000}, acceptDownloads: true});
      page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(url); await page.waitForFunction(() => typeof ONT !== "undefined");
      await upload(customers, "customers.csv"); await upload(orders, "orders.csv");
      await check("catalog: ported personal-data rules, uniqueness and stored date formats", async () => {
        await nav("glossary"); const t = await page.locator("#view").innerText();
        assert(/email address · 0\.99/.test(t), "email rule"); assert(/person name · 0\.94/.test(t), "first name in a person table");
        assert(t.includes("DD/MM/YYYY") && t.includes("YYYY-MM-DD"), "date formats"); assert(t.includes("Unique"));
        assert.equal(await page.evaluate(() => cur().cols[idxOf(cur(), "amount")].tags.sens || ""), "");
        assert.equal(await page.evaluate(() => A.sets.filter((s) => s.name === "customers")[0].cols[2].tags.sens), "personal");
      });
      await check("relationships: inferred key with every value contained", async () => {
        await sec("graph"); const t = await page.locator("#view").innerText(); assert(t.includes("customer_id → customer_id"), t.slice(0, 300));
        assert(await page.evaluate(() => inferJoins().edges.some((e) => e.from === "orders" && e.to === "customers" && e.fromCol === "customer_id")));
      });
      await check("terms: drafted, edited with synonyms, certification shown in analyses", async () => {
        await sec("terms"); await page.locator("[data-tdraft]").click(); assert.equal(await page.evaluate(() => ONT.terms.length), 2);
        const id = await page.evaluate(() => ONT.terms.filter((t) => t.ds === "orders")[0].id); await page.locator('[data-tedit-open="' + id + '"]').click();
        const j = await page.evaluate(() => ONT.terms.filter((t) => t.ds === "orders")[0].cols.findIndex((c) => c.col === "amount"));
        await page.locator('[data-tcol="synonyms"][data-j="' + j + '"]').fill("revenue, sales"); await page.locator('[data-tcol="synonyms"][data-j="' + j + '"]').press("Tab");
        await page.locator('[data-tcol="certified"][data-j="' + j + '"]').check();
        await page.locator("#f_name").fill("Margin"); await page.locator("#f_expr").fill("[amount] - [cost]"); await page.locator("#f_desc").fill("Amount minus cost"); await page.locator("[data-fadd]").click();
        await page.locator("[data-fcert]").first().click(); await page.locator("[data-tdone]").click();
        await page.evaluate(() => { pickSet(A.sets.filter((s) => s.name === "orders")[0].id); });
        await nav("analyze"); await selectAnalysis(page, '[data-akind="describe"]'); await page.locator("#y").selectOption("amount");
        assert((await page.locator(".poster").innerText()).includes("Certified definitions"));
      });
      await check("formulas from the glossary become recorded columns", async () => {
        await nav("glossary"); await sec("terms"); const id = await page.evaluate(() => ONT.terms.filter((t) => t.ds === "orders")[0].id); await page.locator('[data-tedit-open="' + id + '"]').click();
        await page.locator("[data-fapply]").first().click(); assert(await page.evaluate(() => idxOf(cur(), "Margin") >= 0 && cur().recipe.some((s) => s.op === "formula" && /glossary/.test(s.text))));
        await page.locator("[data-tdone]").click();
      });
      await check("questions: synonyms route to columns; uncovered terms are named", async () => {
        await nav("analyze"); await ask("Summarize revenue");
        assert.equal(await page.evaluate(() => A.sel.y), "amount");
        await ask("What was the advertising spend for Austin?");
        const msg = await page.locator("#ask-answer").innerText(); assert(/Coverage \d+%/.test(msg) && msg.includes("advertising spend"), msg);
      });
      await check("predictive questions open the tested prediction models", async () => { await nav("analyze"); await ask("Will amount go up?"); assert.equal(await page.evaluate(() => A.kind), "model"); });
      await check("filter values are checked with near-miss suggestions", async () => {
        await page.evaluate(() => { pickSet(A.sets.filter((s) => s.name === "customers")[0].id); A.kind = "describe"; A.sel.where = {conds: [{col: "city", op: "is", v: "Austn"}], any: false}; }); await nav("analyze");
        assert((await page.locator(".subset").innerText()).includes("Did you mean “Austin”"));
        await page.evaluate(() => { A.sel.where = null; });
      });
      await check("joins on non-matching keys are blocked; suggestions fill the right keys", async () => {
        await page.evaluate(() => { pickSet(A.sets.filter((s) => s.name === "orders")[0].id); }); await nav("enhance"); await page.locator('[data-dtsec="join"] summary').click();
        await page.locator("[data-jsugg]").first().click(); assert.equal(await page.evaluate(() => DT.join.kl), "customer_id");
        await page.evaluate(() => { DT.join.kl = "amount"; DT.join.kr = "city"; }); const n = await page.evaluate(() => A.sets.length); await page.locator('[data-dt="join"]').click();
        assert.equal(await page.evaluate(() => A.sets.length), n); assert((await page.locator(".dt-card").innerText()).includes("Blocked"));
      });
      await check("Auto Ontology model YAML round-trips the glossary", async () => {
        await nav("glossary"); await sec("share"); const f = await download('[data-mexp="yaml"]'); const yaml = fs.readFileSync(f, "utf8");
        assert(yaml.includes("data_layer:") && yaml.includes("semantic_layer:") && yaml.includes("columns_attributes:")); assert(!yaml.includes("p1@mail.org"), "personal samples exported");
        const doc = await page.evaluate((y) => parseYaml(y), yaml); assert.equal(doc.semantic_layer.terms.length, 2);
        cp.execFileSync("python3", ["-c", "import json,sys,re\nt=open(sys.argv[1]).read()\ntry:\n import yaml;d=yaml.safe_load(t)\nexcept ImportError:\n d=None\nassert d is None or len(d['semantic_layer']['terms'])==2", f]);
        await page.evaluate(() => { ONT.terms = []; }); await page.locator("#m_imp").setInputFiles(f); await page.waitForFunction(() => ONT.terms.length === 2);
        assert(await page.evaluate(() => ONT.terms.every((t) => t.imported && t.dsId) && ONT.terms.some((t) => t.formulas.some((x) => x.expr === "[amount] - [cost]"))));
      });
      await check("project files keep the glossary", async () => { const n = await page.evaluate(() => validateProject(JSON.parse(JSON.stringify(projectSnapshot()))).ontology.terms.length); assert.equal(n, 2); });
      await check("MCP server answers over the agent export, without rows", async () => {
        await nav("glossary"); await sec("share"); const f = await download('[data-mexp="agent"]'); assert(!fs.readFileSync(f, "utf8").includes("p1@mail.org"));
        const msgs = [{jsonrpc: "2.0", id: 1, method: "initialize", params: {protocolVersion: "2025-06-18"}}, {jsonrpc: "2.0", method: "notifications/initialized"}, {jsonrpc: "2.0", id: 2, method: "tools/list"},
          {jsonrpc: "2.0", id: 3, method: "tools/call", params: {name: "check_answerable", arguments: {question: "What was total revenue for Austin?"}}}, {jsonrpc: "2.0", id: 4, method: "tools/call", params: {name: "describe_table", arguments: {dataset: "orders"}}},
          {jsonrpc: "2.0", id: 5, method: "tools/call", params: {name: "check_answerable", arguments: {question: "advertising spend"}}}];
        const out = cp.execFileSync("python3", [path.join(ROOT, "local_ai/mcp_server.py"), "--ontology", f], {input: msgs.map((m) => JSON.stringify(m)).join("\n") + "\n", encoding: "utf8"}).trim().split("\n").map((l) => JSON.parse(l));
        assert.equal(out.length, 5); assert.equal(out[1].result.tools.length, 9); const cov = out[2].result.structuredContent; assert(cov.coverage === 1 && cov.answerable, JSON.stringify(cov));
        assert(out[3].result.structuredContent.links.length >= 1); assert.deepEqual(out[4].result.structuredContent.uncovered, ["advertising spend"]);
      });
      await check("local AI drafts terms and reviews undecided columns (mock model)", async () => {
        await nav("glossary"); await sec("terms"); await page.locator("[data-aidraft]").click(); await waitIdle(); assert(await page.evaluate(() => ONT.terms.some((t) => t.ai && t.suggested)));
        await sec("catalog"); if (await page.locator("[data-aipii]").count()) { await page.locator("[data-aipii]").click(); await waitIdle(); assert(await page.evaluate(() => A.sets.some((s) => s.cols.some((c) => c.tags && c.tags.pii && c.tags.pii.source === "llm" && c.tags.piiReview)))); }
      });
      await check("AI-chosen analysis is labelled and run with EKM's statistics", async () => {
        await page.evaluate(() => { pickSet(A.sets.filter((s) => s.name === "customers")[0].id); }); await nav("glossary"); await sec("ask");
        await page.locator("#ax_q").fill("Do signups differ by segment?"); await page.locator("#ax_q").press("Tab"); await page.locator("[data-axai]").click(); await waitIdle();
        assert((await page.locator(".aibox").innerText()).includes("AI-generated")); await page.locator('[data-axopen="ai"]').click(); assert.equal(await page.evaluate(() => st.tab), "analyze");
      });
      await check("AI-written SQL is validated, repaired and labelled", async () => {
        await nav("glossary"); await sec("ask"); await page.locator("#ax_q").fill("Total amount by region"); await page.locator("#ax_q").press("Tab"); await page.locator("#ax_target").fill(db); await page.locator("#ax_target").press("Tab");
        await page.locator("[data-axsql]").click(); await waitIdle(); const t = await page.locator(".aibox").last().innerText();
        assert(t.includes("AI-generated query") && t.includes("Repaired 1 time") && t.includes("North"), t.slice(0, 400));
        await page.locator("[data-axsqladd]").click(); assert(await page.evaluate(() => /AI-generated SQL/.test(cur().source)));
      });
      await check("database connector: read-only query through /api/db; writes refused", async () => {
        await nav("data"); await page.locator("#cn_target").fill(db); await page.locator("#cn_target").press("Tab"); await page.locator("#cn_q").fill("SELECT region, amount FROM sales"); await page.locator("#cn_q").press("Tab");
        await page.locator("[data-cndb]").click(); await page.waitForFunction(() => !CN.busy); assert.equal(await page.evaluate(() => cur().rows.length), 3);
        const r = await page.evaluate(() => aiPost("/api/db", {source: {kind: "sqlite", path: AIX.dbTarget}, query: "DELETE FROM sales"}).then(() => "ran", (e) => e.message)); assert(/read-only|Only reading/.test(r), r);
      });
      await context.close();
    }
  } finally { await browser.close(); child.kill(); }
  console.log(count + " glossary checks passed" + (fails ? ", " + fails + " failed" : "")); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); child.kill(); process.exit(1); });
