# Stage 1 verification

Date: 2026-11-12

## Built

- Added Mongoose models for all ten collections: users, patients, consents, questionnaires, predictions, outcomes, auditLogs, modelVersions, notifications, refreshTokens.
- Added strict field, enum, score-range, and required-field validation in Mongoose and MongoDB collection validators.
- Added compound hot-path and cursor indexes; disabled Mongoose auto-index creation so migrations own index changes.
- Added migrate-mongo migration/configuration to create collections, validators, indexes, a custom application role, and its database user. The role grants only `find`/`insert` on `auditLogs`, while granting application CRUD on other domain collections.
- Added an explicit Patients schema and documented that MongoDB references are not foreign keys and must be checked by service logic.
- Added unit validation/index tests and a Testcontainers integration test for audit insert/read success, update/delete denial and MongoDB validator rejection.
- Added migration operations and data model documentation.

## Commands and results

`npm run verify` — exit code 0. ESLint and strict typecheck passed; all 8 unit tests passed:

```text
> carelens@0.1.0 verify
> npm run lint && npm run typecheck && npm test

> carelens@0.1.0 lint
> eslint .

> carelens@0.1.0 typecheck
> tsc --noEmit

> carelens@0.1.0 test
> npm run build:test && node --test .test-dist/tests/unit/data-models.test.js

> carelens@0.1.0 build:test
> tsc -p tsconfig.test.json

TAP version 13
# Subtest: registers all ten collections with explicit collection names
ok 1 - registers all ten collections with explicit collection names
# Subtest: normalizes user email and rejects an invalid role
ok 2 - normalizes user email and rejects an invalid role
# Subtest: requires consent scope and expiry
ok 3 - requires consent scope and expiry
# Subtest: requires questionnaire response object and patient reference
ok 4 - requires questionnaire response object and patient reference
# Subtest: enforces score bounds and score source enum
ok 5 - enforces score bounds and score source enum
# Subtest: requires outcome attribution and constrains model rollout percentage
ok 6 - requires outcome attribution and constrains model rollout percentage
# Subtest: declares compound indexes for consent, audit, and cursor paths
ok 7 - declares compound indexes for consent, audit, and cursor paths
# Subtest: notification and refresh token models require recipient and family fields
ok 8 - notification and refresh token models require recipient and family fields
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
```

`node --check services/core-api/migrations/20261112000000-create-carelens-data.js` — exit code 0.

`node --check services/core-api/migrate-mongo-config.cjs` — exit code 0.

`npm run test:integration` — **failed before MongoDB startup** because no container runtime was available:

```text
not ok 1 - application MongoDB identity can insert/read audit rows but cannot update/delete
error: 'Could not find a working container runtime strategy'
code: 'ERR_TEST_FAILURE'
```

`docker info --format '{{.ServerVersion}}'` — failed; Docker Desktop engine pipe was unavailable (access denied after attempting to start Docker Desktop).

The Testcontainers integration is required to prove FR-6.2 at the database permission level. The code and integration test exist, but that requirement is not yet verified against MongoDB.

## Gate status

**Stage 1 gate is not passed.** Unit checks pass, but the real MongoDB/Testcontainers integration test could not run because Docker Desktop has no accessible engine. Do not begin Stage 2 until the integration test passes in an environment with a working container runtime.

Additional limits: the local Node runtime is v20.17.0, below the repository Node 22 baseline. npm emitted engine warnings. No 12-month retention test, 100,000-record load run, or p95 write-latency measurement was performed; those are scheduled for Stage 11.

## Requirement coverage and gaps

- FR-6.2: implemented in the migration and integration test; database proof pending.
- PR-2: no TTL expiry is configured and history indexes exist; retention/performance not measured.
- PR-3 and PR-8: load tests/measurements remain for Stage 11.
- All other requirements remain as mapped in `TRACEABILITY.md`; Stage 1 implements no authentication, API, worker, or ML behavior.
