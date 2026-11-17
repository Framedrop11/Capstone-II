# CareLens web application

This directory contains the strict TypeScript React/Vite CareLens UI. The UI implementation follows the gated plan in `../docs/UI_PLAN.md` and the source prompt in `../carelens_ui_master_prompt.md`.

The API contract is `../services/core-api/openapi/openapi.yaml`. Generate the typed client with `npm run fe:client` from the repository root. Do not add API paths that are absent from the OpenAPI document. Track backend contract work in `../docs/UI_BACKEND_CHANGES.md`.

## Local commands

Run `npm run fe:dev` from the repository root for the Vite development server. Its `/api` proxy targets `http://localhost:3000`. `make up` builds and runs the same-origin product through the NGINX frontend at `http://localhost:18082`, which proxies `/api/` to the core API. Local Google sign-in redirects to `http://localhost:18082/api/v1/auth/callback`; configure that URL in the Google OAuth client and set the client ID and secret in `.env`. The frontend container generates `/config.js` at startup from the environment and auth provider, so the mock role selector is shown only when local mock auth is enabled. Root scripts include `fe:verify`, `fe:client`, and the stage-specific Make targets.

U1 adds the written palette tokens, accessible base primitives, motion rules, and programmatic contrast checks. The visual reference image mentioned by the UI prompt was not supplied, so refine decorative details only when that reference becomes available.

U7 adds a non-root NGINX image, runtime configuration, security headers, Compose service, Kustomize deployment/service/HPA/PDB/network policies, and frontend image build/scan/publish/deploy workflow wiring. See `../docs/verification/ui-stage7.md` for gate evidence.
