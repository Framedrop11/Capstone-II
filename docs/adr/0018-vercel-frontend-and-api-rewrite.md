# ADR-0018: Host the demo frontend on Vercel with a same-origin API rewrite

- Status: Configuration implemented in `vercel.ts`; Vercel project setup and runtime verification pending.
- Date: 2026-11-17

## Decision

Deploy the frontend workspace from the repository root to Vercel and configure an `/api/:path*` rewrite to the HTTPS API origin from the `CARELENS_API_ORIGIN` deployment environment variable. Use relative `/api` URLs. Reject missing or non-HTTPS API origins, disable caching for API responses, retain `Cache-Control: no-store` on responses containing health data, and set security headers in Vercel configuration. The public project URL is `<<MANUAL:VERCEL_DOMAIN>>`.

## Consequences

The browser and API share a site boundary for refresh-cookie behavior. OAuth redirect URIs must exactly match the assigned Vercel domain; previews are visual-only unless separately registered. D7 must verify rewrite, cookie round trip, silent refresh, and response headers before this decision is called operational. Configure Vercel's project root as the repository root because the npm workspace lockfile is located there.
