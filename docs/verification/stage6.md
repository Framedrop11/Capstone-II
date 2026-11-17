# Stage 6 verification

Date: 2026-11-12

## Built

- Added Redis cache-aside report reads keyed by a SHA-256 digest of patient and prediction identifiers. Entries use a five-minute TTL plus 0–60 seconds of jitter; per-key in-process single-flight coalesces concurrent reads. Cache failures fall through to MongoDB.
- Worker prediction writes invalidate the report entry. An epoch fence prevents a loader that began before invalidation from repopulating stale data afterward.
- Patient report access still verifies the authenticated patient's ownership. Doctor report access queries current, unrevoked, unexpired consent before using cached report data and writes an audit row on each successful read. Consent grants and revocations are not cached.
- Added a short-lived model-version list cache (15 seconds) with a generation bump after promotion or rollback. Existing rate-limit counters remain in Redis; the limiter fails open if Redis is unavailable.
- Added version-partitioned ML result caching in Redis using a hash of normalized inference features and the selected model version. Redis locks coalesce concurrent cache misses, and cache outages fall through to model inference. Entries use 300–360 seconds TTL.
- Core API readiness now reports cache outage as degraded while remaining ready if MongoDB and the queue are healthy; cache outage does not remove otherwise functioning API instances from service.

## Commands and results

`npm run lint`, `npm run typecheck`, and `npm run build:test` — exit code 0.

`services\ml-service\.venv\Scripts\python.exe -m pytest -q tests` — exit code 0: 6 passed.

`services\ml-service\.venv\Scripts\pyb.exe --no-venvs` from `services\ml-service` — exit code 0; PyBuilder publish and its 6 Python tests passed.

`node --test .test-dist/tests/integration/ml-service.test.js .test-dist/tests/integration/report-cache.test.js` — exit code 0: 4 passed using real Redis 7 and MongoDB 7 containers. The ML HTTP test confirmed Redis result-cache hits. Report-cache integration confirmed concurrent reads coalesce, invalidation prevents stale refill, reads fall back after Redis disconnect, a cache hit cannot bypass consent revocation, and rate limits fail open when Redis disconnects.

`npm run verify` — exit code 0: lint, typecheck, and 22 unit tests passed.

`npm run test:integration` — exit code 0: all 9 integration tests passed across audit immutability, sessions, Core API contract, queue/worker behavior, ML service/registry, and report caching, using real Docker MongoDB/Redis containers.

## Cache/privacy behavior

Report payloads and ML scores are stored only in the application-controlled cache Redis with bounded TTLs; cache keys contain hashes rather than raw feature values or patient identifiers. No CDN or ingress response caching was added. The doctor path never caches consent decisions and checks MongoDB on every access. Redis access control, TLS, and deployment resource policies are part of the later infrastructure stages.

## Known gaps

- Stage 6 does not implement a shared Redis cache for arbitrary rate-limited API response bodies. It caches report reads, short-lived model-version listings, rate-limit counters, and ML results.
- The 15-second model-version list cache is invalidated on manual promote and rollback. An automated canary controller is not implemented; Stage 5 verification records that gap.
- The service cache lock is bounded (200 ms wait, four-second lease); on lock timeout or Redis failure inference proceeds without waiting, preserving availability at the cost of a possible duplicate computation.

## Gate status

**Stage 6 implementation and runtime gate passed** for the cache paths and required fail-open, single-flight, invalidation, and consent-revocation behavior. Docker Compose wiring remains Stage 8.
