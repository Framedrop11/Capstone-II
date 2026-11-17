# UI Stage U4 verification

Date: 2026-11-14

## Delivered

- Doctor worklist with patient/report search, risk filter, risk-then-recency ordering, `j`/`k` navigation and Enter to open.
- Worklist API summary now includes share time and includes risk band only when that field is in the active consent scope.
- Report view obtains a short-lived scoped token in memory, sends it only to the report endpoint, shows a countdown, and polls consent status. Expiry/revocation produces an access-ended state.
- Outcome form is available only while report access is active and remains subject to the backend's active-consent check.
- OpenAPI-generated types, UI traceability and backend gap inventory updated.

## Verification

- `frontend`: `npm run verify` — passed; OpenAPI client generation, lint, formatting, typecheck, 16 tests across 9 files, contrast checks and production build.
- `npm run test:e2e` — passed; MongoDB/Redis patient-doctor journey covered the scoped worklist summary, token issuance/report read, outcome submission, patient revocation and immediate 409 on the next doctor report read.
- `npm run typecheck` — passed.
- `git diff --check` — passed (Git emitted only line-ending conversion notices for existing workspace files).

The root `npm run verify` command was also attempted; its lint step stops on an existing `react-hooks/incompatible-library` suppression in `frontend/src/app/routes/PatientWorkspace.tsx:1117`, because the installed `eslint-plugin-react-hooks` version does not define that rule. The separate root typecheck and U4 real-stack API journey pass; frontend verification passes in full.

## Known scope notes

- Outcome confirmation requires active report consent. The supported journey records the outcome before revocation; the UI does not bypass that server authorization rule.
- Doctor notification inbox/read endpoints are not available, so U4 shows the consent-backed worklist without a separate inbox.
- Stop after U4. U5 is not started.
