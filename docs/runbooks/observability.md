# Observability runbook

Prometheus scrapes the Core API at `:3000/metrics`, the worker at `:9464/metrics`, and the ML service at `:8000/metrics`. The dashboard is `infra/monitoring/grafana/carelens-overview.json`; alerts and thresholds are in `infra/monitoring/alerts.yml`.

## Triage

- For Core API 5xx or latency alerts, inspect the alert's route and status labels, then use the `X-Correlation-ID` in JSON application logs. Log records intentionally omit request bodies, user identifiers, and raw URLs.
- For queue depth or job-duration alerts, compare waiting/active/delayed jobs with worker job outcomes. Worker logs include correlation ID, job name, duration, and error type, but no patient identifier.
- For an ML fallback or open-circuit alert, verify ML service health and the ML latency histogram. The worker continues with the basic score while ML is unavailable.
- For cache alerts, the API is expected to remain ready when MongoDB and the queue are healthy. Cache reads fail open; check Redis health and the `degraded` field from `/readyz`.
- For score-distribution drift, compare the five-minute and one-hour means, then segment by the persisted model version in MongoDB before changing traffic.

## Alert thresholds

The initial rules page on: Core API 5xx ratio >5% for five minutes; Core API p95 >500 ms for five minutes; required MongoDB/queue dependency unavailable for one minute; cache Redis unavailable for five minutes; >100 waiting jobs for five minutes; fallback ratio >10% for five minutes; circuit open for one minute; mean normalized score shift >0.15 with at least 50 scores for ten minutes; and cache read hit ratio <20% for fifteen minutes.

Treat these as demonstration thresholds. Tune them with observed baseline traffic before production use. No PHI, raw feature values, or patient IDs are Prometheus labels.
