// Runs EKM's statistics on fixed data and prints JSON. Used by check_stats.py.
const fs = require("fs"), path = require("path");
const src = (f) => fs.readFileSync(f === "stats.js" && process.env.EKM_STATS_FILE ? process.env.EKM_STATS_FILE : path.join(__dirname, "..", "src", f), "utf8");
eval(src("core.js").split("\n").filter(l=>/^function am(in|ax)\(/.test(l)).join("\n"));
eval(src("stats.js") + src("stats2.js") + src("stats3.js") + ";globalThis.S=S;globalThis.S2=S2;globalThis.S3=S3;");
// Batched, independent reference cases supplied by the Python accuracy gate.
if (process.argv.includes('--welch-cases')) {
 const cases = JSON.parse(fs.readFileSync(0,'utf8'));
 fs.writeFileSync(1, JSON.stringify(cases.map(c => {const t=S.ttest(c.a,c.b), scale=c.unit || 1;return {t:t.t,df:t.df,p:t.p,d:t.d,diff:t.diff/scale,lo:t.ciLo/scale,hi:t.ciHi/scale};})));
 process.exit(0);
}
const a = [5.1,4.9,6.2,5.8,6.0,5.5,5.3,7.1,6.6,5.9,5.5,6.0], b = [4.1,4.5,5.0,4.8,5.2,4.4,4.9,4.7,4.9], c = [6.5,7.0,6.8,7.4,6.9,7.7,7.0];
const x = [1.2,2.3,2.1,3.8,4.0,4.4,5.9,6.1,7.3,8.8,9.1,10.5,11.2,12.0,30.0], y = [1.0,2.6,2.0,3.5,4.6,4.1,6.3,5.8,7.9,8.1,9.8,10.0,11.9,12.2,15.0];
const t = S.ttest(a, b), an = S.anova([a, b, c]), ch = S.chisq([[20,15,5],[10,25,25]]), co = S.correlate(x, y);
const o = S.ols(y, x.map((v, i) => [v, (i * 7) % 5]), ["x1", "x2"]);
const lg = S2.logistic([0,0,0,1,0,1,0,1,1,1,0,1,1,1,0,1], [[1],[2],[3],[4],[5],[6],[7],[8],[9],[10],[11],[12],[13],[14],[3.5],[2.5]], ["x"]);
const result = {
  welch_t: t.t, welch_df: t.df, welch_p: t.p, anova_F: an.F, anova_p: an.p, chi2: ch.x2, chi2_p: ch.p,
  pearson_r: co.r, pearson_p: co.p, spearman: co.rho, spearman_p: co.prho,
  ols_b1: o.coefs[1].b, ols_se1: o.coefs[1].se, ols_r2: o.r2,
  shapiro_W: S2.shapiro(a).W, shapiro_p: S2.shapiro(a).p, shapiro_skew_p: S2.shapiro(x).p,
  levene_F: S2.levene([a, b, c]).F, levene_p: S2.levene([a, b, c]).p,
  mannwhitney_U: S2.mannWhitney(a, b).U, mannwhitney_p: S2.mannWhitney(a, b).p,
  kruskal_H: S2.kruskal([a, b, c]).H, kruskal_p: S2.kruskal([a, b, c]).p,
  wilcoxon_T: S2.wilcoxon(x, y).T, wilcoxon_p: S2.wilcoxon(x, y).p,
  paired_t: S2.pairedT(x, y).t, paired_p: S2.pairedT(x, y).p,
  logit_b1: lg.coefs[1].b, logit_se1: lg.coefs[1].se, logit_p1: lg.coefs[1].p,
};

const edgeX = [1,2,3,4,5], edgeY = [1,3,2,5,4];
for (const [name, scale] of [['large',1e150],['tiny',1e-150],['huge',1e300],['subnormal',1e-300]]) {
 const c = S.correlate(edgeX.map(v=>v*scale),edgeY.map(v=>v*scale));
 for (const key of ['r','p','ciLo','ciHi']) result[name+'_'+key]=c[key];
 const d = S.describe(edgeX.map(v=>v*scale)); result[name+'_sd_unit']=d.sd/scale;
 const screen = S.screenPair(edgeX.map(v=>v*scale), edgeY.map(v=>v*scale)); result[name+'_screen']=screen.r;
}
for (const [name, xs, ys] of [['three',[1,2,3],[1,3,2]],['offset',edgeX.map(v=>v+1e12),edgeY.map(v=>v+1e12)],['perfect',edgeX,edgeX],['negative',edgeX,edgeX.map(v=>-v)]]) {
 const c = S.correlate(xs,ys); for (const key of ['r','p','ciLo','ciHi']) result[name+'_'+key]=c[key];
}
for (const [name, scale] of [['large',1e150],['tiny',1e-150]]) {
 const aa=a.map(v=>v*scale),bb=b.map(v=>v*scale),cc=c.map(v=>v*scale), t=S.ttest(aa,bb),an=S.anova([aa,bb,cc]);
 for (const key of ['t','df','p']) result[name+'_welch_'+key]=t[key];
 result[name+'_welch_diff_unit']=t.diff/scale; result[name+'_welch_lo_unit']=t.ciLo/scale; result[name+'_welch_hi_unit']=t.ciHi/scale;
 result[name+'_anova_F']=an.F;result[name+'_anova_p']=an.p;
}
result.mean_huge_unit = S.mean([1e308,1e308,1e308])/1e308;
result.mean_smallest_unit = S.mean([Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE])/Number.MIN_VALUE;
for (const [name, scale] of [['large',1e150],['tiny',1e-150]]) { const sw=S2.shapiro(a.map(v=>v*scale));result[name+'_shapiro_W']=sw.W;result[name+'_shapiro_p']=sw.p; }
const independent = S.chisq([[12,12],[12,12],[12,12]]);
result.chi2_independent = independent.x2;result.chi2_independent_p = independent.p;result.chi2_independent_n=independent.n;
for (const [name,d,n1,n2] of [['zero',0,20,20],['small',.05,24,48],['medium',.5,20,30],['negative',-.5,20,30]]) result['power_d_'+name]=S2.powerD(d,n1,n2).power;
for (const [name,r,n] of [['zero',0,30],['medium',.3,30],['negative',-.3,30]]) result['power_r_'+name]=S2.powerR(r,n).power;
// Exercise Discover's actual helpers, not copies of their formulas.
const discover = src("discover.js");
eval(discover.slice(discover.indexOf("function discoverSilhouette("), discover.indexOf("function subgroupRule(")));
eval(discover.slice(discover.indexOf("function rankVec("), discover.indexOf("function etaBinned(")));
eval(discover.slice(discover.indexOf("function testFor("), discover.indexOf("function subgroupCandidates(")));
function idxOf(ds, name) { return ds.cols.findIndex(c=>c.name===name); }
const points = [[0,0],[0,1],[1,0],[8,8],[8,9],[9,8]];
result.discover_silhouette = discoverSilhouette(points, [0,0,0,1,1,1]);
result.discover_singleton_silhouette = discoverSilhouette(points.concat([[20,20]]), [0,0,0,1,1,1,2]);
for (const [name, scale] of [["huge",1e300],["tiny",1e-300]]) {
 const c = corrPair([1,2,3,4,5,6,7,8].map(v=>v*scale),[2,1,4,3,6,5,8,7].map(v=>v*scale));
 result['discover_'+name+'_r']=c.r;result['discover_'+name+'_p']=c.p;
}
const missingDs = {cols:[{name:'X'},{name:'Y'}],rows:[1,2,null,4,5,6,7,8,9,10,11,12].map((v,i)=>[v,[3,null,4,1,7,6,null,9,8,10,11,12][i]])};
const missingRank = testFor(missingDs,{type:'link',a:'X',b:'Y'},missingDs.rows.map((_,i)=>i));
result.discover_missing_r=missingRank.r;result.discover_missing_p=missingRank.p;
const baselineFixture = JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/welch_baseline.json'),'utf8'));
const baselineWelch = S.ttest(baselineFixture.a.map(v=>v+baselineFixture.offset),baselineFixture.b.map(v=>v+baselineFixture.offset));
for(const [key, field] of [['t','t'],['df','df'],['p','p'],['diff','diff'],['lo','ciLo'],['hi','ciHi'],['d','d']])result['baseline_welch_'+key]=baselineWelch[field];
for(const [name,aa,bb] of [['near',Array.from({length:30},(_,i)=>[1,2,3][i%3]),Array.from({length:30},(_,i)=>[2,3,2][i%3])],['irregular',[1,1,10,10,100,100,100],[1,10,1,10,100,10,100]]]) {
 for(const weight of ['linear','quadratic']){const k=S3.kappa(aa,bb,weight);for(const key of ['rawPo','rawPe','po','pe','kappa'])result['agreement_'+name+'_'+weight+'_'+key]=k[key];}
}
for(const [name,n,tied] of [['separated30',30,false],['separated120',120,false],['tied120',120,true]])result['tail_mw_'+name]=S2.mannWhitney(Array.from({length:n},(_,i)=>tied?i%3:i),Array.from({length:n},(_,i)=>tied?10+i%5:i+n)).p;
const ka=Array.from({length:3000},(_,i)=>[1,2,3][i%3]),kb_=Array.from({length:3000},(_,i)=>[2,3,2][i%3]);result.tail_kappa=S3.kappa(ka,kb_,'linear').p;
eval(src('plan.js').split('function plCurve(')[0]);
result.plan_default_n=plSolve().n;
PL=Object.assign(plDefaults(),{ratio:1.5,n:65,solve:'power'});result.plan_unequal_power=plPower(65,.5);PL.alt='smaller';result.plan_lower_power=plPower(65,.5);
PL=Object.assign(plDefaults(),{design:'prop',ratio:1.3,alt:'smaller'});result.plan_prop_lower=plPower(45,.4);
PL=Object.assign(plDefaults(),{design:'corr',alt:'smaller'});result.plan_corr_lower=plPower(70,.3);
PL=Object.assign(plDefaults(),{m:10,icc:.05,drop:10});const inflated=plInflate(160);result.plan_recruit=inflated.n;result.plan_clusters=inflated.clusters;
eval(src('ml.js')+';globalThis.ML=ML;');
const shiftedY=Array.from({length:60},(_,i)=>1e15+(i<30?0:10)), shiftedTree=ML.tree(shiftedY.map((_,i)=>[i]),shiftedY,{maxDepth:3,minLeaf:3});
result.model_shift_variance=shiftedTree.root.impurity;result.model_shift_threshold=shiftedTree.root.thr;result.model_shift_prediction=ML.treePredict(shiftedTree,[59])-1e15;
const priorMetrics=ML.clsMetrics([0,0,0,1],[.25,.25,.25,.25]);result.baseline_accuracy=priorMetrics.accuracy;result.baseline_brier=priorMetrics.brier;result.baseline_rmse=ML.regMetrics([2,5,8,11],[3,3,3,3]).rmse;
eval(src('analyzer.js').slice(src('analyzer.js').indexOf('function colVals('),src('analyzer.js').indexOf('function idxOf(')));
const enh=src('enhancer.js'),dt=src('datatools.js'),met=src('methods.js'),input=src('input-integrity.js');
function isNum(c){return c.type==='number'||c.type==='year';}
eval(input.slice(input.indexOf('function uniqueColumnName'),input.indexOf('function validDateValue')));
eval(enh.slice(enh.indexOf('function knnFill('),enh.indexOf('// --- Isolation Forest')));
eval(enh.slice(enh.indexOf('function mapCol('),enh.indexOf('function latestIsoOutputs(')));
eval(dt.slice(0,dt.indexOf('// Join:')));
eval(met.slice(met.indexOf('function reverseInRange('),met.indexOf('function fitFactor(')));
const precise=[.12345678901234567,.23456789012345678,.34567890123456789,.4567890123456789],pd={cols:[{name:'Value',type:'number'}],rows:precise.map(v=>[v])};
for(const [i,r] of opDerive(pd,0,'z').rows.entries())result['transform_z_'+i]=r[1];
for(const [i,r] of opDerive(pd,0,'log').rows.entries())result['transform_log_'+i]=r[1];
const off={cols:pd.cols,rows:[0,0,1].map(v=>[1e15+v])};for(const [i,r] of opDerive(off,0,'z').rows.entries())result['transform_offset_z_'+i]=r[1];
result.transform_copy=opFormula(pd,'Copy','[Value]').rows[0][1];
result.transform_mean=opFill({cols:pd.cols,rows:pd.rows.concat([[null]])},0,'mean',false).rows[4][0];
const donors={cols:[{name:'Target',type:'number'},{name:'Feature',type:'number'}],rows:precise.concat([.567890123456789]).map(v=>[v,0]).concat([[null,0]])};result.transform_knn=knnFill(donors,0,5).rows[5][0];
const caps={cols:pd.cols,rows:precise.concat([10.123456789]).map(v=>[v])};result.transform_cap=opOutliers(caps,0,'cap').rows[4][0];
result.transform_scale=opScale({cols:[{name:'A',type:'number'},{name:'B',type:'number'}],rows:[[precise[0],precise[1]]]},['A','B'],[],'Mean').rows[0][2];
result.transform_huge_scale_unit=opScale({cols:[{name:'A',type:'number'},{name:'B',type:'number'}],rows:[[1e308,1e308]]},['A','B'],['B'],'Mean').rows[0][2]/1e308;
console.log(JSON.stringify(result));
