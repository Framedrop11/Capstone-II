# UI Stage U3 verification

Status: **Passed**. U3 is complete. Stop here; start U4 only after the next stage instruction.

## Delivered

- Patient landing/dashboard with latest score, history entry, clear `basic_only` badge, non-colour risk label/shape, persistent screening disclaimer, empty/loading/error states, and report navigation.
- Nine-step FINDRISC questionnaire matching the API schema, Zod field validation, no health-answer persistence, live BMI indicator, per-session idempotency key, and working/pending/completed/failed states with bounded polling.
- Patient report with persisted score source, risk band, factors, expandable explanation, calm next-step guidance, and visible non-diagnosis disclaimer.
- Doctor search with minimal identity results, report sharing with 24-hour/7-day/30-day/custom duration, live expiry countdown, confirmation, and server-confirmed revocation.
- Filterable, cursor-paginated, virtualized patient activity and a notification panel with unread count and mark-read behavior.
- Patient API routes for questionnaire status, doctor search, notification listing/read state; typed report factors/risk band; patient and scoped report responses carry `Cache-Control: no-store`.

## Contract operations

U3 added `getQuestionnaireStatus`, `searchDoctors`, `listOwnNotifications`, and `markOwnNotificationRead`. It exercises `submitQuestionnaire`, `listOwnPredictions`, `readOwnReport`, `grantConsent`, `listOwnConsents`, `revokeConsent`, and `listOwnAuditTrail`.

## Gate evidence

- `npm run fe:verify` — passed in the Node 22 container: OpenAPI client generation, ESLint, Prettier, TypeScript, 8 frontend test files / 14 tests, contrast checks, and production build.
- The patient component test includes axe checks on the dashboard and sharing state; zero violations were reported.
- `npm run verify` — passed: repository lint, typecheck, and 26 backend unit/contract tests.
- `npm run build:test` — passed for the integration test build.
- `node --test .test-dist/tests/integration/patient-experience.test.js` — passed against Docker-backed MongoDB and Redis. It covers submission idempotency/replay conflict, pending/complete status, cross-patient not-found, minimal doctor search, unread/read notification behavior, share/list/revoke, audit trail ownership, and no-store headers.
- `git diff --check` — passed (checked after the final documentation edits).

The full Selenium multi-browser story remains scheduled for U8. No deployment/browser E2E claim is made at this gate.

## Remaining gaps

Doctor notification inbox/read behavior, post-revocation outcome semantics, local role fixtures, admin-safe system health, deployment CSP/security headers, and full Selenium coverage remain for later stages. The remaining API gap inventory is in `docs/UI_BACKEND_CHANGES.md`.
