# D7 Vercel frontend and same-origin API rewrite

Status: repository configuration is prepared; Vercel project setup, deployment, and browser proof are pending. No Vercel login or deployment was performed.

## Implemented

- Root `vercel.ts` config builds the existing frontend workspace and serves `frontend/dist`.
- The API origin is supplied through `CARELENS_API_ORIGIN`; build configuration rejects missing, non-HTTPS, or non-origin values to avoid creating a broken/open proxy deployment.
- `/api/:path*` is rewritten to the configured API origin. API and runtime `/config.js` responses receive `Cache-Control: no-store`.
- Client-side routes fall through to `/index.html`; hashed Vite assets receive immutable caching.
- Vercel supplies content security, frame, referrer, MIME, and permissions headers for frontend routes. The frontend CSP is excluded from `/api/*` so it does not conflict with the API callback's nonce-based popup completion CSP.
- ADR-0018 remains operationally unverified until the following inputs and live checks are complete.

## Configure the Vercel project

1. Import the repository in Vercel and set the project root directory to the repository root (`.`), not `frontend/`; npm workspaces use the root `package-lock.json`.
2. The checked-in `vercel.ts` declares `npm ci`, `npm run fe:build`, and `frontend/dist`. Set `CARELENS_API_ORIGIN` separately in Vercel's Development, Preview, and Production environments to the intended HTTPS API origin. For initial demo use, Preview and Production should only point at the designated synthetic-data staging API if its OAuth and data policies allow it.
3. Set Core API `OIDC_REDIRECT_URI` to the final browser-visible Vercel origin plus `/api/v1/auth/callback`. Add that exact URI to the Google OAuth Web client. Keep the client secret only in the Core API/cluster secret store; the frontend does not need it.
4. Configure the Vercel production domain and only enable Google sign-in for domains registered in the OAuth client. Preview URLs remain visual-only until their callback origins are explicitly configured.
5. Configure backend trusted-proxy behavior and public URL/cookie settings for the Vercel-to-API proxy. Do not disable CSRF/origin checks as a workaround.

Alternatively, after installing/authenticating the Vercel CLI and linking the repository-root project, add the public API origin through the interactive prompts and deploy:

```powershell
npx vercel env add CARELENS_API_ORIGIN development
npx vercel env add CARELENS_API_ORIGIN preview
npx vercel env add CARELENS_API_ORIGIN production
npx vercel --prod
```

Enter only the HTTPS origin (for example, `https://api.example.com`), not an `/api` path. The Vercel CLI stores this as project configuration; it is not a secret. Do not put OAuth client secrets in Vercel frontend variables.

## User verification checklist

After deploying a Preview or Production build:

1. Open the assigned HTTPS domain. Confirm `/`, direct navigation to a nested patient route, and `/config.js` load; confirm the browser-visible URL remains on Vercel.
2. In DevTools Network, call `/api/healthz` and an unauthenticated protected route. Confirm requests go to the Vercel origin, are served by the API, and include `Cache-Control: no-store`.
3. Inspect responses for CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
4. Complete Google consent. Confirm the browser returns to the Vercel origin at `/api/v1/auth/callback`, the popup sends the session result to the opener, and the correct profile loads.
5. Inspect browser storage/cookies: refresh cookie must be Secure, HttpOnly, SameSite=Strict and scoped to `/api/v1/auth`; do not copy its value into evidence.
6. Reload the page, expire/clear the access token using the app's normal session flow, and confirm silent refresh keeps the user signed in. Confirm no authenticated response is cached by browser or edge.
7. Record the deployment URL, commit SHA, request/response status and headers, and screenshots with account identifiers and tokens hidden.

## Pending inputs and constraints

The Vercel project/login/domain and staging API origin are not supplied. M09, M11, and M12 in `docs/MANUAL_INPUTS.md` remain pending; add the API origin as M16. Because the environment value is required at config evaluation, Vercel build/deploy must wait until `CARELENS_API_ORIGIN` is configured. No runtime claim is made until rewrite, callback, cookie round trip, silent refresh, and no-cache behavior pass on the assigned URL.
