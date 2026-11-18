# ADR-0016: Keep queue and cache Redis separate in the demo cluster

- Status: Accepted; optional staging add-on manifests prepared, but not included in overlays or runtime-verified. Consistent with [ADR-0009](0009-separate-redis-instances.md).
- Date: 2026-11-17

## Decision

Deploy two authenticated Redis instances in the demo cluster namespace: BullMQ queue Redis configured with `noeviction` and append-only persistence, and cache Redis configured with `allkeys-lru` and no persistence. Do not combine queue and cache roles. The optional manifests are under `infra/k8s/addons/demo-data` and require separate passwords in the runtime Secret.

## Consequences

Queue durability and cache eviction can be managed independently. Queue persistence is not a backup or high-availability design. This increases resource requests, so the total must be included in D8's full-stack resource-fit calculation. It does not itself provide Redis high availability.
