"""Print what the raw file looks like. Run this first on the real dataset.

    python scripts/inspect_data.py [--file data/raw/<file>]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pandas as pd

from ml import config as C
from ml.data import clean_frame, load_raw


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=None)
    args = ap.parse_args()

    raw, src = load_raw(args.file)
    df, original = clean_frame(raw)
    print(f"File: {src}\nShape after cleaning: {df.shape}\n")

    rows = []
    for c in df.columns:
        u = df[c].dropna().unique().tolist()
        rows.append({
            "column": c,
            "dtype": str(df[c].dtype),
            "n_unique": len(u),
            "n_missing": int(df[c].isna().sum()),
            "sample": u[:5],
        })
    with pd.option_context("display.max_rows", None, "display.width", 200, "display.max_colwidth", 60):
        print(pd.DataFrame(rows).to_string(index=False))

    print("\nTarget-like columns (value counts):")
    for c in df.columns:
        if c in C.LEAKAGE_COLUMNS:
            print(f"\n[{c}]")
            print(df[c].value_counts(dropna=False).to_string())


if __name__ == "__main__":
    main()
