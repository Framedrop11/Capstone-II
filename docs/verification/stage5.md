# Stage 5 verification

Date: 2026-11-12

## Built

- Added a Python/FastAPI ML service with strict Pydantic validation matching the Stage 4 questionnaire payload, `/predict`, `/health`, and Prometheus text format at `/metrics`.
- Added stable and optional canary artifact loading, configurable random canary traffic selection, model version and score output, and ranked positive logistic contributions as factors.
- Added a reproducible training pipeline using UCI dataset 529 with a stratified 80/20 holdout and seed 2026. It saves AUC, recall, precision, Brier score, dataset hash, and artifact checksum with the versioned model.
- Added a candidate gate that rejects tied or worse AUC and requires recall and Brier score to be no worse than stable.
- Added `retrain.py`, which loads doctor-confirmed outcomes and linked questionnaire features from MongoDB, accepts only positive/negative labels, trains a candidate, evaluates candidate and stable on the same fixed UCI holdout, and registers an artifact only when all promotion criteria pass.
- Documented dataset limits in `ml/DATASETS.md` and ADR-0012. The output is exploratory and is not a calibrated FINDRISC estimate or clinically validated.

## Commands and results

`services\ml-service\.venv\Scripts\python.exe services\ml-service\train.py --mode stable --version carelens-logreg-v1` — exit code 0. Metrics: AUC 0.8242, recall 0.7344, precision 0.7581, Brier 0.1620 (fixed holdout, 104 cases).

`services\ml-service\.venv\Scripts\python.exe -m pytest -q tests` from `services\ml-service` — exit code 0: 6 passed, including deterministic doctor-outcome retraining and fixed-holdout comparison.

`\.venv\Scripts\pyb.exe --no-venvs` from `services\ml-service` — exit code 0, PyBuilder `publish` succeeded and ran the same 6 tests. PyBuilder’s isolated virtualenv mode was also attempted but could not download dependencies because the sandbox could not resolve pypi.org; the successful command therefore reused the already provisioned service environment.

## Coverage and known gaps

- Covers Stage 5 training and serving: deterministic fixed-holdout evaluation, artifact serialization/loading, request validation, prediction output, health/metrics routes, doctor-outcome retraining, candidate promotion criteria, stable/canary selection code.
- `npm run build:test` followed by `node --test .test-dist/tests/integration/ml-service.test.js` — exit code 0: 2 passed. One launched the actual Uvicorn service and exercised `/health`, `/predict`, and `/metrics` over HTTP. The other wrote and read a real `modelVersions` document in a Docker MongoDB 7 container.
- UCI source data is included at `ml/data/uci-early-stage-diabetes.csv` (520 rows, selected fields only). The dataset’s source and license are identified in `ml/DATASETS.md`.
- MongoDB registration is conditional on `MONGODB_URI`; training without it writes a local artifact only. The integration check verified the registry writer against MongoDB, while the CLI training command was separately run without a registry URI.
- Retraining is invoked as a command and is not yet scheduled. The automatic five-minute canary ramp/rollback controller is not implemented; the service supports stable/canary loading and traffic selection, and the admin API supports manual promote/rollback. These remain later controller integration work.
- The score is not clinically valid or calibrated to FINDRISC’s 10-year risk. See ADR-0012.

## Gate status

**Stage 5 implementation and runtime gate passed** for training, doctor-outcome retraining logic, artifact serving, real HTTP health/prediction/metrics, and a real MongoDB registry write. Scheduling and automatic canary ramp/rollback remain explicit gaps; the training and serving score is exploratory, not clinically validated.
