# ADR-0019: Bake model artifacts into the ML image

- Status: Implemented in the ML image and inference manifests; image publication and runtime verification pending.
- Date: 2026-11-17

## Decision

Package the stable model artifact into the ML container image at `/app/models`. Include demo canary artifacts only when the build explicitly sets `INCLUDE_DEMO_CANARY=true`; the production default removes them. Do not require a shared model volume at inference time. Candidate promotion creates a new immutable image and digest. Retraining and publishing are explicit build/release operations; the former weekly in-cluster model-artifact CronJob and PVC are removed.

## Consequences

Inference deployments become reproducible and do not depend on RWX storage. A new artifact requires a new immutable image build and digest. Runtime verification of the published image and Kubernetes rollout remains a deployment gate.
