"""Work out which features drive each model overall and save it for the API and the dashboard
python scripts/export_importance.py #writes reports/global_importance.json
Run once after training. It is a separate step because explaining all 303 patients with the
random-forest models takes a while: better done once here than every time the app starts.
"""
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ml import config as C
from ml.inference import RiskService

def main() -> None:
    svc = RiskService()
    out = {}
    for target in C.TARGETS:
        share = svc.global_importance(target).head(12)  # top 12 features is plenty to show
        out[target] =[
            {"feature":name, "label":svc.meta[name]["original_name"], "share_pct":round(float(v),2)}
            for name, v in share.items()
        ]
        top = ",".join(f"{svc.meta[n]['original_name']} {v:.0f}%" for n, v in share.head(5).items())
        print(f"{target.upper():4s}{top}")
    path = svc.report_dir/"global_importance.json"
    path.write_text(json.dumps(out,indent=2))
    print(f"Saved:{path}")


if __name__ == "__main__":
    main()