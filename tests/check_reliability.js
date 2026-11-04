var chromium = require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium;
var assert = require('assert'), path = require('path'), fs = require('fs'), spawn = require('child_process').spawn;
(async function () {
 var child = spawn('python3',['local_ai/server.py','--port','0'],{cwd:path.join(__dirname,'..')}), browser;
 try {
  var url = await new Promise(function(resolve,reject){var timer=setTimeout(function(){reject(Error('startup timeout'));},5000);child.once('error',reject);child.stdout.on('data',function(d){var m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(d));if(m){clearTimeout(timer);resolve(m[0]);}});});
  browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined,headless:true});
  for(var width of [1440,400]){
   var context=await browser.newContext({viewport:{width:width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',function(e){errors.push(e.message);});
   await page.goto(url);
   async function upload(data){await page.locator('#afile').setInputFiles({name:'Study.csv',mimeType:'text/csv',buffer:Buffer.from(data)});await page.waitForFunction(function(){return !A.busy;});}
   await upload('X,Y,Group\n1,2,A\n1,3,A\n1,4,B\n1,5,B\n1,6,B');
   await page.locator('#tabs a[href="#analyze"]').click();await selectAnalysis(page, '[data-akind="relate"]');
   assert((await page.locator('.poster').innerText()).includes('constant'));
   assert(!/NaN|Infinity|very strong negative/.test(await page.locator('.poster').innerText()));
   assert.equal(await page.getByRole('button',{name:'Add to write-up',exact:true}).count(),0);
   await page.evaluate(function(){addToPaper(cur(),LAST_R);}); assert.equal(await page.evaluate(function(){return WP.items.length;}),0);
   // Degenerate and small-sample inferential inputs never produce invalid prose.
   for(var kind of ['compare','paired','regress']){
    await selectAnalysis(page, '[data-akind="'+kind+'"]');assert(!/NaN|Infinity/.test(await page.locator('.poster').innerText()));
   }
   await page.locator('#tabs a[href="#data"]').click();await upload('X,Y,Group\n2,3,A\n4,6,A\n5,4,A\n7,9,B\n9,8,B\n11,12,B');
   await page.locator('#tabs a[href="#analyze"]').click();await selectAnalysis(page, '[data-akind="relate"]');
   await page.getByRole('button',{name:'Add to write-up',exact:true}).click();
   for(var label of ['Report (.html)','For Word (.doc)','Figure (.svg)','Figure (.png)']) {
    var nextFile=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();var resultFile=await nextFile,bytes=fs.readFileSync(await resultFile.path());
    if(label==='Figure (.png)')assert.equal(bytes.slice(1,4).toString(),'PNG');else assert(bytes.toString().includes(label==='Figure (.svg)'?'<svg':'<!doctype html>'));
   }
   // A real cleaning step and its undo baseline survive round-trip.
   await page.evaluate(function(){var ds=cur();applyStep(ds,{op:'test',text:'Test rename'},function(){return {rows:ds.rows.map(function(r){return r.slice();}),changed:1};});});
   await page.locator('#tabs a[href="#data"]').click();
   var csv=page.waitForEvent('download');await page.getByRole('button',{name:'Data (.csv)',exact:true}).click();var csvFile=await csv;assert((fs.readFileSync(await csvFile.path(),'utf8')).includes('X,Y,Group'));
   var download=page.waitForEvent('download');await page.getByRole('button',{name:'Save full project (.json)',exact:true}).click();var file=await download;
   var json=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.equal(json.writeup.items.length,1);assert.equal(json.datasets.length,2);assert(json.history.undo[json.current].length);
   assert(await page.evaluate(function(){var old=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new Error('quota');};var title=WP.title;WP.title+=' quota-test';render();var failed=PROJECT.storageMessage.indexOf('unavailable or full')>=0;Storage.prototype.setItem=old;WP.title=title;render();return failed;}));
   await page.reload();assert.equal(await page.evaluate(function(){return A.sets.length;}),2);assert.equal(await page.evaluate(function(){return WP.items.length;}),1);
   assert.equal(await page.evaluate(function(){return E.undo[A.cur].length;}),1);
   await page.getByRole('button',{name:'Forget browser copy',exact:true}).click();await page.reload();assert.equal(await page.evaluate(function(){return A.sets.length;}),0);
   await page.locator('#project-file').setInputFiles({name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});await page.waitForFunction(function(){return A.sets.length===2;});
   assert.equal(await page.evaluate(function(){return WP.items.length;}),1);assert(await page.evaluate(function(){return WP.items[0].fig.indexOf('<svg')===0;}));
   var current=await page.evaluate(function(){return A.cur;});
   await page.locator('#project-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"wrong"}')});await page.waitForFunction(function(){return PROJECT.message.indexOf('not opened')>=0;});assert.equal(await page.evaluate(function(){return A.cur;}),current);
   // Import removes executable markup, preserves safe figures, and rejects objects in numeric cells.
   var safe=await page.evaluate(function(json){json.writeup.items[0].fig='<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://evil.test"/><text onclick="alert(1)">Label</text></svg>';var v=validateProject(json);return v.writeup.items[0].fig;},json);
   assert(!/script|image|onclick|evil/.test(safe));
   var reject=await page.evaluate(function(json){json.datasets[0].rows[0][0]={bad:1};try{validateProject(json);return false;}catch(e){return true;}},json);assert(reject);
   await page.locator('#tabs a[href="#analyze"]').click();await selectAnalysis(page, '[data-akind="relate"]');
   await page.route('**/health',function(r){return r.fulfill({json:{ready:false,model:'missing',message:'Model not installed.'}});});await page.getByRole('button',{name:'Check connection',exact:true}).click();await page.waitForFunction(function(){return LM.health.indexOf('Not ready')===0;});
   var release;await page.route('**/api/explain',function(r){return new Promise(function(resolve){release=async function(){try{await r.fulfill({json:{status:'validated',topic:'result',lines:r.request().postDataJSON().evidence.result}});}catch(e){}resolve();};});});
   await page.locator('#local-model-question').fill('Explain this result');await page.getByRole('button',{name:'Ask local model',exact:true}).click();await page.getByRole('button',{name:'Cancel request',exact:true}).click();assert((await page.locator('#local-model-answer').innerText()).includes('cancelled'));if(release)await release();assert(!await page.getByRole('button',{name:'Ask local model',exact:true}).isDisabled());
   assert(await page.evaluate(function(){return document.documentElement.scrollWidth<=innerWidth;}));assert.deepEqual(errors,[]);
   console.log('PASS '+width+'px validity, native CSV/project download, reload, project restore, history, malicious input, readiness and cancellation');await context.close();
  }
 }finally{if(browser)await browser.close();child.kill();}
})().catch(function(e){console.error(e);process.exitCode=1;});

async function selectAnalysis(page, selector) {
  var picker = page.locator('.analysis-picker');
  if (await picker.count() && !(await picker.evaluate(function (el) { return el.open; }))) await picker.locator('summary').click();
  await page.locator(selector).click();
}
