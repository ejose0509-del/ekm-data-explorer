"""Independent exact-binary-input moments, CART and convex optimality checks.

Fractions retain represented inputs exactly. Decimal evaluates roots; SciPy supplies
an independent convex optimizer for logistic fits. CART minimizes squared loss over
all eligible 1D partitions, without floating-point variance subtraction.
"""
import json,math,os,subprocess,sys
from fractions import Fraction as F
from decimal import Decimal,localcontext
import numpy as np
from scipy.special import expit
from scipy.optimize import minimize, root as solve_root
HERE=os.path.dirname(os.path.abspath(__file__));rng=np.random.default_rng(20261104)
def fr(v):return F.from_float(float(v))
def root(v):
    with localcontext() as ctx:
        ctx.prec=100
        return float((Decimal(v.numerator)/Decimal(v.denominator)).sqrt())
def moments(x):
    xx=list(map(fr,x));mu=sum(xx)/len(xx);var=sum((v-mu)**2 for v in xx)/len(xx)
    return mu,var
def standard(x):
    mu,var=moments(x);sd=root(var)
    if not var:return float(mu),1.,np.zeros(len(x))
    # Standardize the exact centered values; never subtract a rounded physical mean.
    z=np.array([float(v-mu)/sd for v in map(fr,x)])
    return float(mu),sd,z
def close(a,b,unit=1.,tol=1e-10):
    return isinstance(a,(int,float)) and math.isfinite(a) and abs(a-b)<=tol*abs(unit)+2*math.ulp(float(b))
cases=[];refs=[]
# Metrics spanning offsets and nearly the entire normal floating-point range.
for seed in range(80):
    n=17+seed%19;scale=[1.,1e-150,1e150,1e300][seed%4];offset=1e15 if seed%4==0 else 0.
    y=offset+np.round(rng.normal(size=n)*20)*scale;p=offset+np.round((y-offset)/scale+rng.normal(size=n)*3)*scale
    cases.append(dict(kind='metrics',y=y.tolist(),pred=p.tolist()));refs.append(('metrics',scale))
# Scalers must retain small deviations on large baselines and avoid squared overflow.
for seed in range(40):
    X=rng.integers(-20,21,size=(25,3)).astype(float);scale=[1.,1e-150,1e150,1e300][seed%4];offset=1e15 if seed%4==0 else 0.
    X=X*scale+offset;cases.append(dict(kind='scale',X=X.tolist()));refs.append(('scale',scale))
# Exact CART oracle on clear piecewise responses, shifts and common scaling.
for offset,scale in [(0.,1.),(1e9,1.),(1e15,1.),(0.,1e-150),(0.,1e150),(0.,1e300)]:
    for variant in range(4):
        x=np.arange(36,dtype=float);y=np.where(x<12,0.,np.where(x<24,10.,-4.))
        if variant:y=y+(np.arange(36)%variant)*.5
        y=offset+y*scale
        # Variant 3 also tests finite midpoint construction near the feature limit.
        X=(1e308+x*1e292 if variant==3 else x).reshape(-1,1)
        cases.append(dict(kind='tree',X=X.tolist(),y=y.tolist(),depth=3,minLeaf=3));refs.append(('tree',scale))
# Coefficient tests use convex KKT conditions, independently of coordinate descent.
for kind in ['enet','logit']:
    for seed in range(24):
        n=50;raw=rng.normal(size=(n,3));scale=[1.,1e-150,1e150][seed%3];offset=1e15 if seed%3==0 else 0.
        X=offset+raw*scale;Z=np.column_stack([standard(X[:,j])[2] for j in range(3)])
        if kind=='logit':
            y=(rng.random(n)<expit(.3+Z@np.array([.8,-.5,.2]))).astype(float);alpha=.5;rho=0;unit=1.
        else:
            unit=[1.,1e-100,1e100][seed%3];y=(2*Z[:,0]-Z[:,1]+rng.normal(size=n)*.2)*unit+(1e15 if seed%3==0 else 0.);rho=[0.,.5,1.][seed%3];alpha=.05*unit if rho==1 else .1
        cases.append(dict(kind=kind,X=X.tolist(),y=y.tolist(),alpha=alpha,rho=rho));refs.append((kind,unit))
# Repeated forest averaging must remain finite for huge outcomes.
for offset,scale in [(1e9,1.),(1e15,1.),(0.,1e300)]:
    X=np.arange(40,dtype=float).reshape(-1,1);y=offset+np.where(X[:,0]<20,0.,10.)*scale
    cases.append(dict(kind='forest',X=X.tolist(),y=y.tolist()));refs.append(('forest',scale))
actual=json.loads(subprocess.check_output(['node',os.path.join(HERE,'model_numerics_harness.js')],input=json.dumps(cases).encode()))
failures=[];failure_count=0;checked=0;max_error=0.
def check(ok,detail):
    global checked,failure_count
    checked+=1
    if not ok:
        failure_count+=1
        if len(failures)<30:failures.append(detail)
