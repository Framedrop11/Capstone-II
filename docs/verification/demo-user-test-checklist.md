# CareLens manual demo verification

Use this checklist to finish the runtime and browser proofs. The local stack should be started from the repo root with Google auth enabled:

```powershell
docker compose --env-file .env --env-file .env.demo -f infra/docker/docker-compose.yml up -d
```

The app is at `http://localhost:18082`; Grafana is at `http://localhost:3001`; Mailpit is at `http://localhost:8025`.

## D2 — Google sign-in and patient → doctor → admin

1. In Google Cloud Console, confirm all three accounts from `CARELENS_DEMO_ACCOUNT_ROLES` in the ignored `.env.demo` are listed as OAuth test users. Do not share the client secret.
2. Open `http://localhost:18082` and sign in as the mapped patient. Confirm the patient profile opens.
3. Submit a synthetic check-up. Confirm the report loads and says whether it used the ML-refined score or basic fallback.
4. Share the report with the mapped doctor account. In a separate browser profile, sign in as that doctor, open the notification, and confirm the report is accessible.
5. Revoke consent as the patient. Confirm the doctor sees access ended and can no longer open the report.
6. Sign in as the mapped admin. Confirm system health and model versions load. Review Mailpit for the generic share notification.

Record which account/profile combinations passed. If Google rejects the account, check its test-user membership and the exact redirect URI `http://localhost:18082/api/v1/auth/callback`.

## D3 — canary ramp and rollback

The local-only `.env.demo` enables the demo controller and points to a candidate fixture identical to the stable model. It demonstrates request routing and control flow only.

1. Read current ML controller state:

   ```powershell
   Invoke-RestMethod http://localhost:8000/health | ConvertTo-Json -Depth 8
   ```

   Expect `stableVersion` `carelens-logreg-v1`, `canaryVersion` `carelens-demo-canary-v1`, and the controller active at 5%.

2. Send synthetic requests directly to the ML service to supply canary samples. This does not create patient records:

   ```powershell
   $body = @{
     responses = @{
       ageYears = 50; bmi = 28; sex = 'female'; waistCm = 80
       activity30MinDaily = $true; fruitVegetablesDaily = $true
       antihypertensiveTreatment = $false; historyHighGlucose = $false
       familyHistoryDiabetes = 'none'
     }
     basicScore = 0.4
   } | ConvertTo-Json -Depth 5 -Compress

   for ($i = 0; $i -lt 250; $i++) {
     Invoke-RestMethod -Method Post -Uri http://localhost:8000/predict `
       -ContentType 'application/json' -Body $body | Out-Null
     $state = Invoke-RestMethod http://localhost:8000/health
     if ($state.canaryController.trafficPercent -eq 100) { break }
     Start-Sleep -Milliseconds 100
   }

   $state = Invoke-RestMethod http://localhost:8000/health
   $state.canaryController | ConvertTo-Json -Depth 8
   ```

   Expect traffic to progress 5 → 25 → 50 → 75 → 100 and history to include `completed`. The Admin → Model versions page should show the same current status/history. Prometheus metrics include `carelens_ml_canary_traffic_percent` and decision counters.

3. Verify failure rollback and production refusal with the ML tests:

   ```powershell
   services\ml-service\.venv\Scripts\python.exe -m pytest -q services\ml-service\tests\test_service.py::test_bad_canary_automatically_rolls_back_on_inference_error services\ml-service\tests\test_service.py::test_production_refuses_demo_auto_canary services\ml-service\tests\test_service.py::test_model_manager_refuses_demo_fixture_in_production
   ```

   Expect rollback to 0% with `error_rate_exceeded`; production must refuse the demo settings.

   **User-reported result:** these three focused tests passed (`3 passed in 20.77s`). This covers the listed cases; live canary ramp and admin UI proof remain separate checks.

## D4 — local hardening checks

The restore drill and synthetic alert-delivery probe were already recorded in [demo-D4.md](demo-D4.md). To repeat them:

```powershell
.\scripts\backup-restore-demo.ps1 -Mode backup
.\scripts\backup-restore-demo.ps1 -Mode verify-restore
```

Open Mailpit at `http://localhost:8025` and confirm the synthetic alert email is delivered. In Grafana, select a recent time range and query after generating fresh app traffic.

