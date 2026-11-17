# GitHub Actions setup

## Workflows

- `pr-checks.yml` runs lint, type-check, unit, Python, and integration tests; Spectral and oasdiff API checks; Kustomize/kubeconform validation; Gitleaks; and `npm audit`.
- `build-and-deploy-dev.yml` builds and scans the Node and ML images, publishes SHA-tagged images to GHCR, records their immutable digests, and deploys the same digests to `dev`.
- `deploy-staging.yml` promotes the digests from a successful `main` run, waits for rollout, runs API health smoke, a small k6 profile, and a ZAP baseline scan.
- `deploy-production.yml` accepts digest references through manual dispatch and uses GitHub's `production` Environment for approval and deployment secrets.
- `model-gate.yml` runs the ML tests, trains the fixed-holdout baseline, and confirms a tied/worse candidate is rejected.
- `codeql.yml` runs JavaScript/TypeScript and Python analysis on pull requests, main pushes, and weekly schedule.

All workflows use read-only token permissions by default and request package or code-scanning permissions only in the jobs that need them. Images are promoted by digest; branch and version tags are for discovery.

## Repository configuration

1. Protect `main` and require the PR checks, CodeQL, and model-gate status checks.
2. Create GitHub Environments named `dev`, `staging`, and `production`; put a `KUBECONFIG` secret scoped to each environment. Require reviewers for `production` in the environment's protection rules.
3. Set `STAGING_BASE_URL` as an environment variable for `staging`.
4. Create the Kubernetes runtime and TLS Secrets described in `docs/ENVIRONMENTS.md` outside of Actions. Create the `ghcr-pull` imagePullSecret in each cluster when GHCR packages are private. Grant the environment-specific kubeconfig only the deployment permissions it needs.
5. Ensure the repository can publish GHCR packages with its `GITHUB_TOKEN`.

## Current limits

The full user-journey E2E suite and production canary controller are not implemented yet (Stage 11 and the known Stage 5 gap). Staging currently checks health, a short read-only k6 profile, and passive ZAP baseline results. Production rollout undo is wired, but automated canary ramp/rollback is not. GitHub-hosted workflow runs and environment approvals have not been exercised from this local checkout; deployment requires the repository and cluster configuration above.
