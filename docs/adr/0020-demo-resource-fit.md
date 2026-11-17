# ADR-0020: Require resource-fit evidence before provisioning

- Status: Accepted; provider and node sizing pending.
- Date: 2026-11-17

## Context

The previous local three-node kind attempt failed during kubeadm initialization, and the host has limited memory. Provisioning without a resource budget risks repeating an unstable demo or incurring avoidable cost.

## Decision

Use x86 nodes by default. Before any cloud provisioning, calculate the sum of requests for API, frontend, worker, ML, MongoDB, both Redis instances, Prometheus, Grafana, ingress-nginx, metrics-server, and cloudflared. Include system and daemon overhead and show the calculation against the selected node shape. The supplied host profile is 7.73 GiB RAM, Intel Core i3-1215U (6 cores), Windows build 10.0.26300; local multi-node capacity remains unverified. Do not provision until provider/region/shape/cost basis/teardown are shown and explicitly approved.

## Consequences

The demo should choose cloud nodes only after user approval or use a local/hosted CI cluster if that is the selected path. If ARM is later selected, add multi-architecture image builds. No cloud resources have been created.
