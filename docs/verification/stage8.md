# Stage 8 verification — Docker and Compose

Date: 2026-11-13

## Scope

Local multi-container deployment for MongoDB replica-set storage, separate queue and cache Redis instances, the Core API, worker, ML service, Prometheus, and Grafana. The Compose startup also initializes MongoDB and runs schema migrations before starting dependent services.

## Results

- `docker compose --env-file .env.example -f infra/docker/docker-compose.yml config --quiet` — passed.
- `docker compose --env-file .env.example -f infra/docker/docker-compose.yml build` — passed. Built `carelens-node:local` and `carelens-ml:local`.
- `docker compose --env-file .env.example -f infra/docker/docker-compose.yml up --build -d` — passed after correcting MongoDB's replica key wiring and using a valid keyfile value in `.env.example`.
- `docker compose ... ps -a` — all long-running services reported `Up (healthy)`. The `mongo-rs-init` and `database-migrate` one-shot services exited with code 0.
- Migration logs show both `20261112000000-create-carelens-data.js` and `20261113000000-worker-idempotency-indexes.js` migrated successfully. Replica initialization logged `initialized rs0`.
- `docker compose ... exec -T core-api node scripts/seed-local.mjs` — passed; created/upserted the synthetic patient `mock-patient@example.test`.
- HTTP checks — Core API `/healthz` and `/readyz`, ML `/health`, Prometheus `/-/healthy`, and Grafana `/api/health` all returned HTTP 200. Prometheus returned three `up` targets.

The explicit Compose command shown above used `.env.example` values, which are local placeholders. Use a private `.env` with changed secrets for local use. No production credentials or real patient data were used.

## Corrections during runtime verification

1. Added `MONGO_REPLICA_KEY` to the MongoDB service environment; the entrypoint had rejected an empty value.
2. Replaced punctuation in the sample replica key because MongoDB keyfiles accept only valid keyfile characters and the original sample contained hyphens.

## Gate

**Stage 8 implementation and runtime gate passed.** The Compose stack is running locally. Stage 9 has not started.
