"""Feature ablation: do weight, height and BMI really help, or are they noise / a stand-in for sex?

For each target we re-run the SAME nested cross-validation with and without the body-size features.
Same seed + same labels => identical outer folds, so the two runs can be compared fold by fold.

    python scripts/ablation.py            # 2 outer repeats (more stable)
    python scripts/ablation.py --quick    # 1 outer repeat (faster)
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np
import pandas as pd

from ml import config as C
from ml.data import load_processed
from ml.tuning import nested_cv

# name -> columns to REMOVE for that variant
VARIANTS = {
    "full": [],
    "no_body": ["weight", "length", "bmi"],   # drop all three body-size features
    "bmi_only": ["weight", "length"],         # keep only BMI (one number instead of three)
}
# A drop in mean AUC smaller than this is treated as "no meaningful loss". It is a judgement call:
# fold-to-fold noise is about +-0.05, so 0.01 is a deliberately strict bar.
TOLERANCE = 0.01


def chosen_models(reports: Path, fallback: str) -> dict:
    """Use the model type that train_final.py picked for each target, so we test what we ship."""
    path = reports / "final_metrics.json"
    if path.exists():
        final = json.loads(path.read_text())
        return {t: final[t]["model"] for t in C.TARGETS if t in final}
    return {t: fallback for t in C.TARGETS}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=None)
    ap.add_argument("--reports", default=str(C.ROOT / "reports"))
    ap.add_argument("--model", default="logreg", help="used only if reports/final_metrics.json is missing")
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()

    reports = Path(args.reports)
    reports.mkdir(parents=True, exist_ok=True)
    repeats = 1 if args.quick else 2
    ds = load_processed(args.data_dir)
    models = chosen_models(reports, args.model)

    # ---- Part 1: how do the body features relate to sex and to each target? ----
    body = [c for c in ("weight", "length", "bmi") if c in ds.X.columns]
    if body and "sex" in ds.X.columns:
        cols = body + ["sex"]
        print("Correlation between body-size features and sex (1 = male):")
        print(ds.X[cols].corr().round(2).to_string(), "\n")
        print("Correlation of each feature with each target:")
        print(pd.DataFrame({t: ds.X[cols].corrwith(ds.Y[col]) for t, col in C.TARGETS.items()}).round(2).to_string(), "\n")

    # ---- Part 2: nested CV with and without those features ----
    rows = []
    for target, col in C.TARGETS.items():
        y = ds.Y[col].astype(int).to_numpy()
        print(f"=== {target.upper()} (model: {models[target]}) ===")
        scores = {}
        for variant, drop in VARIANTS.items():
            X = ds.X.drop(columns=[c for c in drop if c in ds.X.columns])        # remove the columns...
            meta = {k: v for k, v in ds.meta.items() if k in X.columns}          # ...and their metadata
            r = nested_cv(X, y, meta, models[target], outer_repeats=repeats)
            scores[variant] = r["scores"]

            auc = np.array(scores[variant]["auc_raw"])
            line = f"  {variant:9s} {X.shape[1]:2d} features | AUC {auc.mean():.3f}±{auc.std(ddof=1):.3f} | Brier {np.mean(scores[variant]['brier_cal']):.3f}"

            row = {"target": target, "variant": variant, "n_features": X.shape[1],
                   "auc": auc.mean(), "auc_std": auc.std(ddof=1), "brier_cal": np.mean(scores[variant]["brier_cal"])}
            if variant != "full":
                # paired comparison: same outer fold, with-feature vs without-feature
                diff = auc - np.array(scores["full"]["auc_raw"])
                se = diff.std(ddof=1) / np.sqrt(len(diff))
                lo, hi = diff.mean() - 1.96 * se, diff.mean() + 1.96 * se
                verdict = "no meaningful loss" if diff.mean() > -TOLERANCE else "LOSES AUC"
                line += f" | Δ vs full {diff.mean():+.3f} (≈95% {lo:+.3f}..{hi:+.3f}) -> {verdict}"
                row.update({"delta_auc": diff.mean(), "delta_lo": lo, "delta_hi": hi, "verdict": verdict})
            print(line)
            rows.append(row)
        print()

    out = pd.DataFrame(rows)
    out.to_csv(reports / "ablation.csv", index=False)

    # ---- Part 3: one-glance summary ----
    nb = out[out.variant == "no_body"]
    print("Summary: dropping weight, height and BMI changes AUC by")
    for _, r in nb.iterrows():
        print(f"  {r.target.upper():4s} {r.delta_auc:+.3f}  ({r.verdict})")
    if (nb.delta_auc > -TOLERANCE).all():
        print("-> No target loses AUC: the simpler model is justified.")
    else:
        worst = nb.loc[nb.delta_auc.idxmin()]
        print(f"-> {worst.target.upper()} loses the most ({worst.delta_auc:+.3f}); weigh that against the simpler form.")
    print(f"\nSaved: {reports / 'ablation.csv'}  (the ± in each line is the spread across folds)")


if __name__ == "__main__":
    main()