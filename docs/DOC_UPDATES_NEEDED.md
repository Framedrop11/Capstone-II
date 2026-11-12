# Source document updates needed

The implementation decisions below are defined by the master prompt. Update the SRS and SDD through the project's change-management process; do not silently alter the supplied baseline.

1. Reconcile the SRS system-context/operations wording that assigns basic scoring to the Core API with the SDD and chosen worker-only scoring ownership.
2. Change database and JSON naming examples from snake_case/model-prefixed spellings to camelCase (`basicScore`, `mlScore`, `modelVersion`), or formally retain the alternative convention.
3. Extend session data design to cover persisted rotating refresh tokens, token-family reuse detection and family-wide revocation; the current SRS calls JWT sessions stateless.
4. Document notification persistence and the pluggable email/SMS adapter, including the doctor share notification.
5. Add the Patients entity/schema (one-to-one `userId` reference to Users; patient records reference the Patient identifier) and the missing API endpoint table.
6. Define concrete canary health thresholds (error rate, p95 latency, fallback rate and score-distribution drift) and the measurement windows.
7. Clarify that audit immutability is enforced by a restricted database role as well as having no application update/delete route.
8. Clarify the separate BullMQ Redis and cache Redis instances, their memory policies and purpose-specific availability behavior.
9. Define the source and conditions for a published rule-based screening method, ensuring it applies to the supported questionnaire and is not invented clinical logic.
10. Reconcile any SRS/SDD requirement for a React GUI with the master prompt's explicit API-only current scope and deferred frontend.
