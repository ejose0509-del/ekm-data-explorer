// Reproductions from the adversarial audit: real UI operations plus state invariants.
var chromium = require(process.env.PLAYWRIGHT_MODULE || 'playwright').chromium;
var assert = require('assert'), fs = require('fs'), path = require('path'), spawn = require('child_process').spawn;
(async function () {
 var child = spawn('python3', ['local_ai/server.py','--port','0'], {cwd:path.join(__dirname,'..')}), browser, count = 0;
 function pass(name) { count++; console.log('PASS '+name); }
 try {
  var url = await new Promise(function (resolve,reject) { var timer=setTimeout(function(){reject(Error('startup timeout'));},5000); child.once('error',reject); child.stdout.on('data',function(d){var m=/http:\/\/127\.0\.0\.1:\d+/.exec(String(d));if(m){clearTimeout(timer);resolve(m[0]);}}); });
  browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||undefined});
  for (var width of [1440,400]) {
   var context = await browser.newContext({viewport:{width:width,height:1000}}), page = await context.newPage(), errors=[];
   page.on('pageerror',function(e){errors.push(e.message);}); await page.goto(((u) => u.includes('#') ? u : u + '#data')(url));
   await page.evaluate(function(){PROJECT.remember=false;});
   async function upload(name,text) { await page.locator('#tabs a[href="#data"]').click(); await page.locator('#afile').setInputFiles({name:name,mimeType:'application/octet-stream',buffer:Buffer.from(text)}); await page.waitForFunction(function(){return !A.busy;}); }
   async function fits() { assert(await page.evaluate(function(){return document.documentElement.scrollWidth<=innerWidth;}),'horizontal page overflow at '+width); }
   await upload('fidelity.csv','ID,Large,Value,Code,Date\n001,9007199254740992,1,NA,2024-02-30\n002,9007199254740993,2,none,2024-02-29\n010,9007199254740994,bad-value,ok,2024-13-01');
   assert.deepEqual(await page.evaluate(function(){return cur().rows;}),[['001','9007199254740992','1','NA','2024-02-30'],['002','9007199254740993','2','none','2024-02-29'],['010','9007199254740994','bad-value','ok','2024-13-01']]);
   assert.notEqual(await page.evaluate(function(){return cur().cols[4].type;}),'date');
   await page.locator('[data-atype="0"]').selectOption('number');
   assert.equal(await page.evaluate(function(){return cur().rows[0][0];}),1);
   await page.locator('[data-atype="0"]').selectOption('text');
   assert.equal(await page.evaluate(function(){return cur().rows[0][0];}),'001');
   await page.locator('[data-atype="2"]').selectOption('number');
   assert.equal(await page.evaluate(function(){return cur().rows[2][2];}),'bad-value');
   assert((await page.getByRole('alert').innerText()).includes('without loss'));
   var download=page.waitForEvent('download');await page.locator('[data-source-csv]').click();var original=fs.readFileSync(await (await download).path(),'utf8');assert(original.includes('001,9007199254740992,1,NA'));assert(original.includes('bad-value'));
   assert(await page.evaluate(function(){var source=JSON.stringify(cur().rawRows);restoreProject(JSON.parse(JSON.stringify(projectSnapshot())));return JSON.stringify(cur().rawRows)===source;}));
   await fits();pass(width+'px lossless identifiers, mixed columns, dates, reversible types, original export and project source');
   await upload('unsafe.json','[{"ID":9007199254740992,"Text":"  keep spaces  "},{"ID":9007199254740993,"Text":"none"}]');
   assert.deepEqual(await page.evaluate(function(){return cur().rows;}),[['9007199254740992','  keep spaces  '],['9007199254740993','none']]);pass(width+'px unsafe JSON integers and literal whitespace');
   await upload('headers.csv','  ID  ,ID,,ID (2)\n001,002,003,004');var headersDownload=page.waitForEvent('download');await page.locator('[data-source-csv]').click();var headerText=fs.readFileSync(await (await headersDownload).path(),'utf8');assert(headerText.startsWith('  ID  ,ID,,ID (2)\n'));assert(await page.evaluate(function(){var p=validateProject(projectSnapshot());return p.datasets[0].sourceHeaders.join('|')==='  ID  |ID||ID (2)';}));pass(width+'px original duplicate and blank headers survive export and project validation');
   await page.locator('summary').filter({hasText:'Import settings'}).click();
   await page.locator('#import-decimal').selectOption(',');await page.locator('#import-missing').selectOption('tokens');
   await upload('locale.csv','Value;Code\n1,5;NA\n2,75;B');assert.deepEqual(await page.evaluate(function(){return cur().rows;}),[[1.5,null],[2.75,'B']]);
   await page.evaluate(function(){IMPORT.decimal='.';IMPORT.missing='blank';});await fits();pass(width+'px explicit decimal comma and missing-value policy');
   await page.locator('#afile').setInputFiles(path.join(__dirname,'fixtures/imports/multiple-sheets.xlsx'));await page.waitForFunction(function(){return !A.busy;});
   assert((await page.locator('#import-sheet option').count())>1);await page.locator('#import-sheet').selectOption('1');var previousId=await page.evaluate(function(){return A.cur;});await page.locator('[data-import-sheet]').click();assert.notEqual(await page.evaluate(function(){return A.cur;}),previousId);assert(await page.evaluate(function(){return cur().name.indexOf(IMPORT.workbook.names[1])>=0;}));assert.deepEqual(await page.evaluate(function(){return cur().rows;}),[[20,'B'],[30,'C']]);await fits();pass(width+'px additional Excel worksheet selection');
   await page.evaluate(function(){var d=makeSet('Labels',['ID','Key','Value'],[['__proto__','ID',1],['constructor','ID',2],['toString','ID',3],['ok','ID',4]]);A.sets=[d];pickSet(d.id);nav('enhance');window.wideResult=widen(d,'ID','Key','Value');var other=makeSet('Right',['ID','Value'],[['__proto__',10],['constructor',20],['toString',30],['ok',40]]);window.joinResult=joinSets(d,other,'ID','ID');});
   var operations=await page.evaluate(function(){return {wide:wideResult,join:joinResult};});assert.equal(operations.wide.rows.length,4);assert.equal(new Set(operations.wide.cols.map(function(c){return c.name;})).size,2);assert.deepEqual(operations.join.rows.map(function(r){return r[r.length-1];}),[10,20,30,40]);
   assert(await page.evaluate(function(){var d=cur();d.rows=wideResult.rows;d.cols=wideResult.cols;return !!validateProject(projectSnapshot());}));
   assert(await page.evaluate(function(){try{parseFormula('constructor(ID)',cur());return false;}catch(e){return true;}}));
   await fits();pass(width+'px special category maps, join, unique reshape columns and formula allowlist');
   assert(await page.evaluate(function(){var d=makeSet('Only',['X'],[[1],[2]]);try{opDrop(d,0);return false;}catch(e){return d.cols.length===1;}}));
   assert(await page.evaluate(function(){var p=projectSnapshot(),before=A.sets;p.selection={preds:'ID'};try{restoreProject(p);return false;}catch(e){return A.sets===before;}}));
   assert(await page.evaluate(function(){var p=projectSnapshot();p.selection={lp:['ID']};p.chart={type:'box',fit:true};validateProject(p);p.selection={lp:'ID'};try{restoreProject(p);return false;}catch(e){return true;}}));
   assert(await page.evaluate(function(){LM.ctl=new AbortController();var ctl=LM.ctl;restoreProject(projectSnapshot());return ctl.signal.aborted && LM.ctl===null;}));pass(width+'px last-column guard, typed selection schemas and restore during inference');
   await upload('disagreement.csv','Value,Group\n1,A\n2,A\n10,B\n11,B');
   await page.locator('#tabs a[href="#analyze"]').click();await selectAnalysis(page, '[data-akind="compare"]');
   var reading=await page.evaluate(function(){return LAST_R.reading.join(' ');});assert(reading.includes('differs at the .05 threshold'));assert(!reading.includes('agrees as a check'));
   await page.locator('#y').focus();await page.locator('#y').selectOption('Value');assert.equal(await page.evaluate(function(){return document.activeElement.id;}),'y');
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(function(){return document.activeElement.id;}),'g');
   await page.locator('.assistant-fold').evaluate(function (el) { el.open = true; }); await page.locator('#askq').fill('What does p = 0.007 tell me?');await page.locator('#askform button[type="submit"]').click();assert((await page.locator('#ask-answer').innerText()).includes('null hypothesis'));
   await page.locator('.assistant-fold').evaluate(function (el) { el.open = true; }); await page.locator('#askq').fill('Combine two files');await page.locator('#askform button[type="submit"]').click();assert((await page.locator('#ask-answer').innerText()).includes('Combine datasets'));await fits();pass(width+'px honest disagreement, keyboard sequence and safe question wording');
   assert(await page.evaluate(function(){var cases=[[9007199254740992,9007199254740994],[-1e308,1e308],[1e-300,2e-300],[1e308,1e308],[0,0]];return cases.every(function(c){var t=ticks(c[0],c[1],6);return t.length>0&&t.length<=100&&t.every(function(v,i){return isFinite(v)&&(!i||v>t[i-1]);});});}));
   await page.evaluate(function(){var d=makeSet('Scaled',['X','Y'],[[1e150,1e150],[2e150,3e150],[3e150,2e150],[4e150,5e150],[5e150,4e150]]);A.sets=[d];pickSet(d.id);A.kind='relate';nav('analyze');});
   assert(Math.abs(await page.evaluate(function(){return LAST_R.summary.r;})-.8)<1e-12);await fits();assert((await page.locator('.achart').first().innerHTML()).includes('×10^150'));assert.equal(await page.locator('.worked tr').filter({has:page.locator('th').filter({hasText:/^r$/})}).locator('.ws-val').innerText(),'0.800');
   if(process.env.EKM_SCREENSHOT_DIR){fs.mkdirSync(process.env.EKM_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.EKM_SCREENSHOT_DIR,'corrected-'+width+'.png'),fullPage:true});await page.locator('.poster').screenshot({path:path.join(process.env.EKM_SCREENSHOT_DIR,'corrected-result-'+width+'.png')});}
   await page.evaluate(function(){var d=makeSet('Huge paired',['X','Y'],[[1e200,2e200],[2e200,3e200],[3e200,4e200],[4e200,5e200]]);A.sets=[d];pickSet(d.id);A.kind='paired';nav('analyze');nav('charts');});await fits();pass(width+'px bounded ticks, scaled correlation, huge paired rendering and mobile layout');
   var elapsed=await page.evaluate(function(){var d=makeSet('Wide',Array.from({length:800},function(_,j){return 'X'+j;}),Array.from({length:100},function(_,i){return Array.from({length:800},function(_,j){return (i*(j+3)%101)+(i%7)/10;});}));A.sets=[d];pickSet(d.id);var t=performance.now();nav('enhance');return performance.now()-t;});assert(elapsed<1500,'wide synchronous render took '+elapsed+'ms');
   await page.waitForFunction(function(){var j=REL.cache.get(cur().rows);return j&&j.state==='running';});await page.locator('[data-relationship-cancel]').click();assert.equal(await page.evaluate(function(){return REL.cache.get(cur().rows).state;}),'cancelled');await page.locator('[data-relationship-start]').click();await page.waitForFunction(function(){return REL.cache.get(cur().rows).state==='complete';},null,{timeout:30000});
   assert.equal(await page.evaluate(function(){return REL.cache.get(cur().rows).done;}),319600);await fits();assert.deepEqual(errors,[]);pass(width+'px background all-pairs scan, cancellation/resume; initial render '+Math.round(elapsed)+'ms');
   await page.evaluate(function(){window.savedWorker=window.Worker;window.Worker=function(){throw new Error('Worker unavailable');};var d=makeSet('Fallback',['X','Y','Z'],Array.from({length:20},function(_,i){return [i,i*2,i%4];}));A.sets=[d];pickSet(d.id);nav('enhance');});await page.waitForFunction(function(){return REL.cache.get(cur().rows).state==='complete';});assert.equal(await page.evaluate(function(){return REL.cache.get(cur().rows).done;}),3);await page.evaluate(function(){window.Worker=window.savedWorker;});pass(width+'px worker-unavailable yielding fallback');
   await context.close();
  }
  var context=await browser.newContext(),p1=await context.newPage();await p1.goto(((u) => u.includes('#') ? u : u + '#data')(url));await p1.evaluate(function(){A.sets=[makeSet('Original',['X'],[[1],[2]])];A.cur=A.sets[0].id;render();});
  var p2=await context.newPage();await p2.goto(((u) => u.includes('#') ? u : u + '#data')(url));await p2.evaluate(function(){A.sets.unshift(makeSet('Second',['X'],[[3],[4]]));A.cur=A.sets[0].id;render();});await p1.waitForFunction(function(){return PROJECT.conflict;});
  await p1.evaluate(function(){A.kind='relate';render();});
  assert.deepEqual(await p1.evaluate(function(){return JSON.parse(localStorage.getItem(PROJECT.key)).datasets.map(function(d){return d.name;});}),['Second','Original']);
  assert(await p1.evaluate(function(){return Object.keys(localStorage).some(function(k){return k.indexOf(PROJECT.key+'-draft-')===0;});}));
  await p1.locator('[data-project-latest]').click();assert.deepEqual(await p1.evaluate(function(){return A.sets.map(function(d){return d.name;});}),['Second','Original']);pass('two-tab save conflict preserves newer copy, stale draft and explicit recovery');
  await Promise.all([p1.evaluate(function(){A.sets.unshift(makeSet('Concurrent one',['X'],[[5],[6]]));A.cur=A.sets[0].id;render();}),p2.evaluate(function(){A.sets.unshift(makeSet('Concurrent two',['X'],[[7],[8]]));A.cur=A.sets[0].id;render();})]);
  // A different renderer can observe its localStorage cache before the browser delivers
  // the other tab's storage event. Wait for both persisted drafts to become visible.
  await p1.waitForFunction(function(){var names=Object.keys(localStorage).filter(function(k){return k.indexOf(PROJECT.key+'-draft-')===0;}).map(function(k){return JSON.parse(localStorage.getItem(k)).project.datasets.map(function(d){return d.name;});});return names.some(function(n){return n.indexOf('Concurrent one')>=0;})&&names.some(function(n){return n.indexOf('Concurrent two')>=0;});});
  var drafts=await p1.evaluate(function(){return Object.keys(localStorage).filter(function(k){return k.indexOf(PROJECT.key+'-draft-')===0;}).map(function(k){return JSON.parse(localStorage.getItem(k)).project.datasets.map(function(d){return d.name;});});});assert(drafts.some(function(names){return names.indexOf('Concurrent one')>=0;}));assert(drafts.some(function(names){return names.indexOf('Concurrent two')>=0;}));
  await p1.locator('[data-project-clear]').click();await p2.waitForFunction(function(){return !PROJECT.remember;});assert(await p1.evaluate(function(){return !Object.keys(localStorage).some(function(k){return k.indexOf(PROJECT.key)===0;});}));pass('simultaneous tabs retain both drafts; forget removes all copies and disables other tabs');await context.close();
  console.log(count+' adversarial regression groups passed');
 } finally {if(browser)await browser.close();child.kill();}
})().catch(function(e){console.error(e);process.exit(1);});

async function selectAnalysis(page, selector) {
  var picker = page.locator('.analysis-picker');
  if (await picker.count() && !(await picker.evaluate(function (el) { return el.open; }))) await picker.locator('summary').click();
  await page.locator(selector).click();
}
