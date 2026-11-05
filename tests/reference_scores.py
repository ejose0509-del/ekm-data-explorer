"""Independent fitted-score checks; SciPy solve and NumPy sample standardization.

Thurstone regression weights solve R W = L Phi for oblique factors. Orthogonal
scores use Phi=I. Source: factor_analyzer FactorAnalyzer.transform. EKM explicitly
uses sample SD (ddof=1); unrotated PCA scores have unit sample variance.
"""
import json, sys
import numpy as np
from scipy.linalg import solve
if '--fixture' in sys.argv:
    rng=np.random.default_rng(20261104)
    latent=rng.normal(size=(180,2)); latent[:,1]+=.4*latent[:,0]
    loading=np.array([[.9,.1],[.8,.2],[.7,.1],[.1,.9],[.2,.8],[-.2,.7]])
    x=latent@loading.T+rng.normal(scale=.4,size=(180,6))
    x[120:]+=100  # excluded observations must not enter the fit
    rows=[[str(i+1)]+list(v)+['A' if i%3 else 'B','Exclude' if i>=120 else ''] for i,v in enumerate(x)]
    rows[4][1]=None
    print(json.dumps({'header':['Person ID']+['Item '+str(i+1) for i in range(6)]+['Cohort','Row tag'],'body':rows}));sys.exit()
case=json.load(sys.stdin); fit=case['fit']; x=np.array(case['training'],float)
mean=x.mean(0);sd=x.std(0,ddof=1);r=np.corrcoef(x,rowvar=False)
l=np.array(fit['loadings']);phi=np.eye(l.shape[1]) if fit['phi'] is None else np.array(fit['phi'])
w=solve(r,l@phi,assume_a='sym');expected=((x-mean)/sd)@w
for label,actual,ref in [('mean',fit['mean'],mean),('sd',fit['sd'],sd),('weights',fit['weights'],w),('scores',case['scores'],expected)]:
    np.testing.assert_allclose(actual,ref,rtol=1e-9,atol=1e-10,err_msg=label)
if fit['method']=='pca' and fit['rotation']=='none':
    ev,vec=np.linalg.eigh(r); ev=ev[::-1][:l.shape[1]]; vec=vec[:,::-1][:,:l.shape[1]]
    ref_l=vec*np.sqrt(ev);ref_l*=np.where(ref_l.sum(0)<0,-1,1)
    np.testing.assert_allclose(l,ref_l,rtol=1e-8,atol=1e-9)
    np.testing.assert_allclose(expected.mean(0),0,atol=1e-10)
    np.testing.assert_allclose(expected.std(0,ddof=1),1,atol=1e-9)
assert fit['trainingN']==len(x)
print(json.dumps({'values':int(expected.size),'max_score_error':float(np.max(np.abs(np.array(case['scores'])-expected)))}))
