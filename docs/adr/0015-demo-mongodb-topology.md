# ADR-0015: Run MongoDB in the demo cluster

- Status: Accepted for the demo target; not implemented or deployed.
- Date: 2026-11-17

## Context

CareLens migrations create a restricted audit-log database role. Some free managed tiers may not support the required role permissions.

## Decision

The demo cluster will run MongoDB as a single-member replica set with an init Job and a separate migration identity. Production should use a managed three-member replica set. This decision is contingent on resource-fit analysis before cluster provisioning.

## Consequences

The demo can exercise migrations and transaction behavior without assuming that a free-tier managed service supports custom roles. A single-member demo database is not equivalent to production availability or backup. D4/D5/D8 must implement, validate, and drill it.