def tree_oracle(x,y,depth,minleaf):
    order=sorted(range(len(x)),key=lambda i:x[i]);x=[x[i] for i in order];y=[fr(y[i]) for i in order]
    def build(xx,yy,left):
        mu=sum(yy)/len(yy);loss=sum((v-mu)**2 for v in yy)
        if not left or len(yy)<2*minleaf or not loss:return (float(mu),None)
        best=None
        for k in range(minleaf,len(yy)-minleaf+1):
            if xx[k-1]==xx[k]:continue
            a,b=yy[:k],yy[k:];ma,mb=sum(a)/len(a),sum(b)/len(b);cost=sum((v-ma)**2 for v in a)+sum((v-mb)**2 for v in b)
            if best is None or cost<best[0]:best=(cost,k)
        if best is None:return (float(mu),None)
        k=best[1];mid=float((fr(xx[k-1])+fr(xx[k]))/2);mid=xx[k-1] if mid>=xx[k] else mid
        return (mid,build(xx[:k],yy[:k],left-1),build(xx[k:],yy[k:],left-1))
    t=build(x,y,depth)
    def predict(v,t):
        if len(t)==2:return t[0]
        return predict(v,t[1] if v<=t[0] else t[2])
    return t,[predict(v,t) for v in x],order
for i,(c,a,(kind,unit)) in enumerate(zip(cases,actual,refs)):
    if 'error' in a:check(False,f'{i} {kind}: {a["error"]}');continue
    if kind=='metrics':
        y,p=list(map(fr,c['y'])),list(map(fr,c['pred']));mu,var=moments(c['y']);mse=sum((v-w)**2 for v,w in zip(y,p))/len(y);mae=sum(abs(v-w) for v,w in zip(y,p))/len(y)
        expected={'r2':float(1-mse/var),'rmse':root(mse),'mae':float(mae)}
        for key,value in expected.items():check(close(a.get(key),value,1 if key=='r2' else unit),f'{i} {key}: {a.get(key)} vs {value}')
    elif kind=='scale':
        X=np.array(c['X']);Z=np.array(a['Z'])
        for j in range(X.shape[1]):
            mu,sd,z=standard(X[:,j]);check(close(a['mean'][j],mu,unit,1e-12),f'{i} mean {j}');check(close(a['sd'][j],sd,sd),f'{i} SD {j}');check(np.allclose(Z[:,j],z,rtol=1e-10,atol=1e-12),f'{i} standardized {j}')
    elif kind=='tree':
        x=np.array(c['X'])[:,0];t,pred,order=tree_oracle(x,c['y'],c['depth'],c['minLeaf']);got=[a['prediction'][j] for j in order]
        for j,(v,w) in enumerate(zip(got,pred)):check(close(v,w,unit),f'{i} tree row {j}: {v} vs {w}')
    elif kind=='forest':
        # Translation/scaling invariance against the identical seeded normalized forest.
        base=dict(c);base['y']=[(v-min(c['y']))/unit for v in c['y']]
        normal=json.loads(subprocess.check_output(['node',os.path.join(HERE,'model_numerics_harness.js')],input=json.dumps([base]).encode()))[0]
        for j,(v,w) in enumerate(zip(a['prediction'],normal['prediction'])):check(close(v,min(c['y'])+w*unit,unit),f'{i} forest row {j}')
        check(all(v is None or math.isfinite(v) for v in a['oob']),f'{i} OOB finite')
    else:
        X=np.array(c['X']);Z=np.column_stack([standard(X[:,j])[2] for j in range(X.shape[1])]);y=np.array(c['y']);pred=np.array(a['prediction']);b=np.array(a['std'])
        check(a.get('converged',False),f'{i} optimizer convergence')
        if kind=='enet':
            mu,_=moments(y);yn=np.array([float(fr(v)-mu)/unit for v in y]);bn=b/unit;g=Z.T@(yn-Z@bn)/len(y);l1=c['alpha']*c['rho']/unit;l2=c['alpha']*(1-c['rho']);kkt=np.where(np.abs(bn)>1e-10,np.abs(g-l2*bn-l1*np.sign(bn)),np.maximum(0,np.abs(g)-l1))
            check(np.max(kkt)<1e-8,f'{i} elastic-net KKT {kkt}')
            check(all(close(v,float(mu)+u*unit,unit) for v,u in zip(pred,Z@bn)),f'{i} centered predictions')
        else:
            grad=np.r_[np.sum(pred-y),Z.T@(pred-y)+c['alpha']*b];check(np.max(np.abs(grad))<1e-7,f'{i} logistic KKT {grad}')
            def objective(w):
                e=w[0]+Z@w[1:];p=expit(e);return np.sum(np.logaddexp(0,e)-y*e)+c['alpha']/2*np.sum(w[1:]**2),np.r_[np.sum(p-y),Z.T@(p-y)+c['alpha']*w[1:]]
            A=np.column_stack([np.ones(len(y)),Z])
            def hessian(w):
                p=expit(A@w);h=A.T@((p*(1-p))[:,None]*A);h[1:,1:]+=c['alpha']*np.eye(3);return h
            fit=minimize(objective,np.zeros(4),jac=True,hess=hessian,method='trust-exact',options={'gtol':1e-12,'maxiter':1000})
            refined=solve_root(lambda w:objective(w)[1],fit.x,jac=hessian,tol=1e-11)
            check(np.max(np.abs(objective(refined.x)[1]))<1e-10,f'{i} independent reference convergence')
            check(np.allclose(pred,expit(refined.x[0]+Z@refined.x[1:]),rtol=1e-8,atol=1e-9),f'{i} independent logistic optimizer')
print(f'{len(cases)} model numerical cases, {checked} comparisons, {failure_count} failures')
for failure in failures:print('FAIL',failure)
sys.exit(bool(failure_count))
