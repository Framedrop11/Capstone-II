# Stage 7 verification

Date: 2026-11-12

## Built

- Added JSON-line logs for Core API requests/errors, worker job success/failure, and ML service requests/errors. Correlation IDs pass from API requests into scoring jobs and the ML call. Logs avoid request bodies, patient identifiers, and raw feature values.
- Added Core API request counters and latency histograms, cache-operation and rate-limit counters, and dependency readiness gauges.
- Added worker job outcome and duration metrics, queue depth gauges, ML request latency/outcomes, breaker state, scoring fallback counters, and normalized score histograms. The worker exposes `/metrics` on configurable port 9464.
- Added ML service HTTP request/error/latency metrics, prediction/cache counters, and prediction score summary at `/metrics`.
- Added Prometheus scrape configuration, operational alert rules, a Grafana service overview dashboard, and an observability runbook.

## Commands and results

`npm run verify` — exit code 0: lint, typecheck, and 25 unit tests passed. Tests cover worker metric families, a live worker `/metrics` scrape, and YAML/JSON parseability of the Prometheus and Grafana files.

`npm run test:integration` — exit code 0: all 9 integration tests passed. The Core API integration exercised `/metrics` and emitted correlation-ID JSON request logs; worker and ML integration paths completed with their new instrumentation.

`services\ml-service\.venv\Scripts\python.exe -m pytest -q tests` — exit code 0: 6 passed.

`services\ml-service\.venv\Scripts\pyb.exe --no-venvs` from `services\ml-service` — exit code 0; PyBuilder `publish` and all 6 Python tests passed.

## Known gaps

- Prometheus/Grafana containers are not wired into Compose or runtime-tested in this stage; service scraping is configured for the Stage 8 stack.
- Alert thresholds are initial operational values and need tuning against real traffic. The score-shift rule is a basic rolling-mean signal, not a clinical drift test.
- JSON logs are emitted to stdout for container collection; centralized storage, retention, and access controls depend on the deployment platform.
- Stage 5's automatic canary traffic ramp/rollback controller remains unimplemented; this stage exposes the relevant metrics and alerts but does not change rollout traffic.

## Gate status

**Stage 7 implementation and verification gate passed** for instrumentation, structured logs, dashboards, alert rules, and local scrape/config tests. Stage 8 has not started.
