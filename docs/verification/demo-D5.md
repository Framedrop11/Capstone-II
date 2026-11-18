# D5 Kubernetes deployment preparation

Status: D5 overlay rendering and schema validation passed for the earlier manifest revision, but D5 is not deployment-ready. After that validation, the ML model-artifact PVC and CronJob were removed to implement ADR-0019 and the ML init-container was removed. Re-render and validate the current manifests before relying on this evidence. Required environment-specific inputs and infrastructure are not configured, and no live-cluster check was possible.

## Verified

- Before the ADR-0019 manifest change, `kubectl kustomize infra/k8s/overlays/dev` rendered 29 resources.
- `kubectl kustomize infra/k8s/overlays/staging` rendered 29 resources.
- `kubectl kustomize infra/k8s/overlays/prod` rendered 29 resources.
- Before the ADR-0019 manifest change, Kubeconform v0.6.7 validated the three rendered manifests: 87 resources found, 87 valid, 0 invalid, 0 errors, 0 skipped. This count and result do not certify the current manifests.
- Staging includes only its demo HPA patch; dev and prod do not. Staging HPA targets are core API CPU 25% (2–5 replicas) and worker CPU 30% (2–6 replicas). Base HPA targets for the other services remain 70%.
- No Kubernetes API was reachable, so no server-side dry run or runtime installation was attempted.

## App workload resource estimate

These sums use the CPU/memory requests in `infra/k8s/base` and overlay replica patches. They include the one-off database migration Job while it runs, but exclude Kubernetes system overhead and all external or not-yet-manifested dependencies.

| Profile | Core API | Worker | ML | Frontend | Migration Job | Peak declared app requests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| dev | 1 replica | 1 | 1 | 1 | 1 | 0.8 vCPU, 1,200 MiB |
| staging baseline | 2 | 2 | 2 | 2 | 1 | 1.5 vCPU, 2,272 MiB |
| staging at demo HPA maxima | 5 | 6 | 2 | 2 | 1 | 2.9 vCPU, 4,064 MiB |
| prod declared initial replicas | 3 | 3 | 3 | 2 | 1 | 2.15 vCPU, 3,296 MiB |

The staging maximum is only the application layer; it is not a node-sizing recommendation. MongoDB, two Redis instances, Prometheus, Grafana, Alertmanager, ingress-nginx, metrics-server, cloudflared, daemonsets, and system reservations need measured or vendor-documented requests before selecting AKS node sizes. The supplied laptop profile (7.73 GiB, 6 CPU cores) is not a valid AKS node capacity estimate.

## Deployment blockers to close before applying

- All four app image references still use `ghcr.io/example-org/...:replace-with-immutable-tag`; actual published immutable image digests are not recorded.
- The sample host is `.invalid`, TLS and GHCR pull secrets are absent, and runtime Secret values are placeholders. No credentials were printed or created.
- MongoDB and Redis are not included in the standard Kustomize overlays. Optional, unverified demo data manifests were added later under `infra/k8s/addons/demo-data`; they need secret creation, resource/schema validation, and runtime/backup testing before use.
- The current manifests expect the stable model artifact inside the immutable ML image at `/app/models`. The demo candidate fixture is excluded from image builds by default. Published image contents and runtime model loading have not been verified.
- Ingress-nginx, CNI enforcement, metrics-server, Prometheus/Grafana/Alertmanager, and Cloudflare tunnel are prerequisites but are not installed by these overlays.
- AKS region, node shape, subscription, cost basis, and teardown details remain pending. No cloud resources were created.

## Conclusion

D5 has completed overlay rendering, Kubernetes schema validation, and an app-only resource calculation for the previous manifest revision. The overlays now follow ADR-0019, but current render/schema validation and resource estimates still need to be rerun by the user. D5 has not met the deployable staging/production gate. Published images, provider sizing/approval inputs, dependency provisioning, and live cluster validation must be resolved before a deployment claim or a D6 cluster proof.
