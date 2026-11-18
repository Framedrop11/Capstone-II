from __future__ import annotations

import json
import os
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

FEATURES = ["ageYears", "obesity", "sex"]
FEATURE_LABELS = {"ageYears": "age", "obesity": "BMI-related obesity category", "sex_male": "sex"}
MODEL_VERSION = "carelens-logreg-v1"


def make_pipeline(c: float = 1.0) -> Pipeline:
    transform = ColumnTransformer(
        [
            ("numeric", StandardScaler(), ["ageYears", "obesity"]),
            ("categorical", OneHotEncoder(handle_unknown="ignore", drop="if_binary"), ["sex"]),
        ],
        verbose_feature_names_out=False,
    )
    return Pipeline([("features", transform), ("classifier", LogisticRegression(C=c, max_iter=2000, random_state=42, solver="liblinear"))])


def normalize_responses(responses: dict[str, Any]) -> pd.DataFrame:
    age = float(responses["ageYears"])
    bmi = float(responses["bmi"])
    sex = str(responses["sex"]).strip().lower()
    if sex not in {"female", "male"}:
        raise ValueError("sex must be female or male")
    return pd.DataFrame([{"ageYears": age, "obesity": int(bmi >= 30), "sex": sex}])


@dataclass
class LoadedModel:
    model: Pipeline
    version: str
    metrics: dict[str, float]


def load_artifact(path: str | Path) -> LoadedModel:
    artifact_path = Path(path)
    if not artifact_path.is_file():
        raise FileNotFoundError(f"Model artifact not found: {artifact_path}")
    payload = joblib.load(artifact_path)
    if not isinstance(payload, dict) or not isinstance(payload.get("model"), Pipeline):
        raise ValueError("Model artifact is invalid")
    return LoadedModel(payload["model"], str(payload["version"]), dict(payload.get("metrics", {})))


class ModelManager:
    def __init__(self, stable: LoadedModel, canary: LoadedModel | None = None, canary_traffic_percent: int = 0, seed: int | None = None):
        if not 0 <= canary_traffic_percent <= 100:
            raise ValueError("canary traffic percent must be from 0 to 100")
        self.stable = stable
        self.canary = canary
        self.canary_traffic_percent = canary_traffic_percent if canary else 0
        self.random = random.Random(seed)

    @classmethod
    def from_environment(cls) -> ModelManager:
        service_root = Path(__file__).resolve().parents[4]
        model_dir = Path(os.environ.get("ML_MODEL_DIR", str(service_root / "models")))
        stable = load_artifact(os.environ.get("ML_STABLE_MODEL_PATH", str(model_dir / "stable.joblib")))
        canary_path = os.environ.get("ML_CANARY_MODEL_PATH")
        environment = os.environ.get("CARELENS_ENV", "local")
        demo_fixtures = os.environ.get("ML_DEMO_CANARY_FIXTURES", "false").lower() == "true"
        demo_artifact = bool(canary_path and "demo-canary-" in Path(canary_path).name)
        if environment == "prod" and (demo_fixtures or demo_artifact):
            raise ValueError("Demo canary fixtures are forbidden in prod")
        if demo_fixtures and environment not in {"local", "dev", "staging"}:
            raise ValueError("ML_DEMO_CANARY_FIXTURES is allowed only in local, dev, or staging")
        if demo_artifact and not demo_fixtures:
            raise ValueError("Demo canary artifact requires ML_DEMO_CANARY_FIXTURES=true")
        canary = load_artifact(canary_path) if canary_path else None
        traffic = int(os.environ.get("ML_CANARY_TRAFFIC_PERCENT", "0"))
        return cls(stable, canary, traffic)

    def predict(self, responses: dict[str, Any]) -> dict[str, Any]:
        selected = self.select_model()
        return self.predict_with_model(responses, selected)

    def select_model(self) -> LoadedModel:
        return self.canary if self.canary and self.random.randrange(100) < self.canary_traffic_percent else self.stable

    def predict_with_model(self, responses: dict[str, Any], selected: LoadedModel) -> dict[str, Any]:
        frame = normalize_responses(responses)
        score = float(selected.model.predict_proba(frame)[0, 1])
        transformed = selected.model.named_steps["features"].transform(frame)
        coefficients = selected.model.named_steps["classifier"].coef_[0]
        contributions = np.asarray(transformed)[0] * coefficients
        names = selected.model.named_steps["features"].get_feature_names_out()
        ranked = sorted(zip(names, contributions, strict=True), key=lambda item: item[1], reverse=True)
        factors = [FEATURE_LABELS.get(name, name) for name, contribution in ranked if contribution > 0][:3]
        return {"score": score, "modelVersion": selected.version, "factors": factors}

    def health(self) -> dict[str, Any]:
        return {
            "status": "ok",
            "stableVersion": self.stable.version,
            "canaryVersion": self.canary.version if self.canary else None,
            "canaryTrafficPercent": self.canary_traffic_percent,
        }


def artifact_metadata(path: str | Path) -> dict[str, Any]:
    artifact = load_artifact(path)
    return {"version": artifact.version, "metrics": artifact.metrics, "artifactUri": str(Path(path).resolve())}


def write_artifact(path: str | Path, version: str, model: Pipeline, metrics: dict[str, float], training_info: dict[str, Any]) -> None:
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"version": version, "model": model, "metrics": metrics, "trainingInfo": training_info}, output)
    metadata = {"version": version, "metrics": metrics, "trainingInfo": training_info, "artifactSha256": _sha256(output)}
    output.with_suffix(".json").write_text(json.dumps(metadata, indent=2, sort_keys=True), encoding="utf-8")


def _sha256(path: Path) -> str:
    import hashlib

    digest = hashlib.sha256()
    with path.open("rb") as artifact_file:
        for block in iter(lambda: artifact_file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
