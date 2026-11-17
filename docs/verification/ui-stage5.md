# UI Stage U5 verification

Date: 2026-11-14

## Delivered

- Admin user table with search across loaded rows, cursor pagination and role changes. The signed-in admin’s own role control is locked in the UI.
- Audit search filters by patient, actor, action and date range; results use cursor pagination and a virtualized table after more than 50 loaded entries.
- Model version cards show status, promotion gate, canary traffic share and artifact URI. Eligible promotions and rollbacks require confirmation; backend checks remain authoritative.
- System health tiles use new admin-authenticated `GET /api/v1/admin/system-health`; all `/api/v1/admin` responses use `no-store`. A Grafana link supports `VITE_GRAFANA_URL`, defaulting to local Compose at `http://localhost:3001`.
- OpenAPI response schemas, generated client types, admin API wrapper, traceability and backend change inventory updated.

## Verification

- `frontend`: `npm run verify` — passed: generated-client check, lint, formatting, typecheck, 17 tests across 10 files, contrast checks and production build.
- Root `npm run verify` — passed: lint, typecheck and 26 unit tests.
- `npm run test:e2e` — passed with MongoDB and Redis: doctor journey plus admin health read, user list/role update, model list/promotion/rollback and audit search.
- Focused admin UI test — passed with a 100-entry audit response, role mutation, filter query, model promotion confirmation and health/Grafana display.
- `git diff --check` — passed (Git may print line-ending conversion notices for existing workspace files).

## Known scope notes

- A local admin identity bootstrap is not available in the current development setup; the real-stack test provisions its admin user directly in the test database. The UI remains protected by server role authorization.
- The Grafana default is for local Compose. Set `VITE_GRAFANA_URL` for another deployment; runtime configuration is part of U7.
- Browser-level multi-role and large-list interaction checks remain scheduled for U6/U8.
- Stop after U5. U6 is not started.
