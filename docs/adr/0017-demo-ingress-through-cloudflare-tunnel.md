# ADR-0017: Expose the demo cluster through Cloudflare Tunnel

- Status: Accepted as a target; credentials and domain pending.
- Date: 2026-11-17

## Decision

Run `cloudflared` in the cluster and route it to an `ingress-nginx` ClusterIP Service. Terminate public TLS at Cloudflare; do not provision a cloud load balancer or cert-manager for the demo. The domain is `<<MANUAL:DOMAIN_NAME>>`.

## Consequences

This avoids a billable public load balancer and gives the staging API an HTTPS endpoint. Tunnel tokens and credentials belong in Kubernetes Secrets. A quick tunnel is rehearsal-only because its URL can change. Production exposure still requires review of Cloudflare account, DNS, access controls, and origin behavior.
