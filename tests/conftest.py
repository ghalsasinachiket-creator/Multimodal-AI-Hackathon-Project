import numpy as np
import pandas as pd
import pytest


def make_frame(n: int = 120, seed: int = 0) -> pd.DataFrame:
    """Synthetic frame shaped like the real dataset (names/labels are assumptions)."""
    rng = np.random.default_rng(seed)
    lad = rng.random(n) < 0.5
    lcx = rng.random(n) < 0.3
    rca = rng.random(n) < 0.35
    cad = lad | lcx | rca
    vhd = rng.choice(["N", "mild", "Moderate", "Severe"], n).astype(object)
    vhd[:3] = "NA"  # missing marker
    return pd.DataFrame({
        "Unnamed: 0": np.arange(n),
        "Age": rng.integers(30, 85, n),
        "Sex": rng.choice(["Male", "Fmale"], n),
        "DM": rng.integers(0, 2, n),
        "BP": rng.integers(90, 190, n).astype(float),
        "Function Class": rng.integers(1, 5, n),
        "Region RWMA": rng.integers(0, 5, n),
        "VHD": vhd,
        "Exertional CP": ["N"] * n,  # constant -> dropped
        "LAD": np.where(lad, "Stenotic", "Normal"),
        "LCX": np.where(lcx, "Stenotic", "Normal"),
        "RCA": np.where(rca, "Stenotic", "Normal"),
        "Cath": np.where(cad, "Cad", "Normal"),
    })


@pytest.fixture
def raw_csv(tmp_path):
    p = tmp_path / "sample.csv"
    make_frame().to_csv(p, index=False)
    return p
