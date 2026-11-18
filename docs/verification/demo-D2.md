# D2 — Golden patient, doctor, and admin journey

Status: API journey passed; automated browser journey did not pass; real Google sign-in remains unverified. D2 is not marked complete.

## Implemented in this stage

- Local Google account-to-role mapping is read from `CARELENS_DEMO_ACCOUNT_ROLES`; it accepts only valid email-to-role JSON and refuses configuration outside `CARELENS_ENV=local`.
- Doctor report-sharing notifications have role-protected, no-store list/read endpoints. The API checks current consent on every list request and omits the prediction ID after revocation or expiry.
- Doctor workspace displays unread share notifications and opens a shared report only while the API reports active consent.
- Patient report sharing can send a generic email to the doctor through SMTP. It contains no patient identity, score, or health details. SMTP failure is logged by safe error type and does not fail report sharing.
- Compose includes Mailpit at `http://localhost:8025` (SMTP `localhost:1025`) for locally visible email.
- `.env.demo` is gitignored and holds the Google OAuth values and demo role map; no values are recorded here.

## Checks completed

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- Auth configuration and OpenAPI unit tests — 10 passed.
- `npm run fe:client` — passed; OpenAPI TypeScript client regenerated.
- `git diff --check` — passed.

## Checks blocked or pending

- API golden journey passed after the D2 changes; all 23 frontend tests passed under Node 22.
- Latest `npm run test:e2e` — passed: 1/1 patient-doctor-admin API journey, including no-store assertions.
- Chrome Selenium was rerun in local mock mode with a callback origin matching the Selenium host. It passed mock login and the patient dashboard contrast check, but timed out before a report appeared after questionnaire submission. A contrast defect in the notification badge was fixed; the browser flow still needs diagnosis and a passing rerun.
- A subsequent browser run remained intermittent: it timed out waiting for the patient route after mock sign-in. The full browser gate therefore remains failed, despite the API journey pass.
- The current Compose API/frontend are restored to `AUTH_PROVIDER=google` using the values already in `.env.demo`. No OAuth value is included in this report.
- The real Google consent and callback journey has not been run. Google OAuth test-user membership is unverified. M08 and M10 remain provided, not verified, in `docs/MANUAL_INPUTS.md`. A human must complete at least one real account consent/callback check; the browser helper explicitly forbids automating authentication dialogs.

## Local execution after Docker access is available

Use the project root in PowerShell:

```powershell
docker compose --env-file .env --env-file .env.demo -f infra/docker/docker-compose.yml up -d --build
```

Open the app at `http://localhost:18082` and Mailpit at `http://localhost:8025`. Confirm all three Google addresses are listed as OAuth consent-screen test users before exercising real login. Verify each account lands in its intended profile, submit a patient questionnaire and wait for the refined score, share it with the doctor, open it from the doctor notification, revoke consent, confirm the doctor sees access ended, and review model versions as admin. Then re-run the browser gate before marking D2 passed.
