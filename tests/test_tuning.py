import numpy as np

from ml.data import build_dataset
from ml.tuning import (bootstrap_auc_ci, fit_final, nested_cv,
                       threshold_metrics, youden_threshold)


def test_nested_cv_shapes_and_ranges(raw_csv):
    ds = build_dataset(raw_csv)
    y = ds.Y["y_lad"].astype(int).to_numpy()
    r = nested_cv(ds.X, y, ds.meta, "logreg", outer_folds=3, outer_repeats=2, inner_folds=2)
    assert r["oof_raw"].shape == (2, len(y)) and r["oof_cal"].shape == (2, len(y))
    assert len(r["scores"]["auc_raw"]) == 6                      # 3 folds x 2 repeats
    assert all(0 <= a <= 1 for a in r["scores"]["auc_raw"])
    # every patient must have been predicted exactly once per repeat (no zeros left over)
    assert (r["oof_raw"] > 0).all() and (r["oof_raw"] < 1).all()


def test_threshold_ci_and_metrics():
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, 200)
    p = np.clip(y * 0.3 + rng.random(200) * 0.7, 0, 1)         # informative scores
    thr = youden_threshold(y, p)
    lo, hi = bootstrap_auc_ci(y, p, n_boot=200)
    m = threshold_metrics(y, p, thr)
    assert 0.5 < lo <= m["roc_auc"] <= hi <= 1
    assert set(m) >= {"accuracy", "precision", "recall", "f1", "roc_auc", "brier", "threshold"}


def test_fit_final_returns_working_models(raw_csv):
    ds = build_dataset(raw_csv)
    y = ds.Y["y_cad"].astype(int).to_numpy()
    params, base, cal = fit_final(ds.X, y, ds.meta, "logreg")
    assert "clf__C" in params
    for model in (base, cal):
        p = model.predict_proba(ds.X.iloc[:5])[:, 1]
        assert p.shape == (5,) and ((0 <= p) & (p <= 1)).all()