# Demo completion manual-input ledger

Secrets must be entered directly into the named local file, GitHub secret, Vercel setting, or cluster secret. Never paste secret values into chat or commit them. `provided` means a public value or choice has been supplied; `verified` means the planned use has been checked. `skipped` requires documenting the selected fallback.

| ID | What | Needed at stage | Status | Where stored | Verification |
| --- | --- | --- | --- | --- | --- |
| M01 | `<<MANUAL:GITHUB_REPO>>`, empty public repository owner/name | D0, D6 | provided; configured locally | Git remote `origin`: `https://github.com/Framedrop11/Capstone-II.git` | `git remote -v`; URL matches user input. Public visibility/emptiness not independently verified; no push |
| M02 | GitHub CLI authentication | D6 | pending | Local `gh` session | `gh auth status`; do not print tokens |
| M03 | GHCR package visibility set to public | D6 | pending | GitHub package settings | Inspect package visibility in GitHub |
| M04 | Required reviewer for GitHub `production` environment | D6 | pending | GitHub environment protection | Inspect required-reviewer setting |
| M05 | `<<MANUAL:HARDWARE_PROFILE>>` RAM, CPU, OS | D0 | verified | `docs/adr/0020-demo-resource-fit.md` | User supplied PowerShell output: 7.73 GiB RAM, Intel i3-1215U, 6 cores; local runtime reports Windows 10.0.26300 |
| M06 | `<<MANUAL:CLUSTER_PROVIDER>>` provider choice only in D0; credentials/region later | D0, D8 | verified: AKS | `docs/adr/0013-demo-environment-targets.md` | AKS recorded as the intended provider; no credentials or resource created in D0 |
| M07 | `<<MANUAL:DOMAIN_NAME>>`, Cloudflare account and named tunnel | D8 | pending | Local Cloudflare credentials and cluster Secret | `cloudflared tunnel info`; verify DNS and HTTPS routes |
| M08 | `<<MANUAL:GOOGLE_CLIENT_ID_LOCAL>>` and client secret | D2 | provided; callback verification pending | `.env.demo` (gitignored); secret entered locally | Run localhost OIDC callback/consent flow; never print secret |
| M09 | `<<MANUAL:GOOGLE_CLIENT_ID_DEMO>>`, client secret, exact Vercel redirect URI | D7, D8 | pending | Vercel env and cluster Secret | Complete Google login on the final Vercel URL; never print secret |
| M10 | `<<MANUAL:DEMO_ACCOUNTS>>`, patient/doctor/admin Google email addresses | D2 | provided; Google test-user verification pending | `.env.demo` (gitignored) role map; Google OAuth test-user list | Verify each account maps to exactly one intended role |
| M11 | Vercel login, scope, and project name | D7 | pending | Local Vercel CLI session/project settings | `vercel whoami`; verify project link without exposing tokens |
| M12 | `<<MANUAL:VERCEL_DOMAIN>>`, assigned Vercel domain | D7 | pending | Vercel project settings and OAuth redirect configuration | Resolve HTTPS URL and verify exact redirect URI |
| M13 | `<<MANUAL:ALERT_WEBHOOK_URL>>` (optional) | D4 | pending | Local secret store / cluster Secret | Send a test alert without logging the webhook URL |
| M14 | Dev/staging/production deployment credentials | D6, D8 | pending | GitHub environment secret `KUBECONFIG` scoped separately to each environment | Verify namespace-scoped identity with `kubectl auth can-i`; never print kubeconfig |
| M15 | Explicit approval for each billable cloud action | D8 | pending | Approval recorded in task notes | Confirm provider, region, shape, cost basis and teardown command before provisioning |
| M16 | `<<MANUAL:STAGING_API_ORIGIN>>`, HTTPS API origin for the Vercel rewrite | D7 | pending | Vercel `CARELENS_API_ORIGIN` environment setting | Confirm it is the approved staging API origin and verify same-origin rewrite and no-store response behavior |
| M17 | D8 AKS provisioning envelope: Azure for Students credits, active subscription, Central India, AKS tier, node SKU/count, 8-hour runtime, and teardown command | D8 | user reports new/unused account, full student credits and expiry far away; `Azure for Students` reported Enabled; filtered quota query returned no rows (inconclusive); AKS SKU query failed with missing identity claim; unfiltered quota/SKU preflight and explicit approval pending; Pay-As-You-Go prohibited | `docs/verification/demo-D8.md`; Azure Portal Cloud Shell for read-only quota/SKU checks | Confirm quota/SKU fit, resolve Cloud Shell identity error if it persists, no Pay-As-You-Go, and explicit approval of the documented $15 USD maximum student-credit envelope |

## D0 request order

1. M05 hardware profile — provided by user and recorded above.
2. M06 provider choice — answered: AKS; recorded in ADR-0013 and `docs/ENVIRONMENTS.md`.
3. M01 public GitHub repository — provided as `Framedrop11/Capstone-II`; configured as local `origin`. GitHub authentication (M02) is deferred to D6.
