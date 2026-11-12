# Requirement traceability

Stage 0 baseline: SRS FR-1.1–FR-7.3 and PR-1–PR-11. Planned paths/tests below identify intended implementation ownership; verification status remains **not implemented** until the relevant stage passes its gate. No requirement is considered proven by this scaffold.

| ID | Requirement (short form) | Planned implementation | Proving test / evidence | Stage | Status |
|---|---|---|---|---:|---|
| FR-1.1 | Google OAuth sign-in, no passwords | `services/core-api/src/auth` | `tests/security/auth.test.ts` | 2 | Planned |
| FR-1.2 | Short-lived identity/role JWT | `services/core-api/src/auth` | `tests/security/jwt.test.ts` | 2 | Planned |
| FR-1.3 | Reject missing/expired/unauthorized JWT | `services/core-api/src/auth` | `tests/security/auth.test.ts` | 2 | Planned |
| FR-1.4 | Patient/doctor/admin RBAC | `services/core-api/src/auth` | `tests/security/rbac.test.ts` | 2 | Planned |
| FR-2.1 | Grant named doctor scoped timed report access | `services/core-api/src/consents` | `tests/api-e2e/consent.test.ts` | 3 | Planned |
| FR-2.2 | Revoke consent | `services/core-api/src/consents` | `tests/api-e2e/consent.test.ts` | 3 | Planned |
| FR-2.3 | Immediately block revoked doctor token | `packages/shared/src/blocklist` | `tests/security/revocation.test.ts` | 6 | Planned |
| FR-2.4 | Require matching current consent | `services/core-api/src/consents` | `tests/security/consent-access.test.ts` | 3 | Planned |
| FR-3.1 | Persist/enqueue and immediately acknowledge | `services/core-api/src/questionnaires` | `tests/api-e2e/submission.test.ts` | 3–4 | Planned |
| FR-3.2 | Independently scalable queue workers | `services/worker` | `tests/api-e2e/worker.test.ts` | 4 | Planned |
| FR-3.3 | Recover crashed worker job | `services/worker` | `tests/resilience/worker-recovery.test.ts` | 4 | Planned |
| FR-3.4 | Notify patient when report ready | `services/worker/src/notifications` | `tests/api-e2e/notifications.test.ts` | 4 | Planned |
| FR-3.5 | Nightly re-score existing questionnaires | `services/worker/src/schedules` | `tests/api-e2e/rescore.test.ts` | 4 | Planned |
| FR-4.1 | Worker computes basic score | `services/worker/src/scoring` | `services/worker/test/scoring.test.ts` | 4 | Planned |
| FR-4.2 | Request ML refinement with bounded wait | `services/worker/src/ml-client` | `tests/resilience/ml-timeout.test.ts` | 4 | Planned |
| FR-4.3 | Label basic-only fallback | `services/worker/src/scoring` | `tests/resilience/ml-fallback.test.ts` | 4 | Planned |
| FR-4.4 | Recovering ML circuit breaker | `services/worker/src/ml-client` | `services/worker/test/circuit-breaker.test.ts` | 4 | Planned |
| FR-4.5 | Record method and model version | `services/worker/src/predictions` | `tests/api-e2e/prediction-provenance.test.ts` | 4 | Planned |
| FR-5.1 | Stable/canary with configurable traffic | `ml/registry` | `ml/tests/test_routing.py` | 5 | Planned |
| FR-5.2 | Ramp or rollback based on health | `ml/canary` | `ml/tests/test_canary_controller.py` | 5 | Planned |
| FR-5.3 | Doctor confirms outcome labels | `services/core-api/src/outcomes` | `tests/api-e2e/outcomes.test.ts` | 3 | Planned |
| FR-5.4 | Scheduled retraining | `ml/training` | `ml/tests/test_training.py` | 5 | Planned |
| FR-5.5 | Fixed holdout promotion gate | `ml/evaluation` | `ml/tests/test_promotion_gate.py` | 5 | Planned |
| FR-6.1 | Append audit for consent/score/view | `services/core-api/src/audit` | `tests/api-e2e/audit.test.ts` | 3–4 | Planned |
| FR-6.2 | DB role denies audit update/delete | `services/core-api/migrations` | `tests/integration/audit-immutability.test.ts` | 1 | Planned |
| FR-6.3 | Admin audit search/filter | `services/core-api/src/audit` | `tests/api-e2e/audit-search.test.ts` | 3 | Planned |
| FR-6.4 | Patient sees own access history | `services/core-api/src/audit` | `tests/api-e2e/audit-history.test.ts` | 3 | Planned |
| FR-7.1 | Reject invalid questionnaire fields | `services/core-api/openapi` | `tests/api-e2e/questionnaire-validation.test.ts` | 3 | Planned |
| FR-7.2 | Log internal failures safely | `packages/shared/src/logger` | `tests/security/error-envelope.test.ts` | 7 | Planned |
| FR-7.3 | Never present partial prediction as complete | `services/worker/src/predictions` | `tests/resilience/prediction-state.test.ts` | 4 | Planned |
| PR-1 | Horizontal scale under concurrent roles | `infra/k8s` | `tests/load/scaling.js` | 9,11 | Planned |
| PR-2 | Retain 12 months history efficiently | `services/core-api/src/data` | `tests/integration/history-retention.test.ts` | 1,11 | Planned |
| PR-3 | Support 100,000 prediction records | `services/core-api/src/data` | `tests/load/predictions.js` | 1,11 | Planned |
| PR-4 | Ack questionnaire <500 ms | `services/core-api/src/questionnaires` | `tests/load/questionnaire-ack.js` | 3,11 | Planned |
| PR-5 | Basic score <1 s | `services/worker/src/scoring` | `services/worker/test/scoring.test.ts` | 4 | Planned |
| PR-6 | ML timeout/fallback <=3 s | `services/worker/src/ml-client` | `tests/resilience/ml-timeout.test.ts` | 4 | Planned |
| PR-7 | 95% reports available <10 s | `services/worker`, `services/ml-service` | `tests/load/report-latency.js` | 5,11 | Planned |
| PR-8 | 95% single-document writes <=3 s | `services/core-api/src/data` | `tests/load/database-writes.js` | 1,11 | Planned |
| PR-9 | 99% evaluation availability | `infra/k8s`, observability | `tests/resilience/availability.md` | 7,9,11 | Planned |
| PR-10 | Recover failures <=30 s, no lost job | `services/worker`, `infra/k8s` | `tests/resilience/worker-recovery.test.ts` | 4,9 | Planned |
| PR-11 | Canary rollback <=5 minutes | `ml/canary` | `ml/tests/test_canary_controller.py` | 5 | Planned |
