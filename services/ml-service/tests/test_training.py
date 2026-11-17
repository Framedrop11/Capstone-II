import numpy as np
import pandas as pd

from carelens_ml.models import make_pipeline
from carelens_ml.training import confirmed_outcome_row, evaluate_candidate, fit_and_evaluate, fit_confirmed_outcomes


def sample_data():
    random = np.random.default_rng(17)
    count = 400
    age = random.integers(20, 80, count)
    obesity = random.integers(0, 2, count)
    sex = random.choice(["female", "male"], count)
    logits = (age - 50) / 12 + obesity * 0.9 + (sex == "male") * 0.15
    probability = 1 / (1 + np.exp(-logits))
    label = random.binomial(1, probability)
    return pd.DataFrame({"ageYears": age, "obesity": obesity, "sex": sex}), pd.Series(label)


def test_fixed_holdout_training_is_reproducible_and_metrics_are_bounded():
    features, target = sample_data()
    first = fit_and_evaluate(features, target)
    second = fit_and_evaluate(features, target)
    assert first.metrics == second.metrics
    assert first.info["holdoutRows"] == 80
    assert 0 <= first.metrics["auc"] <= 1
    assert 0 <= first.metrics["recall"] <= 1
    assert 0 <= first.metrics["precision"] <= 1
    assert 0 <= first.metrics["brier"] <= 1


def test_promotion_gate_rejects_worse_or_tied_models_and_accepts_strict_improvement():
    stable = {"auc": 0.80, "recall": 0.75, "brier": 0.16}
    assert evaluate_candidate({"auc": 0.80, "recall": 0.75, "brier": 0.16}, stable)[0] is False
    assert evaluate_candidate({"auc": 0.81, "recall": 0.74, "brier": 0.15}, stable)[0] is False
    accepted, _reason = evaluate_candidate({"auc": 0.81, "recall": 0.76, "brier": 0.15}, stable)
    assert accepted is True


def test_confirmed_outcome_retraining_uses_fixed_benchmark_holdout(tmp_path):
    source_features, target = sample_data()
    features, labels = source_features, target
    outcome_rows = [
        ({"ageYears": float(row.ageYears), "bmi": 32 if row.obesity else 25, "sex": row.sex}, "positive" if label else "negative")
        for row, label in zip(features.itertuples(index=False), labels, strict=True)
    ]
    benchmark_path = tmp_path / "benchmark.csv"
    benchmark = source_features.assign(
        age=source_features["ageYears"], gender=source_features["sex"], obesity=source_features["obesity"].map({1: "Yes", 0: "No"}),
        **{"class": labels.map({1: "Positive", 0: "Negative"})},
    )
    benchmark[["age", "gender", "obesity", "class"]].to_csv(benchmark_path, index=False)
    stable = make_pipeline()
    stable.fit(source_features, labels)
    candidate, stable_metrics = fit_confirmed_outcomes(outcome_rows, stable, benchmark_path)
    assert candidate.info["trainRows"] == 400
    assert candidate.info["holdoutRows"] == 80
    assert candidate.info["trainingSource"].startswith("doctor-confirmed outcomes")
    assert set(candidate.metrics) == {"auc", "recall", "precision", "brier"}
    assert set(stable_metrics) == set(candidate.metrics)
    assert confirmed_outcome_row({"ageYears": 30, "bmi": 24, "sex": "male"}, "unknown") is None
