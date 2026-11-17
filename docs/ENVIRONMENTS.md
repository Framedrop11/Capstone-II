# Environments

CareLens reads runtime configuration from environment variables. Do not commit `.env` files or copy local development credentials into shared environments. `.env.example` contains local-only demonstration values and is not a production secret store.

| Profile   | Authentication                                   | Database and services                                        | Intended use                             |
| --------- | ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------- |
| `local`   | Google OIDC by default; mock available for E2E   | Docker Compose MongoDB replica set, queue Redis, cache Redis | Local development and browser testing    |
| `dev`     | Google OIDC credentials                          | Isolated development database and Redis services             | Shared integration development           |
| `staging` | Google OIDC credentials; HTTPS redirect required | Isolated staging data/services                               | Release verification with synthetic data |
| `prod`    | Google OIDC credentials; HTTPS redirect required | Production-managed database and separate Redis services      | Production deployments                   |

The Core API requires `CARELENS_ENV`, `AUTH_PROVIDER`, `OIDC_REDIRECT_URI`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_SIGNING_SECRET`, `OIDC_TRANSACTION_KEY`, `MONGODB_URI`, `QUEUE_REDIS_URL`, and `CACHE_REDIS_URL`. Mock OIDC is refused in `staging` and `prod`. Google credentials are mandatory when `AUTH_PROVIDER=google`.

The worker requires `MONGODB_URI`, `MONGODB_DATABASE`, `QUEUE_REDIS_URL`, and `CACHE_REDIS_URL`; `ML_SERVICE_URL` enables refinement. The ML service requires a valid stable artifact at `ML_STABLE_MODEL_PATH`; `CACHE_REDIS_URL` enables result caching. Prometheus targets Core API `:3000`, worker `:9464`, and ML service `:8000`.

## Local Compose

Copy `.env.example` to `.env`, replace the local-only passwords and Google OAuth client placeholders, and run `make up`. Add `http://localhost:18082/api/v1/auth/callback` to the Google OAuth client's authorized redirect URIs. Compose starts MongoDB 7 as a single-node `rs0` replica set, initializes the set, runs schema migrations with the migration identity, then starts the runtime services. The frontend is served at `http://localhost:18082`; its NGINX container proxies `/api/` to the Core API to keep auth cookies same-origin. MongoDB application access uses the least-privilege `carelensApplication` account created by the migration. The queue Redis uses `noeviction`; cache Redis uses `allkeys-lru`.

`make seed` creates synthetic patient, doctor, and administrator mock identities for local browser testing. No real patient data is included. To use those accounts instead of Google, set `AUTH_PROVIDER=mock` in `.env`; role selection then appears on the local sign-in page. Local HTTP cookies omit the `Secure` attribute so localhost can refresh its session; staging and production cookies retain `Secure`, `HttpOnly`, and `SameSite=Strict`.

The OIDC callback URL must use the same public origin as the frontend. The Compose default is `http://localhost:18082`; when changing `FRONTEND_HOST_PORT`, set `FRONTEND_PUBLIC_URL` to the matching host URL too. Port 8080 may be occupied by another local service; the CareLens default avoids that collision.

For the local Selenium matrix, start the test browsers with `docker compose --env-file .env -f infra/docker/docker-compose.yml --profile e2e up -d selenium-chrome selenium-firefox`, then run `npm run fe:e2e`. The default Selenium URL is `http://host.docker.internal:8080`; set `CARELENS_E2E_BASE_URL` when the frontend uses another port. `make down` preserves volumes; the destructive `docker compose down -v` removes local database and monitoring state.

## Promoting builds

Build once and tag each resulting container image with an immutable digest. Promote those same digests between `dev`, `staging`, and `prod`; change only environment configuration and managed secrets. Production secrets belong in the deployment secret manager, never in Compose files, image layers, or Git.

## Kubernetes overlays

Kustomize overlays live in `infra/k8s/overlays/{dev,staging,prod}`. Replace the example GHCR image names and tags in the overlay with the same immutable image digests for every environment before promotion. Create the `carelens-runtime` Secret from your secret manager; the template file `infra/k8s/secret-template.yaml.example` lists required keys and is not included in any Kustomize overlay. Create the `ghcr-pull` imagePullSecret if the GHCR packages are private, and provision a TLS Secret named `carelens-tls`. The MongoDB and Redis URLs must point to private endpoints; network policies only permit their expected ports from API/worker roles, and the ML service can reach only cache Redis. The cluster must provide a `ReadWriteMany` storage class for shared model artifacts.

The migration Job is annotated as an Argo CD `PreSync` hook. For plain kubectl, first apply the namespace, ConfigMap, service account, and migration Job from the rendered overlay; wait for `database-migrate` to complete, then apply the full overlay and wait for Deployments. The GitHub deployment workflows perform this split. A CNI that enforces NetworkPolicy and an NGINX Ingress controller are required. Replace the `.invalid` hostnames and configure external HTTPS egress for Google OIDC in the cluster firewall before enabling login.

GitHub Actions deployment, scanning, and approval configuration is described in `docs/CI_CD.md`.

## Demo deployment target (planned; not runtime-verified)

The intended live demo target is the Kubernetes `staging` namespace, with the Vercel frontend rewritten to its HTTPS API. Staging may enable synthetic demo accounts, demo-only timing, and Swagger UI. The `production` namespace is a separate approval-gated deployment with those demo features disabled, Swagger UI disabled, minimum replicas, and post-deploy smoke checks. See ADR-0013 and ADR-0014.

For the demo cluster, the current plan is an in-cluster single-member MongoDB replica set and two Redis instances (queue with `noeviction`, cache with LRU eviction). Production is expected to use a managed three-member MongoDB replica set and separate managed Redis instances. Public ingress is planned as `cloudflared` to an `ingress-nginx` ClusterIP Service, with TLS terminated by Cloudflare. AKS is the selected provider; Azure subscription, region, node shape, credentials, cost estimate, and teardown plan are pending for D8. Domain and Vercel host are also pending. The local host profile is 7.73 GiB RAM, 6 CPU cores, Windows build 10.0.26300, and local multi-node capacity has not been proven.

These are target decisions, not a claim that Vercel, Cloudflare, MongoDB/Redis cluster workloads, ingress, or any Kubernetes namespace currently exists. Before provisioning, calculate the full resource requests and present provider, region, node shape, cost basis, and teardown command for explicit approval. Manual inputs are tracked in `docs/MANUAL_INPUTS.md`.
