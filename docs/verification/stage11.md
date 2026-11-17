# Stage 11 verification — full hardening and final verification

Date: 2026-11-14

## Built

- Added `tests/api-e2e/patient-doctor-journey.test.ts`, exercising mock OIDC login, questionnaire acknowledgement and queue handoff, worker basic-only scoring, patient report, scoped doctor report access, notification, outcome confirmation, immediate revocation, and admin audit search against real MongoDB and Redis containers.
- Added `npm run test:e2e` and connected `make e2e` to that suite. Connected `make load` to the existing k6 health/readiness smoke profile.
- Updated traceability for the persisted consent, outcome, report access, revocation, and audit paths covered by the new API journey.

## Commands and results

- `npm run verify` — exit 0: ESLint, TypeScript strict type-check, test compilation, and 25/25 unit tests passed. The sandbox-only run initially denied loopback socket binding for 3 HTTP tests; the approved local-access rerun passed.
- `npm run test:integration` — exit 0: all 9 existing Testcontainers tests passed across audit permissions, OIDC sessions, API contract, worker persistence/crash recovery, ML serving/registry, and report-cache privacy behavior.
- `npm run test:e2e` — exit 0: 1/1 API journey passed with disposable MongoDB 7 and Redis 7 containers. The questionnaire request was acknowledged in 93 ms in this single test run; this is not a load guarantee.
- `services/ml-service/.venv/Scripts/python.exe -m pytest -q services/ml-service/tests` — exit 0: 6 passed.
- `docker run --rm -e BASE_URL=http://host.docker.internal:3000 -v "F:\Projects\Capstone II\tests\load:/scripts:ro" grafana/k6:0.52.0 run /scripts/staging-smoke.js` — exit 0 against the running local Compose stack: 2 VUs for 30s, 14,792 HTTP requests, 0 failures, p95 7.11 ms. This profile only covers `/healthz` and `/readyz`, not questionnaire submission or report latency.
- `make load` — unavailable because GNU Make is not installed in the host environment; the Docker k6 command above ran the profile directly.

## Remaining hardening gaps

- The full specified story is not yet covered end to end: failure/recovery of a live ML service across successive submissions, model retraining from that journey, and automatic canary ramp/rollback are not linked together. The automatic canary controller (including the <=5 minute rollback target) remains unimplemented from Stage 5.
- The SRS coverage gate (>=80% core logic) is not measured or enforced. Schemathesis, security route matrix/injection tests, database write/history-retention load, 100,000-record load, questionnaire acknowledgement load, report-latency load, and resilience availability targets were not run.
- GitHub hosted workflows and production/staging deployments remain unverified as noted in Stage 10. No Kubernetes cluster is configured.
- `make` is missing on this host. The direct npm, Python, and Docker commands were used for local verification.

## Gate

**Stage 11 hardening work was performed, but the final definition-of-done gate is not passed.** The available unit, integration, API journey, ML, and health/readiness smoke checks passed. The remaining unimplemented canary controller and unmeasured acceptance/security/load gates are material requirements; no further stage remains after Stage 11.
