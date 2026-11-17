# CareLens: UI Master Build Prompt

> Run this **after** the backend master prompt has been completed and verified.
> Paste this file into your coding agent from the root of the existing `carelens/` repository.
> Also attach the reference screenshot (blue gradient hero, floating cards, pink gauge) so the agent can see the visual direction.
> Tip: say "Run Stage U0 only, then stop and report." Then continue one stage at a time.

---

## 0. Role and mission

You are a senior frontend engineer with strong UX, accessibility and DevOps skills. Build the **CareLens web UI** in `frontend/` and integrate it with the **already-built backend** in this repository. The result must be **interactive, friendly and fun to use**, while staying calm, clear and trustworthy, because it handles health information.

**What CareLens is:** a patient signs in with Google, completes a health questionnaire, and receives an early risk estimate (a screening aid, **not a diagnosis**). The patient can share the report with a doctor for a limited time and revoke access at any moment. Doctors review shared reports and later confirm real outcomes. Admins manage users, audit logs and model versions.

**Hard requirement:** the frontend and backend must work together **with no errors**: no console errors, no unexpected 4xx/5xx responses, no contract mismatches. This is proven by automated tests against the real full stack, not assumed.

## 1. Source of truth (read first, before writing code)

1. `services/core-api/openapi.yaml` is the **only** contract. Never call an endpoint that is not in it.
2. `docs/` (SRS, SDD, ADRs, `TRACEABILITY.md`, `ENVIRONMENTS.md`), `infra/docker/docker-compose.yml`, `infra/k8s/`, `.github/workflows/`, `Makefile`.
3. If the UI needs something the API doesn't offer (for example a prediction status endpoint, a doctor-side notification, or a field), **do not fake it in the frontend**. Add it to the backend properly: update `openapi.yaml`, implement it, test it, add it to `docs/TRACEABILITY.md`, then use it. List every such change in `docs/UI_BACKEND_CHANGES.md`.
4. Build `docs/UI_TRACEABILITY.md`: every screen and user action mapped to its OpenAPI operation(s) and the test(s) that prove it.

## 2. Fixed technology stack (do not substitute)

| Area | Choice |
|---|---|
| Framework | React (current stable) + **TypeScript (strict)** + Vite |
| Routing | React Router (data routers, route-level lazy loading) |
| Server state | **TanStack Query** |
| API client | **Generated from `openapi.yaml`** (`openapi-typescript` + `openapi-fetch`, or Orval). Regenerate with `make fe-client` |
| Forms and validation | React Hook Form + Zod |
| Styling | Tailwind CSS driven by design tokens |
| Accessible primitives | Radix UI |
| Motion | Framer Motion (respect `prefers-reduced-motion`) |
| Large lists | TanStack Virtual |
| Unit and component tests | Vitest + React Testing Library + **MSW** + `jest-axe` |
| End-to-end tests | **Selenium WebDriver** (Chrome and Firefox) against the real docker-compose stack |
| Quality gates | ESLint, Prettier, `tsc --noEmit`, bundle-size budget, Lighthouse CI, axe |

## 3. Visual identity (strict)

**Palette (taken from the reference screenshot; verify the hex values against it):**

| Role | Name | Hex |
|---|---|---|
| Primary / brand | Deep Blue | `#09318D` |
| Surface / background | Pure White | `#FFFFFF` |
| **Single accent** | Bubblegum Pink | `#FD91CC` |

**The one-accent rule:** pink is the only accent. It marks the **one main action per screen** and the key highlight (the risk gauge, a primary CTA, an active state). Everything else is deep blue, white and tints of blue. Do not scatter pink.

**Accessibility facts you must respect (measured contrast):**
- Deep blue on white is about 11:1, which is excellent for text.
- Deep blue text on pink is about 5.5:1, which passes. **Use deep-blue text on pink buttons.**
- **Pink on white is only about 2:1 and fails for text.** Never use pink as text colour on white. Use it only for large shapes, fills, borders, and graphics.
- White text on pink also fails. Never use it.
- Derive a tint scale (50 to 900) for blue and pink as design tokens. Add tiny neutral semantic tokens for error and success only, tested for contrast. Verify contrast **programmatically** in CI.
- **Never rely on colour alone.** Risk levels (low, medium, high) must also use a label, an icon and a shape or position, not only a colour.

