"""Day 3: nested CV for every target and model, calibration check, final models saved to models/.

    python scripts/train_final.py            # full run (several minutes)
    python scripts/train_final.py --quick    # 1 outer repeat instead of 2 (about half the time)
"""

import argparse
import json
import sys
from pathlib import Path


# Make the project's `ml` package importable when running `python scripts/...`
sys.path.insert(0, str(Path(__file__).parent.parents[1]))
import joblib # saves/loads Python objects (our fitted models) to disk
import pandas as pd
import numpy as np
from ml import config as C
from ml.models import MODEL_NAMES
from ml.tuning import (bootstrap_auc_ci,fit_final, nested_cv,
                       threshold_metrics, youden_threshold)
# The dummy model was only a "no skill" floor on Day 2, so it isn't a candidate for shipping.
CANDIDATES = [m for m in MODEL_NAMES if m != "dummy"]

def main() -> None:
    #Command-line arguements, so the same script serves a quick test or a full run
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=None)
    ap.add_argument("--models", nargs="+", default=CANDIDATES, choices=CANDIDATES)
    ap.add_argument("--quick", action="store_true")   # a flag: present = True, absent = False
    ap.add_argument("--reports", default=str(C.ROOT / "reports"))
    ap.add_argument("--model-dir", default=str(C.ROOT / "models"))
    args = ap.parse_args()

    reports, model_dir = Path(args.reports), Path(args.model_dir)
    reports.mkdir(parents=True,exist_ok=True) #create the reports/ folder if it doesn't exist
    model_dir.mkdir(parents=True, exist_ok=True)
    repeats = 1 if args.quick else 2               # fewer repeats = faster but a noisier estimate
    ds = load_processed(args.data_dir)             # X (features), Y (4 target columns), meta
    # rows      -> one summary line per (target, model), becomes nested_cv_results.csv
    # final     -> the chosen model's metrics per target, becomes final_metrics.json
    # oof_table -> every patient's out-of-fold probability per target, becomes oof_predictions.csv
    rows, final, oof_table = [], {}, {}

    for target, col in C.TARGETS.items():          # cad, lad, lcx, rca
        y = ds.Y[col].astype(int).to_numpy()
        print(f"\n=== {target.upper()} ({y.sum()} positives / {len(y)}) ===")

        # ---- Step 1: nested CV for every candidate model type ----
        results = {}
        for name in args.models:
            results[name] = nested_cv(ds.X, y, ds.meta, name, outer_repeats=repeats)
            s = results[name]["scores"]
            rows.append({
                "target": target, "model": name,
                "auc_raw": np.mean(s["auc_raw"]),
                "auc_raw_std": np.std(s["auc_raw"], ddof=1),   # ddof=1 = sample std (n-1), standard for folds
                "auc_cal": np.mean(s["auc_cal"]),
                "brier_raw": np.mean(s["brier_raw"]), "brier_cal": np.mean(s["brier_cal"]),
            })
            r = rows[-1]   # the row we just added, for printing
            print(f"  {name:7s} AUC {r['auc_raw']:.3f}±{r['auc_raw_std']:.3f} | "
                  f"Brier raw {r['brier_raw']:.3f} -> calibrated {r['brier_cal']:.3f}")

        # ---- Step 2: choose the model type with the highest mean nested AUC ----
        # max(..., key=...) returns the name whose key value is largest.
        # Reminder: the models are statistically tied, so this is a tiebreak, not a verdict.
        best = max(args.models, key=lambda m: np.mean(results[m]["scores"]["auc_raw"]))
        s = results[best]["scores"]

        # Use calibration only if it actually lowered the Brier score (i.e. improved the probabilities).
        use_cal = bool(np.mean(s["brier_cal"]) < np.mean(s["brier_raw"]))
        oof = results[best]["oof_cal"] if use_cal else results[best]["oof_raw"]

        # oof has shape (repeats, patients). Averaging over axis 0 collapses the repeats, giving one
        # probability per patient. All of these come from models that never saw that patient.
        p = oof.mean(axis=0)

        # ---- Step 3: numbers for the report, all from the out-of-fold probabilities ----
        thr = youden_threshold(y, p)          # best yes/no cut-off (see the Youden explanation)
        lo, hi = bootstrap_auc_ci(y, p)       # 95% confidence interval for the AUC
        m = threshold_metrics(y, p, thr)      # accuracy, precision, recall, F1, AUC, Brier at that cut-off
        m.update({"model": best, "calibrated": use_cal, "auc_ci95": [lo, hi],
                  "nested_auc_mean": float(np.mean(s["auc_raw"])),
                  "nested_auc_std": float(np.std(s["auc_raw"], ddof=1))})
        print(f"  -> chosen: {best} | calibrated: {use_cal} | AUC {m['roc_auc']:.3f} "
              f"(95% CI {lo:.3f}-{hi:.3f}) | recall {m['recall']:.2f} | precision {m['precision']:.2f}")

        # ---- Step 4: final fit on all patients, saved for the web app ----
        params, base, cal = fit_final(ds.X, y, ds.meta, best)
        # JSON can't store every Python type, so non-basic values are stored as text.
        m["best_params"] = {k: (v if isinstance(v, (int, float, str)) else str(v))
                            for k, v in params.items()}
        final[target] = m
        oof_table[f"{target}_prob"] = p
        oof_table[f"{target}_true"] = y
        # One .joblib per target: both models, the cut-off, and the exact feature order they expect.
        joblib.dump({"target": target, "model": best, "params": params, "base": base,
                     "calibrated": cal, "use_calibration": use_cal, "threshold": thr,
                     "features": list(ds.X.columns)}, model_dir / f"{target}.joblib")

    # Write the summary files for your documentation and for plots later.
    pd.DataFrame(rows).to_csv(reports / "nested_cv_results.csv", index=False)
    pd.DataFrame(oof_table).to_csv(reports / "oof_predictions.csv", index=False)
    (reports / "final_metrics.json").write_text(json.dumps(final, indent=2))
    print(f"\nSaved to {reports} and {model_dir}")


if __name__ == "__main__":
    main()


