"""Welch accuracy contract: exact represented inputs, Decimal moments, SciPy tails/CI.
Run python3 tests/check_welch_accuracy.py. No browser or additional package beyond numpy/scipy.
Reference: NIST https://www.itl.nist.gov/div898/handbook/eda/section3/eda353.htm
"""
import json, subprocess, math
from decimal import Decimal, localcontext
from pathlib import Path
import numpy as np
from scipy import stats
ROOT = Path(__file__).resolve().parent
fixture=json.loads((ROOT/'fixtures/welch_baseline.json').read_text())
rng=np.random.default_rng(811)
cases=[]
for i in range(1000):
    n,m=map(int,rng.integers(8,35,size=2))
    a=rng.integers(0,20,n).astype(float);b=rng.integers(3,23,m).astype(float)
    cases.append(dict(a=(a+1e15).tolist(),b=(b+1e15).tolist(),unit=1,name=f'offset random {i}'))
for offset in [0.,1e12,1e15,-1e15]:
    for flip in [False,True]:
        a=[float(offset+v) for v in fixture['a']];b=[float(offset+v) for v in fixture['b']]
        if flip:a,b=b,a
        cases.append(dict(a=a,b=b,unit=1,name=f'fixture {offset} reversed={flip}'))
for scale in [1e-300,1e-150,1.,1e150,1e300]:
    cases.append(dict(a=[v*scale for v in [1.,2.,3.,4.,5.]],b=[v*scale for v in [0.,1.,1.5,3.,5.,8.]],unit=scale,name=f'scale {scale}'))
for name,a,b in [('unequal',[0.,1.,2.],[2.,3.,5.,8.,13.,21.,34.]),('one constant',[7.]*5,[1.,2.,3.,5.,8.]),('equal mean',[0.,2.,4.],[1.,2.,3.]),('mixed extreme',[-1e308,0.,1e308],[-1e308,1e307,1e308,0.])]:
    cases.append(dict(a=a,b=b,unit=1e308 if name=='mixed extreme' else 1,name=name))
def reference(c):
    # Decimal.from_float preserves the actual binary inputs, including offset rounding.
    with localcontext() as ctx:
        ctx.prec=100
        a=list(map(Decimal.from_float,c['a']));b=list(map(Decimal.from_float,c['b']))
        ma=sum(a)/len(a);mb=sum(b)/len(b)
        sa=sum((v-ma)**2 for v in a)/(len(a)-1);sb=sum((v-mb)**2 for v in b)/(len(b)-1)
        va=sa/len(a);vb=sb/len(b);se=(va+vb).sqrt();diff=ma-mb
        df=(va+vb)**2/(va**2/(len(a)-1)+vb**2/(len(b)-1));t=diff/se
        pooled=(((len(a)-1)*sa+(len(b)-1)*sb)/(len(a)+len(b)-2)).sqrt();d=diff/pooled
        tc=Decimal.from_float(float(stats.t.ppf(.975,float(df))));u=Decimal.from_float(c['unit'])
        return dict(t=float(t),df=float(df),p=float(2*stats.t.sf(abs(float(t)),float(df))),d=float(d),diff=float(diff/u),lo=float((diff-tc*se)/u),hi=float((diff+tc*se)/u))
actual=json.loads(subprocess.check_output(['node',str(ROOT/'stats_harness.js'),'--welch-cases'],input=json.dumps(cases).encode()))
fails=[];max_error={k:0 for k in ['t','df','p','d','diff','lo','hi']};flips=0
for c,got in zip(cases,actual):
    want=reference(c)
    if got['p'] is not None:flips+=((got['p']<.05)!=(want['p']<.05))
    for k,v in want.items():
        a=got[k]
        if k in ('lo','hi') and not math.isfinite(v*c['unit']):
            if a is not None:fails.append((c['name'],k,a,'unrepresentable endpoint must fail explicitly'))
            continue
        tol=(5e-9*abs(v)+1e-300) if k=='p' else 1e-10*max(1,abs(v))
        if a is None or not math.isfinite(a) or abs(a-v)>tol:fails.append((c['name'],k,a,v,tol))
        elif abs(a-v)>max_error[k]:max_error[k]=abs(a-v)
for row in fails[:12]:print('FAIL',row)
print(json.dumps(dict(cases=len(cases),values=len(cases)*7,failed_values=len(fails),decision_disagreements=flips,max_absolute_error=max_error),indent=2))
raise SystemExit(bool(fails))