**Look and feel:** modern and airy, in the spirit of the reference: a deep-blue-to-white gradient hero, soft floating glass cards with generous radius, a pink risk gauge, crisp type (one sans-serif family, clear hierarchy), consistent 4/8px spacing. Light theme first. A dark theme based on deep blue is a stretch goal.

**Tone and microcopy:** friendly, plain language, never alarming. A high-risk result must feel **calm and supportive**: say what it means, what to do next ("talk to a doctor"), and offer a one-tap way to share the report. Playfulness lives in the interactions, never in how risk is communicated. Keep the "screening aid, not a diagnosis" note visible but unobtrusive on every report.

## 4. Experience to build (fun and interactive, mapped to the deliverables)

### Public
- **Landing and sign-in:** animated gradient hero with floating cards (a pink gauge that fills, a mini trend card), a short "how it works" in three steps, and **Sign in with Google**. Session-expired and error states are handled gracefully.

### Patient
- **Dashboard:** latest risk gauge (animated reveal), history timeline, quick "Start a new check-up" CTA (the pink action), and any pending shares.
- **Check-up wizard:** a step-by-step, conversational questionnaire. One topic per step, animated transitions, a progress ring, friendly microcopy, sliders and steppers with live units, a live BMI visual, and inline validation (Zod, mirroring the backend rules). Save progress locally in memory for the session only (no health data in localStorage). Submit sends an **idempotency key**, so double-clicks and retries never create duplicates.
- **"Working on it" state:** a staged progress view that mirrors the real job (answers saved, basic score ready, refining with ML) by polling the backend status with backoff. If the backend falls back, show the result with a clear **"Basic score only"** badge and an explanation, and offer a refresh.
- **Report page:** animated gauge, risk label with icon, top factors in plain language with expandable "why", next-step guidance, the disclaimer, and the **Share with a doctor** CTA.
- **Sharing:** pick a doctor, choose a duration with chips (24h, 7 days, 30 days, custom), see a **live countdown** on each active share, and revoke with a confirmation. Revocation must wait for the server's confirmation, so there is **no optimistic update** for anything security-related.
- **Activity:** the patient's own audit trail ("who viewed my report and when"), virtualized and filterable.
- **Notifications:** bell with unread count and a panel.

### Doctor
- **Worklist:** reports shared with the doctor as cards sorted by risk and recency, with filters, search and keyboard navigation (`j`/`k`, `Enter`). Skeleton loaders, and a friendly empty state.
- **Report view:** read-only, with a visible **"access ends in mm:ss"** indicator driven by the scoped token. If the patient revokes or access expires while the doctor is on the page, show a graceful "Access has ended" screen. No crashes or blank pages.
- **Confirm outcome:** a short form to record the confirmed diagnosis. Show a clear success state and note that it helps improve future screening.

### Admin
- **Users and roles:** table with role changes.
- **Audit search:** a **virtualized** table (tens of thousands of rows stay smooth) with filters (patient, actor, action, date range) and cursor pagination.
- **Models:** model versions with status, the canary traffic share visualised, and promote or rollback actions with confirmation.
- **System health:** tiles from the API plus a link to Grafana.
- Optional delight: a **command palette** (`Ctrl/Cmd+K`) for quick navigation.

### Cross-cutting interactivity
- Micro-interactions: hover lift, press feedback, animated number counters, smooth route and step transitions, toasts, skeleton loaders, illustrated empty states (inline SVG), animated success states. Keep motion subtle and fast, and **respect reduced motion**.
- Fully **responsive** (mobile first), **keyboard accessible**, screen-reader friendly, visible focus states, WCAG 2.2 AA.

## 5. Advanced React and architecture requirements

