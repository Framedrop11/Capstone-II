# CareLens: Master Build Prompt

> Paste this whole file into your coding agent (e.g. Claude Code) from the root of an empty repository.
> Before you start, create a `docs/` folder and put `CareLens_SRS.docx` and `CareLens_SDD.docx` inside it.
> Tip: tell the agent "Run Stage 0 only, then stop and report." Then continue one stage at a time.

---

## 0. Your role and the mission

You are a senior full-stack, ML and DevOps engineer. Build **CareLens** end to end as a **production-grade, deployment-ready system**, not a demo or a course exercise.

**CareLens in one paragraph:** A patient signs in with Google, fills in a health questionnaire, and receives an early risk estimate for chronic conditions (as defined in the SRS). A background worker computes a rule-based "basic score" immediately, then asks an ML service for a refined score. If the ML service is slow or down, the patient still gets the basic score, clearly marked "basic score only". The patient grants a doctor time-limited, revocable access. The doctor sees the report using a short-lived, single-patient token. Every access is audit-logged in an append-only log. Doctors later confirm real outcomes, which become training data for a retrain, evaluate and canary-release loop. This is a **screening aid, not a diagnosis**, and every report must say so.

**Scope of this build:** everything **except the user interface**. The React frontend is deferred: create `frontend/` with only a README explaining it is intentionally postponed and that the typed API client will be generated from the OpenAPI spec. All features must be fully usable and verifiable through the **REST API**, Swagger UI and automated tests.

## 1. Source of truth and how to treat it

1. Read `docs/CareLens_SRS.docx` and `docs/CareLens_SDD.docx` completely before writing code. Extract text with a tool such as `pandoc`, `python-docx` or `docx2txt`.
2. The SRS requirement IDs (`FR-x.x`, `PR-x`) are your acceptance backbone. Build and maintain `docs/TRACEABILITY.md`, a matrix mapping **every requirement ID to the code that implements it and the test(s) that prove it**. No requirement may be left unmapped.
3. Where the documents conflict or are silent, **do not guess silently**. Make the decision listed in section 3, record it as an ADR in `docs/adr/`, and list what should be corrected in the SRS/SDD in `docs/DOC_UPDATES_NEEDED.md`.
4. Anything you assume goes in `docs/ASSUMPTIONS.md`.

## 2. Fixed technology stack (do not substitute)

| Area | Choice |
|---|---|
| Core API and workers | Node.js (current LTS) + **TypeScript (strict)** + Express |
| Data | MongoDB (replica set) via Mongoose, migrations with `migrate-mongo` |
| Queue | BullMQ on Redis |
| Cache, blocklist, rate limits | A **separate** Redis instance (see section 5.6) |
| ML service | Python + FastAPI + pydantic; build with **PyBuilder (`pyb`)** |
| API contracts | OpenAPI 3.1, **Swagger UI**, contract-first |
| Auth | Google OAuth 2.0 / OIDC with PKCE, short-lived JWT access tokens, rotating refresh tokens |
| Containers | Docker (multi-stage, non-root) + docker-compose for local |
| Orchestration | Kubernetes with **Kustomize** (`base/` + `overlays/{dev,staging,prod}`) |
| CI/CD | **GitHub Actions** (no Jenkins) |
| Observability | Prometheus + Grafana, structured logs (pino), OpenTelemetry-ready |
| Testing | Jest + Supertest + Testcontainers (Node), pytest (Python), k6 (load), Schemathesis (contract) |

## 3. Decisions already made (record each as an ADR)

