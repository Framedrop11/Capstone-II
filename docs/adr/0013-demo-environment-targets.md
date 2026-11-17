# ADR-0013: Separate live demo staging from production

- Status: Accepted as a demo target; AKS selected, not deployed or runtime-verified.
- Date: 2026-11-17

## Context

The demo needs visible features and seeded synthetic identities, while the production profile must avoid demo behavior. A single deployment cannot safely serve both purposes.

## Decision

Use the Kubernetes `staging` namespace as the live demonstration target and point the Vercel frontend at its API. Use the `production` namespace only behind the GitHub production approval gate with demo features disabled, Swagger UI disabled, minimum replicas, and post-deploy smoke checks. AKS is the selected target provider. Subscription, region, node shape, credentials, cost estimate, and teardown plan remain pending for D8; no Azure resources are authorized or created in D0.

## Consequences

Staging can use synthetic demo accounts, short demo intervals, and visible operational tooling. Production remains a separate configuration and approval boundary. AKS is only the provider choice; no cluster, Vercel project, or namespace has been provisioned.
