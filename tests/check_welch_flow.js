// Actual CSV -> Welch -> report -> saved workflow -> downloaded Python/Node replay.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/welch_baseline.json'),'utf8'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ekm-welch-'));
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined,headless:true});try{
for(const width of [1440,400]){
 const context=await browser.newContext({viewport:{width,height:1100},acceptDownloads:true,reducedMotion:"reduce"}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto('file://'+path.join(__dirname,'../dist/index.html'));
 const csv='Balance,Group\n'+fixture.a.map(v=>(v+fixture.offset)+',A').concat(fixture.b.map(v=>(v+fixture.offset)+',B')).join('\n');
 await page.locator('#afile').setInputFiles({name:'Large balances.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.waitForFunction(()=>!A.busy&&cur());
 await page.locator('#tabs a[href="#analyze"]').click();await page.locator('.analysis-picker > summary').click();await page.locator('[data-akind=compare]').click();await page.locator('#y').selectOption('Balance');await page.locator('#g').selectOption('Group');
 const summary=await page.evaluate(()=>LAST_R.summary);assert(Math.abs(summary.p-0.048987877676774275)<1e-11);assert(Math.abs(Math.abs(summary.diff)-3.2211981566820285)<1e-12);assert(summary.ci95[0]>0);assert(await page.evaluate(()=>cur().rows.every(r=>Number.isSafeInteger(r[0]))));
 if(process.env.EKM_SCREENSHOT_DIR){fs.mkdirSync(process.env.EKM_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.EKM_SCREENSHOT_DIR,'welch-fixed-'+width+'.png')});}
 let d=page.waitForEvent('download');await page.locator('[data-exp=html]').click();const report=fs.readFileSync(await(await d).path(),'utf8');assert(report.includes('.049')&&!report.includes('p = 0.057'));
 await page.locator('[data-wfadd]').click();await page.locator('#tabs a[href="#writeup"]').click();
 d=page.waitForEvent('download');await page.locator('[data-wfexp=py]').click();let download=await d;let script=path.join(tmp,'replay-'+width+'.py');await download.saveAs(script);
 d=page.waitForEvent('download');await page.locator('[data-wfdata]').click();download=await d;await download.saveAs(path.join(tmp,download.suggestedFilename()));
 const run=cp.spawnSync(process.env.EKM_PYTHON||'python3',[script],{cwd:tmp,encoding:'utf8'});assert.equal(run.status,0,run.stderr);const replay=JSON.parse(run.stdout);assert(replay.verified);assert.equal(replay.summary.p,summary.p);assert.equal(replay.summary.diff,summary.diff);
 // Unrepresentable confidence limits must fail the result gate, never produce prose.
 await page.evaluate(()=>{var ds=makeSet('Range limit',['Value','Group'],[-1e308,0,1e308].map(v=>[v,'A']).concat([-1e308,1e307,1e308,0].map(v=>[v,'B'])));A.sets=[ds];A.cur=ds.id;A.sel={y:'Value',g:'Group'};A.kind='compare';nav('analyze');});assert(await page.evaluate(()=>LAST_R.valid===false&&!LAST_R.reading.length));assert.equal(await page.locator('[data-wfadd]').count(),0);
 assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS '+width+'px exact-integer import, Welch summary, report, Python replay, overflow refusal');await context.close();
}}finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
