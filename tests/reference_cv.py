"""Verify every held-out metric and training-only baseline with scikit-learn."""
import sys,json,numpy as np
from fractions import Fraction
def exact_mean(x):return sum(Fraction.from_float(float(v)) for v in x)/len(x)
def exact_r2(y,p):
    mu=exact_mean(y);den=sum((Fraction.from_float(float(v))-mu)**2 for v in y);num=sum((Fraction.from_float(float(v))-Fraction.from_float(float(w)))**2 for v,w in zip(y,p));return float(1-num/den)
def exact_rmse(y,p):
    from decimal import Decimal,localcontext
    q=sum((Fraction.from_float(float(v))-Fraction.from_float(float(w)))**2 for v,w in zip(y,p))/len(y)
    with localcontext() as ctx:
        ctx.prec=100
        return float((Decimal(q.numerator)/Decimal(q.denominator)).sqrt())
from sklearn.metrics import roc_auc_score,accuracy_score,brier_score_loss,r2_score,mean_squared_error
c=json.load(sys.stdin);y=np.array(c['y']);oof=c['oof'];baseline=[];model=[]
for split,actual in zip(c['folds'],c['scores']):
    train=y[split['train']];test=y[split['test']];pred=np.array([oof[i] for i in split['test']])
    if c['task']=='cls':
        assert len(np.unique(train))==len(np.unique(test))==2
        metric=roc_auc_score(test,pred); prior=float(np.mean(train));bp=np.full(len(test),prior)
    else:
        metric=exact_r2(test,pred);bp=np.full(len(test),float(exact_mean(train)))
    key='auc' if c['task']=='cls' else 'r2'
    np.testing.assert_allclose(actual[key],metric,rtol=1e-10,atol=1e-12)
    baseline.extend(zip(split['test'],bp));model.append(metric)
indices=[i for i,p in baseline];bp=np.array([p for i,p in baseline]);test=y[indices]
if c['task']=='cls':
    np.testing.assert_allclose(c['baseline']['accuracy'],accuracy_score(test,bp>=.5),atol=1e-12)
    np.testing.assert_allclose(c['baseline']['brier'],brier_score_loss(test,bp),atol=1e-12)
else:np.testing.assert_allclose(c['baseline']['rmse'],exact_rmse(test,bp),rtol=1e-10)
print(json.dumps({'folds':len(model),'cv_mean':float(np.mean(model))}))
