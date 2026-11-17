# UI stage U7 verification

U7 adds the production frontend container and its Compose, Kustomize, and CI/CD wiring. The U7 gate **passed**. Kubernetes cluster deployment and GitHub-hosted workflow execution are not part of this local verification.

## Changes

- Added a multi-stage Node 22 build and NGINX 1.30.6 Alpine runtime. NGINX runs as UID 101 on port 8080 with a read-only root filesystem compatible with the Kustomize pod security context.
- NGINX serves the SPA with history fallback, gzip, immutable hashed assets, no-store HTML/runtime config, health endpoints, same-origin `/api/` proxying, and CSP, frame, referrer, MIME, and permissions headers.
- Runtime `config.js` is generated at container start from `CARELENS_ENVIRONMENT`; the API base uses the current origin so refresh cookies remain same-origin.
- Compose now starts the frontend at port 8080 by default. `FRONTEND_HOST_PORT` can change the host port.
- Kustomize now includes the frontend Deployment, Service, HPA, PDB, probes, resource requests/limits, non-root security context, `/tmp` volume, ingress routes, and network policies. Frontend-to-API traffic is allowed through the default-deny policies.
- CI builds and scans the frontend image. Dev deployment publishes and promotes an immutable image digest; staging and production workflows deploy it with the API and ML images. Existing PR manifest checks include the new resources.
- Added a 220 KiB total and 120 KiB per-file gzip bundle budget to frontend verification.

## Verification

- `npm run fe:verify` — passed: lint, Prettier, type check, 12 test files / 22 tests, contrast, production build, and bundle budget. Compressed JS/CSS total: 176.4 KiB of 220 KiB.
- `docker build -f frontend/Dockerfile -t carelens-frontend:stage7 .` — passed. The final image includes Alpine `libxslt` 1.1.43-r4 and `zlib` 1.4-r0 updates.
- Final-image Trivy scan (`--scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1`) — passed: zero high or critical vulnerabilities. An earlier scan found three fixed `libxslt` findings; the runtime package upgrade cleared them.
- Container runtime smoke — passed with UID/GID 101 and a fresh writable `/tmp` mount: `/`, `/config.js`, and `/healthz` returned 200; `nginx -t` passed; the Docker health status was `healthy`; security headers were present; runtime environment was injected into `config.js`.
- Compose — `docker compose --env-file .env.example -f infra/docker/docker-compose.yml up -d --no-deps frontend` passed with `FRONTEND_HOST_PORT=18081` because host port 8080 was occupied. The frontend health and static routes passed. A contract-valid `POST /api/v1/auth/refresh` traversed NGINX to the live API and returned the expected 401 because the request had no refresh cookie.
- `kubectl kustomize` on `infra/k8s/base` and the dev, staging, and prod overlays — passed.
- `actionlint` on the repository workflows — passed after fixing shellcheck output-append style findings.
- GitHub workflow YAML parse — passed for frontend checks and dev/staging/prod deploy workflows.
- `git diff --check` — passed.

The local container/image, Compose service, and generated Kustomize output were exercised. No cluster credentials or live Kubernetes cluster were used; CI contains the kubeconform schema validation and image scan steps for those deployment gates.