- **Route-level code splitting** (`React.lazy` and Suspense) and a **bundle-size budget** enforced in CI.
- **Error boundaries** at app and route level with a friendly fallback and a "try again" action. They must never leak technical details or health data.
- **Role-protected routes** (`patient`, `doctor`, `admin`) plus a clear 403 page. Guards are UX only; the backend remains the authority.
- **TanStack Query strategy** that cooperates with the backend cache: sensible `staleTime` per resource (short for reports and consents), targeted invalidation after mutations, prefetch on hover, retries with backoff for GET only, no retries for mutations unless idempotent.
- A `useCountdown`-style hook for token and consent expiry, a typed error mapper, and feature folders (`features/patient`, `features/doctor`, `features/admin`, `shared/`).
- **Virtualization** for audit and long lists. Memoize only where measured.

## 6. Frontend-backend integration rules (the "no errors" section)

1. **Same origin.** Serve the UI and API from the same origin: Vite dev proxy locally, and the Ingress (`/` to frontend, `/api` to core-api) in clusters. This keeps the httpOnly refresh cookie working with no CORS problems.
2. **Tokens:** the access token lives **in memory only**. Never in `localStorage` or `sessionStorage`. Refresh happens silently via the refresh cookie, with a **single-flight** refresh so parallel 401s trigger only one refresh. Refresh-token reuse detection from the backend must lead to a clean sign-out.
3. **Error envelope:** map **every** backend error code to a friendly message. Handle 400 (field errors shown inline), 401 (refresh, then sign-in), 403 (consent revoked or no permission), 404, 409 (duplicate or idempotency), 429 (respect `Retry-After`), and 5xx (calm retry state). No raw errors shown to users.
4. **Contract safety:** the typed client is generated from the spec. CI regenerates it and fails if `git diff` shows drift. Run `Schemathesis`-style consistency checks where applicable. Response data is parsed defensively at boundaries.
5. **Privacy:** no health data in URLs, logs, analytics, error reporting or browser storage. No third-party trackers or CDNs. Use `Cache-Control: no-store` on API responses with PHI (verify what the backend sends). Never use `dangerouslySetInnerHTML` with user data.
6. **Security headers** from the frontend server: strict CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protections. Add an **idle-timeout** sign-out with a warning.
7. **Config at runtime, not build time:** the container serves a `config.js` generated from environment variables at start, so the **same image is promoted** across environments.

## 7. DevOps scope for the frontend

- **Docker:** multi-stage build, served by a non-root unprivileged NGINX with gzip/brotli, immutable hashed assets, no-cache `index.html`, SPA fallback, healthcheck.
- **docker-compose:** add the frontend so `make up` gives the complete product: UI + API + workers + ML + databases + mock sign-in.
- **Kubernetes (Kustomize):** frontend Deployment, Service, HPA, PodDisruptionBudget, probes, resources, and the Ingress routing above, for all overlays. Update NetworkPolicies as needed.
- **GitHub Actions:** extend the existing workflows with typecheck, lint, unit and component tests, client-drift check, build, bundle-size budget, axe checks, Lighthouse CI, image build and scan, and a staging job that runs the **Selenium suite against the deployed stack**.
- **Makefile targets:** `fe-dev`, `fe-client`, `fe-test`, `fe-lint`, `fe-build`, `fe-e2e`, `fe-a11y`, `fe-verify`.

## 8. Testing requirements (everything is tested)

