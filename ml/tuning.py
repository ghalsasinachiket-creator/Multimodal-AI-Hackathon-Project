"""Day 3 helpers: honest evaluation (nested CV), calibration, cut-off choice, final model fitting.

Vocabulary
----------
OOF   = "out-of-fold": a prediction made for a patient by a model that never saw that patient.
AUC   = chance the model scores a random sick patient above a random healthy one (0.5 = coin flip).
Brier = average squared gap between predicted probability and the true 0/1 outcome (lower = better).
"""
from __future__ import annotations

import numpy as np
import pandas as pd   # not used yet, harmless
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score,
                             precision_score, recall_score, roc_auc_score, roc_curve)
from sklearn.model_selection import GridSearchCV, RepeatedStratifiedKFold, StratifiedKFold

from . import config as C
from .models import make_pipeline

# Hyperparameter options to try for each model. Deliberately small: with only 303 patients,
# a big search starts fitting noise in the validation folds instead of real signal.
# The "clf__" prefix = the step named "clf" inside our Pipeline (see ml/models.py);
# "clf__C" therefore means "the C parameter of the classifier step".
#   logreg: C = regularisation strength (smaller = simpler model)            -> 3 combinations
#   rf:     min_samples_leaf = smallest allowed leaf size (bigger = smoother),
#           max_features = share of features each split may look at           -> 3 x 2 = 6 combinations
#   xgb:    max_depth = tree depth, n_estimators = number of trees            -> 2 x 2 = 4 combinations
GRIDS = {
    "logreg": {"clf__C": [0.01, 0.1, 1.0]},
    "rf": {"clf__min_samples_leaf": [1, 3, 5], "clf__max_features": ["sqrt", 0.3]},
    "xgb": {"clf__max_depth": [2, 3], "clf__n_estimators": [150, 300]},
}


def nested_cv(X, y, meta, name, outer_folds=5, outer_repeats=2, inner_folds=3, seed=C.SEED):
    """Nested cross-validation for ONE model type on ONE target.

    OUTER loop = the "real exam": split patients into 5 folds; each fold takes a turn as unseen test data.
    INNER loop = "practice tests": runs only inside the outer-training part and picks hyperparameters.
    The outer test fold never influences tuning, so the resulting score is not optimistic.
    The whole thing is repeated `outer_repeats` times with different random splits for stability.

    Returns per-fold scores plus out-of-fold probabilities, raw and calibrated.
    """
    n = len(y)  # number of patients (303)

    # Produces outer_folds x outer_repeats = 10 (train_idx, test_idx) pairs.
    # "Stratified" keeps the positive/negative ratio the same in every fold.
    outer = RepeatedStratifiedKFold(n_splits=outer_folds, n_repeats=outer_repeats, random_state=seed)

    # One row per repeat, one column per patient. oof_raw[r, i] will hold the probability the model
    # gave patient i in repeat r, at the moment i was in the test fold. After the loop every cell is
    # filled, because each repeat tests every patient exactly once.
    oof_raw = np.zeros((outer_repeats, n))
    oof_cal = np.zeros((outer_repeats, n))
    scores = {"auc_raw": [], "auc_cal": [], "brier_raw": [], "brier_cal": []}   # one value per outer fold

    for i, (tr, te) in enumerate(outer.split(X, y)):
        # The splitter yields folds repeat by repeat: folds 0-4 are repeat 0, folds 5-9 are repeat 1.
        # Integer division maps fold number -> repeat number (7 // 5 = 1).
        rep = i // outer_folds

        # iloc selects rows by position; y is a plain numpy array so it uses ordinary indexing.
        X_tr, X_te, y_tr, y_te = X.iloc[tr], X.iloc[te], y[tr], y[te]

        # ---- INNER loop: choose hyperparameters using ONLY the outer-training patients ----
        inner = StratifiedKFold(n_splits=inner_folds, shuffle=True, random_state=seed)
        # GridSearchCV tries every combination in GRIDS[name]. For each, it runs the inner CV and
        # averages the AUC. n_jobs=1 because random forest already uses all CPU cores itself.
        search = GridSearchCV(make_pipeline(name, meta, seed), GRIDS[name],
                              scoring="roc_auc", cv=inner, n_jobs=1)
        search.fit(X_tr, y_tr)   # afterwards it refits the winning setting on all of X_tr
        p_raw = search.predict_proba(X_te)[:, 1]   # column 1 = probability of the positive class

        # ---- Calibration: remap raw scores to honest probabilities (Platt / "sigmoid") ----
        # CalibratedClassifierCV clones the tuned pipeline and, inside X_tr, runs a 3-fold split:
        # each copy trains on 2/3 of X_tr and learns the score->probability mapping from the
        # remaining 1/3 (patients that copy did not train on). predict_proba averages the 3 copies.
        # The test fold X_te is untouched until now.
        cal = CalibratedClassifierCV(estimator=search.best_estimator_, method="sigmoid", cv=3)
        cal.fit(X_tr, y_tr)
        p_cal = cal.predict_proba(X_te)[:, 1]

        # Store these test-fold predictions in the right cells: row = repeat, columns = test patients.
        oof_raw[rep, te], oof_cal[rep, te] = p_raw, p_cal

        # Per-fold scores (these are what we later average and report +/- std).
        scores["auc_raw"].append(roc_auc_score(y_te, p_raw))
        scores["auc_cal"].append(roc_auc_score(y_te, p_cal))
        scores["brier_raw"].append(brier_score_loss(y_te, p_raw))   # lower = better probabilities
        scores["brier_cal"].append(brier_score_loss(y_te, p_cal))

    return {"scores": scores, "oof_raw": oof_raw, "oof_cal": oof_cal}


