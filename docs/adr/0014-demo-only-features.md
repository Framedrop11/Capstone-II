# ADR-0014: Gate demo features by environment configuration

- Status: Partially implemented; D3 ML demo fixtures and auto-canary settings are gated and covered by production-refusal tests. Other demo-only behaviors remain subject to their stage gates.
- Date: 2026-11-17

## Decision

Demo-only behavior (seeded identities, abbreviated share durations, shortened canary intervals, and model fixtures) must be enabled only by explicit staging/local configuration. Production must reject or force-disable these settings at startup. A test must prove the production overlay cannot enable them.

## D3 implementation

- `ML_DEMO_CANARY_FIXTURES=true` and a `demo-canary-*` artifact are refused in `CARELENS_ENV=prod`.
- `ML_AUTO_CANARY_ENABLED=true` is refused in `prod`.
- The local/staging controller's ramp/rollback events are visible on ML health/metrics and the authenticated admin model page.
- The local fixture is an identical copy of the stable estimator with a different version label; it tests routing only, not model improvement or clinical performance.

## Consequences

Demo convenience remains separate from production defaults. The remaining behaviors such as seeded identities and abbreviated demo durations still require their own gates. No clinical validity is implied by a successful canary ramp.
