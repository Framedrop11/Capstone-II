# UI stage U8 verification

U8 implementation is present, but the stage gate is **incomplete**. The complete patient-to-doctor-to-admin story across the Chrome/Firefox desktop/mobile matrix and Lighthouse budgets have not passed locally. No later stage is started.

## Delivered

- Added an isolated local-only mock sign-in role selector and synthetic patient, doctor, and admin identities. Local mock transactions preserve the selected role in a signed transaction cookie; non-local cookie security behavior is retained.
- Added local seed data and documented demo account setup. Added `mock_role` to the OpenAPI login contract and a contract test.
- Replaced the Selenium placeholder with the full browser runner: four browser/viewport configurations, patient questionnaire and report sharing, doctor access and outcome, patient revocation, admin views, negative authorization and XSS checks, browser console/network checks, privacy checks, security headers, axe WCAG 2.2 AA scan, and responsive overflow checks. Staging can run a public-only smoke path.
- Added Compose Selenium services and CI jobs for the local full-stack story, staging browser smoke, and Lighthouse CI budgets.
- Updated the local Mongo health check timeout to 15 seconds after observing `mongosh` probe startup exceed the old 5-second limit under host load.

## Verification results

- Frontend lint — passed.
- `npm run fe:verify` — passed under Node 24: generated OpenAPI client, lint, Prettier, TypeScript typecheck, 12 test files / 22 tests, contrast, production build, and bundle budget. Compressed bundle total: 176.6 KiB of 220 KiB.
- Frontend checks and staging workflow YAML parse — passed.
- `git diff --check` — passed; Git emitted only the repository's LF-to-CRLF working-copy notices.
- `docker compose --env-file .env.example -f infra/docker/docker-compose.yml --profile e2e config --quiet` — passed.
- Browser smoke — one isolated headless Chrome session loaded the local frontend and found the CareLens heading.
- Full Selenium flow — not passed. On the recovered stack, the desktop run started Chrome but Firefox failed before creating a session (`Failed to read marionette port`), so the patient/doctor story did not begin. Firefox failed the same way in an isolated public smoke. An isolated Chrome smoke then failed with `chrome not reachable`; one earlier Chrome landing smoke had passed. The runner now closes the first browser if the second cannot start. The full flow and all four matrix configurations remain unverified.
- Docker images — API, frontend, and ML images built successfully. The first Compose start was blocked by Mongo health probes exceeding 5 seconds and a host port 8080 conflict. Mongo was recovered using its persistent named volume, the health timeout was raised to 15 seconds, and the full stack then reached healthy status with the frontend bound to host port 18082. The local synthetic identities were reseeded successfully.
- Final container state — after the browser retries, Mongo and worker health checks failed again under host load (Mongo exceeded 15 seconds; worker exceeded 3 seconds). The API and frontend remained healthy. Selenium nodes were restarted to clear browser processes, but the matrix could not be completed.
- Lighthouse — not run locally. Installing the LHCI CLI was blocked by the unavailable npm registry (`ENOTFOUND`); the CI job is configured but has not run in this environment.

## Remaining U8 gate

Compose configuration and `npm run fe:verify` have passed. The full stack reached healthy status after recovery, then Mongo and worker health checks timed out again during browser attempts. U8 still needs a passing `npm run fe:e2e` across Chrome/Firefox desktop/mobile and Lighthouse CI scores meeting the configured performance, accessibility, and best-practices thresholds. Lighthouse CI could not run locally because npm registry access failed with `ENOTFOUND`; the configured CI job has not run in this environment. Update this report with observed results before marking U8 complete. U8 is the last stage defined in `carelens_ui_master_prompt.md`; there is no U9 to begin.
