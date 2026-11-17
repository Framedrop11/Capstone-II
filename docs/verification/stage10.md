# Stage 10 verification — GitHub Actions

Date: 2026-11-14

## Built

- Expanded pull request checks for lint, type-check, unit and integration tests, Python tests, Spectral, oasdiff, Kustomize/kubeconform, actionlint, Gitleaks, and npm dependency audit.
- Added the main-branch build pipeline: Node and ML images are built, Trivy-scanned, pushed to GHCR with SHA tags, and recorded by digest; successful builds deploy to the `dev` GitHub Environment.
- Added automatic staging promotion from the built image digests, with rollout checks, API health smoke, a short k6 profile, and ZAP baseline scan.
- Added a manually dispatched production deployment that accepts image digests, uses the protected `production` Environment, and undoes Deployment rollouts after a failed release.
- Made deployment ordering explicit: workflows apply shared configuration and the migration Job first, wait for migration completion, then apply the full overlay and wait for rollouts.
- Added CodeQL analysis for JavaScript/TypeScript and Python, plus a deterministic ML promotion-gate workflow.
- Added `.spectral.yaml`, `tests/load/staging-smoke.js`, and `docs/CI_CD.md` with the required repository settings and environment secrets.
- Fixed the OpenAPI `Error.details` array schema after Spectral reported a missing `items` declaration. Added ESLint globals for the existing mongosh init script and the new k6 script.

## Commands and results

- `npm run verify` — exit 0: lint, type-check, and all 25 unit tests passed. The first sandboxed run could not bind loopback for three HTTP tests; the escalated rerun with local socket access passed.
- `npm run test:integration` — exit 0: all 9 integration tests passed across audit permissions, auth sessions, API contract, worker processing/recovery, ML service/registry, and report cache.
- `services/ml-service/.venv/Scripts/python.exe -m pytest -q services/ml-service/tests` — exit 0: 6 passed.
- `npx --yes @stoplight/spectral-cli@6.17.0 lint --ruleset .spectral.yaml services/core-api/openapi/openapi.yaml` — exit 0: 0 errors; 25 warnings remain for missing operation descriptions and contact metadata.
- Local YAML parsing of every workflow and `.spectral.yaml` — passed.
- `docker run --rm -v "${PWD}:/repo" --workdir /repo rhysd/actionlint:1.7.12` — exit 0 on the final workflow files.
- Local YAML parser — 7 workflow/config files passed.
- `docker run --rm -v "${PWD}:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 detect --source=/repo --redact` — exit 0: 6 commits scanned, no leaks found.
- `kubectl kustomize` rendered the base and all three overlays successfully.
- The model-gate baseline training command succeeded; candidate training with `--c 0.5` correctly returned exit 2 and reported that tied AUC is ineligible.

## Gate limits and known gaps

- This checkout has no Git remote or GitHub Actions run context, so the workflow jobs, GHCR publishing, Environment approval, Trivy, npm audit, CodeQL, oasdiff comparison, kubeconform schema validation, and cluster deployments could not be exercised as hosted workflows. Configure the environments/secrets listed in `docs/CI_CD.md` before enabling deployment.
- Spectral reports 25 warnings but no errors. Add operation descriptions and API contact metadata in a later contract cleanup.
- Staging has health smoke, k6, and ZAP checks, but the full user-journey E2E suite remains Stage 11 work. Production rollout undo is configured; automatic canary ramp/rollback remains unimplemented from the Stage 5 gap.
- Production manual approval depends on required reviewers being configured on the GitHub `production` Environment.

## Gate

**Stage 10 workflow definitions and local checks are complete, but the hosted CI/CD gate is not runtime-verified.** GitHub repository access and deployment environment credentials are not configured in this checkout. Stage 11 has not started.
