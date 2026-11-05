// Actual score-column action, independent numerical reference, persisted fit and replay.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const py=process.env.EKM_PYTHON||'python3',ref=path.join(__dirname,'reference_scores.py');
const fixture=JSON.parse(cp.execFileSync(py,[ref,'--fixture'],{encoding:'utf8'}));
const csv=fixture.header.join(',')+'\n'+fixture.body.map(r=>r.map(v=>v==null?'':v).join(',')).join('\n');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ekm-scores-'));
(async()=>{const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||undefined,headless:true});let values=0,maxError=0;try{for(const width of [1440,400]){
const ctx=await browser.newContext({viewport:{width,height:1100},acceptDownloads:true,reducedMotion:'reduce'}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(((u) => u.includes('#') ? u : u + '#data')('file://'+(process.env.EKM_TEST_HTML||path.join(__dirname,'../dist/index.html'))));
for(const [meth,rot,k] of [['pca','none',1],['pca','none',2],['pca','varimax',2],['pca','promax',2],['paf','none',2],['paf','varimax',2],['paf','promax',2]]){
 await page.locator('#afile').setInputFiles({name:'Factors.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await page.waitForFunction(()=>cur()&&!A.busy);
 await page.evaluate(({meth,rot,k})=>{PROJECT.remember=false;A.kind='factor';A.sel={fmeth:meth,fk:String(k),frot:rot,fitems:cur().cols.slice(1,7).map(c=>c.name),f:'Cohort',fv:'A'};nav('analyze');},{meth,rot,k});
 assert.equal(await page.evaluate(()=>LAST_R.summary.n),79);
 // A different exclusion setting must not reuse the cached model.
 assert(await page.evaluate(()=>{const n=LAST_R.summary.n;A.sel.keepExcluded=true;var all=runFactor(cur()).summary.n;A.sel.keepExcluded=false;return n===79&&all===119&&runFactor(cur()).summary.n===79;}));
 const before=await page.evaluate(()=>({rows:cur().rows,cols:cur().cols,fit:LAST_R.scoreFit,training:completeMatrix(cur(),filterRows(cur()),A.sel.fitems).X}));assert(before.fit,'Displayed model has no recorded fit');
 await page.locator('[data-mscores]').click();
 const result=await page.evaluate(()=>({rows:cur().rows,cols:cur().cols,recipe:cur().recipe,summary:LAST_R.summary}));assert.equal(result.cols.length,9+k);assert.equal(result.rows.filter(r=>r[9]!=null).length,79);assert(result.rows.filter(r=>r[8]==='Exclude'||r[7]!=='A'||r[1]==null).every(r=>r.slice(9).every(v=>v===null)));
 const scores=result.rows.filter(r=>r[9]!=null).map(r=>r.slice(9));
 const checked=cp.spawnSync(py,[ref],{input:JSON.stringify({fit:before.fit,training:before.training,scores}),encoding:'utf8'});assert.equal(checked.status,0,checked.stderr);const numbers=JSON.parse(checked.stdout);values+=numbers.values;maxError=Math.max(maxError,numbers.max_score_error);
 const saved=await page.evaluate(()=>{const p=projectSnapshot();restoreProject(JSON.parse(JSON.stringify(p)));var ds=cur(),step=ds.recipe.find(s=>s.op==='scores');A.sel={f:'Cohort',fv:'B',keepExcluded:true};var orig=E.orig[ds.id];var baseline={cols:orig.cols,rows:orig.rows};var r=replayStep(baseline,step);return {rows:r.rows,step};});assert.deepEqual(saved.rows,result.rows);assert.deepEqual(saved.step.fit,before.fit);
 // Actual downloaded whole workflow (source + saved score fit + analysis).
 if(meth==='paf'&&rot==='promax'){
  await page.evaluate(()=>{A.kind='describe';A.sel={y:'Factor 1'};nav('analyze');});await page.locator('[data-wfadd]').click();await page.locator('#tabs a[href="#writeup"]').click();
  let d=page.waitForEvent('download');await page.locator('[data-wfexp=py]').click();let script=path.join(tmp,'scores-'+width+'.py');await(await d).saveAs(script);
  d=page.waitForEvent('download');await page.locator('[data-wfdata]').click();let source=await d;await source.saveAs(path.join(tmp,source.suggestedFilename()));
  let replay=cp.spawnSync(py,[script],{cwd:tmp,encoding:'utf8'});assert.equal(replay.status,0,replay.stderr);assert(JSON.parse(replay.stdout).verified);
 }
 // Legacy positional/refitted scores must fail explicitly rather than silently drift.
 assert(await page.evaluate(()=>{try{replayStep(cur(),{op:'scores',items:A.sel.fitems||['Item 1'],meth:'pca',k:1,rot:'none',prefix:'Component'});return false;}catch(e){return /no recorded fit/.test(e.message);}}));
 console.log('PASS',width,meth,rot,k,'79 eligible rows, saved fit, independent score numbers and replay');
 await page.evaluate(()=>{A.sets=[];A.cur=null;A.sel={};nav('data');});
}
assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ctx.close();}
console.log(JSON.stringify({score_values:values,max_score_error:maxError}));}finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
