import pandas as pd
import pytest

from ml import config as C
from ml.data import (assert_no_leakage, binarize_target, build_dataset,
                     load_processed, save_processed)


def test_leakage_columns_removed(raw_csv):
    ds = build_dataset(raw_csv)
    assert not (set(ds.X.columns) & C.LEAKAGE_COLUMNS)
    assert ds.report["excluded_from_features"] == ["cath", "lad", "lcx", "rca"]


def test_guard_raises_when_contaminated(raw_csv):
    ds = build_dataset(raw_csv)
    bad = ds.X.assign(lad=ds.Y["y_lad"])
    with pytest.raises(AssertionError):
        assert_no_leakage(bad)


def test_targets_binary_and_aligned(raw_csv):
    ds = build_dataset(raw_csv)
    assert len(ds.X) == len(ds.Y)
    assert set(ds.Y.columns) == set(C.TARGETS.values())
    for col in ds.Y.columns:
        assert set(ds.Y[col].unique()) <= {0.0, 1.0}
    # CAD must be positive wherever any vessel is stenosed
    any_vessel = (ds.Y[["y_lad", "y_lcx", "y_rca"]].sum(axis=1) > 0)
    assert (ds.Y["y_cad"][any_vessel] == 1).all()


def test_feature_typing_and_cleaning(raw_csv):
    ds = build_dataset(raw_csv)
    assert "unnamed_0" not in ds.X.columns          # id column dropped
    assert "exertional_cp" not in ds.X.columns      # constant column dropped
    assert ds.meta["sex"]["kind"] == "binary"
    assert ds.meta["sex"]["mapping"] == {"Fmale": 0, "Male": 1}
    assert ds.meta["vhd"]["kind"] == "categorical"
    assert ds.meta["vhd"]["n_missing"] == 3         # "NA" became missing
    assert ds.meta["age"]["kind"] == "numeric"


def test_unknown_target_label_raises():
    with pytest.raises(ValueError):
        binarize_target(pd.Series(["Stenotic", "Maybe", "Normal"]), "lad")


def test_numeric_target_must_be_zero_one():
    with pytest.raises(ValueError):
        binarize_target(pd.Series([10, 60, 90]), "lad")


def test_processed_roundtrip(raw_csv, tmp_path):
    ds = build_dataset(raw_csv)
    out = save_processed(ds, tmp_path / "proc")
    again = load_processed(out)
    assert list(again.X.columns) == list(ds.X.columns)
    assert again.Y.shape == ds.Y.shape
    assert again.meta == ds.meta
