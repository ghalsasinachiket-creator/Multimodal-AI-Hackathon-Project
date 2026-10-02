"""Load, clean and type the Z-Alizadeh Sani (extension) dataset.

Key guarantees
--------------
* Column names are snake_cased, so downstream code never sees spaces.
* Targets (CAD, LAD, LCX, RCA) are binarised strictly: an unrecognised label
  raises instead of being silently guessed.
* LAD, LCX, RCA, Cath and CAD are removed from the feature matrix for ALL
  four targets (target-leakage guard), and re-checked by `assert_no_leakage`.
* No imputation or scaling happens here. That belongs inside the sklearn
  Pipeline so it is fitted on training folds only.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from . import config as C


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def snake(name: object) -> str:
    return re.sub(r"[^0-9a-zA-Z]+", "_", str(name).strip()).strip("_").lower()


def find_raw_file(path: str | Path | None = None) -> Path:
    if path:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"File not found: {p}")
        return p
    candidates = sorted(
        p for p in C.RAW_DIR.glob("*") if p.suffix.lower() in {".csv", ".xlsx", ".xls"}
    )
    if not candidates:
        raise FileNotFoundError(
            f"No .csv/.xlsx found in {C.RAW_DIR}. Download the dataset and place it there."
        )
    if len(candidates) > 1:
        raise ValueError(f"Several files in {C.RAW_DIR}; pass one explicitly: {candidates}")
    return candidates[0]


def load_raw(path: str | Path | None = None) -> tuple[pd.DataFrame, Path]:
    p = find_raw_file(path)
    df = pd.read_csv(p) if p.suffix.lower() == ".csv" else pd.read_excel(p)
    return df, p


def _is_text(s: pd.Series) -> bool:
    return not pd.api.types.is_numeric_dtype(s)


# --------------------------------------------------------------------------- #
# cleaning
# --------------------------------------------------------------------------- #
def clean_frame(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, str]]:
    df = raw.copy()
    original = {snake(c): str(c) for c in df.columns}
    new_cols = [snake(c) for c in df.columns]
    if len(set(new_cols)) != len(new_cols):
        dupes = sorted({c for c in new_cols if new_cols.count(c) > 1})
        raise ValueError(f"Column names collide after snake_casing: {dupes}")
    df.columns = new_cols

    df = df.drop(columns=[c for c in df.columns if c in C.ID_COLUMNS])

    for col in df.columns:
        if _is_text(df[col]):
            s = df[col].astype("string").str.strip()
            s = s.mask(s.str.lower().isin(C.MISSING_TOKENS))
            df[col] = s.astype(object).where(s.notna(), np.nan)

    df = df.dropna(how="all").reset_index(drop=True)
    return df, original


# --------------------------------------------------------------------------- #
# targets
# --------------------------------------------------------------------------- #
def binarize_target(s: pd.Series, name: str) -> pd.Series:
    """Map a label column to {0, 1, NaN}; raise on anything unrecognised."""
    if not _is_text(s):
        vals = set(s.dropna().unique().tolist())
        if vals <= {0, 1, 0.0, 1.0, False, True}:
            return s.astype(float)
        raise ValueError(
            f"Target '{name}' is numeric with values {sorted(vals)}; "
            "expected only 0/1. Run scripts/inspect_data.py and decide the threshold."
        )
    low = s.astype("string").str.strip().str.lower()
    out = pd.Series(np.nan, index=s.index, dtype=float)
    out[low.isin(C.POSITIVE_TOKENS).fillna(False)] = 1.0
    out[low.isin(C.NEGATIVE_TOKENS).fillna(False)] = 0.0
    unknown = sorted(set(low.dropna().unique()) - C.POSITIVE_TOKENS - C.NEGATIVE_TOKENS)
    if unknown:
        raise ValueError(
            f"Target '{name}' has unrecognised labels {unknown}. "
            "Add them to POSITIVE_TOKENS / NEGATIVE_TOKENS in ml/config.py."
        )
    return out


# --------------------------------------------------------------------------- #
# features
# --------------------------------------------------------------------------- #
def _infer_feature(s: pd.Series) -> tuple[pd.Series, dict]:
    """Return (typed series, metadata). Kinds: numeric | binary | categorical."""
    if _is_text(s):
        num = pd.to_numeric(s, errors="coerce")
        if s.notna().sum() and num.notna().sum() >= 0.95 * s.notna().sum():
            s = num
    nonnull = s.dropna()
    n_missing = int(s.isna().sum())

    if pd.api.types.is_numeric_dtype(s):
        levels = sorted(nonnull.unique().tolist())
        if len(levels) == 2:
            lo, hi = levels
            out = (s == hi).astype(float).where(s.notna())
            return out, {
                "kind": "binary",
                "mapping": {str(lo): 0, str(hi): 1},
                "mapping_source": "numeric_order",
                "n_missing": n_missing,
            }
        out = s.astype(float)
        return out, {
            "kind": "numeric",
            "min": float(nonnull.min()),
            "max": float(nonnull.max()),
            "median": float(nonnull.median()),
            "mean": float(nonnull.mean()),
            "std": float(nonnull.std()) if len(nonnull) > 1 else 0.0,
            "n_missing": n_missing,
        }

    levels = sorted(nonnull.unique().tolist())
    if len(levels) == 2:
        pos = [lv for lv in levels if str(lv).lower() in C.POSITIVE_TOKENS]
        if len(pos) == 1:
            one, source = pos[0], "token"
        else:
            one, source = levels[1], "alphabetical"
        zero = levels[0] if one == levels[1] else levels[1]
        out = (s == one).astype(float).where(s.notna())
        return out, {
            "kind": "binary",
            "mapping": {str(zero): 0, str(one): 1},
            "mapping_source": source,
            "n_missing": n_missing,
        }
    return s, {"kind": "categorical", "categories": [str(v) for v in levels], "n_missing": n_missing}


def assert_no_leakage(X: pd.DataFrame) -> None:
    bad = sorted(set(X.columns) & C.LEAKAGE_COLUMNS)
    if bad:
        raise AssertionError(f"Target leakage: {bad} present in the feature matrix")


# --------------------------------------------------------------------------- #
# build / save / load
# --------------------------------------------------------------------------- #
@dataclass
class Dataset:
    X: pd.DataFrame
    Y: pd.DataFrame
    meta: dict
    report: dict


def build_dataset(path: str | Path | None = None) -> Dataset:
    raw, src = load_raw(path)
    df, original = clean_frame(raw)
    cols = set(df.columns)

    missing = [k for k in ("lad", "lcx", "rca") if k not in cols]
    if missing:
        raise KeyError(f"Missing target column(s) {missing}. Found: {sorted(cols)}")
    cad_src = "cad" if "cad" in cols else ("cath" if "cath" in cols else None)
    if cad_src is None:
        raise KeyError("Neither a 'CAD' nor a 'Cath' column was found for the overall CAD label")

    sources = {"cad": cad_src, "lad": "lad", "lcx": "lcx", "rca": "rca"}
    Y = pd.DataFrame({C.TARGETS[k]: binarize_target(df[v], v) for k, v in sources.items()})

    keep = Y.notna().all(axis=1)
    n_dropped_rows = int((~keep).sum())
    df, Y = df[keep].reset_index(drop=True), Y[keep].reset_index(drop=True)

    feats = df.drop(columns=[c for c in df.columns if c in C.LEAKAGE_COLUMNS])
    constant = [c for c in feats.columns if feats[c].dropna().nunique() <= 1]
    feats = feats.drop(columns=constant)

    typed, meta = {}, {}
    for col in feats.columns:
        typed[col], m = _infer_feature(feats[col])
        m["original_name"] = original.get(col, col)
        meta[col] = m
    X = pd.DataFrame(typed)
    assert_no_leakage(X)

    kinds = pd.Series({k: v["kind"] for k, v in meta.items()}).value_counts().to_dict()
    report = {
        "source_file": str(src),
        "n_rows": int(len(X)),
        "n_features": int(X.shape[1]),
        "feature_kinds": {k: int(v) for k, v in kinds.items()},
        "rows_dropped_missing_target": n_dropped_rows,
        "duplicate_rows": int(pd.concat([X, Y], axis=1).duplicated().sum()),
        "constant_columns_dropped": constant,
        "cad_label_source_column": cad_src,
        "excluded_from_features": sorted(C.LEAKAGE_COLUMNS & cols),
        "class_balance": {
            k: {
                "positives": int(Y[v].sum()),
                "negatives": int((1 - Y[v]).sum()),
                "prevalence": round(float(Y[v].mean()), 4),
            }
            for k, v in C.TARGETS.items()
        },
        "columns_with_missing": {
            c: m["n_missing"] for c, m in meta.items() if m["n_missing"] > 0
        },
    }
    return Dataset(X=X, Y=Y, meta=meta, report=report)


def _json_default(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    raise TypeError(type(o))


def save_processed(ds: Dataset, out_dir: str | Path | None = None) -> Path:
    out = Path(out_dir) if out_dir else C.PROCESSED_DIR
    out.mkdir(parents=True, exist_ok=True)
    pd.concat([ds.X, ds.Y], axis=1).to_csv(out / "dataset.csv", index=False)
    (out / "feature_meta.json").write_text(json.dumps(ds.meta, indent=2, default=_json_default))
    (out / "data_report.json").write_text(json.dumps(ds.report, indent=2, default=_json_default))
    return out


def load_processed(in_dir: str | Path | None = None) -> Dataset:
    d = Path(in_dir) if in_dir else C.PROCESSED_DIR
    df = pd.read_csv(d / "dataset.csv")
    ycols = list(C.TARGETS.values())
    meta = json.loads((d / "feature_meta.json").read_text())
    report = json.loads((d / "data_report.json").read_text())
    X = df.drop(columns=ycols)
    for col, m in meta.items():  # restore categorical dtype as text
        if m["kind"] == "categorical":
            X[col] = X[col].astype(object)
    assert_no_leakage(X)
    return Dataset(X=X, Y=df[ycols], meta=meta, report=report)
