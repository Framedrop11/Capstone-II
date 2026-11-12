# Stage 2 verification

Date: 2026-11-12

## Built

- Added a Google OpenID Connect adapter using authorization code flow, PKCE S256, state and nonce validation, verified email claims, and `select_account` prompt.
- Added local/development/test mock OIDC adapter and an auth runtime factory that refuses mock/test auth for staging and production. Configuration is validated from environment variables at startup.
- Added a five-minute signed HttpOnly/Secure/SameSite=Lax OAuth transaction cookie, 15-minute HS256 access JWTs, bearer authentication middleware and role authorization middleware.
- Added refresh tokens stored only as SHA-256 hashes, family tracking, 30-day expiry, rotation, logout revocation, and transactional family-wide revocation when a revoked token is reused.
- Added secure HttpOnly/Secure/SameSite=Strict refresh cookies; successful first patient login provisions a patient profile.
- Added Express/Supertest role matrix tests and MongoDB Testcontainers session integration tests.

## Commands and results

`npm run verify` — exit code 0 when run outside the sandbox (loopback requests from Supertest require local socket access). ESLint, strict TypeScript check, and all 17 unit/HTTP tests passed:

```text
TAP version 13
# tests 17
# suites 0
# pass 17
# fail 0
# cancelled 0
```

`npm run test:integration` — exit code 0 using Docker Desktop 28.4.0 and Testcontainers MongoDB 7.0:

```text
# Subtest: application MongoDB identity can insert/read audit rows but cannot update/delete
ok 1 - application MongoDB identity can insert/read audit rows but cannot update/delete
# tests 1
# pass 1
# fail 0

# Subtest: OIDC login creates patient session, refresh rotates, and reuse revokes the token family
ok 1 - OIDC login creates patient session, refresh rotates, and reuse revokes the token family
# tests 1
# pass 1
# fail 0
```

The session integration confirms passwordless mock OIDC login, patient-profile creation, JWT issuance, hashed refresh-token storage, successful rotation, old-token reuse detection, family-wide revocation, and logout revocation.

## Gate status

**Stage 2 gate passed.** Local unit/HTTP checks and MongoDB replica-set integration checks passed.

## Known limits

- No Google OAuth client credentials were supplied, so live Google discovery and callback exchange were not exercised. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OIDC_REDIRECT_URI` for a deployment. The mock adapter was used for end-to-end auth integration.
- The local Node runtime remains v20.17.0 while the repository baseline is Node 22; npm reports engine warnings for dependencies. CI targets Node 22.
- HTTP auth routes are wired in Stage 3; Stage 2 provides the adapter, auth service and tested Express middleware only.
