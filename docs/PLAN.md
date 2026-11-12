# CareLens implementation plan

## Source review

Stage 0 read the complete supplied `CareLens_SRS.docx` and `CareLens_SDD.docx` by extracting each Word document's `word/document.xml` paragraphs as UTF-8 text. The SRS identifies FR-1.1–FR-7.3 (29 functional requirements) and PR-1–PR-11 (11 performance/reliability requirements). The SDD supplies architecture and data-design detail. The original documents remain unchanged.

## Stage gates

Each stage has a verification report with actual command output before the next stage begins.

| Stage | Scope | Gate focus |
|---|---|---|
| 0 | Source review, decisions, traceability, repository/tooling scaffold | Structure, lint/typecheck/test tooling, source/requirement inventory |
| 1 | Data models, indexes, migrations | MongoDB schema and database-level audit permissions |
| 2 | Authentication and sessions | OIDC adapter, JWTs, refresh rotation, RBAC |
| 3 | Core API and OpenAPI | Contract validation, endpoints, auth/access tests |
| 4 | Queue and workers | Basic score, ML timeout/fallback, retries and crash recovery |
| 5 | ML pipeline and service | Reproducible training, evaluation, serving and promotion gate |
| 6 | Cache architecture | Single-flight, fail-open behavior and revocation race |
| 7 | Observability | Metrics, structured logs, dashboards and alerts |
| 8 | Docker and Compose | Clean local stack and health checks |
| 9 | Kubernetes | Kustomize overlay validation and policy review |
| 10 | GitHub Actions | CI, build, model gate and deployment workflows |
| 11 | Full test hardening | E2E, resilience, security, load and final verification |

## Stage 0 implementation plan

1. Review both specifications and inventory every FR/PR identifier.
2. Record the ten decisions supplied by the master prompt as ADRs, plus document conflicts and explicit assumptions.
3. Add the traceability matrix, stage plan, repository directories, strict TypeScript/tooling baseline, Makefile targets, frontend deferral note and PR workflow skeleton.
4. Run available local verification commands and record their exact outcomes in `docs/verification/stage0.md`.

## Known source conflicts for resolution

The SRS calls for the Core API to compute the basic score in its system-context and operations descriptions, while the SDD says the worker owns scoring; the master prompt explicitly selects the worker. The SRS specifies snake_case database fields while the master prompt selects camelCase. The SRS says session state is stateless while the master prompt requires rotating persisted refresh-token families. Decisions and requested source-document corrections are recorded in ADRs and `DOC_UPDATES_NEEDED.md`.
