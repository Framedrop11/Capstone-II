# ADR-0009: Separate queue Redis from cache Redis

- Status: Accepted
- Decision: BullMQ uses its own Redis configured with `noeviction`; cache, blocklist and rate limits use a separate Redis configured with `allkeys-lru`.
- Consequence: Compose and Kubernetes deploy separate instances; application configuration must not permit accidental sharing.
