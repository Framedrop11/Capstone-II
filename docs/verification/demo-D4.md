# D4 demo hardening verification

Status: implementation and selected local checks completed; the Kubernetes runtime HPA gate remains pending. This report records only evidence observed during D4 work and does not claim a live cluster drill.

## Implemented

- Report reads coordinate cache misses through a Redis lock with a bounded wait, a cache recheck, and compare-and-delete lock release. Cache/Redis failure remains fail-open. A two-cache-instance integration test covers the cross-instance path.
- Authenticated patient, doctor, and admin API routes send `Cache-Control: no-store`; API E2E assertions cover patient report and doctor notification reads.
- Prometheus routes alerts to a local Alertmanager. Alertmanager delivers email to Mailpit and suppresses warning notifications when a page alert is active.
- `scripts/backup-restore-demo.ps1` creates a gzip Mongo archive and provides a restore drill into a temporary database, verifies document counts, then removes the temporary database. `.backups/` is gitignored.
- Staging alone patches the core API and worker HPA thresholds for a visible demo. Development and production overlays do not include the staging patch.
- `tests/load/staging-smoke.js` retains the health scenario and adds a bounded questionnaire-submit → scoring-status → report-read journey scenario. Login happens once in setup so the test respects the API's per-IP rate limit.

## Observed evidence

- TypeScript typecheck, ESLint, and test compilation passed during D4 implementation.
- Focused report-cache and observability tests passed: 5/5, including the cross-instance lock and no-cache safety checks.
- Staging Kustomize rendered successfully and included the demo HPA patch.
- Backup/restore drill restored 106 documents from 106 source documents; the temporary restore database was dropped.
- Alert delivery probe reached Mailpit; one email arrived with subject `[CareLens FIRING] CareLensD4DeliveryProbe`.
- Bounded k6 journey smoke completed 10 iterations / 39 requests with 0% failed requests. Aggregate HTTP p95 was 62.96 ms; questionnaire submit p95 63.41 ms; report read p95 33.22 ms. Checks passed. This is a smoke-load result, not a capacity or autoscaling test.

## Pending / limitations

- The API E2E command was started again for the added `no-store` assertions, but did not produce test results in this session and was stopped. Treat the latest assertion additions as not rerun-verified.
- Docker Desktop's engine pipe and the configured Kubernetes API were unreachable during final checks. No live HPA scale-up/scale-down, pod failure/recovery, or node failure drill is verified.
- The staging HPA patch is rendered configuration only. A live cluster with metrics-server and sufficient capacity is required to demonstrate scaling.
- No high-load stress test was run. The rate limiter constrained the bounded k6 journey and must be accounted for when designing a separately approved load test.
- D2 browser/real Google sign-in remains pending. D3 implementation and automated ML checks are now recorded in `demo-D3.md`; live ramp/rollback observation remains pending. D4 evidence does not close those gates.

## Reproduction commands

```powershell
kubectl kustomize infra/k8s/overlays/staging
.\scripts\backup-restore-demo.ps1 -Mode backup
.\scripts\backup-restore-demo.ps1 -Mode verify-restore
docker run --rm --network carelens_default `
  -e BASE_URL=http://core-api:3000 `
  -e SCENARIO=journey -e VUS=2 -e ITERATIONS=10 `
  -v "F:/Projects/Capstone II/tests/load:/scripts:ro" `
  grafana/k6:0.52.0 run /scripts/staging-smoke.js
```
