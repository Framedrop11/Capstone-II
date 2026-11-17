# ADR-0018: Host the demo frontend on Vercel with a same-origin API rewrite

- Status: Accepted as a target; not deployed or verified.
- Date: 2026-11-17

## Decision

Deploy `frontend/` to Vercel and configure an `/api/:path*` rewrite to the HTTPS staging API. Use relative `/api` URLs. Disable rewrite caching for API responses, retain `Cache-Control: no-store` on responses containing health data, and set security headers in Vercel configuration. The public project URL is `<<MANUAL:VERCEL_DOMAIN>>`.

## Consequences

The browser and API share a site boundary for refresh-cookie behavior. OAuth redirect URIs must exactly match the assigned Vercel domain; previews are visual-only unless separately registered. D7 must verify rewrite, cookie round trip, silent refresh, and response headers before this decision is called operational.
