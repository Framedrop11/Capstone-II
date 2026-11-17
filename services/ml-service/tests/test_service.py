from pathlib import Path
import pytest
from pydantic import ValidationError

from carelens_ml.app import create_app
from carelens_ml.models import LoadedModel, ModelManager
from carelens_ml.app import PredictionRequest
from carelens_ml.training import fit_and_evaluate
from test_training import sample_data


def test_health_and_prediction_follow_worker_contract_and_select_model_version():
    features, target = sample_data()
    trained = fit_and_evaluate(features, target)
    manager = ModelManager(LoadedModel(trained.model, "candidate-test-v1", trained.metrics), seed=1)
    app = create_app(lambda: manager)
    health = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/health")
    predict = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/predict")
    metrics = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/metrics")
    assert health()["stableVersion"] == "candidate-test-v1"
    request = PredictionRequest.model_validate({
        "responses": {
            "ageYears": 50, "bmi": 32.2, "sex": "female", "waistCm": 90,
            "activity30MinDaily": True, "fruitVegetablesDaily": False,
            "antihypertensiveTreatment": False, "historyHighGlucose": False,
            "familyHistoryDiabetes": "none",
        },
        "basicScore": 0.4,
    })
    payload = predict(request).model_dump()
    assert 0 <= payload["score"] <= 1
    assert payload["modelVersion"] == "candidate-test-v1"
    assert isinstance(payload["factors"], list)
    assert "carelens_ml_prediction_requests_total 1" in metrics().body.decode()


def test_prediction_rejects_missing_features_and_unknown_fields():
    features, target = sample_data()
    trained = fit_and_evaluate(features, target)
    manager = ModelManager(LoadedModel(trained.model, "test", trained.metrics))
    valid = {
        "ageYears": 50, "bmi": 28, "sex": "female", "waistCm": 80,
        "activity30MinDaily": True, "fruitVegetablesDaily": True,
        "antihypertensiveTreatment": False, "historyHighGlucose": False,
        "familyHistoryDiabetes": "none",
    }
    app = create_app(lambda: manager)

    with pytest.raises(ValidationError):
        PredictionRequest.model_validate({"responses": {"ageYears": 50}, "basicScore": 0.4})
    with pytest.raises(ValidationError):
        PredictionRequest.model_validate({"responses": {**valid, "unknown": 1}, "basicScore": 0.4})


def test_repository_stable_artifact_loads_and_serves(monkeypatch):
    artifact = Path(__file__).parents[1] / "models" / "stable.joblib"
    monkeypatch.setenv("ML_STABLE_MODEL_PATH", str(artifact))
    app = create_app()

    predict = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/predict")
    request = PredictionRequest.model_validate({
        "responses": {
            "ageYears": 50, "bmi": 32, "sex": "female", "waistCm": 90,
            "activity30MinDaily": True, "fruitVegetablesDaily": False,
            "antihypertensiveTreatment": False, "historyHighGlucose": False,
            "familyHistoryDiabetes": "none",
        },
        "basicScore": 0.3,
    })
    assert predict(request).modelVersion == "carelens-logreg-v1"
