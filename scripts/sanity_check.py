"""Is the app reading inputs correctly, and how much do the predictions really vary?

    python scripts/sanity_check.py

Three checks, all on the frozen models:
  1. SPREAD      how different are the predictions across the 303 real patients?
  2. ROUND TRIP  a real patient sent through the app's input path must get exactly the model's own answer
  3. SENSITIVITY change ONE input at a time from a "typical patient" and see what moves
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd

from ml import config as C
from ml.inference import RiskService

TARGETS = list(C.TARGETS)


def as_request(row, meta):
    """One training row -> the dict the web form would send (binary stays 0/1, categories stay text)."""
    return {c: (str(v) if meta[c]["kind"] == "categorical" else float(v)) for c, v in row.items() if pd.notna(v)}


def spread(reports: Path):
    print("1. SPREAD of out-of-fold predictions across the 303 real patients (probabilities in %)")
    oof = pd.read_csv(reports / "oof_predictions.csv")
    rows = []
    for t in TARGETS:
        p, y = oof[f"{t}_prob"] * 100, oof[f"{t}_true"]
        rows.append({"target": t.upper(), "min": p.min(), "10%": p.quantile(.1), "median": p.median(),
                     "90%": p.quantile(.9), "max": p.max(),
                     "avg if truly stenotic": p[y == 1].mean(), "avg if not": p[y == 0].mean()})
    print(pd.DataFrame(rows).round(0).astype({c: int for c in ["min", "10%", "median", "90%", "max", "avg if truly stenotic", "avg if not"]}).to_string(index=False))
    print("   The last two columns are the point: the bigger the gap, the better the model separates patients.\n")


def round_trip(svc, n=40):
    print(f"2. ROUND TRIP: {n} real patients through the app's input path vs the model's own answer")
    rng = np.random.default_rng(0)
    worst = 0.0
    for i in rng.choice(len(svc._X_train), size=n, replace=False):
        got = svc.predict(as_request(svc._X_train.iloc[i], svc.meta))["predictions"]
        for t, b in svc.bundles.items():
            model = b["calibrated"] if b["use_calibration"] else b["base"]
            direct = float(model.predict_proba(svc._X_train.iloc[[i]])[0, 1])
            worst = max(worst, abs(got[t]["probability"] - direct))
    verdict = "OK: inputs are interpreted correctly" if worst < 2e-4 else "PROBLEM: the app and the model disagree"
    print(f"   largest difference: {worst:.5f}  ->  {verdict}\n")


def probabilities(svc, values):
    return {t: p["probability"] * 100 for t, p in svc.predict(values)["predictions"].items()}


def sensitivity(svc, top=6):
    base = probabilities(svc, {})
    print("3. SENSITIVITY: one change at a time, starting from a typical patient")
    print("   typical patient: " + " | ".join(f"{t.upper()} {base[t]:.0f}%" for t in TARGETS))
    swings = {t: [] for t in TARGETS}
    for col in svc.features:
        m = svc.meta[col]
        if m["kind"] == "numeric":
            alts = [round(float(q), 1) for q in svc._X_train[col].quantile([.1, .9])]   # a low and a high value
        elif m["kind"] == "binary":
            alts = [0, 1]
        else:
            alts = m["categories"]
        for alt in alts:
            p = probabilities(svc, {col: alt})
            for t in TARGETS:
                swings[t].append((p[t] - base[t], col, alt))
    for t in TARGETS:
        biggest = {}                                    # keep each feature's largest move only
        for d, col, alt in swings[t]:
            if col not in biggest or abs(d) > abs(biggest[col][0]):
                biggest[col] = (d, alt)
        ranked = sorted(biggest.items(), key=lambda kv: -abs(kv[1][0]))
        print(f"\n   {t.upper()}: biggest single changes (percentage points)")
        for col, (d, alt) in ranked[:top]:
            print(f"      {svc.meta[col]['original_name']:<22} set to {alt!s:<7} {d:+.0f} pts")
        flat = sum(abs(d) < 1 for d, _ in biggest.values())
        print(f"      ...and {flat} of {len(biggest)} features move it by less than 1 point on their own")


if __name__ == "__main__":
    svc = RiskService()
    spread(svc.report_dir)
    round_trip(svc)
    sensitivity(svc)