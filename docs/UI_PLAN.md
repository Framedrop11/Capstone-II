# CareLens UI plan

The UI is implemented in `frontend/` against `services/core-api/openapi/openapi.yaml`. Backend route handlers and existing APIs are not treated as a promise: each screen must stay within the published contract, and any contract gap must first be implemented and tested in the backend.

Current gate: U0 through U7 passed. U8 implementation and static checks are recorded, but its full browser and Lighthouse gates remain incomplete; see `docs/verification/ui-stage8.md`. Stop here until the remaining U8 runtime checks pass.

## Stage sequence

| Stage | Deliverables                                                                                                                                            | Gate evidence                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| U0    | Repository/API review, gap inventory, UI backend change list, traceability skeleton, React/Vite strict TypeScript scaffold, tooling and CI/Make targets | Scaffold builds, generated contract client, frontend lint/test baseline, `docs/verification/ui-stage0.md` |
| U1    | Design tokens, contrast checker, accessible primitives, responsive shell and motion rules                                                               | Token contrast tests and component accessibility tests                                                    |
| U2    | Generated OpenAPI client, in-memory access-token session, single-flight refresh, role guards, error mapping, MSW API tests                              | Auth/error/client tests and generated-client drift check                                                  |
| U3    | Patient landing/dashboard, check-up wizard, progress/results, report, sharing, activity and notifications                                               | Patient component/API tests; backend changes documented and tested                                        |
| U4    | Doctor worklist, scoped report/countdown, access-ended state and outcome form                                                                           | Doctor API flow tests                                                                                     |
| U5    | Admin users, audit search, models and system-health views                                                                                               | Admin API flow tests                                                                                      |
| U6    | Responsive/accessibility/performance polish, keyboard navigation and empty/loading/error states                                                         | axe, keyboard, responsive and large-list checks                                                           |
| U7    | NGINX frontend image, Compose, Kustomize, runtime config, security headers and CI                                                                       | Image, compose, manifest, scan and workflow checks                                                        |
| U8    | Selenium full-stack story in Chrome and Firefox, desktop/mobile, resilience/security, Lighthouse and final verification                                 | Full real-stack run with console/network/a11y gates and `docs/verification/ui-stage8.md`                  |

## Product and privacy constraints

- The patient is always shown that CareLens is a screening aid, not a diagnosis. Avoid alarming language and do not imply clinical validity.
- Keep access tokens in memory. Do not place health data, tokens, or other PHI in browser storage, URLs, logs, analytics, third-party requests, or CDN caches.
- Keep pink as the only accent and use deep-blue text on pink. Never use pink or white-on-pink for text. Risk level includes text and a non-colour cue.
- Forms follow the OpenAPI schema. Use the API's idempotency key for questionnaire submission. A revoke action waits for server confirmation.
- The SRS/SDD conflict on basic-score ownership is resolved by ADR-0001: the worker owns scoring. The UI must present the persisted score source, not calculate a clinical score in the browser.

## U0 source review

Read the supplied SRS and SDD, current ADRs, backend OpenAPI, traceability matrix, environment and CI documentation, Compose stack, Kubernetes ingress, and Makefile. The SRS calls for patient, doctor, and admin interfaces; consent, worklist, audit and model views; accessible error/status feedback; and performance/reliability goals. The API is the sole source of operation paths and payload fields.

The supplied reference screenshot mentioned in the prompt was not present in the workspace. The written `#09318D`, `#FFFFFF`, `#FD91CC` palette and visual description are the only available design input at U0.
