// Reproduce the signed-meaning, row-scope, persistence, privacy and Discover regressions.
// Both disk and local-server modes; 1440px and 400px. No user data or external services.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('assert'), path = require('path'), fs = require('fs'), cp = require('child_process');
const root = path.join(__dirname, '..');
const child = cp.spawn('python3', ['local_ai/server.py', '--port', '0'], {cwd: root});
const address = new Promise((ok, no) => { const timer = setTimeout(() => no(Error('server startup timeout')), 5000); child.stdout.on('data', d => { const m = /http:\/\/127\.0\.0\.1:\d+/.exec(String(d)); if (m) { clearTimeout(timer); ok(m[0]); } }); });
let browser, page, count = 0, width, mode, errors = [];
async function check(name, run) {
  const before = errors.length; await run();
  assert.deepEqual(errors.slice(before), [], 'page errors');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page overflow');
  console.log('PASS', mode, width, name); count++;
}
async function install(head, rows, sel = {}, kind = 'describe') {
  await page.evaluate(({head, rows, sel, kind}) => {
    cancelDiscover(); DSC.res = null; DSC.key = ''; DSC.detail = null; DSC.outcome = ''; DSC.limit = 5000;
    var ds = makeSet('Integrity study', head, rows); A.sets = [ds]; A.cur = ds.id; A.sel = sel; A.kind = kind; A.includeSensitive = false;
    PROJECT.remember = false; WP.items = []; E.undo = Object.create(null); E.orig = Object.create(null); MOD.res = null; MOD.job = null; MOD.key = '';
    nav('analyze');
  }, {head, rows, sel, kind});
}
async function scan() {
  await page.locator('#tabs a[href="#discover"]').click();
  assert(await page.locator('[data-drun]').isVisible());
  await page.locator('[data-drun]').click();
  await page.waitForFunction(() => DSC.res && !DSC.job && DSC.key === discoverKey(cur()), null, {timeout: 30000});
}
(async () => {
  try {
    const local = await address; browser = await chromium.launch({channel: process.env.BROWSER_CHANNEL || undefined, headless: true});
    for (const [name, url] of [['disk', 'file://' + path.join(root, 'dist/index.html')], ['local', local]]) for (width of [1440, 400]) {
      mode = name; const context = await browser.newContext({viewport: {width, height: 1100}, acceptDownloads: true});
      page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(url);
      await check('identity and meaningful first screen', async () => { assert((await page.title()).includes('EKM')); assert((await page.locator('#view').innerText()).length > 30); });
      await check('negative levels stay signed and result appears early', async () => {
        await install(['Return'], [[-5],[-4],[-3],[-2],[-1]], {y: 'Return'});
        assert((await page.locator('.tk-head').innerText()).includes('-3.00'));
        assert((await page.locator('.poster').innerText()).includes('-3.00'));
        assert((await page.locator('.takeaway').boundingBox()).y < 700, 'takeaway buried below menu');
        if (process.env.EKM_SCREENSHOT_DIR && mode === 'disk') await page.screenshot({path: path.join(process.env.EKM_SCREENSHOT_DIR, 'fixed-analysis-' + width + '.png')});
      });
      await check('zero-crossing interval retains both signed endpoints', async () => {
        await install(['Value','Group'], [[-2,'A'],[0,'A'],[2,'A'],[-1,'B'],[1,'B'],[3,'B']], {y:'Value',g:'Group'}, 'compare');
        const r = await page.evaluate(() => ({lo: f3(LAST_R.summary.ci95[0]), hi: f3(LAST_R.summary.ci95[1]), t: takeaway(cur(), LAST_R).everyday.join(' ')}));
        assert(r.t.includes(r.lo + ' to ' + r.hi) && r.lo.startsWith('-') && r.t.includes('includes no difference'));
        assert(!(await page.locator('.sure').innerText()).includes('Strong'));
      });
      await check('intercept is never translated as a predictor', async () => {
        await install(['X','Y'], Array.from({length:80}, (_,i)=>[(i-40)/10,100+2*Math.sin(3*i)]), {y:'Y',preds:['X']}, 'regress');
        const t = await page.locator('.takeaway').innerText(); assert(!/baseline|clearest single factor/i.test(t)); assert(t.includes('of X'));
      });
      await check('multiclass accuracy is not binary AUC', async () => {
        await install(['X','Outcome'], Array.from({length:90}, (_,i)=>[i/10,['A','B','C'][i%3]]), {mt:'Outcome',mp:['X'],mm:'tree',mv:'k5'}, 'model');
        const t = await page.locator('.tk-head').innerText(); assert(t.includes('Accuracy') && !/two outcomes|50% is guessing/.test(t));
      });
      await check('negative cross-validation R-squared is not clamped to zero', async () => {
        const t = await page.evaluate(() => takeaway(cur(), {kind:'model', summary:{task:'regression',cv_mean:-0.3}}).headline);
        assert(t.includes('-0.300') && t.includes('worse'));
      });
      await check('integer revenue and cost remain analytical measures', async () => {
        await install(['Revenue','Cost'], Array.from({length:60},(_,i)=>[1000+17*i,500+11*i]), {y:'Revenue'});
        assert.deepEqual(await page.evaluate(() => scanColumns(cur()).nums.map(c=>c.name)), ['Revenue','Cost']);
        assert(await page.evaluate(()=>{cur().cols[0].tags={role:'id',level:'nominal',suggested:true};var back=validateProject(JSON.parse(JSON.stringify(projectSnapshot())));return back.datasets[0].cols[0].tags.role!=='id';}));
        assert(await page.evaluate(()=>{cur().cols[0].tags={role:'id',level:'nominal'};var back=validateProject(JSON.parse(JSON.stringify(projectSnapshot())));cur().cols[0].tags={role:'predictor',level:'ratio'};return back.datasets[0].cols[0].tags.role==='id';}));
        await scan(); assert(await page.evaluate(() => DSC.res.items.some(p=>p.c.type==='link' && p.confirmed)));
      });
      await check('Discover respects Exclude and active filters; metadata invalidates its cache', async () => {
        await page.evaluate(() => {
          var r = rng(100), ds = makeSet('Eligible', ['X','Y','Group','Row tag'], Array.from({length:240}, function(_,i){var x=r()*10;return [x,i<120?r()*10:20*x+r(),i%2?'A':'B',i<120?'Verified':'Exclude'];}));
          A.sets=[ds];A.cur=ds.id;A.sel={x:'X',y:'Y',where:{any:false,conds:[{col:'Group',op:'is',v:'A'}]}};A.kind='relate';DSC.key='';DSC.res=null;nav('analyze');
        });
        const n = await page.evaluate(() => LAST_R.summary.n); assert.equal(n,60); await scan();
        assert.equal(await page.evaluate(() => DSC.res.halves[0]+DSC.res.halves[1]),n);
        assert.equal(await page.evaluate(() => DSC.res.eligible),n);
        assert(await page.evaluate(() => DSC.res.rows.every(i=>cur().rows[i][3]!=='Exclude' && cur().rows[i][2]==='A')));
        assert(await page.evaluate(() => {var key=discoverKey(cur());cur().cols[0].tags.role='ignore';return discoverKey(cur())!==key;}));
        await page.evaluate(() => render()); assert.equal(await page.locator('.pcard').count(),0);
      });
      await check('Gaussian partitions are descriptive; silhouette matches independent distances', async () => {
        await page.evaluate(() => {var r=S3.rngN(1),ds=makeSet('Gaussian',['X','Y'],Array.from({length:300},function(){return [r.norm(),r.norm()];}));A.sets=[ds];A.cur=ds.id;A.sel={};DSC.res=null;DSC.key='';});
        await scan(); const cl = await page.evaluate(() => {var p=DSC.res.items.find(p=>p.c.type==='cluster');return {confirmed:p.confirmed,desc:p.descriptive,sil:p.cl.sil,X:p.cl.st.Z,labels:p.cl.lab};});
        assert(!cl.confirmed && cl.desc);
        let sum=0; for(let i=0;i<cl.X.length;i++){const by=new Map();for(let j=0;j<cl.X.length;j++){if(i===j)continue;const g=cl.labels[j];if(!by.has(g))by.set(g,[]);by.get(g).push(Math.hypot(...cl.X[i].map((v,q)=>v-cl.X[j][q])));}const own=by.get(cl.labels[i]);if(!own)continue;const a=own.reduce((s,v)=>s+v,0)/own.length,b=Math.min(...[...by].filter(([g])=>g!==cl.labels[i]).map(([,v])=>v.reduce((s,x)=>s+x,0)/v.length));sum+=(b-a)/Math.max(a,b);}
        assert(Math.abs(sum/cl.X.length-cl.sil)<1e-12);
        const i = await page.evaluate(() => DSC.res.items.findIndex(p=>p.c.type==='cluster'));
        await page.locator('[data-dopen="'+i+'"]').click(); assert((await page.locator('#view').innerText()).includes('not confirmed')); assert.equal(await page.evaluate(()=>st.tab),'discover');
        await page.locator('[data-dback]').click();
      });
      await check('curves open exact descriptive pattern rather than straight regression', async () => {
        await install(['X','Y'], Array.from({length:300},(_,i)=>{let x=(i-150)/25;return [x,x*x+.01*Math.sin(i)];}), {});
        await scan(); const i=await page.evaluate(()=>DSC.res.items.findIndex(p=>p.c.type==='curve'));assert(i>=0);
        assert(await page.evaluate(i=>!DSC.res.items[i].confirmed,i));
        await page.locator('[data-dopen="'+i+'"]').click(); assert((await page.locator('#view').innerText()).includes('not validation of a fixed nonlinear'));
      });
      await check('subgroup inspection uses its rule and both comparison populations', async () => {
        await install(['X','Score'], Array.from({length:300},(_,i)=>[i/10,i<150?10+Math.sin(i):100+Math.sin(i)]), {});
        await scan(); const i=await page.evaluate(()=>DSC.res.items.findIndex(p=>p.c.type==='subgroup'));assert(i>=0);
        const n=await page.evaluate(i=>DSC.res.rows.filter(at=>DSC.res.items[i].c.rule(cur().rows[at])).length,i);
        await page.locator('[data-dopen="'+i+'"]').click(); const t=await page.locator('#view').innerText();assert(t.includes('Matching rows') && t.includes(String(n)) && t.includes('Matching minus other rows'));
      });
      await check('full testing family is counted before effect filtering', async () => {
        await install(['X','Y'],Array.from({length:120},(_,i)=>[i/10,i/10+.02*Math.sin(i)]),{});await scan();
        assert.equal(await page.evaluate(()=>DSC.res.baseTests),3);
        assert(await page.evaluate(()=>DSC.res.items.filter(p=>p.confirmed).every(p=>p.holdoutAdjusted<=.05)));
      });
      await check('no automatic scan; Stop terminates without publishing partial work', async () => {
        await page.evaluate(()=>{cancelDiscover();DSC.res=null;DSC.key='';nav('discover');});assert(await page.evaluate(()=>!DSC.job));
        await page.locator('.discover-options > summary').click();await page.locator('[data-dtype=link]').click();assert(await page.locator('.discover-options').evaluate(el=>el.open));await page.locator('[data-dtype=all]').click();
        await page.locator('[data-drun]').click();await page.locator('[data-dstop]').click();
        assert(await page.evaluate(()=>!DSC.job && !DSC.res));assert((await page.locator('#d-status').innerText()).includes('Scan stopped'));
      });
      await check('settings changes discard an active job; unavailable workers fail clearly', async () => {
        await page.evaluate(()=>{startDiscover(cur(),discoverKey(cur()));A.sel.where={any:false,conds:[{col:cur().cols[0].name,op:'gt',v:'2'}]};render();});
        assert(await page.evaluate(()=>!DSC.job && !DSC.res));
        await page.evaluate(()=>{window.previousWorker=window.Worker;window.Worker=function(){throw Error('disabled');};startDiscover(cur(),discoverKey(cur()));render();});
        await page.waitForFunction(()=>!DSC.job);assert((await page.locator('#d-status').innerText()).includes('Could not start'));
        await page.evaluate(()=>{window.Worker=window.previousWorker;});
      });
      await check('worker remains responsive on a 100,000-row dataset; cap is exact', async () => {
        await page.evaluate(()=>{var ds=makeSet('Large',['X','Y'],Array.from({length:100000},function(_,i){return [i/100,2*i/100+Math.sin(i)];}));A.sets=[ds];A.cur=ds.id;A.sel={};DSC.key='';DSC.res=null;nav('discover');window.testTicks=0;window.testTimer=setInterval(function(){window.testTicks++;},10);});
        await scan();const r=await page.evaluate(()=>{clearInterval(window.testTimer);return {ticks:window.testTicks,n:DSC.res.sampled,eligible:DSC.res.eligible};});assert.equal(r.n,5000);assert.equal(r.eligible,100000);assert(r.ticks>2);
      });
      await check('bulk tagging replays all 50,001 rows', async () => {
        const r=await page.evaluate(()=>{var ds=makeSet('Bulk',['X'],Array.from({length:50001},function(_,i){return [i/100];}));A.sets=[ds];A.cur=ds.id;A.sel={};st.tab='data';var base={cols:ds.cols.slice(),rows:ds.rows};tagRows(ds,ds.rows.map(function(_,i){return i;}),'Exclude','','regression');var step=ds.recipe[ds.recipe.length-1],back=replayStep(base,step);return {recorded:step.rows.length,current:ds.rows.filter(r=>r[1]==='Exclude').length,replay:back.rows.filter(r=>r[1]==='Exclude').length};});
        assert.deepEqual(r,{recorded:50001,current:50001,replay:50001});
      });
      await check('sensitive subgroup values never prefill search', async () => {
        await install(['SecretField','Score'],[['person A',1],['person B',2]],{});
        const q=await page.evaluate(()=>{cur().cols[0].tags.sens='health';return defaultQuery({c:{type:'subgroup',a:'SecretField',b:'Score',label:'SecretField is “person A”'}});});
        assert(!/SecretField|person A/.test(q));
      });
      await check('working CSV redacts; full backups disclose their scope; sharing gate checks history', async () => {
        await install(['Email','Score'],[['a@example.org',1],['b@example.org',2]],{});
        assert(await page.evaluate(()=>!csvText(cur()).includes('@') && projectHasSensitive(projectSnapshot())));
        await page.locator('#tabs a[href="#data"]').click();assert((await page.locator('[data-source-csv]').innerText()).includes('unredacted'));
        assert((await page.locator('#view').innerText()).includes('including sensitive columns'));
        await page.evaluate(()=>wsShare());assert(await page.evaluate(()=>/full project.*sensitive/i.test(CN.wsMsg)));
        assert(await page.evaluate(()=>projectHasSensitive({history:{original:{x:{cols:[{name:'Removed',tags:{sens:'health'}}]}}}})));
        const d=page.waitForEvent('download');await page.locator('[data-source-csv]').click();assert(fs.readFileSync(await (await d).path(),'utf8').includes('@example.org'));
      });
      await check('manual tags survive a real browser reload', async () => {
        await install(['Identifier','Value'],[['a',2],['b',3],['c',4]],{y:'Value'});
        await page.evaluate(()=>{cur().cols[1].tags={role:'outcome',level:'ratio',sens:'health',topics:['secret']};cur().tags={project:'Study'};PROJECT.remember=true;localStorage.setItem('ekm-remember','on');render();});
        await page.reload();assert.deepEqual(await page.evaluate(()=>cur().cols[1].tags),{role:'outcome',level:'ratio',sens:'health',topics:['secret']});assert.equal(await page.evaluate(()=>cur().tags.project),'Study');
        await page.evaluate(()=>{PROJECT.remember=false;localStorage.removeItem(PROJECT.key);});
      });
      await check('method picker works by keyboard with visible focus', async () => {
        await page.locator('#tabs a[href="#analyze"]').click();const summary=page.locator('.analysis-picker > summary');await summary.focus();await page.keyboard.press('Enter');
        assert(await page.locator('.analysis-picker').evaluate(el=>el.open));assert(await summary.evaluate(el=>getComputedStyle(el).outlineStyle!=='none'));
        await page.locator('[data-akind="describe"]').click();assert.equal(await page.evaluate(()=>A.kind),'describe');assert(await page.evaluate(()=>document.activeElement.matches('.analysis-picker > summary')));
        if(process.env.EKM_SCREENSHOT_DIR && mode==='disk')await page.screenshot({path:path.join(process.env.EKM_SCREENSHOT_DIR,'fixed-flow-'+width+'.png')});
      });
      await context.close();
    }
    console.log(count+' interpretation and integrity checks passed');
  } finally { if(browser)await browser.close();child.kill(); }
})().catch(e=>{console.error(e);child.kill();process.exitCode=1;});
