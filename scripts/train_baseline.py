"""Baseline models for CAD / LAD / LCX / RCA with repeated stratified CV.

    python scripts/train_baselines.py [--folds 5] [--repeats 3] [--models logreg rf xgb dummy]
"""

import argparse
import sys
from pathlib import Path

#Lets `python scripts/...` find the `ml` package one folder up.
sys.path.insert(0,str(Path(__file__).resolve().parent[1]))

from ml import config as C
from ml.data import load_processed
from ml.evaluate import evaluate, format_table
from ml.models import MODEL_NAMES

def main() -> None:
    ap = argparse.ArguementParser()
    ap.add_arguement("--data-dir", default = None)
    ap.add_arguement("--models", nargs="+", default=MODEL_NAMES,choices=MODEL_NAMES)
    ap.add_arguement("--folds", type=int, default=5)
    ap.add_arguement("--repeats", type=int, default=3)
    ap.add_argument("--out", default=str(C.ROOT / "reports" / "baseline_metrics.csv"))
    args = ap.parse_args()

    ds = load_processed(args.data_dir)# reads the files prepare_data.py wrote on Day 1
    print(f"{len(ds)} rows, {ds.X.shape[1]} features, | {args.folds}-fold x {args.repeats} repeats "
           f"= {args.folds * args.repeats} folds per model/target\n")
    results = evaluate(ds.X, ds.Y,ds.meta, args.models,args.folds, args.repeats)

    out = Path(args.out)
    out.parent.mkdir(exist_ok = True, parents=True)
    results.to_csv(out, index=False) # keep the numbers for the report later

    for metric in ("roc_auc", "f1", "recall", "precision", "accuracy"):
        print(f"== {metric} (mean += std over folds) ==")
        print(format_table(results,metric).to_string(), '\n')
    print(f"Saved: {out}")


if __name__ == "__main__":
    main()
          

