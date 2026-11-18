from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable
from typing import Any


class CanaryController:
    """Small-sample, deterministic in-process canary ramp for local/staging demos."""

    STEPS = (5, 25, 50, 75, 100)

    def __init__(
        self,
        manager: Any,
        *,
        enabled: bool,
        minimum_samples: int = 5,
        stage_interval_seconds: float = 60.0,
        maximum_error_rate: float = 0.01,
        maximum_fallback_rate: float = 0.05,
        maximum_p95_latency_ms: float = 500.0,
        maximum_mean_score_drift: float = 0.25,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if minimum_samples < 1 or stage_interval_seconds < 0:
            raise ValueError("Canary sample count must be positive and interval non-negative")
        self.manager = manager
        self.enabled = enabled and manager.canary is not None
        self.minimum_samples = minimum_samples
        self.stage_interval_seconds = stage_interval_seconds
        self.maximum_error_rate = maximum_error_rate
        self.maximum_fallback_rate = maximum_fallback_rate
        self.maximum_p95_latency_ms = maximum_p95_latency_ms
        self.maximum_mean_score_drift = maximum_mean_score_drift
        self.clock = clock
        self.stage_started = clock()
        self.samples: list[tuple[float, float, bool, bool]] = []
        self.history: list[dict[str, Any]] = []
        if self.enabled and manager.canary_traffic_percent == 0:
            manager.canary_traffic_percent = self.STEPS[0]
            self._record("started", self.STEPS[0], "eligible canary loaded")

    @property
    def state(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "candidateVersion": self.manager.canary.version if self.manager.canary else None,
            "trafficPercent": self.manager.canary_traffic_percent,
            "samplesInStage": len(self.samples),
            "history": list(self.history),
        }

    def observe(
        self,
        version: str,
        *,
        latency_ms: float,
        score: float | None = None,
        baseline_score: float | None = None,
        basic_score: float | None = None,
        error: bool = False,
        fallback: bool = False,
    ) -> None:
        if not self.enabled or not self.manager.canary or version != self.manager.canary.version:
            return
        baseline = baseline_score if baseline_score is not None else basic_score
        drift = abs(score - baseline) if score is not None and baseline is not None else 0.0
        self.samples.append((max(0.0, latency_ms), drift, error, fallback))
        self.reconcile()

    def reconcile(self, now: float | None = None) -> dict[str, Any] | None:
        if not self.enabled or not self.manager.canary:
            return None
        observed_at = self.clock() if now is None else now
        if observed_at - self.stage_started < self.stage_interval_seconds:
            return None
        if len(self.samples) < self.minimum_samples:
            return None

        latencies = sorted(sample[0] for sample in self.samples)
        p95 = latencies[min(len(latencies) - 1, math.ceil(len(latencies) * 0.95) - 1)]
        error_rate = sum(sample[2] for sample in self.samples) / len(self.samples)
        fallback_rate = sum(sample[3] for sample in self.samples) / len(self.samples)
        mean_drift = sum(sample[1] for sample in self.samples) / len(self.samples)
        metrics = {
            "samples": len(self.samples),
            "errorRate": error_rate,
            "fallbackRate": fallback_rate,
            "p95LatencyMs": p95,
            "meanScoreDrift": mean_drift,
        }
        failure = None
        if error_rate > self.maximum_error_rate:
            failure = "error_rate_exceeded"
        elif fallback_rate > self.maximum_fallback_rate:
            failure = "fallback_rate_exceeded"
        elif p95 > self.maximum_p95_latency_ms:
            failure = "p95_latency_exceeded"
        elif mean_drift > self.maximum_mean_score_drift:
            failure = "score_drift_exceeded"

        if failure:
            self.manager.canary_traffic_percent = 0
            self.enabled = False
            return self._record("rolled_back", 0, failure, metrics)

        current = self.manager.canary_traffic_percent
        next_step = next((step for step in self.STEPS if step > current), None)
        self.samples.clear()
        self.stage_started = observed_at
        if next_step is None:
            self.enabled = False
            return self._record("completed", 100, "all rollout stages passed", metrics)
        self.manager.canary_traffic_percent = next_step
        return self._record("advanced", next_step, "canary health thresholds passed", metrics)

    def _record(self, action: str, traffic_percent: int, reason: str, metrics: dict[str, Any] | None = None) -> dict[str, Any]:
        decision = {
            "action": action,
            "candidateVersion": self.manager.canary.version if self.manager.canary else None,
            "trafficPercent": traffic_percent,
            "reason": reason,
            "metrics": metrics or {},
            "timestamp": time.time(),
        }
        self.history.append(decision)
        del self.history[:-50]
        logging.getLogger("carelens.ml").info("canary_decision %s", decision)
        return decision
