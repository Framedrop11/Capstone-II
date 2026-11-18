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
2. Create GitHub Environments named `dev`, `staging`, and `production`; put a `KUBECONFIG` secret scoped to each environment. Each deploy workflow reads `secrets.KUBECONFIG` from its selected environment. Require reviewers for `production` in the environment's protection rules.
3. Set `STAGING_BASE_URL` as an environment variable for `staging`.
4. Create the Kubernetes runtime and TLS Secrets described in `docs/ENVIRONMENTS.md` outside of Actions. Create the `ghcr-pull` imagePullSecret in each cluster when GHCR packages are private. Grant the environment-specific kubeconfig only the deployment permissions it needs.
5. Ensure the repository can publish GHCR packages with its `GITHUB_TOKEN`.

The staging workflow checks out the exact source SHA from the successful `Build and deploy dev` run before applying its manifests. It downloads the immutable image digest artifact from that same run. This keeps the deployed manifest revision and application images tied to one build. Deployment workflows are not proof of a working cluster until the environment secrets, namespaces, external dependencies, and protected environments are configured and a hosted run succeeds.

## D6 manual gate setup and evidence

Before enabling deploy environments, authenticate the GitHub CLI locally and confirm the configured `origin` repository is the intended public repository. Configure the three GitHub Environments and the repository/package settings above. Use the Actions page to run the PR checks on a review branch first. Verify that the image build publishes three GHCR packages and produces the `image-digests` artifact, then configure the `dev` kubeconfig and run the deployment. Only after dev succeeds should the staging environment receive its kubeconfig and `STAGING_BASE_URL`.

For a visible gate demonstration, use a disposable PR that intentionally introduces a manifest schema error, confirm the `OpenAPI and Kubernetes validation` job fails, then revert the deliberate error and confirm the corrected commit passes. Do not inject failures into `main`, a deployment branch, or a live cluster. Capture workflow run links, digest artifact contents, rollout output, and the staging smoke/browser/load/security results as D6 evidence.

## Current limits

The local/staging ML service now has an automatic inference canary controller with staged traffic, health thresholds, rollback, and admin visibility. It is separate from Kubernetes/GitHub deployment rollout: model artifact publishing, hosted workflow evidence, production approvals, and AKS deployment still need D6/D8 setup. The full browser journey is still pending. Staging CI checks and GitHub-hosted environment approvals have not been exercised from this local checkout; deployment requires the repository and cluster configuration above.
