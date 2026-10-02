"""Clean the raw file and write data/processed/{dataset.csv,feature_meta.json,data_report.json}.

    python scripts/prepare_data.py [--file data/raw/<file>] [--out data/processed]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml.data import build_dataset, save_processed


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=None)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    ds = build_dataset(args.file)
    out = save_processed(ds, args.out)
    r = ds.report
    print(f"Wrote processed data to {out}")
    print(f"Rows: {r['n_rows']} | Features: {r['n_features']} {r['feature_kinds']}")
    print(f"Excluded as leakage: {r['excluded_from_features']} (CAD label from '{r['cad_label_source_column']}')")
    print("Class balance:")
    print(json.dumps(r["class_balance"], indent=2))
    if r["constant_columns_dropped"]:
        print("Constant columns dropped:", r["constant_columns_dropped"])
    if r["columns_with_missing"]:
        print("Columns with missing values:", r["columns_with_missing"])


if __name__ == "__main__":
    main()
