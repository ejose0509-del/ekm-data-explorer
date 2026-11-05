const fs=require('fs'),path=require('path');
function amin(a){return a.reduce((x,y)=>Math.min(x,y),Infinity);}function amax(a){return a.reduce((x,y)=>Math.max(x,y),-Infinity);}
const read=f=>fs.readFileSync(f==='ml'&&process.env.EKM_ML_FILE?process.env.EKM_ML_FILE:path.join(__dirname,'../src/'+f+'.js'),'utf8');
eval(['stats','stats2','stats3','ml'].map(read).join('\n')+';globalThis.ML=ML;');
const data=JSON.parse(fs.readFileSync(0,'utf8'));
fs.writeFileSync(1,JSON.stringify(data.map(c=>{try{
 if(c.kind==='metrics')return ML.regMetrics(c.y,c.pred);
 if(c.kind==='scale'){const s=ML.standardize(c.X);return {mean:s.mu,sd:s.sd,Z:s.Z};}
 if(c.kind==='tree'){const t=ML.tree(c.X,c.y,{maxDepth:c.depth||3,minLeaf:c.minLeaf||3});return {prediction:(c.query||c.X).map(x=>ML.treePredict(t,x)),threshold:t.root.thr,impurity:t.root.impurity,importance:t.importance};}
 if(c.kind==='forest'){const f=ML.forest(c.X,c.y,{trees:20,minLeaf:3,maxDepth:3,rnd:ML.rng(42)});return {prediction:(c.query||c.X).map(x=>ML.forestPredict(f,x)),oob:f.oob};}
 const model=c.kind==='logit'?ML.logit(c.X,c.y,c.alpha):ML.enet(c.X,c.y,c.alpha,c.rho);return {std:model.std,coef:model.coef,intercept:model.intercept,prediction:(c.query||c.X).map(model.predict),converged:model.converged};
}catch(e){return {error:e.message};}})));
