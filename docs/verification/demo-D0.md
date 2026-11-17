# Demo completion D0 verification

Date: 2026-11-17

Status: **D0 passed.** The plan, input ledger, ADRs, safety tag, branch, secret scan, and logical commits are complete. M01 was provided and configured locally; repository visibility and emptiness were not independently verified. No push or cloud provisioning occurred.

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
- `gitleaks git . --log-opts="--all" --redact --no-banner` (with repository process access) — **passed**: 10 commits scanned; no leaks found. A subsequent final scan after the D0 verification commit is recorded below.
- `gitleaks git . --staged --redact --no-banner` — no staged leaks found before the logical commits.
- `gitleaks dir . --redact --no-banner` — found 13 matches in the current working tree: one in ignored local `.env` (`GOOGLE_CLIENT_SECRET`, value not printed) and 12 generic-api-key matches in the local `services/ml-service/.venv` dependency test sources. These paths are excluded from Git; build/test artifacts under `services/ml-service/target/` were also excluded by a new ignore rule. The local `.env` was preserved and never staged.
- Placeholder check using `rg -n --hidden -g '!**/.git/**' -g '!**/.venv/**' -g '!**/node_modules/**' '<<MANUAL:' .` — remaining matches are the manual-input ledger and the demo plan/ADRs documenting inputs required by later stages. No placeholders were found in application source or deployment configuration. Later-stage placeholders remain intentionally documented until those inputs are collected.
- Existing work was committed locally in logical chunks. No user files were reset or cleaned. `git status --short` is empty on `demo-rc`.

## Manual inputs

- M05: verified from user-provided PowerShell output; recorded in `docs/MANUAL_INPUTS.md` and ADR-0020.
- M06: user selected AKS; recorded in ADR-0013 and `docs/ENVIRONMENTS.md`. No Azure credentials or resources were requested or created.
- M01: user provided `https://github.com/Framedrop11/Capstone-II.git`; configured as local `origin`. The remote was not contacted and no push occurred. Public visibility and emptiness are not independently verified. M02 GitHub authentication is deferred to D6.

## Gate

**Passed.** Safety tag `pre-demo-snapshot` exists, branch `demo-rc` is clean, all current work was committed locally, the full-history scan passed, and the plan/ledger/ADRs are recorded. Commits: `d1e58bb` (docs/architecture), `6f34e88` (frontend), `d9d5873` (API/ML), `96c385d` (infrastructure/CI); the final D0/D1 report update follows.

## Final post-commit history scan

After the report update was committed, Gitleaks scanned all refs/history again: 11 commits scanned, approximately 1.5 MB, no leaks found. Output was redacted.
