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


def test_enabled_controller_ramps_real_prediction_traffic(monkeypatch):
    features, target = sample_data()
    trained = fit_and_evaluate(features, target)
    manager = ModelManager(
        LoadedModel(trained.model, "stable-v1", trained.metrics),
        LoadedModel(trained.model, "candidate-v2", trained.metrics),
        seed=1,
    )
    manager.select_model = lambda: manager.canary
    monkeypatch.setenv("CARELENS_ENV", "local")
    monkeypatch.setenv("ML_AUTO_CANARY_ENABLED", "true")
    monkeypatch.setenv("ML_CANARY_MINIMUM_SAMPLES", "2")
    monkeypatch.setenv("ML_CANARY_STAGE_INTERVAL_SECONDS", "0")
    app = create_app(lambda: manager)
    predict = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/predict")
    health = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/health")
    request = PredictionRequest.model_validate({
        "responses": {
            "ageYears": 50, "bmi": 32, "sex": "female", "waistCm": 90,
            "activity30MinDaily": True, "fruitVegetablesDaily": False,
            "antihypertensiveTreatment": False, "historyHighGlucose": False,
            "familyHistoryDiabetes": "none",
        },
        "basicScore": 0.4,
    })

    for expected in (25, 50, 75, 100):
        predict(request)
        predict(request)
        assert manager.canary_traffic_percent == expected
    predict(request)
    predict(request)
    controller = health()["canaryController"]
    assert controller["history"][-1]["action"] == "completed"
    assert controller["history"][-1]["trafficPercent"] == 100


def test_bad_canary_automatically_rolls_back_on_inference_error(monkeypatch):
    features, target = sample_data()
    trained = fit_and_evaluate(features, target)

    class BrokenModel:
        def predict_proba(self, _features):
            raise RuntimeError("inference failed")

    manager = ModelManager(
        LoadedModel(trained.model, "stable-v1", trained.metrics),
        LoadedModel(BrokenModel(), "broken-v2", trained.metrics),
        canary_traffic_percent=5,
    )
    manager.select_model = lambda: manager.canary
    monkeypatch.setenv("CARELENS_ENV", "local")
    monkeypatch.setenv("ML_AUTO_CANARY_ENABLED", "true")
    monkeypatch.setenv("ML_CANARY_MINIMUM_SAMPLES", "1")
    monkeypatch.setenv("ML_CANARY_STAGE_INTERVAL_SECONDS", "0")
    app = create_app(lambda: manager)
    predict = next(route.endpoint for route in app.routes if getattr(route, "path", None) == "/predict")
    request = PredictionRequest.model_validate({
        "responses": {
            "ageYears": 50, "bmi": 32, "sex": "female", "waistCm": 90,
            "activity30MinDaily": True, "fruitVegetablesDaily": False,
            "antihypertensiveTreatment": False, "historyHighGlucose": False,
            "familyHistoryDiabetes": "none",
        },
        "basicScore": 0.4,
    })

    with pytest.raises(RuntimeError):
        predict(request)
    assert manager.canary_traffic_percent == 0
    assert app.state.canary_controller.history[-1]["action"] == "rolled_back"


def test_production_refuses_demo_auto_canary(monkeypatch):
    manager = ModelManager(
        LoadedModel(None, "stable-v1", {}),
        LoadedModel(None, "candidate-v2", {}),
    )
    monkeypatch.setenv("CARELENS_ENV", "prod")
    monkeypatch.setenv("ML_AUTO_CANARY_ENABLED", "true")

    with pytest.raises(RuntimeError, match="forbidden in prod"):
        create_app(lambda: manager)


def test_model_manager_refuses_demo_fixture_in_production(monkeypatch):
    model_dir = Path(__file__).parents[1] / "models"
    monkeypatch.setenv("CARELENS_ENV", "prod")
    monkeypatch.setenv("ML_STABLE_MODEL_PATH", str(model_dir / "stable.joblib"))
    monkeypatch.setenv("ML_CANARY_MODEL_PATH", str(model_dir / "demo-canary-good.joblib"))
    monkeypatch.setenv("ML_DEMO_CANARY_FIXTURES", "true")

    with pytest.raises(ValueError, match="forbidden in prod"):
        ModelManager.from_environment()