def youden_threshold(y, p) -> float:
    """Find the cut-off with the best balance of sensitivity and specificity.

    Youden's J = sensitivity + specificity - 1 = TPR - FPR.
    roc_curve tries every distinct score as a cut-off and reports TPR and FPR for each.
    We take the cut-off where TPR - FPR is largest (the point farthest above the coin-flip line).

    Used ONLY for the yes/no status label. The 3D colours use the probability itself.
    """
    fpr, tpr, thr = roc_curve(y, p)          # three arrays of equal length, one entry per cut-off
    return float(thr[np.argmax(tpr - fpr)])  # argmax = position of the biggest J; thr[...] = that cut-off


def bootstrap_auc_ci(y, p, n_boot=2000, seed=C.SEED) -> tuple[float, float]:
    """95% confidence interval for the AUC via the bootstrap.

    Idea: "what if we had recruited a slightly different group of patients?" Imitate that by redrawing
    patients WITH replacement (some appear twice, some not at all), recompute AUC, repeat 2000 times.
    The middle 95% of those AUCs (2.5th to 97.5th percentile) is the interval. Wider = less certain.
    """
    rng = np.random.default_rng(seed)   # seeded random generator -> same answer every run
    aucs = []
    for _ in range(n_boot):
        idx = rng.integers(0, len(y), len(y))   # len(y) random patient indices, with replacement
        if y[idx].min() == y[idx].max():        # this draw contains only one class: AUC undefined, skip
            continue
        aucs.append(roc_auc_score(y[idx], p[idx]))
    lo, hi = np.percentile(aucs, [2.5, 97.5])
    return float(lo), float(hi)


def threshold_metrics(y, p, thr) -> dict:
    """The classification metrics required by the problem statement, at a given cut-off.

    TP/FP/TN/FN = true/false positives/negatives after turning probabilities into yes/no at `thr`.
      accuracy  = (TP+TN) / everyone
      precision = TP / (TP+FP)   "when we say stenotic, how often are we right?"
      recall    = TP / (TP+FN)   "of the truly stenotic, how many did we catch?" (= sensitivity)
      f1        = harmonic mean of precision and recall (low if either is low)
    ROC-AUC and Brier use the raw probabilities and do not depend on the cut-off.
    """
    pred = (p >= thr).astype(int)   # probability at or above the cut-off -> 1, else 0
    return {
        "accuracy": float(accuracy_score(y, pred)),
        "precision": float(precision_score(y, pred, zero_division=0)),   # 0 instead of an error if nobody flagged
        "recall": float(recall_score(y, pred)),
        "f1": float(f1_score(y, pred)),
        "roc_auc": float(roc_auc_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "threshold": float(thr),
    }


def fit_final(X, y, meta, name, seed=C.SEED):
    """Fit the models the web app will actually load, using ALL patients.

    Why use everything now? Nested CV already gave the honest performance estimate. The final model
    just needs to be as good as possible, and more data helps with only 303 rows.

    Returns (best_params, base_pipeline, calibrated_model):
      base_pipeline    = uncalibrated, kept for SHAP explanations on Day 4
      calibrated_model = what produces the probabilities shown in the dashboard and 3D view
    """
    inner = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed)
    search = GridSearchCV(make_pipeline(name, meta, seed), GRIDS[name],
                          scoring="roc_auc", cv=inner, n_jobs=1).fit(X, y)
    base = search.best_estimator_   # the winning setting, refitted on all data
    cal = CalibratedClassifierCV(estimator=base, method="sigmoid", cv=5).fit(X, y)
    return search.best_params_, base, cal