1. **Who computes the basic score:** the **worker**, never the Core API. The Core API validates, stores and enqueues only.
2. **Audit log immutability:** enforced at the **database level**. The application's MongoDB user has only `insert` and `find` on `auditLogs` (no update or delete), via a custom role created in a migration. Prove it with a test that attempts update/delete and expects failure.
3. **Naming:** `camelCase` for all JSON fields and MongoDB fields. Note the deviation from the SRS wording in `DOC_UPDATES_NEEDED.md`.
4. **Sessions:** 15-minute access JWT, refresh token in an httpOnly, SameSite, Secure cookie with **rotation and reuse detection** (reuse revokes the whole token family).
5. **Doctor report access:** a separate short-lived (<= 5 min) JWT scoped to one patient and one purpose, issued only after a live consent check.
6. **Revocation:** revoking consent writes the doctor token family to a Redis blocklist (TTL = token expiry) so access ends **immediately**. The blocklist check runs before any cache lookup.
7. **Notifications:** an in-app `notifications` collection plus a pluggable email/SMS adapter interface with a logging stub (FR-3.4 is otherwise undefined). Also notify the doctor when a patient shares a report.
8. **Canary health criteria** (undefined in the docs): define concrete thresholds in config (error rate, p95 latency, fallback rate, score-distribution drift) and document them.
9. **Two Redis instances:** one for BullMQ (`maxmemory-policy noeviction`), one for cache (`allkeys-lru`). Never share.
10. Define the missing **`Patients` schema** and the missing **API endpoint table** (section 5.3).

## 4. Repository layout

```
carelens/
  docs/                     SRS, SDD, ADRs, TRACEABILITY.md, ASSUMPTIONS.md,
                            DOC_UPDATES_NEEDED.md, runbooks/, verification/
  packages/shared/          shared types, config loader, errors, logger
  services/
    core-api/               Express API + OpenAPI spec + Swagger UI
    worker/                 BullMQ workers (basic score, ML call, notifications)
    ml-service/             FastAPI (+ build.py for pyb)
  ml/                       data scripts, training, evaluation, model registry
  frontend/                 README only (deferred)
  infra/
    docker/                 Dockerfiles, docker-compose.yml (+ overrides)
    k8s/base, k8s/overlays/{dev,staging,prod}
    monitoring/             prometheus rules, grafana dashboards (JSON)
  tests/                    api-e2e/, load/ (k6), security/, resilience/
  .github/workflows/
  Makefile                  make up | down | test | lint | verify | seed | e2e | load
```

## 5. Functional scope to implement

### 5.1 Data layer
Collections: `users`, `patients`, `consents`, `questionnaires`, `predictions`, `outcomes`, `auditLogs`, `modelVersions`, `notifications`, `refreshTokens`. Enforce constraints from the SDD (unique email, required fields, enums, `0.0-1.0` scores, ML score nullable). Add **compound indexes** for the hot paths (for example consents on `patientId, doctorId, revoked, expiresAt`; audit logs on `patientId, timestamp`). Cursor-based pagination everywhere.

### 5.2 Auth and access control
Google OIDC behind an **adapter interface**. In dev and test use a **mock OIDC provider** container or a test-only login route. A startup safety check must make the production profile **refuse to boot** if the test auth path is enabled (and a test must prove it). RBAC middleware for `patient`, `doctor`, `admin`.

### 5.3 Core API (`/api/v1`, OpenAPI-first)
Write `openapi.yaml` first. Validate requests/responses against it with `express-openapi-validator`. Serve Swagger UI at `/docs` in dev and staging only. In production it must be disabled or admin-protected. Implement at minimum:
- Auth: login, callback, refresh, logout.
- Patient: questionnaire submit (**idempotency key**), list own predictions, read report, manage consents, view own audit trail, revoke.
- Doctor: list patients who shared with them, open report (consent check, scoped token, audit entry), submit confirmed outcome.
- Admin: manage users/roles, search audit logs (by patient, actor, action, date range), list/promote/rollback model versions.
- Ops: `/healthz` (liveness), `/readyz` (readiness: DB and Redis), `/metrics`.
Standard error envelope, request-size limits, rate limiting (Redis-backed), correlation IDs on every request and job.
Meet the SRS target: questionnaire acknowledged in **< 500 ms**.

### 5.4 Queue and workers
- Questionnaire submit enqueues a job. The worker computes the **rule-based basic score** (< 1 s), then calls the ML service with a **3 s timeout**.
- Implement a **circuit breaker** with open, half-open and closed states and automatic recovery. On fallback, store `scoreSource: "basic_only"`.
- At-least-once processing, **idempotent** handlers, exponential-backoff retries, **dead-letter queue**, graceful shutdown. A crashed worker's job must be re-queued (prove by killing a worker mid-job in a test).
- Nightly re-scoring job and notification jobs.
- Document the rule-based formula in `docs/scoring-rules.md`, based on a **published, openly documented screening method** (cite it). Do not invent clinical logic.

