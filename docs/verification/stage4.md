# Stage 4 verification

Date: 2026-11-12

## Built

- Added a BullMQ scoring worker with concurrency configuration, exponential retries, stalled-job recovery, a dead-letter queue for final failures, and a 02:00 daily questionnaire rescore scheduler.
- Added the published FINDRISC rule-based scoring implementation, strict input validation, 0–26 scoring and bands, normalized persistence, idempotent prediction/notification/audit writes, and report-ready notifications.
- Added a bounded 3-second ML client and closed/open/half-open circuit breaker. When the ML URL is absent or unhealthy, the worker persists a clearly marked `basic_only` result with the FINDRISC version.
- Added MongoDB unique indexes and a migration for one prediction per questionnaire, one report-ready notification per patient/questionnaire, and idempotent score-generated audit inserts.
- Documented the source instrument and limits in `docs/scoring-rules.md`, and recorded the choice in ADR-0011 because the SRS/SDD do not specify the questionnaire or formula.

## Commands and results

`npm run verify` — exit code 0: lint, strict typecheck, and all 22 unit tests passed.

`npm run worker:build` — exit code 0.

`npm run test:integration` — exit code 0 using MongoDB 7 and Redis 7 Testcontainers:

```text
# audit immutability: pass 1, fail 0
# auth sessions: pass 1, fail 0
# Core API contract smoke: pass 1, fail 0
# worker pipeline: pass 2, fail 0
```

The worker integration verifies a real queued job persisted the FINDRISC fallback, notification and audit row; duplicate processing remained idempotent; invalid inputs reached the dead-letter queue; and a job was recovered after its worker was force-closed.

## Gate status

**Stage 4 gate passed.**

## Known limits

- The SRS/SDD did not specify score inputs or a formula. Per ADR-0011, this build adopts adult FINDRISC for Type 2 diabetes only. The normalized 0–1 value is points divided by 26, not a calibrated probability. It is not a hypertension score and makes no clinical-validity claim.
- The ML endpoint is not implemented until Stage 5. Worker fallback was exercised; live ML scoring and the 3-second network timeout against a running model remain unverified.
- The nightly scheduler registration is tested; the daily full-history scan is not time-triggered in tests. Performance targets and cluster-level <=30-second recovery remain for later hardening.
- Local verification ran on Node 20.17.0 although the repository baseline is Node 22.
