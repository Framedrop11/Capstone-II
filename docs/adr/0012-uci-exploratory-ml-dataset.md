# ADR-0012: use UCI diabetes survey data for an exploratory ML service

- Status: accepted for Stage 5 demonstration only
- Date: 2026-11-12

## Context

The SRS and SDD require a separate FastAPI ML service and public health-survey training data, but name neither a dataset nor a model. Stage 4 uses FINDRISC. No dataset with aligned FINDRISC outcome labels was supplied.

## Decision

Use UCI Machine Learning Repository dataset 529, “Early Stage Diabetes Risk Prediction,” under CC BY 4.0. Train a logistic regression using age, sex, and its obesity field; map questionnaire BMI >= 30 to obesity at inference. Keep the full Stage 4 response shape in the API contract but do not treat the unused answers as model features. Use a fixed stratified 80/20 holdout and seed 2026. Version artifacts and reject candidate promotion unless AUC strictly improves while recall and Brier score are no worse.

## Consequences

The API can demonstrate versioned serving, canary selection, and a deterministic promotion gate. Dataset size and population specificity limit generalization, and its label is not FINDRISC's 10-year diabetes risk. The returned score is not calibrated or clinically valid. It must not be represented as such. Replace this dataset and evaluation design before any clinical use.

## Source

UCI Machine Learning Repository, [Early Stage Diabetes Risk Prediction](https://archive.ics.uci.edu/dataset/0529/diabetes), CC BY 4.0.
