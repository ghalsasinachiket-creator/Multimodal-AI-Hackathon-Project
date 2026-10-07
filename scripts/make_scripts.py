"""Figures and tables for the documentation, built ONLY from the frozen files in models/ and reports/.

    python scripts/make_figures.py          # writes PNGs and tables into figures/

Nothing is retrained here. Every number comes from out-of-fold predictions (patients the model
had not seen), so the figures are not flattered by the training data.
"""
import argparse
import json
import sys
from pathlib import Path
