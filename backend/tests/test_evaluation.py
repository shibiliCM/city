import pandas as pd

from app.ml.evaluation import (
    classification_metrics,
    evaluate_holdout,
    naive_last_value_forecast,
    regression_metrics,
)


def test_regression_metrics_are_stable():
    metrics = regression_metrics([100, 110, 120], [98, 115, 123])

    assert metrics["n"] == 3
    assert metrics["mae"] == 3.333
    assert metrics["rmse"] > 0
    assert metrics["mape"] > 0


def test_holdout_evaluation_compares_baseline():
    df = pd.DataFrame(
        {
            "actual": [100, 120, 140, 160],
            "model": [102, 119, 138, 161],
            "baseline": [100, 100, 100, 100],
        }
    )

    result = evaluate_holdout(df, "actual", "model", baseline_col="baseline")

    assert result["model"]["mae"] < result["baseline"]["mae"]
    assert result["mape_improvement_pct"] > 0


def test_naive_last_value_forecast_uses_last_observation():
    assert naive_last_value_forecast([3, 4, 7], horizon=3) == [7.0, 7.0, 7.0]


def test_classification_metrics_include_confusion_matrix():
    report = classification_metrics(["low", "high", "high"], ["low", "medium", "high"])

    assert report["accuracy"] == 0.667
    assert report["labels"] == ["high", "low", "medium"]
    assert len(report["confusion_matrix"]) == 3
