from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from carelens_ml.models import load_artifact, write_artifact
from carelens_ml.training import evaluate_candidate, fit_confirmed_outcomes, record_model_version


def read_confirmed_outcomes(uri: str, database_name: str) -> list[tuple[dict[str, Any], str]]:
    from pymongo import MongoClient

    with MongoClient(uri, serverSelectionTimeoutMS=5_000) as client:
        database = client[database_name]
        outcomes = list(database["outcomes"].find({"actualOutcome": {"$in": ["positive", "negative"]}}))
        predictions = {row["_id"]: row for row in database["predictions"].find({"_id": {"$in": [row["predictionId"] for row in outcomes]}})}
        questionnaire_ids = [row["questionnaireId"] for row in predictions.values()]
        questionnaires = {row["_id"]: row for row in database["questionnaires"].find({"_id": {"$in": questionnaire_ids}})}
        result = []
        for outcome in outcomes:
            prediction = predictions.get(outcome["predictionId"])
            questionnaire = questionnaires.get(prediction["questionnaireId"]) if prediction else None
            responses = questionnaire.get("responses") if questionnaire else None
            if isinstance(responses, dict):
                result.append((responses, str(outcome["actualOutcome"])))
        return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Retrain and gate a candidate using doctor-confirmed outcomes")
    parser.add_argument("--version", required=True)
    parser.add_argument("--database", default=os.environ.get("MONGODB_DATABASE", "carelens"))
    parser.add_argument("--benchmark", type=Path, default=Path("ml/data/uci-early-stage-diabetes.csv"))
    parser.add_argument("--model-dir", type=Path, default=Path("services/ml-service/models"))
    parser.add_argument("--c", type=float, default=1.0)
    args = parser.parse_args()
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise SystemExit("MONGODB_URI is required to read confirmed outcomes and register a candidate")

    stable_path = args.model_dir / "stable.joblib"
    stable = load_artifact(stable_path)
    outcomes = read_confirmed_outcomes(uri, args.database)
    trained, stable_metrics = fit_confirmed_outcomes(outcomes, stable.model, args.benchmark, args.c)
    eligible, reason = evaluate_candidate(trained.metrics, stable_metrics)
    if not eligible:
        print(json.dumps({"registered": False, "promotionEligible": False, "reason": reason, "candidateMetrics": trained.metrics, "stableMetrics": stable_metrics, "usableOutcomes": trained.info["datasetRows"]}, indent=2))
        return 2

    trained.info["candidateC"] = args.c
    output = args.model_dir / f"candidate-{args.version}.joblib"
    write_artifact(output, args.version, trained.model, trained.metrics, trained.info)
    record_model_version(args.version, "candidate", output, trained.metrics, trained.info, True)
    print(json.dumps({"registered": True, "version": args.version, "promotionEligible": True, "reason": reason, "candidateMetrics": trained.metrics, "stableMetrics": stable_metrics, "artifact": str(output)}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