## D5 — overlay and AKS readiness

Do this from PowerShell in the repository root (`F:\Projects\Capstone II`). These commands only render and check YAML schemas; they do not connect to or change a Kubernetes cluster.

1. Start Docker Desktop and wait until its engine is running.
2. Copy and run this block. It checks `dev`, `staging`, and `prod` one at a time and stops if any step fails:

```powershell
$profiles = 'dev', 'staging', 'prod'
foreach ($profile in $profiles) {
  $manifest = Join-Path $env:TEMP "carelens-$profile.yaml"
  $rendered = kubectl kustomize "infra/k8s/overlays/$profile"
  if ($LASTEXITCODE -ne 0) { throw "Kustomize rendering failed for $profile" }
  [System.IO.File]::WriteAllText($manifest, ($rendered -join "`n"), [System.Text.UTF8Encoding]::new($false))
  $tempMount = "$($env:TEMP -replace '\\','/'):/work"
  docker run --rm -v "$tempMount" ghcr.io/yannh/kubeconform:v0.6.7 `
    -strict -summary "/work/carelens-$profile.yaml"
  if ($LASTEXITCODE -ne 0) { throw "Schema validation failed for $profile" }
}
```

3. Expect each profile's Kubeconform summary to show zero invalid resources and zero errors. Resource counts can differ from the earlier report because manifests changed.
4. Send me the three summaries, or the first error if one fails. I’ll record the current D5 result and refresh the app-only request estimate.
5. Stop there. **Do not run `kubectl apply`**; this is only a local schema check and creates no AKS resources or Azure charges.

The existing app-only resource estimate and remaining dependencies are in [demo-D5.md](demo-D5.md). AKS sizing and billing are a separate D8 approval gate.

## D6 — GitHub Actions and release evidence

Follow the setup and evidence sequence in [demo-D6.md](demo-D6.md). Start by configuring GitHub Environments and workflow permissions; do not dispatch production. Capture workflow links and the immutable digest artifact. Run the intentional schema-failure demonstration only on a disposable PR, then revert it. Run `Kind cluster proof` from Actions and save the node interruption/recovery logs. It uses a disposable NGINX workload and does not deploy CareLens. D6 is not complete until hosted CI, GHCR publication, dev deploy, staging smoke, Kind proof, and protected-gate evidence have been observed.

## D7 — Vercel frontend and API rewrite

Follow [demo-D7.md](demo-D7.md). Configure the Vercel project root as the repository root and set `CARELENS_API_ORIGIN` to the approved HTTPS staging API origin in each Vercel environment before the first deployment. Set the exact public callback URL in the Core API and Google OAuth configuration. Then verify nested-route refresh, `/api` rewrite, response security/no-store headers, sign-in callback, Secure/HttpOnly refresh cookie, and silent refresh. Do not mark D7 complete based only on a successful static build.

## D8 — AKS live environment

To let me prepare the AKS setup, follow this order:

1. In Azure Portal **Cloud Shell → Bash**, run the read-only quota/SKU commands in [demo-D8.md](demo-D8.md). They confirm that Central India and the selected three-node VM pool have sufficient quota; do not send subscription IDs, passwords, access tokens, client secrets, or kubeconfig.
2. Review the proposed `Standard_D2s_v5` three-node AKS Free configuration, 10-hour billing allowance, **$15 USD maximum Azure for Students credit envelope**, and resource-group teardown command in [demo-D8.md](demo-D8.md).
3. Explicitly approve the exact envelope by replying `approve D8: $15 maximum student-credit spend`. This authorizes only the documented plan; Pay-As-You-Go remains prohibited. No Azure create/update action occurs before approval.
4. After creation, follow [demo-D8.md](demo-D8.md) to configure dependencies, deploy staging, and collect cluster/demo evidence.
