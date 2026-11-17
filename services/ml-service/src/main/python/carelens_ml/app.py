import hashlib
import json
import os
import random
import re
import sys
import time
import uuid
import logging
from typing import Callable
from typing import Annotated

from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from redis import Redis

from carelens_ml.models import ModelManager, normalize_responses

logger = logging.getLogger("carelens.ml")
logger.setLevel(logging.INFO)
logger.propagate = False
if not logger.handlers:
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(stream_handler)


class QuestionnaireFeatures(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ageYears: Annotated[int, Field(ge=18, le=120)]
    bmi: Annotated[float, Field(ge=10, le=100)]
    sex: str = Field(pattern="^(female|male)$")
    waistCm: Annotated[float, Field(ge=40, le=200)]
    activity30MinDaily: bool
    fruitVegetablesDaily: bool
    antihypertensiveTreatment: bool
    historyHighGlucose: bool
    familyHistoryDiabetes: str = Field(pattern="^(none|second_degree|first_degree)$")


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    responses: QuestionnaireFeatures
    basicScore: Annotated[float, Field(ge=0, le=1)]


class PredictionResponse(BaseModel):
    score: Annotated[float, Field(ge=0, le=1)]
    modelVersion: str
    factors: list[str]


def create_app(model_loader: Callable[[], ModelManager] = ModelManager.from_environment) -> FastAPI:
    try:
        models = model_loader()
    except (FileNotFoundError, ValueError) as error:
        raise RuntimeError(f"ML service cannot load its stable model: {error}") from error

    instance = FastAPI(title="CareLens ML Service", version="1.0.0")
    instance.state.models = models
    instance.state.prediction_requests = 0
    instance.state.cache_hits = 0
    instance.state.cache_misses = 0
    instance.state.http_requests = {}
    instance.state.http_duration_sum = 0.0
    instance.state.http_duration_count = 0
    instance.state.request_errors = 0
    instance.state.score_sum = 0.0
    instance.state.score_count = 0
    cache_url = os.environ.get("CACHE_REDIS_URL")
    instance.state.result_cache = Redis.from_url(cache_url, socket_connect_timeout=0.5, socket_timeout=0.5, decode_responses=True) if cache_url else None

    @instance.middleware("http")
    async def observe_request(request: Request, call_next):
        started = time.perf_counter()
        supplied_id = request.headers.get("x-correlation-id", "")
        correlation_id = supplied_id if re.fullmatch(r"[A-Fa-f0-9-]{36}", supplied_id) else str(uuid.uuid4())
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Correlation-ID"] = correlation_id
            return response
        except Exception as error:
            logger.error(json.dumps({"timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "level": "error", "service": "carelens-ml", "event": "request_failed", "correlationId": correlation_id, "route": request.url.path, "errorType": type(error).__name__}, separators=(",", ":")))
            raise
        finally:
            duration = time.perf_counter() - started
            route = request.url.path if request.url.path in {"/predict", "/health", "/metrics"} else "unmatched"
            key = (route, status_code)
            instance.state.http_requests[key] = instance.state.http_requests.get(key, 0) + 1
            instance.state.http_duration_sum += duration
            instance.state.http_duration_count += 1
            if status_code >= 400:
                instance.state.request_errors += 1
            logger.info(json.dumps({"timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "level": "info", "service": "carelens-ml", "event": "http_request", "correlationId": correlation_id, "route": route, "statusCode": status_code, "durationMs": round(duration * 1000, 2)}, separators=(",", ":")))

    @instance.get("/health")
    def health_route() -> dict:
        return models.health()

    @instance.get("/metrics", include_in_schema=False)
    def metrics_route() -> Response:
        body = (
            "# HELP carelens_ml_http_requests_total HTTP requests handled by route and status\n"
            "# TYPE carelens_ml_http_requests_total counter\n"
            + "".join(f'carelens_ml_http_requests_total{{route="{route}",status_code="{status}"}} {count}\n' for (route, status), count in sorted(instance.state.http_requests.items()))
            +
            "# HELP carelens_ml_http_request_duration_seconds HTTP request duration\n"
            "# TYPE carelens_ml_http_request_duration_seconds summary\n"
            f"carelens_ml_http_request_duration_seconds_sum {instance.state.http_duration_sum}\n"
            f"carelens_ml_http_request_duration_seconds_count {instance.state.http_duration_count}\n"
            "# HELP carelens_ml_http_errors_total HTTP requests with error status\n"
            "# TYPE carelens_ml_http_errors_total counter\n"
            f"carelens_ml_http_errors_total {instance.state.request_errors}\n"
            "# HELP carelens_ml_prediction_requests_total Prediction requests served\n"
            "# TYPE carelens_ml_prediction_requests_total counter\n"
            f"carelens_ml_prediction_requests_total {instance.state.prediction_requests}\n"
            "# HELP carelens_ml_result_cache_hits_total ML result cache hits\n"
            "# TYPE carelens_ml_result_cache_hits_total counter\n"
            f"carelens_ml_result_cache_hits_total {instance.state.cache_hits}\n"
            "# HELP carelens_ml_result_cache_misses_total ML result cache misses\n"
            "# TYPE carelens_ml_result_cache_misses_total counter\n"
            f"carelens_ml_result_cache_misses_total {instance.state.cache_misses}\n"
            "# HELP carelens_ml_prediction_score Prediction score distribution\n"
            "# TYPE carelens_ml_prediction_score summary\n"
            f"carelens_ml_prediction_score_sum {instance.state.score_sum}\n"
            f"carelens_ml_prediction_score_count {instance.state.score_count}\n"
        )
        return Response(body, media_type="text/plain; version=0.0.4; charset=utf-8")

    @instance.post("/predict", response_model=PredictionResponse)
    def predict_route(request: PredictionRequest) -> PredictionResponse:
        try:
            responses = request.responses.model_dump()
            selected = models.select_model()
            normalized = normalize_responses(responses).to_dict(orient="records")[0]
            cache_key = "carelens:ml-result:v1:" + hashlib.sha256(
                json.dumps({"features": normalized, "modelVersion": selected.version}, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()
            cache = instance.state.result_cache
            lock = None
            if cache is not None:
                try:
                    cached = cache.get(cache_key)
                    if cached:
                        instance.state.prediction_requests += 1
                        instance.state.cache_hits += 1
                        cached_result = json.loads(cached)
                        instance.state.score_sum += cached_result["score"]
                        instance.state.score_count += 1
                        return PredictionResponse(**cached_result)
                    instance.state.cache_misses += 1
                    lock = cache.lock(f"{cache_key}:lock", timeout=4, blocking_timeout=0.2)
                    if not lock.acquire(blocking=True):
                        lock = None
                except Exception:
                    cache = None
                    lock = None

            try:
                if cache is not None:
                    try:
                        cached = cache.get(cache_key)
                        if cached:
                            instance.state.prediction_requests += 1
                            instance.state.cache_hits += 1
                            cached_result = json.loads(cached)
                            instance.state.score_sum += cached_result["score"]
                            instance.state.score_count += 1
                            return PredictionResponse(**cached_result)
                    except Exception:
                        cache = None
                result = models.predict_with_model(responses, selected)
                if cache is not None:
                    try:
                        cache.setex(cache_key, 300 + random.randint(0, 60), json.dumps(result, separators=(",", ":")))
                    except Exception:
                        pass
            finally:
                if lock is not None:
                    try:
                        lock.release()
                    except Exception:
                        pass
            instance.state.prediction_requests += 1
            instance.state.score_sum += result["score"]
            instance.state.score_count += 1
            return PredictionResponse(**result)
        except (ValueError, KeyError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    return instance


app = create_app()
