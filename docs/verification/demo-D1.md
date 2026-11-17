# Demo completion D1 verification

Date: 2026-11-17

Status: **Passed locally.** All Compose images were rebuilt, the full local stack became healthy, the service/docs probes passed, and a synthetic mock patient completed a questionnaire-to-ML-refined-report journey. No external deployment or production claim is implied.

## Inputs

D1 has no manual inputs in the demo-completion registry. The local Compose run used `AUTH_PROVIDER=mock` as a process-level override; the ignored `.env` was not edited and its values were not printed.

## Commands and observed results

- `docker compose --env-file .env.example -f infra/docker/docker-compose.yml config --quiet` — exit 0.
- `$env:AUTH_PROVIDER = 'mock'; docker compose --env-file .env -f infra/docker/docker-compose.yml up --build -d` — all three images built (`carelens-node`, `carelens-ml`, `carelens-frontend`); Mongo replica-set init and migration jobs exited 0; API, worker, frontend, ML, MongoDB, both Redis instances, Prometheus, and Grafana became healthy.
- `npm run verify` — passed: lint, type-check, and 27/27 backend/shared unit tests.
- `npm run test:integration` — passed: 11/11 integration tests using real MongoDB/Redis/ML dependencies.
- `npm run test:e2e` — passed: the API patient → doctor → admin journey, including consent revocation and audit checks. This isolated API E2E uses a deterministic basic-score fallback; the Compose smoke below verified real ML refinement.
- `& 'services/ml-service/.venv/Scripts/python.exe' -m pytest services/ml-service/tests -q` — `6 passed`.
- `npm run fe:verify` in a `node:22-bookworm-slim` Docker runner — passed: lint, formatting, type-check, 12/12 test files and 22/22 tests, contrast checks, production build, and bundle budget (179.3/220 KiB gzip). The host Node is v20.17, below the repository’s declared `>=22` requirement; the supported Node 22 runner was used. The first frontend test run exposed an outdated “CareLens heading” expectation; the test now checks the current accessible “CareLens home” link.
- `npm run smoke` — passed: Compose state checks for all 11 required services/jobs; frontend readiness; Core API health/readiness; `/docs`, `/api/docs`, and same-origin frontend `/api/docs`; ML, Prometheus, Grafana, and worker metrics readiness; mock patient sign-in; questionnaire submission; completed scoring; and report retrieval. The real pipeline returned `scoreSource=ml_refined`, `modelVersion=carelens-logreg-v1`, and a numeric ML score.
- `docker compose --env-file .env -f infra/docker/docker-compose.yml ps --all` — runtime evidence showed healthy service containers; migration and replica-set init jobs exited 0. Old optional Selenium-profile containers remain exited and were not started by D1.

## D1 changes

- Added `scripts/smoke-local.mjs` and `npm run smoke` / `make smoke` entry points.
- Smoke probes all required service states, both API docs endpoints and the frontend proxy, mock login, and a complete real-ML report cycle using synthetic responses only.
- Fixed frontend formatting and updated a stale sign-in page test to match the accessible product home link.
- OpenAPI client generation incorporated two current operation descriptions.

## Observed limitations

- Docker access from the restricted command sandbox initially returned `EACCES`; running approved Docker commands with repository access reached Docker Desktop 4.99.0 / Engine 29.9.3 and the stack passed.
- Frontend host verification cannot run on Node 20.17 because the repo requires Node 22 or newer; Node 22 verification passed in Docker.
- npm reported 15 moderate vulnerabilities in the development dependency tree during `npm ci`; the production-only API image install reported 0 vulnerabilities. Dependency audit/remediation is scheduled for D6.
- This is synthetic demo data and a non-clinically-validated model pipeline, not a diagnostic or clinically validated system.
