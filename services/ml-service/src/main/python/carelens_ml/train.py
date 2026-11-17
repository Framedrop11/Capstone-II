from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from carelens_ml.models import load_artifact, write_artifact
from carelens_ml.training import evaluate_candidate, record_model_version, train_dataset


def main() -> int:
    parser = argparse.ArgumentParser(description="Train or evaluate the CareLens screening model")
    parser.add_argument("--mode", choices=["stable", "candidate"], required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--dataset", type=Path, default=Path("ml/data/uci-early-stage-diabetes.csv"))
    parser.add_argument("--model-dir", type=Path, default=Path("services/ml-service/models"))
    parser.add_argument("--c", type=float, default=1.0, help="Logistic regression regularization strength")
    args = parser.parse_args()

    trained = train_dataset(args.dataset, args.c)
    trained.info["candidateC"] = args.c
    output = args.model_dir / ("stable.joblib" if args.mode == "stable" else "candidate.joblib")
    if args.mode == "candidate":
        stable_path = args.model_dir / "stable.joblib"
        if not stable_path.exists():
            raise SystemExit("Candidate training requires an existing stable artifact")
        stable = load_artifact(stable_path)
        eligible, reason = evaluate_candidate(trained.metrics, stable.metrics)
        if not eligible:
            print(json.dumps({"registered": False, "promotionEligible": False, "reason": reason, "metrics": trained.metrics}, indent=2))
            return 2
        status = "candidate"
    else:
        eligible, reason, status = True, "initial stable baseline", "stable"

    write_artifact(output, args.version, trained.model, trained.metrics, trained.info)
    record_model_version(args.version, status, output, trained.metrics, trained.info, eligible)
    print(json.dumps({"registered": True, "version": args.version, "status": status, "promotionEligible": eligible, "reason": reason, "metrics": trained.metrics, "artifact": str(output)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
