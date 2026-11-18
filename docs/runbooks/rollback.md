# Deployment rollback runbook

1. Stop or pause promotion when health checks, error rate, latency, queue backlog, or ML fallback alerts breach the release thresholds.
2. For an application regression, redeploy the previous known-good Core API, worker, and ML image digests as a compatible set. Keep the same MongoDB data and Redis instances.
3. If a model candidate caused the issue, use the admin model-version rollback operation to restore the prior stable version and set canary traffic to zero. Verify the worker's `modelVersion`, fallback ratio, and score distribution afterward.
4. Do not run `docker compose down -v` or drop MongoDB volumes during a service rollback. Compose rollback uses the prior image tags and `docker compose up -d`; schema migrations are forward-only unless a reviewed migration explicitly provides a safe down operation.
5. Verify `/healthz`, `/readyz`, `/metrics`, Prometheus targets, Grafana alerts, login, and a synthetic questionnaire flow. Record the deploy digest, correlation IDs, alert timeline, and recovery time.
6. Reopen promotion only after the cause is understood and the rollback window has remained healthy.

For local development, `docker compose -f infra/docker/docker-compose.yml down` preserves volumes. `docker compose ... down -v` is a destructive data reset and should only be used when intentionally discarding the local stack.

## Kubernetes

Render the target overlay and redeploy the previous immutable image digests. Apply the namespace, ConfigMap, service account, and migration Job first, wait for migration completion, then apply the full overlay. Check rollout status for `core-api`, `worker`, and `ml-service`, then verify API readiness and Prometheus targets. Keep MongoDB data and restore the prior immutable ML image digest, which contains its model artifacts. Keep schema migrations forward-only during an application rollback.
