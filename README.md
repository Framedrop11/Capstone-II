# CareLens

CareLens is an API-first demonstration of patient-controlled report sharing and asynchronous chronic-condition risk screening. It is a screening aid, not a diagnosis; the model requires clinical validation and legal review before use with real patients.

The React UI is intentionally postponed. The future typed API client will be generated from the OpenAPI specification.

## Build stages

See [docs/PLAN.md](docs/PLAN.md) for the gated implementation sequence and [docs/TRACEABILITY.md](docs/TRACEABILITY.md) for the requirement map. The source specifications are in `docs/CareLens_SRS.docx` and `docs/CareLens_SDD.docx`.

## Development

Node.js LTS and npm are required. Use `npm run lint`, `npm run typecheck`, `npm test`, and `make verify` as the implementation stages add their checks. Local services and deployment instructions will be added in their respective stages.
