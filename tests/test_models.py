import pandas as pd

from ml import config as C
from ml.data import build_dataset
from ml.evaluate import evaluate, format_table
from ml.models import MODEL_NAMES, make_pipeline

def test_pipelines_fit_and_never_see_leakage_columns(raw_csv):
    # raw_csv is a synthetic file made by tests/conftest.py
    ds = build_dataset(raw_csv)
    y = ds.Y["y_lad"].astype(int)
    for name in MODEL_NAMES:
        pipe = make_pipeline(name, ds.meta).fit(ds.X, y)
        proba = pipe.predict_proba(ds.X)[:, 1]
        assert proba.shape == (len(ds.X),) and ((0 <= proba) & (proba <= 1)).all()
        # None of the transformed feature names may start with lad/lcx/rca/cath/cad
        feats = set(pipe.named_steps["prep"].get_feature_names_out())
        assert not any(f.startswith(k) for f in feats for k in C.LEAKAGE_COLUMNS)


def test_evaluate_returns_all_targets_models_metrics(raw_csv):
    ds = build_dataset(raw_csv)
    res = evaluate(ds.X, ds.Y, ds.meta, ["dummy", "logreg"], folds=3, repeats=1)
    assert set(res["target"]) == set(C.TARGETS)
    assert set(res["metric"]) == {"accuracy", "precision", "recall", "f1", "roc_auc"}
    assert res["mean"].between(0, 1).all()
    dummy_auc = res[(res.model == "dummy") & (res.metric == "roc_auc")]["mean"]
    assert (dummy_auc.round(3) == 0.5).all()          # no signal -> AUC exactly 0.5
    table = format_table(res, "roc_auc")
    assert list(table.columns) == list(C.TARGETS) and set(table.index) == {"dummy", "logreg"}


def test_missing_values_at_inference_are_imputed(raw_csv):
    # The web form will sometimes leave fields blank; the pipeline must still predict.
    ds = build_dataset(raw_csv)
    pipe = make_pipeline("logreg", ds.meta).fit(ds.X, ds.Y["y_cad"].astype(int))
    row = ds.X.iloc[[0]].copy()
    row[["age", "bp", "vhd", "sex"]] = float("nan")
    assert pd.notna(pipe.predict_proba(row)).all()