# ADR-0019: Bake model artifacts into the ML image

- Status: Accepted for demo deployment; not implemented in the current Kubernetes layout.
- Date: 2026-11-17

## Decision

Package the stable and demo canary model artifacts into the ML container image. Run retraining only as an explicitly triggered Kubernetes Job; do not require a shared model volume at inference time.

## Consequences

Inference deployments become reproducible and do not depend on RWX storage. A new artifact requires a new immutable image build and digest. D3/D5 must implement model fixtures behind a demo-only flag and verify that production configuration refuses them.
