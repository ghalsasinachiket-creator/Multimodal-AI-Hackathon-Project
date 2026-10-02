"""Preprocessing. Everything here is fitted inside CV folds (no leakage across folds)."""
from __future__ import annotations

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

def column_groups(meta: dict) -> dict[str, list[str]]:
    """Group feature names by kind, using feature meta.json from Day 1.
     This is used to build the preprocessing pipeline."""
    groups = {"numeric":[], "binary":[],"categorical":[]}
    for col, m in meta.items():
        groups[m["kind"]].append(col)
    return groups

#def build_preprocessor(meta: dict) -> ColumnTransformer:
def build_preprocessor(meta: dict, scale: bool = True) -> ColumnTransformer:

    """Each kind of column gets its own treatment:
    numeric     -> fill gaps with the median (+ standardise if scale=True)
    binary      -> fill gaps with the most common value (0 or 1)
    categorical -> fill gaps with the most common value, then one-hot encode
                   (e.g. bbb -> bbb_LBBB, bbb_RBBB, bbb_N)
    verbose_feature_names_out=False keeps output names plain ('age', 'bbb_LBBB'),
    which keeps SHAP charts readable later."""
    g = column_groups(meta)
    # Scaling matters for logistic regression, not for tree models.
    num_steps = [("impute", SimpleImputer(strategy="median"))]
    if scale:
        num_steps.append(("scale", StandardScaler()))

    transformers = []
    if g["numeric"]:
        transformers.append(("num", Pipeline(num_steps), g["numeric"]))
    if g["binary"]:
        transformers.append(("bin", SimpleImputer(strategy="most_frequent"), g["binary"]))
    if g["categorical"]:
        cat = Pipeline([
            ("impute", SimpleImputer(strategy="most_frequent")),
            # handle_unknown="ignore": an unseen category at inference becomes all zeros, not an error
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ])
        transformers.append(("cat", cat, g["categorical"]))

    # remainder="drop": any column not listed above is discarded (a second safety net)
    return ColumnTransformer(transformers, remainder="drop", verbose_feature_names_out=False)