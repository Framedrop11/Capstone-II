# ADR-0016: Keep queue and cache Redis separate in the demo cluster

- Status: Accepted; consistent with [ADR-0009](0009-separate-redis-instances.md).
- Date: 2026-11-17

## Decision

Deploy two Redis instances in each demo cluster namespace: BullMQ queue Redis configured with `noeviction`, and cache Redis configured with an LRU eviction policy. Do not combine queue and cache roles.

## Consequences

Queue durability and cache eviction can be managed independently. This increases resource requests, so the total must be included in D5's resource-fit calculation. It does not itself provide Redis high availability.
