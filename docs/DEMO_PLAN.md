# CareLens demo completion plan

Status: D0 and D1 passed locally. D2 API journey passes; browser journey and real Google sign-in are awaiting user verification. D3 controller implementation and 13 ML tests pass; user separately reports 3 focused rollback/production-refusal tests passed; live ramp/rollback observation remains pending. D4 implementation and selected checks are complete; its live Kubernetes HPA drill remains pending. D5 model image and inference manifests now follow ADR-0019; revalidate current overlays after the manifest changes. D6 workflow implementation now includes exact-SHA staging promotion and a three-node Kind worker-recovery proof; no hosted runs or GitHub configuration have been verified. D7 Vercel configuration is implemented, but project, API origin, domain, and Google callback setup plus runtime verification remain pending. D8 now has optional Mongo/Redis and Cloudflare Tunnel manifests outside automatic overlays; these are unvalidated and unverified. User selected Central India, Azure for Students credits only, an 8-hour run window, and no Cloudflare or Vercel domain/project. User reports full unused student credits, account newly created, and expiry far away; subscription is reported Enabled. D8 has a proposed three-node AKS Free plan with local port-forward access, a $15 USD maximum credit envelope, and isolated resource-group teardown. The filtered quota query returned no rows (inconclusive), and the AKS SKU query failed with an Azure identity-token error; rerun the unfiltered quota table and general Compute SKU query after refreshing Cloud Shell. Exact-envelope approval is pending. No Azure resources have been created and Pay-As-You-Go is not allowed. See `docs/MANUAL_INPUTS.md` and `docs/verification/demo-D*.md` for evidence and manual checks.

## Known gaps mapped to stages

| Known gap | Planned closure | Evidence required |
| --- | --- | --- |
| Local three-node kind startup failed during kubeadm init | D5, D6, D8 | Local or hosted 3-node cluster evidence; `kubectl get nodes`; pod spread and failure/recovery drills |
| Standard Kubernetes overlays use external Mongo/Redis and do not install the full demo monitoring/ingress stack | D5, D8 | Revalidate current overlays; review optional Mongo/Redis and Cloudflare manifests; install ingress, metrics-server, monitoring, and approved data services in AKS |
| Swagger and latest UI changes have not been rebuilt in running containers | D1, D7 | Compose smoke for `/docs` and `/api/docs`; built frontend and live UI checks |
| Full Chrome/Firefox desktop/mobile path and Lighthouse are incomplete | D2, D6, D9 | Browser matrix, zero console/network errors, axe and Lighthouse output |
| CI/CD workflow definitions have no hosted-run evidence or published image digests | D6 | Green hosted CI, GHCR digest evidence, staging deployment, approval-gated production deployment, deliberate failing-gate proof |
| D3 controller is implemented but running-demo ramp/rollback is unobserved | D3, D6, D8 | User verifies good fixture reaches 100%, bad fixture rolls back, admin history is visible, and prod rejects demo flags |
| HPA is CPU-only at 70%, unsuitable as a visible demo trigger | D4, D5, D8 | Staging-only demo HPA configuration and observed scale-up/scale-down under measured workload |
| k6 evidence only covers health/readiness at 2 VUs for 30 seconds | D4, D6, D9 | Questionnaire-submit → status-poll → report-read load results with thresholds and resource charts |
| Cache single-flight is process-local; alert delivery is not configured; notification adapters log; backup/restore is absent | D4, D5, D8, D9 | Redis lock/stampede test, firing/delivered alerts, visible local email inbox, successful backup/restore drill |
| Existing worktree contains numerous user changes | D0 | Snapshot tag, `demo-rc` branch, secret scan, logical commits, clean post-commit status |

## Stages and gates

| Stage | Scope | Gate |
| --- | --- | --- |
| D0 | Orientation, safety, manual-input ledger, demo plan, environment ADRs, tool inventory | Safety snapshot/branch; secret scan; inputs/plan/ADRs recorded; existing work committed in logical chunks; stop |
| D1 | Truthful local Compose stack | Build all images; unit, integration, API E2E, ML tests; smoke every service, docs, mock sign-in, submit-to-report |
| D2 | Golden patient → doctor → admin journey | API journey passes; browser journey has not passed; manually verify role-mapped Google login and the patient/doctor/admin story |
| D3 | Deterministic canary controller | Controller, admin visibility, and 13 ML tests implemented/passing; observe good candidate to 100%, bad candidate rollback, and production fixture refusal in the running demo |
| D4 | Demo hardening | Redis coordination, no-store responses, backup/restore, alerts, staging-only demo HPA and drills (implementation/selected checks recorded; live HPA drill pending) |
| D5 | Deployable `staging` and `production` Kubernetes overlays | Kustomize rendering and kubeconform pass for dev/staging/prod; app-only resource estimate recorded; dependency/image/secret provisioning, AKS sizing, and runtime checks pending |
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
