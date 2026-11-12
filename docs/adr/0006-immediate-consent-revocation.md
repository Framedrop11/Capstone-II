# ADR-0006: Block doctor tokens at revocation

- Status: Accepted
- Decision: Revocation adds the affected doctor token family to a cache Redis blocklist until token expiry; check the blocklist before any cache lookup.
- Consequence: Verify revocation immediately blocks cached and uncached report access.
