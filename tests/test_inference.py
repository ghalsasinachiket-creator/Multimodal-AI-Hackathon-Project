import json

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from sklearn.calibration import CalibratedClassifierCV

from backend.main import create_app
from conftest import make_frame
from ml import config as C
from ml.data import build_dataset, save_processed
from ml.inference import RiskService
from ml.models import make_pipeline

# One model of each type, so SHAP is exercised for random forest, XGBoost and logistic regression.
CHOICE = {"cad": "rf", "lad": "xgb", "lcx": "logreg", "rca": "rf"}


@pytest.fixture(scope="module")      # build the models once for the whole file: much faster
def service(tmp_path_factory):
    # Make small fake models in a temp folder, in the same format train_final.py saves.
    tmp_path = tmp_path_factory.mktemp("svc")
    csv = tmp_path / "sample.csv"
    make_frame().to_csv(csv, index=False)
    ds = build_dataset(csv)
    save_processed(ds, tmp_path / "proc")
    model_dir = tmp_path / "models"
    model_dir.mkdir()
    for target, col in C.TARGETS.items():
        y = ds.Y[col].astype(int)
        base = make_pipeline(CHOICE[target], ds.meta).fit(ds.X, y)
        cal = CalibratedClassifierCV(estimator=base, method="sigmoid", cv=3).fit(ds.X, y)
        joblib.dump({"target": target, "model": CHOICE[target], "params": {}, "base": base,
                     "calibrated": cal, "use_calibration": True, "threshold": 0.5,
                     "features": list(ds.X.columns)}, model_dir / f"{target}.joblib")
    return RiskService(model_dir, tmp_path / "proc", tmp_path / "reports")


def test_predict_structure(service):
    r = service.predict({"age": 60, "bp": 140, "sex": 1})
    assert set(r["predictions"]) == set(C.TARGETS)
    assert all(0 <= p["probability"] <= 1 for p in r["predictions"].values())
    assert r["n_inputs_filled"] == len(service.features) - 3     # everything we did not send


def test_shap_is_additive_for_every_model_type(service):
    """base value + sum of SHAP values must reproduce the model output (probability for RF, log-odds otherwise)."""
    X, _, _ = service.to_frame({})
    for t, b in service.bundles.items():
        base = b["base"]
        Xt = base.named_steps["prep"].transform(X)
        sv, base_value = service._shap_for(service.explainers[t], Xt)
        p = float(base.predict_proba(X)[0, 1])
        target_output = p if CHOICE[t] == "rf" else float(np.log(p / (1 - p)))   # log(p/(1-p)) = log-odds
        assert abs(base_value + sv.sum() - target_output) < 1e-3, t


def test_explain_shares(service):
    r = service.explain({"age": 60}, top_k=100)                  # top_k large = list every feature
    for t, e in r["explanations"].items():
        shares = sum(i["share_pct"] for i in e["top_features"])
        assert abs(shares - 100) < 1.0 and e["other_share_pct"] == 0
        names = [i["feature"] for i in e["top_features"]]
        assert len(names) == len(set(names))                     # one-hot columns were merged
        assert not any(n in C.LEAKAGE_COLUMNS for n in names)    # leakage columns never appear
    age = next(i for i in r["explanations"]["cad"]["top_features"] if i["feature"] == "age")
    assert age["value"] == 60 and not age["was_filled"]


def test_entered_hides_assumed_values(service):
    r = service.explain({"age":60,"bp":140}, top_k = 100, entered_only = True)
    for e in r["explanations"].values():
        assert {i["feature"] for i in e["top_features"]} <= {"age", "bp"}
        #entered shares + assumed shares must still add up to 100%
        assert abs(sum(i["share_pct"] for i in e["top_features"]) + e["assumed_share_pct"] - 100) < 1.0

def test_global_importance_is_a_share_per_clinical_feature(service):
    for t in C.TARGETS:
        share = service.global_importance(t)
        assert abs(share.sum() - 100) < 1e-6
        assert (share >= 0).all()
        assert set(share.index) <= set(service.features) #one-hot columns were merged back


def test_validation(service):
    with pytest.raises(ValueError):
        service.to_frame({"not_a_feature": 1})
    with pytest.raises(ValueError):
        service.to_frame({"sex": 2})
    with pytest.raises(ValueError):
        service.to_frame({"vhd": "nonsense"})
    with pytest.raises(ValueError):
        service.to_frame({"age": "abc"})
    _, warnings, _ = service.to_frame({"age": 500})
    assert any("outside the range" in w for w in warnings)
    X, _, filled = service.to_frame({"vhd": None})               # missing text field must still work
    assert "vhd" in filled and service.predict({"vhd": None})


def test_api_endpoints(service):
    with TestClient(create_app(service)) as client:              # "with" runs the startup code
        assert client.get("/health").json() == {"status": "ok"}
        feats = client.get("/features").json()
        assert {f["name"] for f in feats} == set(service.features)
        body = {"features": {"age": 63, "sex": 1, "bp": 140}}
        assert client.post("/predict", json=body).status_code == 200
        assert client.post("/explain?top_k=3", json=body).json()["explanations"]["lad"]["top_features"][2]
        # only fields we actually sent may appear when entered_only is on
        r = client.post("/explain?top_k=50&entered_only=true", json=body).json()
        assert {i["feature"] for i in r["explanations"]["lad"]["top_features"]} <= {"age", "sex", "bp"}
        assert client.post("/predict", json={"features": {"sex": 5}}).status_code == 422
        assert client.get("/metrics").status_code == 404         # no reports in the temp folder yet
        service.report_dir.mkdir()
        (service.report_dir / "final_metrics.json").write_text(json.dumps({"cad": {"roc_auc": 0.9}}))
        assert client.get("/metrics").json()["final"]["cad"]["roc_auc"] == 0.9
        assert client.get("/importance").status_code == 404      # the export script has not been run here
        (service.report_dir / "global_importance.json").write_text(json.dumps({"cad": []}))
        assert client.get("/importance").json() == {"cad": []}