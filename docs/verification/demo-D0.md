# Demo completion D0 verification

Date: 2026-11-17

Status: **D0 incomplete; stop here.** The orientation plan, input ledger, ADRs, safety tag, and branch are present. Required Gitleaks history scan and logical commits are not complete. M01 was provided and configured locally; repository visibility and emptiness are not independently verified. No D1 work has started.

## Work completed

- Read the demo-completion prompt and inspected the repository, environment docs, Kubernetes manifests, workflows, verification reports, `.gitignore`, and working tree.
- Created `docs/DEMO_PLAN.md`, `docs/MANUAL_INPUTS.md`, ADR-0013 through ADR-0020, and documented the target demo deployment in `docs/ENVIRONMENTS.md`.
- Added ignore rules for `.secrets/`, root logs/reports, kind exports, and Vercel metadata.
- M05 received from the user: 7.73 GiB RAM; 12th Gen Intel Core i3-1215U with 6 cores. The execution runtime reports Windows build 10.0.26300; display edition was not available.

## Commands and observed results

- `git status --short` before D0 edits — 39 modified tracked files and 176 untracked path lines were present. Existing changes were preserved.
- `git tag -a pre-demo-snapshot -m "Snapshot before CareLens demo completion"` — first sandbox attempt could not write `.git/objects`; rerun with approved repository-metadata access succeeded. `git tag --list pre-demo-snapshot` lists the tag. The tag captures the prior committed HEAD; uncommitted files remain on the branch/worktree and are not contained in the tag.
- `git switch -c demo-rc` — `Switched to a new branch 'demo-rc'`.
- `git branch --show-current` — `demo-rc`.
- `git remote -v` — no output; no remote is configured.
- Tool inventory — available: Git, Docker CLI, kubectl, Node, Python. Missing: `gh`, `kind`, `k3d`, `helm`, standalone `kustomize`, `vercel`, `az`, `gcloud`, `cloudflared`, GNU Make, and Gitleaks.
- `docker version --format '{{.Client.Version}} / {{.Server.Version}}'` — Docker client `29.9.3`; server unavailable because `//./pipe/dockerDesktopLinuxEngine` does not exist.
- `kubectl config get-contexts` — header only; no Kubernetes context is configured.
- `git check-ignore -v .secrets/demo.env logs/demo.log reports/demo.txt kind-export/demo.yaml kind-exports/demo.yaml .vercel/project.json` — all sample paths matched the intended ignore entries.
- Machine inventory `Get-CimInstance Win32_ComputerSystem` — denied by the restricted host API; hardware numbers above were supplied directly by the user. Runtime OS string was `Microsoft Windows 10.0.26300`.
- Gitleaks full-history scan — **not run**: executable unavailable and Docker daemon is not running. No full-history secret-scan result is claimed.
- Existing work has not been committed. Without a Gitleaks scan and review of the broad pre-existing working tree, committing it would violate the prompt’s secret-safety gate. No files were reset or cleaned.

## Manual inputs

- M05: verified from user-provided PowerShell output; recorded in `docs/MANUAL_INPUTS.md` and ADR-0020.
- M06: user selected AKS; recorded in ADR-0013 and `docs/ENVIRONMENTS.md`. No Azure credentials or resources were requested or created.
- M01: user provided `https://github.com/Framedrop11/Capstone-II.git`; configured as local `origin`. The remote was not contacted and no push occurred. Public visibility and emptiness are not independently verified. M02 GitHub authentication is deferred to D6.

## Gate

**Not passed.** Gitleaks and committing the existing work in logical chunks remain outstanding. Docker/Kubernetes runtime verification is unavailable until Docker Desktop’s Linux engine is running and a cluster/provider is configured. D0 has not advanced to D1.