| Layer | What must be covered |
|---|---|
| Static | `tsc --noEmit`, ESLint, Prettier, contrast-check script on tokens |
| Unit and component | Every shared component and hook: states (loading, empty, error, success), keyboard use, `jest-axe` with zero violations |
| API layer | MSW-based tests for refresh single-flight, every error code mapping, idempotent submit, polling backoff, countdown logic |
| Integration | UI against the **real** backend in docker-compose (not mocks) for all main flows |
| **E2E (Selenium)** | Full "Riya and Dr. Mehta" story through the UI (below), on Chrome and Firefox, desktop and mobile viewport |
| **Console and network gate** | Every E2E run **fails** on any browser `console.error`, uncaught exception, failed request, or unexpected 4xx/5xx |
| Accessibility | axe on every page and state via Selenium, plus a keyboard-only run of the main flows |
| Performance | Lighthouse CI budgets (performance, accessibility, best practices), route-level bundle sizes, a 20,000-row audit table that stays responsive |
| Resilience | Stop the ML service (UI shows "Basic score only"), stop the backend (calm retry state), expire the access token mid-action (silent refresh), patient revokes while doctor is viewing (graceful "Access ended"), rate limiting (429) |
| Security | RBAC matrix in the UI (every role on every route), no tokens or PHI in browser storage or URLs, CSP in effect, XSS probes on all text inputs |

**E2E story (must pass):** patient signs in (mock identity in non-prod), completes the wizard, sees staged progress, gets a basic score, then a refined score; with ML stopped a second check-up shows "Basic score only", and recovers after ML restarts; patient shares with a doctor for a limited time; doctor is notified, opens the report and sees the access countdown; patient revokes and the doctor's page immediately shows "Access ended"; doctor confirms an outcome; admin searches the audit log, sees the trail, and views model versions; session expiry and sign-out behave correctly. **Zero console errors throughout.**

## 9. Working rules (follow strictly)

1. **Work in stages and stop at each gate:**
   - **U0:** read the repo, gap analysis (UI needs vs API), `UI_BACKEND_CHANGES.md`, plan, scaffold `frontend/`, tooling, Makefile targets, CI skeleton.
   - **U1:** design system (tokens, contrast checks, core components, motion rules).
   - **U2:** generated API client, auth and session layer, protected routes, error mapping, MSW tests.
   - **U3:** patient experience.
   - **U4:** doctor experience.
   - **U5:** admin experience.
   - **U6:** polish: interactions, empty, loading and error states, responsive layouts, keyboard and a11y, performance tuning.
   - **U7:** Docker, NGINX, compose, Kubernetes, CI/CD.
   - **U8:** full-stack E2E on Chrome and Firefox, a11y, Lighthouse, resilience and security tests, final verification.
2. **A stage is done only when its checks pass in your environment and you have shown the real command output.** Do not start the next stage before that. Write `docs/verification/ui-stageN.md` per stage (what was built, commands run, results, requirement and operation IDs covered, known gaps).
3. **Never claim something works without running it.** If something cannot run in this environment (a browser, Docker, a cluster), say so, run the strongest checks available, and mark it "not runtime-verified".
4. No placeholders, `TODO`s, mocked-out screens or always-passing tests in finished stages. Mock only in unit and component tests. Integration and E2E use the real backend.
5. Keep `make verify` and `make fe-verify` green. Use conventional commits. No secrets in the repo.
6. If something needs a human (real Google credentials, hosting, a domain), document what is needed and where it plugs in, and continue with the mock.

## 10. Definition of done

- [ ] `make up` from a clean clone serves the full product. Opening the site and signing in with the mock identity works for all three roles.
- [ ] The Selenium E2E story passes on Chrome and Firefox (desktop and mobile viewport) with **zero console errors and zero unexpected failed requests**.
- [ ] `jest-axe` and axe-in-browser report zero violations. Keyboard-only runs of the main flows pass. Contrast checks pass in CI.
- [ ] Generated API client matches the spec (no drift), and every UI action maps to an OpenAPI operation in `UI_TRACEABILITY.md`.
- [ ] Lighthouse and bundle-size budgets pass. The 20,000-row audit table stays smooth.
- [ ] The frontend image builds, scans clean, runs non-root, and the Kustomize overlays validate. CI workflows are valid.
- [ ] All stage reports exist with real output. README updated with screenshots and run instructions.

## 11. Out of scope for this prompt (add later, backend first)

Doctor notes visible to patients, follow-up reminders, appointment booking, and a risk-over-time analytics view. These need new backend features and specs first. Only build them if explicitly asked.

**Start now with Stage U0 only. When it is done, show the plan, the gap list and the gate evidence, then stop and wait for confirmation.**
