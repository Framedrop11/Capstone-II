# CareLens demo completion plan

Status: D0 passed; D1 blocked at entry because Docker Desktop’s Linux engine is unavailable. This plan is not evidence that deployment or runtime gates have passed. See `docs/MANUAL_INPUTS.md` and the reports under `docs/verification/demo-D*.md` for input state and observed results.

## Known gaps mapped to stages

| Known gap | Planned closure | Evidence required |
| --- | --- | --- |
| Local three-node kind startup failed during kubeadm init | D5, D6, D8 | Local or hosted 3-node cluster evidence; `kubectl get nodes`; pod spread and failure/recovery drills |
| Kubernetes base expects external Mongo/Redis and omits a complete demo monitoring/ingress stack | D5 | Rendered staging and production overlays; schema validation; installed ingress, metrics-server, Mongo replica set, two Redis services, Prometheus/Grafana |
| Swagger and latest UI changes have not been rebuilt in running containers | D1, D7 | Compose smoke for `/docs` and `/api/docs`; built frontend and live UI checks |
| Full Chrome/Firefox desktop/mobile path and Lighthouse are incomplete | D2, D6, D9 | Browser matrix, zero console/network errors, axe and Lighthouse output |
| CI/CD workflow definitions have no hosted-run evidence or published image digests | D6 | Green hosted CI, GHCR digest evidence, staging deployment, approval-gated production deployment, deliberate failing-gate proof |
| Automatic model canary ramp/rollback is absent | D3, D6, D8 | Good model reaches 100%; bad model rolls back; audit entries and admin screen evidence |
| HPA is CPU-only at 70%, unsuitable as a visible demo trigger | D4, D5, D8 | Staging-only demo HPA configuration and observed scale-up/scale-down under measured workload |
| k6 evidence only covers health/readiness at 2 VUs for 30 seconds | D4, D6, D9 | Questionnaire-submit → status-poll → report-read load results with thresholds and resource charts |
| Cache single-flight is process-local; alert delivery is not configured; notification adapters log; backup/restore is absent | D4, D5, D8, D9 | Redis lock/stampede test, firing/delivered alerts, visible local email inbox, successful backup/restore drill |
| Existing worktree contains numerous user changes | D0 | Snapshot tag, `demo-rc` branch, secret scan, logical commits, clean post-commit status |

## Stages and gates

| Stage | Scope | Gate |
| --- | --- | --- |
| D0 | Orientation, safety, manual-input ledger, demo plan, environment ADRs, tool inventory | Safety snapshot/branch; secret scan; inputs/plan/ADRs recorded; existing work committed in logical chunks; stop |
| D1 | Truthful local Compose stack | Build all images; unit, integration, API E2E, ML tests; smoke every service, docs, mock sign-in, submit-to-report |
| D2 | Golden patient → doctor → admin journey | API and browser journey with mock IdP, then one manually verified real Google localhost sign-in |
| D3 | Deterministic canary controller | Good canary advances to 100%; bad canary rolls back; decisions audited and visible; production disables demo fixtures |
| D4 | Demo hardening | Redis coordination, no-store responses, backup/restore, alerts, staging-only demo HPA and drills |
| D5 | Deployable `staging` and `production` Kubernetes overlays | Kustomize and kubeconform pass; resource-fit calculation; runtime test if local cluster permits |
| D6 | Hosted GitHub CI/CD and repeatable cluster proof | Green hosted jobs; 3-node kind CI run; digest deployment; deliberate failure blocks a gate |
| D7 | Vercel frontend and same-origin API rewrite | Live API proxy, cookie/refresh round trip, headers, and no edge caching of authenticated responses |
| D8 | Selected cluster provider, tunnel, live system | Explicit cost approval first; 3+ ready nodes; live journey and cluster drills pass |
| D9 | Final verification and demo pack | Load/browser/security/resilience evidence, runbook, evidence index, gap table and teardown instructions |

## Sequencing and safety

- Work one stage at a time. Do not start D1 until D0 is reported and explicitly continued.
- Cloud provisioning is blocked until provider, region, node shape, estimated cost basis, and teardown command are reviewed and the user explicitly confirms.
- Use placeholders exactly as `<<MANUAL:NAME>>`; do not fabricate public inputs or request secrets in chat.
- Describe the result as a production-shaped demo. Do not claim clinical validation, production readiness, or runtime success without measured evidence.
- Current machine profile supplied by the user: 7.73 GiB RAM, 12th Gen Intel Core i3-1215U, 6 cores; local runtime reports Windows build 10.0.26300. Its local cluster capacity remains unverified.
- Current D0 input state and environment choices are recorded in `docs/MANUAL_INPUTS.md` and `docs/adr/0013-demo-environment-targets.md` through `docs/adr/0020-demo-resource-fit.md`.
