from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
from sklearn.metrics import brier_score_loss, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from carelens_ml.models import make_pipeline, write_artifact

RANDOM_SEED = 2026
TEST_FRACTION = 0.20
TARGET = "class"


@dataclass
class TrainedModel:
    model: Pipeline
    metrics: dict[str, float]
    info: dict[str, Any]


def load_dataset(path: str | Path) -> tuple[pd.DataFrame, pd.Series, str]:
    source = Path(path)
    raw = source.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    frame = pd.read_csv(source)
    normalized = {str(column).strip().lower(): column for column in frame.columns}
    required = {"age", "gender", "obesity", TARGET}
    missing = required - normalized.keys()
    if missing:
        raise ValueError(f"Dataset is missing expected UCI fields: {sorted(missing)}")
    features = pd.DataFrame({
        "ageYears": pd.to_numeric(frame[normalized["age"]], errors="raise"),
        "obesity": frame[normalized["obesity"]].astype(str).str.strip().str.lower().map({"yes": 1, "no": 0}),
        "sex": frame[normalized["gender"]].astype(str).str.strip().str.lower(),
    })
    target = frame[normalized[TARGET]].astype(str).str.strip().str.lower().map({"positive": 1, "negative": 0})
    if features.isna().any().any() or target.isna().any() or not features["sex"].isin(["male", "female"]).all():
        raise ValueError("Dataset has missing or unsupported values in the selected features/target")
    return features.astype({"ageYears": float, "obesity": int}), target.astype(int), digest


def evaluate_candidate(candidate_metrics: dict[str, float], stable_metrics: dict[str, float]) -> tuple[bool, str]:
    if candidate_metrics.get("auc", -1) <= stable_metrics.get("auc", -1):
        return False, "candidate AUC must be strictly higher than stable"
    if candidate_metrics.get("brier", 2) > stable_metrics.get("brier", 2):
        return False, "candidate Brier score must be no worse than stable"
    if candidate_metrics.get("recall", -1) < stable_metrics.get("recall", -1):
        return False, "candidate recall must be no worse than stable"
    return True, "candidate beats stable on fixed holdout"


def fit_and_evaluate(features: pd.DataFrame, target: pd.Series, c: float = 1.0) -> TrainedModel:
    x_train, x_holdout, y_train, y_holdout = train_test_split(
        features, target, test_size=TEST_FRACTION, random_state=RANDOM_SEED, stratify=target,
    )
    model = make_pipeline(c)
    model.fit(x_train, y_train)
    probabilities = model.predict_proba(x_holdout)[:, 1]
    predicted = (probabilities >= 0.5).astype(int)
    metrics = {
        "auc": float(roc_auc_score(y_holdout, probabilities)),
        "recall": float(recall_score(y_holdout, predicted, zero_division=0)),
        "precision": float(precision_score(y_holdout, predicted, zero_division=0)),
        "brier": float(brier_score_loss(y_holdout, probabilities)),
    }
    info = {
        "datasetSha256": "",
        "datasetRows": int(len(features)),
        "trainRows": int(len(x_train)),
        "holdoutRows": int(len(x_holdout)),
        "randomSeed": RANDOM_SEED,
        "testFraction": TEST_FRACTION,
        "features": ["ageYears", "obesity", "sex"],
        "estimator": "StandardScaler + one-hot encoder + logistic regression",
    }
    return TrainedModel(model, metrics, info)


def metrics_for(model: Pipeline, features: pd.DataFrame, target: pd.Series) -> dict[str, float]:
    probabilities = model.predict_proba(features)[:, 1]
    predicted = (probabilities >= 0.5).astype(int)
    return {
        "auc": float(roc_auc_score(target, probabilities)),
        "recall": float(recall_score(target, predicted, zero_division=0)),
        "precision": float(precision_score(target, predicted, zero_division=0)),
        "brier": float(brier_score_loss(target, probabilities)),
    }


def confirmed_outcome_row(responses: dict[str, Any], actual_outcome: str) -> tuple[dict[str, Any], int] | None:
    label = actual_outcome.strip().lower()
    if label not in {"positive", "negative"}:
        return None
    try:
        age = float(responses["ageYears"])
        bmi = float(responses["bmi"])
        sex = str(responses["sex"]).strip().lower()
    except (KeyError, TypeError, ValueError):
        return None
    if not 18 <= age <= 120 or not 10 <= bmi <= 100 or sex not in {"female", "male"}:
        return None
    return {"ageYears": age, "obesity": int(bmi >= 30), "sex": sex}, int(label == "positive")


def fit_confirmed_outcomes(
    outcome_rows: list[tuple[dict[str, Any], str]],
    stable_model: Pipeline,
    benchmark_path: str | Path,
    c: float = 1.0,
) -> tuple[TrainedModel, dict[str, float]]:
    parsed = [row for responses, label in outcome_rows if (row := confirmed_outcome_row(responses, label)) is not None]
    if len(parsed) < 20 or len({label for _features, label in parsed}) != 2:
        raise ValueError("At least 20 usable doctor-confirmed positive/negative outcomes are required")
    training_features = pd.DataFrame([item[0] for item in parsed])
    training_target = pd.Series([item[1] for item in parsed], dtype=int)
    benchmark_features, benchmark_target, benchmark_digest = load_dataset(benchmark_path)
    _train_x, holdout_x, _train_y, holdout_y = train_test_split(
        benchmark_features, benchmark_target, test_size=TEST_FRACTION, random_state=RANDOM_SEED, stratify=benchmark_target,
    )
    model = make_pipeline(c)
    model.fit(training_features, training_target)
    candidate_metrics = metrics_for(model, holdout_x, holdout_y)
    stable_metrics = metrics_for(stable_model, holdout_x, holdout_y)
    info = {
        "datasetSha256": hashlib.sha256("".join(sorted(f"{features['ageYears']}|{features['obesity']}|{features['sex']}|{label}" for features, label in parsed)).encode()).hexdigest(),
        "benchmarkSha256": benchmark_digest,
        "datasetRows": len(parsed),
        "trainRows": len(parsed),
        "holdoutRows": len(holdout_x),
        "randomSeed": RANDOM_SEED,
        "testFraction": TEST_FRACTION,
        "features": ["ageYears", "obesity", "sex"],
        "estimator": "StandardScaler + one-hot encoder + logistic regression",
        "trainingSource": "doctor-confirmed outcomes; labels restricted to positive/negative",
    }
    return TrainedModel(model, candidate_metrics, info), stable_metrics


def train_dataset(path: str | Path, c: float = 1.0) -> TrainedModel:
    features, target, digest = load_dataset(path)
    result = fit_and_evaluate(features, target, c)
    result.info["datasetSha256"] = digest
    return result


def record_model_version(version: str, status: str, artifact: Path, metrics: dict[str, float], info: dict[str, Any], eligible: bool) -> None:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        return
    from pymongo import MongoClient

    database = os.environ.get("MONGODB_DATABASE", "carelens")
    with MongoClient(uri, serverSelectionTimeoutMS=5_000) as client:
        collection = client[database]["modelVersions"]
        collection.update_one(
            {"version": version},
            {"$set": {
                "version": version,
                "status": status,
                "canaryTrafficPercent": 0,
                "testResults": {**metrics, "promotionEligible": eligible, **info},
                "artifactUri": str(artifact.resolve()),
                "promotedAt": None,
            }, "$setOnInsert": {"createdAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc)}, "$currentDate": {"updatedAt": True}},
            upsert=True,
        )
