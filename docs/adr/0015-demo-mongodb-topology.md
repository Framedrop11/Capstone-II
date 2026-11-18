# ADR-0015: Run MongoDB in the demo cluster

- Status: Accepted; optional staging add-on manifests prepared, but not included in overlays or runtime-verified.
- Date: 2026-11-17

## Context

CareLens migrations create a restricted audit-log database role. Some free managed tiers may not support the required role permissions.

## Decision

The demo cluster will run MongoDB as a single-member replica set with a replica-set init Job and a separate migration identity. Optional manifests are under `infra/k8s/addons/demo-data`; they require persistent storage and secrets and must be reviewed and verified before manual application. Production should use a managed three-member replica set. This decision is contingent on resource-fit analysis before cluster provisioning.

## Consequences

The demo can exercise migrations and transaction behavior without assuming that a managed tier supports custom roles. A single-member demo database is not equivalent to production availability or backup. D8 must review and validate the add-on and drill backup/restore before calling the demo live-ready.
