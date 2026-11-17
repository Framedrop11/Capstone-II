# Requirement traceability

SRS baseline: FR-1.1–FR-7.3 and PR-1–PR-11. Paths/tests identify implementation ownership. Status reflects the latest completed stage gate; later-stage requirements remain planned until implemented and verified.

| ID | Requirement (short form) | Planned implementation | Proving test / evidence | Stage | Status |
|---|---|---|---|---:|---|
| FR-1.1 | Google OAuth sign-in, no passwords | `services/core-api/src/auth` | `tests/integration/auth-sessions.test.ts` | 2 | OIDC/PKCE flow implemented; mock tested; live Google unverified |
| FR-1.2 | Short-lived identity/role JWT | `services/core-api/src/auth/access-tokens.ts` | `tests/unit/auth.test.ts` | 2 | Implemented and tested (15-minute JWT) |
| FR-1.3 | Reject missing/expired/unauthorized JWT | `services/core-api/src/auth/middleware.ts` | `tests/unit/auth-middleware.test.ts` | 2 | Implemented and tested |
| FR-1.4 | Patient/doctor/admin RBAC | `services/core-api/src/auth/middleware.ts`, `services/core-api/src/http/routes/admin.ts`, `frontend/src/app/routes/AdminWorkspace.tsx` | `tests/unit/auth-middleware.test.ts`, `tests/api-e2e/patient-doctor-journey.test.ts` | 2,U5 | Implemented; role guards remain server-enforced and admin role updates are integration-tested |
| FR-2.1 | Grant named doctor scoped timed report access | `services/core-api/src/http/routes/patient.ts`, `services/core-api/src/http/routes/doctor.ts`, `frontend/src/app/routes/DoctorWorkspace.tsx` | `tests/api-e2e/patient-doctor-journey.test.ts`, `frontend/src/features/doctor/DoctorWorkspace.test.tsx` | 3,11,U4 | Worklist, scoped token read/countdown, consent-limited risk summary and access audit passed |
| FR-2.2 | Revoke consent | `services/core-api/src/http/routes/patient.ts` | `tests/api-e2e/patient-doctor-journey.test.ts` | 3,11 | Persisted revoke passed |
| FR-2.3 | Immediately block revoked doctor token | `services/core-api/src/http/routes/doctor.ts`, `services/core-api/src/cache/report-cache.ts`, `frontend/src/app/routes/DoctorWorkspace.tsx` | `tests/integration/report-cache.test.ts`, `tests/api-e2e/patient-doctor-journey.test.ts`, `frontend/src/features/doctor/DoctorWorkspace.test.tsx` | 6,11,U4 | Revoked token rejected on next report read despite cache; UI displays access ended |
| FR-2.4 | Require matching current consent | `services/core-api/src/http/routes/doctor.ts` | `tests/integration/core-api-contract.test.ts` (validator/auth smoke); consent flow pending | 3 | Implemented; full flow pending |
| FR-3.1 | Persist/enqueue and immediately acknowledge | `services/core-api/src/http/routes/patient.ts`, `services/core-api/src/queue/scoring-queue.ts` | `tests/integration/patient-experience.test.ts`, `tests/integration/worker-pipeline.test.ts` | 3–4 | Patient submission is idempotent, stored and acknowledged; worker pipeline is integration tested |
| FR-3.2 | Independently scalable queue workers | `services/worker/src/worker.ts` | `tests/integration/worker-pipeline.test.ts` | 4 | Implemented; real BullMQ worker tested |
| FR-3.3 | Recover crashed worker job | `services/worker/src/worker.ts` | `tests/integration/worker-pipeline.test.ts` | 4 | Implemented; force-close and stalled job recovery tested |
| FR-3.4 | Notify patient when report ready | `services/worker/src/worker.ts`, `services/core-api/src/data/models.ts` | `tests/integration/worker-pipeline.test.ts` | 4 | Implemented; Mongo notification persisted idempotently |
| FR-3.5 | Nightly re-score existing questionnaires | `services/worker/src/worker.ts` | `tests/integration/worker-pipeline.test.ts` | 4 | Implemented; nightly scheduler registered (full scan not time-triggered in test) |
| FR-4.1 | Worker computes basic score | `services/worker/src/scoring/findrisc.ts` | `tests/unit/findrisc.test.ts`, `tests/integration/worker-pipeline.test.ts` | 4 | Implemented; published deterministic score tested |
| FR-4.2 | Request ML refinement with bounded wait | `services/worker/src/ml/client.ts` | `tests/unit/circuit-breaker.test.ts`; timeout enforced at 3s | 4 | Implemented; live ML service absent until Stage 5 |
| FR-4.3 | Label basic-only fallback | `services/worker/src/worker.ts` | `tests/integration/worker-pipeline.test.ts` | 4 | Implemented; missing ML path stores basic_only |
| FR-4.4 | Recovering ML circuit breaker | `services/worker/src/ml/circuit-breaker.ts` | `tests/unit/circuit-breaker.test.ts` | 4 | Implemented and tested through open, half-open, and closed states |
| FR-4.5 | Record method and model version | `services/worker/src/worker.ts` | `tests/integration/worker-pipeline.test.ts` | 4 | Implemented; fallback provenance persisted |
| FR-5.1 | Stable/canary with configurable traffic | `ml/registry` | `ml/tests/test_routing.py` | 5 | Planned |
| FR-5.2 | Ramp or rollback based on health | `ml/canary` | `ml/tests/test_canary_controller.py` | 5 | Planned |
| FR-5.3 | Doctor confirms outcome labels | `services/core-api/src/http/routes/doctor.ts`, `frontend/src/app/routes/DoctorWorkspace.tsx` | `tests/api-e2e/patient-doctor-journey.test.ts`, `frontend/src/features/doctor/DoctorWorkspace.test.tsx` | 3,11,U4 | Outcome recorded only while active consent exists; UI confirms successful submission |
| FR-5.4 | Scheduled retraining | `ml/training` | `ml/tests/test_training.py` | 5 | Planned |
| FR-5.5 | Fixed holdout promotion gate | `ml/evaluation` | `ml/tests/test_promotion_gate.py` | 5 | Planned |
| FR-6.1 | Append audit for consent/score/view | `services/core-api/src/http/audit.ts`, `services/core-api/src/worker` | `tests/api-e2e/patient-doctor-journey.test.ts`, `tests/integration/worker-pipeline.test.ts` | 3–4,11 | Consent, report-view, and score events verified in persisted stores |
| FR-6.2 | DB role denies audit update/delete | `services/core-api/migrations` | `tests/integration/audit-immutability.test.ts` | 1 | Implemented and integration verified |
| FR-6.3 | Admin audit search/filter | `services/core-api/src/http/routes/admin.ts`, `frontend/src/app/routes/AdminWorkspace.tsx` | `tests/api-e2e/patient-doctor-journey.test.ts`, `frontend/src/features/admin/AdminWorkspace.test.tsx` | 3,U5 | Persisted filtered search, cursor paging and virtualized admin table implemented |
| FR-6.4 | Patient sees own access history | `services/core-api/src/http/routes/patient.ts` | `tests/integration/patient-experience.test.ts` | 3 | Implemented; persisted grant and revoke events are returned only to the owning patient |
| FR-7.1 | Reject invalid questionnaire fields | `services/core-api/openapi/openapi.yaml`, `services/core-api/src/http/app.ts` | `tests/integration/core-api-contract.test.ts` | 3 | Implemented and request validation smoke-tested |
| FR-7.2 | Log internal failures safely | `packages/shared/src/logger` | `tests/security/error-envelope.test.ts` | 7 | Planned |
| FR-7.3 | Never present partial prediction as complete | `services/worker/src/worker.ts` | `tests/integration/worker-pipeline.test.ts` | 4 | Implemented; prediction upsert occurs after scoring/fallback settles |
| PR-1 | Horizontal scale under concurrent roles | `infra/k8s` | `tests/load/scaling.js` | 9,11 | Planned |
| PR-2 | Retain 12 months history efficiently | `services/core-api/src/data` | `tests/integration/history-retention.test.ts` | 1,11 | No expiry index; retention/performance verification pending |
| PR-3 | Support 100,000 prediction records | `services/core-api/src/data` | `tests/load/predictions.js` | 1,11 | Load verification pending |
| PR-4 | Ack questionnaire <500 ms | `services/core-api/src/questionnaires` | `tests/load/questionnaire-ack.js` | 3,11 | Planned |
| PR-5 | Basic score <1 s | `services/worker/src/scoring/findrisc.ts` | `tests/unit/findrisc.test.ts` | 4 | Deterministic local calculation; formal load timing pending |
| PR-6 | ML timeout/fallback <=3 s | `services/worker/src/ml/client.ts` | `tests/integration/worker-pipeline.test.ts` | 4 | 3-second abort configured; live timeout measurement pending ML service |
| PR-7 | 95% reports available <10 s | `services/worker`, `services/ml-service` | `tests/load/report-latency.js` | 5,11 | Planned |
| PR-8 | 95% single-document writes <=3 s | `services/core-api/src/data` | `tests/load/database-writes.js` | 1,11 | Load verification pending |
| PR-9 | 99% evaluation availability | `infra/k8s`, observability | `tests/resilience/availability.md` | 7,9,11 | Planned |
| PR-10 | Recover failures <=30 s, no lost job | `services/worker/src/worker.ts` | `tests/integration/worker-pipeline.test.ts` | 4,9 | Redis stalled-job recovery tested locally; cluster recovery/time target pending |
| PR-11 | Canary rollback <=5 minutes | `ml/canary` | `ml/tests/test_canary_controller.py` | 5 | Planned |
