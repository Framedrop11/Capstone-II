# D6 GitHub CI/CD and cluster proof

Status: Workflow implementation is prepared; hosted evidence is pending. No GitHub login, workflow dispatch, push, cluster credential, or deployment was performed in this stage.

## Prepared

- Existing PR workflows cover application checks, API compatibility, Kubernetes manifest schemas, secret scanning, dependency audit, frontend browser checks, image scanning, and the ML promotion gate.
- The main-branch build publishes Core API/worker, ML, and frontend images to GHCR and records immutable digest references as the `image-digests` artifact.
- Dev and staging deployments consume digests. Staging now checks out the exact `workflow_run.head_sha` associated with those digests, avoiding a manifest/image source revision mismatch.
- Production deployment is manually dispatched with validated digest-shaped inputs and uses the `production` GitHub Environment, which can require reviewer approval.
- CI/CD setup documentation now uses the actual environment-scoped secret name, `KUBECONFIG`, consistently.
- A safe negative-gate demonstration is documented for a disposable PR; it must not be run against `main` or a live deployment.
- Added an on-demand/PR three-node Kind workflow. It deploys a disposable stateless workload, stops one worker node container, and checks whether the remaining worker restores all three replicas. This proves basic scheduler recovery only; it does not deploy CareLens or prove AKS behavior.

## Required manual evidence

1. Authenticate GitHub CLI and confirm the `origin` repository and public visibility.
2. Configure `dev`, `staging`, and `production` GitHub Environments, each with an appropriately scoped `KUBECONFIG`; set staging `STAGING_BASE_URL`; require a production reviewer; verify GHCR package publishing.
3. Open a review PR and confirm required CI jobs pass. Use a separate disposable PR to show a deliberate Kubernetes schema failure blocks the gate, then revert it and confirm a successful run.
4. Merge only after branch protection requires the intended checks. Capture the build run, image digest artifact, and successful dev rollout.
5. Confirm staging deploy uses the same source SHA and image digests, then capture API health, browser, k6, and ZAP outputs.
6. Configure production credentials and perform an approval-gated dispatch only after production infrastructure is provisioned and reviewed.

To run the independent three-node Kind proof after pushing this branch, use the GitHub Actions page → `Kind cluster proof` → `Run workflow`, or let a PR touching `infra/k8s/kind/**` trigger it. Expect three Kind nodes before the drill, one worker to become NotReady, and three available replicas afterward. Save the job log as evidence. A successful run is not an application or cloud-cluster deployment proof.

Current blockers: GitHub CLI authentication, branch protection, environment secrets/reviewers, GHCR package settings, published image digests, and a live cluster are unverified or unavailable. AKS provisioning remains a separate D8 task requiring region, node shape, cost estimate, teardown plan, credentials, and explicit approval.

See `docs/CI_CD.md` and `docs/MANUAL_INPUTS.md` for setup details. Do not report D6 as hosted-verified until the evidence above exists.
