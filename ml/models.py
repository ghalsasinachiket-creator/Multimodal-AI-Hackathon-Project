"""Model zoo. Keep hyperparameters modest: n=303, so simple and regularised wins."""
from __future__ import annotations

from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

from . import config as C
from .pipeline import build_preprocessor

MODEL_NAMES = ["dummy", "logreg", "rf", "xgb"]
_SCALED = {"logreg"}  # only the linear model needs standardised inputs


def make_model(name: str, seed: int = C.SEED):
    if name == "dummy":
        # Always predicts the class prior. Its AUC is 0.5, so it is the "no skill" floor
        # that the real models have to beat.
        return DummyClassifier(strategy="prior")
    if name == "logreg":
        # class_weight="balanced" up-weights the rarer class (matters for CAD, 71% positive)
        return LogisticRegression(C=1.0, class_weight="balanced", max_iter=5000)
    if name == "rf":
        return RandomForestClassifier(
            n_estimators=400,
            min_samples_leaf=2,                  # stops trees memorising single patients
            class_weight="balanced_subsample",
            n_jobs=-1,                           # use all CPU cores
            random_state=seed,
        )
    if name == "xgb":
        return XGBClassifier(
            n_estimators=300, max_depth=3,       # shallow trees: small dataset
            learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
            reg_lambda=1.0, eval_metric="logloss",
            n_jobs=1, random_state=seed,
        )
    raise ValueError(f"Unknown model '{name}'. Choose from {MODEL_NAMES}")


def make_pipeline(name: str, meta: dict, seed: int = C.SEED) -> Pipeline:
    """Preprocessing + model in ONE object, so cross-validation refits both together on each fold."""
    return Pipeline([
        ("prep", build_preprocessor(meta, scale=name in _SCALED)),
        ("clf", make_model(name, seed)),
    ])