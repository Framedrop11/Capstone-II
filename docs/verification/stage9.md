# Stage 9 verification — Kubernetes

Date: 2026-11-13

## Built

- Kustomize base and `dev`, `staging`, and `prod` overlays with API, worker, ML deployments/services, NGINX Ingress/TLS, resource requests and limits, startup/readiness/liveness probes, topology spread, HPAs, and PDBs.
- Default-deny network policies. API and worker roles may reach private MongoDB and Redis ports; only workers may reach the ML service; ML may reach cache Redis. DNS, ingress, metrics scraping, and API public HTTPS egress are explicit exceptions.
- Migration Job, scheduled retraining CronJob, shared model-artifact PVC, ConfigMap, and a Secret template that is not included by Kustomize.
- Updated the ML image build context to include its fixed benchmark dataset, required by the scheduled retraining command.
- Added Kubernetes deployment and rollback notes to `docs/ENVIRONMENTS.md` and `docs/runbooks/rollback.md`.

## Commands and results

- `kubectl version --client` — passed: client v1.32.2, Kustomize v5.5.0.
- `kubectl kustomize infra/k8s/base` — passed.
- `kubectl kustomize infra/k8s/overlays/dev` — passed.
- `kubectl kustomize infra/k8s/overlays/staging` — passed.
- `kubectl kustomize infra/k8s/overlays/prod` — passed.
- `docker compose --env-file .env.example -f infra/docker/docker-compose.yml config --quiet` — passed after changing the ML build context.
- `docker compose --env-file .env.example -f infra/docker/docker-compose.yml build ml-service` — passed; the image included `ml/data/uci-early-stage-diabetes.csv`.
- `git diff --check` — exit code 0 (Git emitted line-ending conversion notices for existing modified files).
- `kubectl apply --dry-run=client --validate=false -k infra/k8s/overlays/dev` — could not validate: no Kubernetes context is configured, so kubectl attempted `localhost:8080` and the connection was denied. No cluster is available for runtime verification.

## Known gaps and deployment requirements

- The automatic canary ramp/rollback controller remains unimplemented, as documented in Stage 5. No placeholder CronJob was added. Nightly rescoring is scheduled by the worker's BullMQ scheduler; it is not duplicated with a Kubernetes CronJob.
- The retraining CronJob registers an artifact in the shared RWX PVC, but automatic health-based canary promotion is not wired to that artifact. Manual promotion and rollback remain available through the admin API.
- A Kubernetes API schema validator (`kubeconform`) and cluster were unavailable, so only Kustomize parsing/rendering was verified. Replace the example registry image/tag values and `.invalid` hostnames, provide `carelens-runtime` and `carelens-tls` Secrets, configure private managed-service endpoints and a ReadWriteMany storage class, and use an enforcing CNI plus NGINX Ingress before deployment.

## Gate

**Stage 9 manifests render for all three overlays, but the full stage gate is not passed.** Runtime/schema validation could not run without a cluster, and the automatic canary controller remains a known gap. Stage 10 has not started.
