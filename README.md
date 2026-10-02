# CAD Risk 3D — Multimodal AI Hackathon 2026, Track A

Predict overall CAD and LAD / LCX / RCA stenosis from clinical features, and map the
probabilities onto an interactive 3D heart. **Decision support / educational use only.
Not a substitute for formal diagnostic imaging.**

## Setup
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Data
Download the *Extension of Z-Alizadeh Sani Dataset* (UCI ML Repository, also on Kaggle)
and place the `.csv` or `.xlsx` in `data/raw/`.

```bash
python scripts/inspect_data.py      # check columns, types, target labels
python scripts/prepare_data.py      # writes data/processed/*
pytest                              # data + leakage tests
```

`prepare_data.py` outputs:
- `dataset.csv`: cleaned features plus `y_cad, y_lad, y_lcx, y_rca`
- `feature_meta.json`: per-feature type, range and category info (used later by the API and input form)
- `data_report.json`: class balance, missingness, dropped columns

## Leakage policy
`LAD`, `LCX`, `RCA`, `Cath` and `CAD` are never model inputs, for any of the four targets.
Enforced in `ml/data.py` (`assert_no_leakage`) and covered by tests.

## Layout
```
ml/          config, data loading/cleaning (training + inference code)
scripts/     inspect_data.py, prepare_data.py
tests/       pytest suite (synthetic data)
data/        raw/ (you add the file), processed/ (generated)
```
Planned: `backend/` (FastAPI) and `frontend/` (Three.js viewer + dashboard).
