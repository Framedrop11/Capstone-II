# Stage 3 verification

Date: 2026-11-12

## Built

- Added an OpenAPI 3.1 contract and Express OpenAPI request/response validation; Swagger UI is enabled only in `dev` and `staging`.
- Wired auth, patient questionnaire/prediction/report/consent/audit routes, doctor shared-report and outcome routes, and admin user/audit/model-version routes.
- Added Redis-backed rate limiting, request correlation IDs, request size limits, sanitized error envelopes, scoped report JWTs, BullMQ questionnaire enqueueing, Prometheus HTTP metrics, liveness/readiness routes, and a runnable server entry point.
- Added OpenAPI contract tests and an HTTP smoke integration test covering validator startup, liveness/correlation behavior, authentication failures and request validation.

## Commands and results

`npm run verify` — exit code 0 (run with local socket access for Supertest):

```text
# tests 18
# pass 18
# fail 0
```

`npm run test:integration` — exit code 0 (Docker Desktop/Testcontainers and local socket access):

```text
# audit immutability: pass 1, fail 0
# auth sessions: pass 1, fail 0
# Core API OpenAPI/HTTP smoke: pass 1, fail 0
```

## Gate status

**Stage 3 gate passed.** Strict type check, lint, unit/HTTP tests, MongoDB audit/session integration and Core API contract smoke passed.

## Known limits

- The Stage 3 HTTP smoke verifies contract loading and representative success/error paths. A complete persisted API journey across questionnaire idempotency, consent revocation, scoped report access, admin workflows and Redis/BullMQ is still needed in later API E2E hardening.
- This local runtime is Node 20.17.0 while the repository requires Node 22; verification passed with engine warnings where applicable.
- Live Google OIDC still requires deployment credentials; mock OIDC remains the tested local path.
