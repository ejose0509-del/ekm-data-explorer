"""Verify every held-out metric and training-only baseline with scikit-learn."""
import sys,json,numpy as np
from sklearn.metrics import roc_auc_score,accuracy_score,brier_score_loss,r2_score,mean_squared_error
c=json.load(sys.stdin);y=np.array(c['y']);oof=c['oof'];baseline=[];model=[]
for split,actual in zip(c['folds'],c['scores']):
    train=y[split['train']];test=y[split['test']];pred=np.array([oof[i] for i in split['test']])
    if c['task']=='cls':
        assert len(np.unique(train))==len(np.unique(test))==2
        metric=roc_auc_score(test,pred); prior=float(np.mean(train));bp=np.full(len(test),prior)
    else:
        metric=r2_score(test,pred);bp=np.full(len(test),np.mean(train))
    key='auc' if c['task']=='cls' else 'r2'
    np.testing.assert_allclose(actual[key],metric,rtol=1e-10,atol=1e-12)
    baseline.extend(zip(split['test'],bp));model.append(metric)
indices=[i for i,p in baseline];bp=np.array([p for i,p in baseline]);test=y[indices]
if c['task']=='cls':
    np.testing.assert_allclose(c['baseline']['accuracy'],accuracy_score(test,bp>=.5),atol=1e-12)
    np.testing.assert_allclose(c['baseline']['brier'],brier_score_loss(test,bp),atol=1e-12)
else:np.testing.assert_allclose(c['baseline']['rmse'],np.sqrt(mean_squared_error(test,bp)),rtol=1e-10)
print(json.dumps({'folds':len(model),'cv_mean':float(np.mean(model))}))
