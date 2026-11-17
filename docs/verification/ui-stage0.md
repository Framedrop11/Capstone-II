# UI Stage U0 verification — review and scaffold

Date: 2026-11-14

## Built

- Reviewed the UI prompt, SRS/SDD, ADRs, existing backend OpenAPI contract, traceability, environment/deployment docs, Compose and Kustomize setup, CI workflows, and Makefile.
- Added `docs/UI_PLAN.md`, `docs/UI_BACKEND_CHANGES.md`, and a screen/action mapping skeleton in `docs/UI_TRACEABILITY.md`.
- Added a strict TypeScript React/Vite frontend workspace with Tailwind integration, React Router/TanStack Query, React Hook Form/Zod, Radix, Framer Motion, TanStack Virtual, Vitest/Testing Library/MSW/jest-axe, Selenium WebDriver, ESLint and Prettier dependencies.
- Added the same-origin Vite `/api`, `/healthz`, and `/readyz` proxy, a generated OpenAPI TypeScript schema, one scaffold render test, frontend Make/root npm targets, and a frontend-checks GitHub Actions workflow with client drift check.
- Updated the frontend and root README files to reflect the staged UI work.

## Commands and results

- `npm install` — exit 0; added 278 packages and audited 706. npm reported 15 moderate vulnerabilities. The host used Node 20.17.0, below the repository's Node >=22 engine; latest UI tooling also requires newer Node 22 patches.
- `npm run fe:client` — exit 0; `openapi-typescript 7.13.0` generated `frontend/src/shared/api/schema.d.ts` from the OpenAPI document.
- `docker run ... node:22-alpine ... npm ci && npm run fe:verify` — exit 0 on Node 22.23.5. Client generation, frontend ESLint, Prettier, strict TypeScript, Vitest (1 passed), and Vite production build passed. Bundle output: 220.16 kB JS (68.89 kB gzip), 4.45 kB CSS (1.52 kB gzip).
- The same Docker Node 22 environment ran `npm run verify` — exit 0; backend lint/typecheck and 25/25 unit tests passed.
- `docker run ... rhysd/actionlint:1.7.12` — exit 0 for all workflow YAML, including the new frontend workflow.
- `git diff --check` — exit 0; Git reported line-ending conversion notices for existing modified files.
- The frontend verify attempt on host Node 20.17.0 failed in Vitest's Rolldown native binding after reporting unsupported-engine warnings. The clean Node 22 container install/build/test passed and is the supported verification result.

## Gap analysis highlights

- The UI prompt's screenshot reference was not supplied; only its written visual direction is available.
- The current backend lacks a safe SPA callback handoff for the access token, doctor lookup, notifications endpoints, and a questionnaire-job status endpoint. These are documented in `docs/UI_BACKEND_CHANGES.md` and must be addressed before the corresponding screens can provide the requested behavior.
- The specified UI story revokes report consent before doctor outcome confirmation, but the current outcome endpoint requires active report consent. Authorization semantics need a product/backend decision before implementing that sequence.
- The active spec path is `services/core-api/openapi/openapi.yaml`. Current ingress routes `/` to Core API and needs a frontend route for same-origin deployment.
- App screens, auth/session flows, design system/contrast tokens, accessible states, Selenium, and runtime-config/security-header work are later UI stages. No backend API changes were made in U0.
- GNU Make is not installed on the host, so the Make targets were added but not invoked. `fe:e2e` and `fe:a11y` explicitly report that their browser suites arrive in later stages; they are not part of the U0 gate.

## Gate

**U0 scaffold gate passed:** contract client generation, frontend lint/format/typecheck/test/build, existing backend verification, and workflow lint all passed in the supported Node 22 environment. No patient, doctor, or admin screens were started. Per the prompt, stop here and wait before U1.
