"""Serving logic: turn a patient's inputs into probabilities and SHAP explanations.

Kept separate from FastAPI so it can be tested without running a web server.
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from xgboost import XGBClassifier

from . import config as C
from .data import load_processed


class RiskService:
    """Loads everything once at startup, then answers requests quickly."""

    def __init__(self, model_dir=None, data_dir=None, report_dir=None):
        # Defaults point at the project's models/ and reports/ folders; tests pass temporary folders.
        model_dir = Path(model_dir) if model_dir else C.ROOT / "models"
        self.report_dir = Path(report_dir) if report_dir else C.ROOT / "reports"

        # One saved bundle per target (written by scripts/train_final.py). Each bundle holds the
        # base pipeline, the calibrated model, the cut-off and the feature order.
        self.bundles = {t: joblib.load(model_dir / f"{t}.joblib") for t in C.TARGETS}

        # We reload the processed dataset for two reasons: its feature metadata (ranges, categories)
        # validates inputs, and the training rows give default values and a SHAP background for logreg.
        ds = load_processed(data_dir)
        self.meta = ds.meta
        self.features = list(ds.X.columns)
        self._X_train = ds.X

        # Safety check: all four models must expect exactly the same columns in the same order.
        for t, b in self.bundles.items():
            if b["features"] != self.features:
                raise ValueError(f"Model '{t}' was trained on different columns than dataset.csv")

        # Building a SHAP explainer takes a moment, so do it once here, not on every request.
        self.explainers = {t: self._make_explainer(b["base"]) for t, b in self.bundles.items()}
        self._owner = self._build_owner_map()

    # ------------------------------------------------------------------ setup
    def _make_explainer(self, base):
        """SHAP needs the model step on its own (not the whole pipeline) and the transformed input."""
        prep, clf = base.named_steps["prep"], base.named_steps["clf"]
        if isinstance(clf, (RandomForestClassifier, XGBClassifier)):
            # TreeExplainer reads the tree structure directly: exact and fast.
            return shap.TreeExplainer(clf)
        if isinstance(clf, LogisticRegression):
            # Linear SHAP measures "difference from the average patient", so it needs a background set.
            return shap.LinearExplainer(clf, prep.transform(self._X_train))
        raise TypeError(f"No SHAP explainer set up for {type(clf).__name__}")

    def _build_owner_map(self) -> dict[str, str]:
        """After one-hot encoding, 'vhd' becomes 'vhd_mild', 'vhd_Severe', ...
        This maps each transformed column back to the clinical feature it came from, so the
        dashboard can show 'VHD' as one bar instead of four."""
        owner = {}
        for col, m in self.meta.items():
            if m["kind"] == "categorical":
                for cat in m["categories"]:
                    owner[f"{col}_{cat}"] = col
            else:
                owner[col] = col     # numeric and binary columns keep their own name
        return owner

    # ------------------------------------------------------------------ inputs
    def to_frame(self, values: dict):
        """Validate the request and build the one-row table the pipeline expects.

        Blank / missing fields become NaN: the pipeline fills them with typical training values.
        Wrong names or impossible values raise ValueError (the API turns that into HTTP 422).
        Values outside the training range only produce a warning.
        """
        unknown = sorted(set(values) - set(self.features))
        if unknown:
            raise ValueError(f"Unknown feature(s): {unknown}")

        row, warnings, filled = {}, [], []
        for col in self.features:
            m, v = self.meta[col], values.get(col)
            label = m["original_name"]            # the readable name, e.g. "Region RWMA"

            # Missing or blank -> NaN, and remember that we filled it (shown to the user).
            if v is None or (isinstance(v, str) and v.strip() == ""):
                row[col] = np.nan
                filled.append(col)
                continue

            if m["kind"] == "numeric":
                try:
                    x = float(v)
                except (TypeError, ValueError):
                    raise ValueError(f"{label}: expected a number, got {v!r}")
                # Outside the observed range is not an error (a real patient can be unusual),
                # but the model is extrapolating, so warn.
                if not (m["min"] <= x <= m["max"]):
                    warnings.append(f"{label}={x:g} is outside the range seen in training "
                                    f"({m['min']:g} to {m['max']:g}); treat this prediction with extra caution.")
                row[col] = x
            elif m["kind"] == "binary":
                if v not in (0, 1, True, False):
                    raise ValueError(f"{label}: expected 0/1 (or true/false), got {v!r}")
                row[col] = float(v)
            else:  # categorical: must be one of the categories seen in training
                if str(v) not in m["categories"]:
                    raise ValueError(f"{label}: expected one of {m['categories']}, got {v!r}")
                row[col] = str(v)

        # Build the one-row table in the exact column order the models were trained on.
        X = pd.DataFrame([row], columns=self.features)
        # A text column whose only value is NaN would be typed float; force it back to text,
        # otherwise the pipeline's imputer for text columns can fail.
        for col in self.features:
            if self.meta[col]["kind"] == "categorical":
                X[col] = X[col].astype(object)
        return X, warnings, filled

    # ------------------------------------------------------------------ outputs
    def predict(self, values: dict) -> dict:
        X, warnings, filled = self.to_frame(values)
        preds = {}
        for t, b in self.bundles.items():
            # Show the calibrated probability when calibration helped on this target
            # (that decision was made in train_final.py using the Brier score).
            model = b["calibrated"] if b["use_calibration"] else b["base"]
            p = float(model.predict_proba(X)[0, 1])   # [0, 1] = first (only) patient, "stenotic" class
            preds[t] = {
                "probability": round(p, 4),                          # drives the artery colour
                "threshold": round(float(b["threshold"]), 4),        # the Youden cut-off from Day 3
                "above_threshold": bool(p >= b["threshold"]),        # yes/no label for the status card
                "model": b["model"],
                "calibrated": bool(b["use_calibration"]),
            }

        # CAD and the vessel models are separate models, so they can disagree
        # (for example a high LAD probability but a low CAD one). Say so instead of hiding it.
        vessels_up = [t.upper() for t in ("lad", "lcx", "rca") if preds[t]["above_threshold"]]
        if vessels_up and not preds["cad"]["above_threshold"]:
            warnings.append(f"The overall CAD model is below its threshold but {', '.join(vessels_up)} "
                            "is above theirs. The models disagree; interpret with caution.")

        return {
            "predictions": preds,
            "n_inputs_filled": len(filled),
            "filled_features": [self.meta[c]["original_name"] for c in filled],
            "warnings": warnings,
        }

    @staticmethod
    def _shap_for(explainer, Xt):
        """Return (SHAP values for the 'stenotic' class, base value) for ONE patient.

        Different SHAP versions / models return different shapes, so normalise them here:
          list of 2 arrays       -> take class 1
          array (rows, feats, 2) -> take class 1
          array (rows, feats)    -> already class 1 (XGBoost, logistic regression)
        """
        sv = explainer.shap_values(Xt)
        if isinstance(sv, list):
            sv = sv[1]
        sv = np.asarray(sv)
        if sv.ndim == 3:
            sv = sv[:, :, 1]
        ev = np.atleast_1d(explainer.expected_value)       # the base value; may be one number or one per class
        base_value = float(ev[1] if len(ev) > 1 else ev[0])
        return sv[0], base_value                           # [0] = the single patient in the batch

    def explain(self, values: dict, top_k: int = 10, entered_only:bool = False) -> dict:
        X, warnings, filled = self.to_frame(values)
        filled_set = set(filled)
        out = {}
        for t, b in self.bundles.items():
            base = b["base"]
            prep, clf = base.named_steps["prep"], base.named_steps["clf"]
            Xt = prep.transform(X)                          # what the model actually sees (imputed, encoded)
            names = list(prep.get_feature_names_out())      # names of those transformed columns
            sv, base_value = self._shap_for(self.explainers[t], Xt)

            # Fold one-hot columns back into their clinical feature (e.g. all vhd_* into "vhd").
            # Legitimate because SHAP values are additive.
            per_feature: dict[str, float] = {}
            for n, v in zip(names, sv):
                key = self._owner.get(n, n)
                per_feature[key] = per_feature.get(key, 0.0) + float(v)

            # share_pct = this feature's |push| as a percentage of all |pushes|, so shares sum to 100.
            total = sum(abs(v) for v in per_feature.values()) or 1.0      # "or 1.0" avoids dividing by zero
            #ranked = sorted(per_feature.items(), key=lambda kv: abs(kv[1]), reverse=True)
            # Share of the total push that came from fields the user did NOT enter (assumed typical values).
            assumed = sum(abs(v) for c, v in per_feature.items() if c in filled_set)
            ranked = sorted(per_feature.items(), key=lambda kv: abs(kv[1]), reverse=True)
            if entered_only:     # hide assumed values from the list; shares stay relative to the full total
                ranked = [(c, v) for c, v in ranked if c not in filled_set]


            items = [{
                "feature": col,
                "label": self.meta[col]["original_name"],
                "value": None if col in filled_set else values.get(col),   # None = was left blank
                "was_filled": col in filled_set,
                "shap": round(v, 5),
                "share_pct": round(100 * abs(v) / total, 1),
                "direction": "raises" if v > 0 else "lowers",
            } for col, v in ranked[:top_k]]
            rest = sum(abs(v) for _, v in ranked[top_k:])      # share of the features not listed

            out[t] = {
                "unit": "probability" if isinstance(clf, RandomForestClassifier) else "log-odds",
                "base_value": round(base_value, 4),
                "top_features": items,
                "other_share_pct": round(100 * rest / total, 1),
                "assumed_share_pct": round(100 * assumed / total, 1),
            }
        return {
            "explanations": out,
            "warnings": warnings,
            "note": ("Explanations describe the underlying (uncalibrated) model. Calibration rescales scores "
                     "monotonically, so the ranking and direction of effects are unchanged, but the numbers "
                     "will not add up exactly to the displayed probability. Use share_pct for comparison."),
        }

    # ------------------------------------------------------------------ metadata
    def feature_info(self) -> list[dict]:
        """Everything the frontend needs to build the input form without hard-coding features.
        New features added later appear automatically."""
        info = []
        for col in self.features:
            m = self.meta[col]
            item = {"name": col, "label": m["original_name"], "kind": m["kind"]}
            mode = self._X_train[col].mode().iloc[0]        # most common training value
            if m["kind"] == "numeric":
                item.update(min=m["min"], max=m["max"], median=m["median"], default=m["median"])
            elif m["kind"] == "binary":
                item.update(mapping=m["mapping"], default=int(mode))
            else:
                item.update(categories=m["categories"], default=str(mode))
            info.append(item)
        return info

    def metrics(self):
        """Evaluation numbers saved by train_final.py (None if the reports are missing)."""
        final = self.report_dir / "final_metrics.json"
        if not final.exists():
            return None
        cv_file = self.report_dir / "nested_cv_results.csv"
        return {
            "final": json.loads(final.read_text()),
            "nested_cv": pd.read_csv(cv_file).to_dict("records") if cv_file.exists() else [],
        }