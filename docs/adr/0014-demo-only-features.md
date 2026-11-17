# ADR-0014: Gate demo features by environment configuration

- Status: Accepted as a design requirement; implementation and production-refusal tests remain planned.
- Date: 2026-11-17

## Decision

Demo-only behavior (seeded identities, abbreviated share durations, shortened canary intervals, and model fixtures) must be enabled only by explicit staging/local configuration. Production must reject or force-disable these settings at startup. A test must prove the production overlay cannot enable them.

## Consequences

Demo convenience remains separate from production defaults. D2–D6 must add the flags, validation, and tests before this decision is considered implemented. No fixtures or production behavior are changed by this ADR alone.