### 5.5 ML part (open-source only)
- Use **open-source algorithms and open datasets**: scikit-learn (logistic regression as an interpretable baseline plus gradient boosting such as scikit-learn's `HistGradientBoostingClassifier`, XGBoost or LightGBM). SHAP or coefficients may be used for explanations.
- Check the SRS/SDD for the datasets and conditions they specify and follow them. Otherwise choose **permissively licensed public datasets** (for example the Pima Indians Diabetes data and the UCI Heart Disease data). Record source, license and preprocessing in `ml/DATASETS.md`. If a dataset can't be downloaded, generate **clearly labelled synthetic data for pipeline testing only** and mark the resulting model "not clinically meaningful".
- Training pipeline: reproducible (fixed seeds, pinned versions), train/validation/**fixed holdout** split, metrics saved (AUC, recall, precision, calibration), **versioned model artifacts** in a simple registry with a `modelVersions` record each.
- FastAPI service: `/predict`, `/health`, `/metrics`, loads a **stable** and an optional **canary** model, returns score, model version, and top contributing factors. The worker picks stable vs canary by `canaryTrafficPercent`.
- Patient-facing report text is **template-generated from the top factors in plain language**, always including the "screening aid, not a diagnosis" statement.
- **Retrain, evaluate, promote loop:** a job reads doctor-confirmed outcomes, retrains, evaluates against the fixed holdout, and registers a candidate **only if it beats stable**. A canary controller ramps traffic up or rolls back automatically (within 5 minutes) using the thresholds from section 3, item 8.

### 5.6 Cache architecture
- Cache-aside in Redis for per-patient report reads, model-version/canary config, and rate-limit counters. Key by user, delete on write, TTL with **jitter**.
- ML result cache keyed by a hash of normalized features and model version.
- **Single-flight locking** against cache stampedes. If the cache is down, **fail open** to MongoDB (degraded but working).
- Never cache PHI at a shared layer (CDN, ingress). Consent revocation must never be defeated by a stale cache (test the race).

### 5.7 Observability
Structured JSON logs with correlation IDs. Prometheus metrics: request latency and errors, queue depth and job duration, ML latency, fallback rate, circuit-breaker state, score-distribution drift, cache hit ratio. Provide Grafana dashboard JSON and Prometheus alert rules.

## 6. DevOps scope

- **Docker:** multi-stage, non-root, pinned base images, healthchecks, `.dockerignore`.
- **docker-compose (local):** MongoDB replica set, two Redis instances, mock OIDC, all services, Prometheus, Grafana. `make up` must give a fully working system from a clean clone.
- **Kubernetes (Kustomize):** Deployments, Services, NGINX Ingress, **HPA**, **PodDisruptionBudgets**, topology spread, resource requests/limits, liveness/readiness/startup probes, CronJobs (nightly re-score, retrain, canary controller), ConfigMaps, Secrets (**templates only, never real secrets**), default-deny **NetworkPolicies** (only API and workers reach MongoDB; only workers reach the ML service). Optional: KEDA scaling workers on queue depth.
- **Environments:** `local`, `dev`, `staging`, `prod`. Config only via environment variables, **validated at startup** (fail fast), with `.env.example` per service. Per-environment OAuth clients, JWT keys and databases. **Build once and promote the same image digest** between environments. Non-prod uses **synthetic seed data only**. Write `docs/ENVIRONMENTS.md` and a rollback runbook.
- **GitHub Actions** workflows: `pr-checks` (lint, type-check, unit tests, OpenAPI lint with Spectral, breaking-change check with `oasdiff`), `build` (build, Trivy scan, push to GHCR tagged with SHA and version), `deploy-dev` (auto), `deploy-staging` (auto + E2E + k6 + ZAP baseline), `deploy-prod` (**manual approval** via GitHub Environments, canary, auto-rollback), `model-gate` (retrain and compare), plus gitleaks, dependency audit, CodeQL/Semgrep.

## 7. Testing requirements (every stage is tested)

| Layer | What must be covered |
|---|---|
| Unit | Scoring rules, consent expiry, token logic, circuit breaker states, cache helpers, ML preprocessing |
| Integration | Real MongoDB and Redis via Testcontainers: queue to worker to DB, crashed-worker re-queue, audit log immutability, blocklist revocation |
| Contract | Schemathesis against the OpenAPI spec of core-api and ml-service |
| API E2E | The full "Riya and Dr. Mehta" story below, automated |
| ML quality | Metric thresholds on the fixed holdout. Promotion refuses a worse model |
| Resilience | Kill the ML service, stop cache Redis, expire tokens, restart workers: system degrades gracefully and recovers |
| Load (k6) | Smoke, load, stress, soak profiles with pass/fail thresholds from the SRS (< 500 ms ack, < 1 s basic score, 95% of reports within 10 s) |
| Security | Auth bypass attempts, RBAC matrix (every role on every route), consent bypass, token replay, rate-limit abuse, injection, dependency and image scans |

Coverage gate: **>= 80%** on core logic, enforced in CI. The Selenium UI tests are deferred to the UI phase.

**API E2E scenario (must pass end to end):** patient signs in, submits questionnaire (< 500 ms ack), gets a basic score, gets a refined score; ML is killed and a second submission falls back to "basic score only" then recovers; patient shares with a doctor for a limited time, doctor is notified and opens the report (audited); patient revokes and the doctor is blocked **immediately**; doctor confirms an outcome; retrain job registers a candidate; canary ramps or rolls back; admin searches the audit trail; audit log update/delete attempts fail.

## 8. Working rules (follow strictly)

1. **Work in stages and stop at each gate:**
   - **Stage 0:** read docs, write plan, ADRs, traceability skeleton, scaffold repo, tooling, Makefile, CI skeleton.
   - **Stage 1:** data layer and migrations.
   - **Stage 2:** auth and sessions.
   - **Stage 3:** Core API and OpenAPI/Swagger.
   - **Stage 4:** queue and workers.
   - **Stage 5:** ML pipeline and service.
   - **Stage 6:** cache architecture.
   - **Stage 7:** observability.
   - **Stage 8:** Docker and compose.
   - **Stage 9:** Kubernetes.
   - **Stage 10:** GitHub Actions.
   - **Stage 11:** full test hardening and final verification.
2. **A stage is done only when** its tests pass **in your environment, and you have shown the actual command output**. Do not start the next stage until the gate passes. Save a short report per stage in `docs/verification/stageN.md` (what was built, commands run, results, requirement IDs covered, known gaps).
3. **Never claim something works without running it.** If the environment lacks Docker, a Kubernetes cluster or network access, say so, run the strongest checks available (for example `kubeconform` and `kubectl apply --dry-run=client`, or a `kind` cluster if possible), and mark that item "not runtime-verified".
4. No stubs, `TODO`s or placeholder logic in finished stages. No fake or always-passing tests. Prefer real dependencies in integration tests over mocks.
5. No secrets in the repo. Use `.env.example` and Secret templates.
6. Use conventional commits with one or more commits per stage. Keep `make verify` (lint, type-check, tests) green at all times.
7. If blocked by something only the human can provide (real Google OAuth credentials, a cloud cluster, registry access), document exactly what is needed and where it plugs in, and continue with the mock or adapter.

## 9. Final definition of done

- [ ] `make up && make seed && make e2e` works from a clean clone.
- [ ] Every SRS requirement ID is mapped to code and a passing test in `docs/TRACEABILITY.md`.
- [ ] All stage verification reports exist with real command output.
- [ ] Swagger UI reflects the real API, and the spec passes lint with no breaking-change violations.
- [ ] The ML pipeline trains, evaluates, registers, serves, and the promotion gate rejects a worse model.
- [ ] Load tests meet the SRS targets, with honest notes on the hardware used.
- [ ] Kubernetes manifests validate for all three overlays. CI workflows are valid.
- [ ] Docs complete: README (setup, architecture diagram in Mermaid), ENVIRONMENTS, runbooks, ADRs, DOC_UPDATES_NEEDED.

## 10. Out of scope

The React UI, real patient data, real Google credentials, cloud account provisioning, and any claim of clinical validity. Say in the README that CareLens is a screening aid and would need clinical validation and legal review before use with real patients.

**Start now with Stage 0 only. When it is done, show the plan and the gate evidence, then stop and wait for confirmation.**
