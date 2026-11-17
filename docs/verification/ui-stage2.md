# UI Stage U2 verification

Status: **Passed**. U2 is complete; the next stage is U3.

## Delivered

- Generated OpenAPI client and a typed API wrapper with authorization, one single-flight refresh retry, and mutation replay only when an idempotency key is present.
- Memory-only access-token session, exact-origin and opened-popup validation for the sign-in handoff, refresh restoration, sign-out, role-protected routes, and shared API error handling.
- Query retry/backoff policy and countdown utility.
- MSW coverage for refresh/replay behavior and API errors; auth popup validation and role guard tests.
- Backend popup callback mode bound to the signed OIDC transaction, returning a CSP-protected same-origin HTML handoff without placing tokens in the URL. JSON callback mode remains available to direct API clients.

## Gate evidence

- `npm run fe:verify` — passed (lint, formatting, typecheck, frontend tests, contrast check, and production build).
- `npm run fe:a11y` — passed (component accessibility test and all contrast checks).
- `npm run verify` — passed (lint, typecheck, and 26 backend unit/contract tests).
- `node --test .test-dist/tests/integration/auth-popup.test.js` — passed (MongoDB/Redis-backed popup callback, security headers, refresh cookie, and user persistence).
- `git diff --check` — passed; only Git line-ending conversion warnings were emitted.

## Remaining backend gaps

Doctor directory and notifications, questionnaire job status, post-revocation outcome semantics, typed report factors, PHI-wide cache policy, deployment security headers, local role fixtures, and admin-safe system-health summary remain tracked in `docs/UI_BACKEND_CHANGES.md`. U2 did not implement those screens or APIs.

## Next gate

Stop at U2. U3 covers the patient landing/dashboard, check-up wizard, progress/results, report, sharing, activity, and notifications; it must first resolve or explicitly scope the missing backend operations above.
