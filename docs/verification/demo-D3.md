# D3 deterministic model canary

Status: controller implementation and ML unit/integration-level checks are complete. The local runtime candidate is configured, but the user requested to perform the remaining manual/runtime demonstration checks. Do not treat D3 as fully demo-verified until the ramp and rollback are observed in the running UI.

## Implemented

- Added an in-process controller in `services/ml-service/src/main/python/carelens_ml/canary.py`.
- With a candidate artifact and `ML_AUTO_CANARY_ENABLED=true`, traffic starts at 5%, then advances through 25%, 50%, 75%, and 100% after the configured sample count and stage interval.
- It rolls back to 0% when candidate error rate exceeds 1%, fallback rate exceeds 5%, candidate p95 inference latency exceeds 500 ms, or mean absolute score drift from the stable model exceeds 0.25.
- Decision history is logged as structured `canary_decision` entries, included in the ML health/metrics endpoints, exposed through the admin-only Core API endpoint `/api/v1/admin/model-canary`, and displayed on the admin model page.
- Production refuses `ML_AUTO_CANARY_ENABLED=true` and refuses demo canary fixture artifacts. Local fixture generation requires `ML_DEMO_CANARY_FIXTURES=true` and uses a candidate identical to the stable model, so it demonstrates routing/control behavior only.
- Added service tests for healthy progression to 100%, inference failure rollback, production refusal, and disabled-controller behavior.

## Observed checks

- ML test suite: 13 passed, including the app-level candidate traffic ramp and bad-candidate rollback tests.
- TypeScript typecheck and ESLint passed after adding the admin endpoint and UI.
- Docker image build completed after fixing the generated OpenAPI decision-history types. The Compose start reported ML and Core API healthy. The live `/health` observation was not captured after the user's request to stop running tests.
- User later reported that the three focused rollback/production-refusal tests listed in `demo-user-test-checklist.md` passed: 3 passed in 20.77s. This is user-reported evidence for those cases, not an independently rerun result; the live UI ramp remains pending.

## Local settings

- `.env.demo` is gitignored and contains `ML_DEMO_CANARY_FIXTURES=true`, a path to `demo-canary-good.joblib`, auto-canary enabled, one sample per stage, and a one-second stage interval.
- `services/ml-service/models/demo-canary-good.joblib` is generated from the existing stable model and gitignored. It is a synthetic routing fixture, not a new or clinically validated model.
- Current stage decision history is in process memory and container logs; restart the ML container to reset the demo.

## Remaining proof

- On the admin page, observe the canary traffic reach 100% and the decision history show `completed`.
- Exercise the bad-candidate test and observe `rolled_back` with traffic at 0%.
- Confirm prod startup rejects the demo fixture/auto-controller settings.
- The browser journey and real Google consent are still D2 manual checks.
