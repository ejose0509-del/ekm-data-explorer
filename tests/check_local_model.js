// Start the real Python app; simulate model responses for deterministic UI regression checks.
var chromium = require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium;
var assert = require('assert'), spawn = require('child_process').spawn, path = require('path');
(async function () {
  var child = spawn('python3', ['local_ai/server.py', '--port', '0'], {cwd: path.join(__dirname, '..')});
  var browser;
  try {
    var url = await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('Server startup timed out')); }, 5000);
      child.once('error', reject);
      child.stdout.on('data', function (data) { var m = /http:\/\/127\.0\.0\.1:\d+/.exec(data.toString()); if (m) { clearTimeout(timer); resolve(m[0]); } });
    });
    browser = await chromium.launch({headless: true, channel: process.env.BROWSER_CHANNEL || undefined});
    for (var width of [1440, 400]) {
      var page = await browser.newPage({viewport: {width: width, height: 900}}), errors = [];
      page.on('pageerror', function (e) { errors.push(e.message); });
      await page.goto(((u) => u.includes('#') ? u : u + '#data')(url)); assert.equal(await page.title(), 'EKM Data Explorer');
      await page.locator('#afile').setInputFiles({name: 'local.csv', mimeType: 'text/csv', buffer: Buffer.from('Score,Hours\n10,1\n11,3\n15,2\n14,4\n18,5')});
      await page.waitForFunction(function () { return !A.busy; });
      await page.locator('#tabs a[href="#analyze"]').click();
      await page.route('**/api/explain', async function (route) {
        var packet = route.request().postDataJSON();
        assert.deepEqual(Object.keys(packet).sort(), ['evidence', 'question']);
        await route.fulfill({json: {status: 'validated', topic: 'uncertainty', lines: packet.evidence.uncertainty}});
      });
      async function ask(q) {
        await page.locator('#local-model-question').fill(q);
        await page.getByRole('button', {name: 'Ask local model', exact: true}).click();
        await page.waitForFunction(function () { return LM.state !== 'wait'; });
      }
      await ask('What uncertainty is available?');
      assert((await page.locator('#local-model-answer').innerText()).includes('Evidence selection validated'));
      assert(await page.evaluate(function () { return document.documentElement.scrollWidth <= innerWidth; }));
      await page.unroute('**/api/explain');
      await page.route('**/api/explain', function (r) { return r.fulfill({json: {status: 'validated', lines: ['Invented: cure rate 99% <img src=x>']}}); });
      await ask('Invent an answer');
      assert((await page.locator('#local-model-answer').innerText()).includes('response rejected'));
      assert(!(await page.locator('#local-model-answer').innerText()).includes('99%'));
      await page.unroute('**/api/explain');
      for (var kind of ['omitted', 'duplicate', 'mixed']) {
        await page.route('**/api/explain', function (r) {
          var packet = r.request().postDataJSON(), lines = packet.evidence.result.slice();
          if (kind === 'omitted') lines.pop();
          if (kind === 'duplicate') lines[lines.length - 1] = lines[0];
          if (kind === 'mixed') lines[0] = packet.evidence.pvalue[0];
          return r.fulfill({json: {status: 'validated', topic: 'result', lines: lines}});
        });
        await ask('Explain the result'); assert((await page.locator('#local-model-answer').innerText()).includes('response rejected'));
        await page.unroute('**/api/explain');
      }
      // Exercise the actual refusal path in Python, without calling Ollama.
      await ask('Prove Score causes a cure');
      assert((await page.locator('#local-model-answer').innerText()).includes('Unsupported question'));
      await page.route('**/api/explain', async function (r) {
        var packet = r.request().postDataJSON();
        await new Promise(function (resolve) { setTimeout(resolve, 150); });
        await r.fulfill({json: {status: 'validated', topic: 'result', lines: packet.evidence.result}});
      });
      await page.locator('#local-model-question').fill('Explain this result');
      await page.getByRole('button', {name: 'Ask local model', exact: true}).click();
      await page.locator('[data-asel="y"]').selectOption('Hours');
      await page.waitForTimeout(300);
      assert.equal(await page.locator('#local-model-answer').innerText(), '');
      assert.deepEqual(errors, []);
      console.log('PASS ' + width + 'px local mode, validation, refusal, fallback, stale responses and layout');
      await page.close();
    }
  } finally { if (browser) await browser.close(); child.kill(); }
})().catch(function (e) { console.error(e); process.exitCode = 1; });
