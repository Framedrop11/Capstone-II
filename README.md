# CareLens

CareLens is an API-first demonstration of patient-controlled report sharing and asynchronous chronic-condition risk screening. It is a screening aid, not a diagnosis; the model requires clinical validation and legal review before use with real patients.

The React UI in `frontend/` follows the gated plan in `carelens_ui_master_prompt.md`. Stages U0 through U6 provide the patient, doctor, and admin screens and accessibility polish. U7 packages the UI for same-origin NGINX deployment; the full-stack browser verification is the separate U8 stage.

## Build stages

See [docs/PLAN.md](docs/PLAN.md) for the gated implementation sequence and [docs/TRACEABILITY.md](docs/TRACEABILITY.md) for the requirement map. The source specifications are in `docs/CareLens_SRS.docx` and `docs/CareLens_SDD.docx`.

## Local development

Docker Desktop with Compose and GNU Make are required for the full local stack. Copy `.env.example` to `.env`, replace the Google client ID and secret placeholders, and register `http://localhost:18082/api/v1/auth/callback` as an authorized redirect URI in your Google OAuth client. Keep `.env` private. Then run:

```sh
make up
```

The stack starts MongoDB 7 as a single-node replica set, separate BullMQ and cache Redis 7 instances, the Core API, frontend, worker, FastAPI ML service, Prometheus, and Grafana. Open the UI at <http://localhost:18082>; NGINX proxies `/api/` to the Core API on the same origin. Local sign-in uses Google OIDC. For mock role-based browser testing, set `AUTH_PROVIDER=mock` in `.env` and run `make seed` to provision synthetic patient, doctor, and administrator accounts.

- Core API health: <http://localhost:3000/healthz>. Swagger UI: <http://localhost:18082/api/docs> through the local app, or <http://localhost:3000/docs> directly. Swagger UI is enabled in local, dev, and staging profiles; it is disabled in production. Use **Authorize** to provide a short-lived access token for protected operations; authorization is not persisted by Swagger UI.
- Prometheus: <http://localhost:9090>
- Grafana: <http://localhost:3001> (credentials are in the local `.env`)
- ML health: <http://localhost:8000/health>

`make down` stops the stack and preserves local data volumes. `docker compose -f infra/docker/docker-compose.yml down -v` removes volumes and deletes local data.

Node.js 22 and npm are required for host-side development. Run `npm run verify`, `npm run test:integration`, and the Python checks in `services/ml-service`; see [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md), [the rollback runbook](docs/runbooks/rollback.md), and [the observability runbook](docs/runbooks/observability.md).
