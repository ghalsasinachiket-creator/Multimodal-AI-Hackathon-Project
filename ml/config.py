"""Project-wide constants for the CAD risk pipeline."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
SEED = 42

# short target name -> column name in the processed dataset
TARGETS = {"cad": "y_cad", "lad": "y_lad", "lcx": "y_lcx", "rca": "y_rca"}

# Snake-cased names that must NEVER reach a model as an input feature:
# the three vessel labels, the cath result, and the overall CAD label.
LEAKAGE_COLUMNS = frozenset({"lad", "lcx", "rca", "cath", "cad"})

# Row identifiers, not features.
ID_COLUMNS = frozenset({"id", "sno", "sr_no", "index", "unnamed_0"})

MISSING_TOKENS = frozenset({"", "na", "n/a", "nan", "?", "null"})

# Used to turn two-level text columns / target labels into 0/1.
POSITIVE_TOKENS = frozenset({
    "y", "yes", "1", "true", "positive", "present", "abnormal",
    "cad", "stenotic", "stenosis", "significant", "male",
})
NEGATIVE_TOKENS = frozenset({
    "n", "no", "0", "false", "negative", "absent", "normal",
    "none", "fmale", "female", "non-significant", "nonsignificant",
})
