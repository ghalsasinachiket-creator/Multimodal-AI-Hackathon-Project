"""Import shim for running the API from the frontend directory."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
root_path = str(ROOT)
backend_path = str(ROOT / "backend")

if root_path not in sys.path:
    sys.path.insert(0, root_path)

if backend_path not in __path__:
    __path__.append(backend_path)
