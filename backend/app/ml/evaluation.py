from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import numpy as np
import pandas as pd


def _as_float_array(values: Iterable[Any]) -> np.ndarray:
    return pd.to_numeric(pd.Series(list(values)), errors="coerce").astype(float).to_numpy()


def regression_metrics(actual: Iterable[Any], predicted: Iterable[Any]) -> dict[str, float]:
    """Return standard regression metrics for model cards and reports."""
    y_true = _as_float_array(actual)
    y_pred = _as_float_array(predicted)
    mask = np.isfinite(y_true) & np.isfinite(y_pred)
    if not mask.any():
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0, "bias": 0.0, "n": 0}

    y_true = y_true[mask]
    y_pred = y_pred[mask]
    errors = y_pred - y_true
    denom = np.where(np.abs(y_true) < 1e-9, np.nan, np.abs(y_true))
    mape = np.nanmean(np.abs(errors) / denom) * 100
    return {
        "mae": round(float(np.mean(np.abs(errors))), 3),
        "rmse": round(float(np.sqrt(np.mean(errors**2))), 3),
        "mape": round(float(0.0 if np.isnan(mape) else mape), 3),
        "bias": round(float(np.mean(errors)), 3),
        "n": int(len(y_true)),
    }


def naive_last_value_forecast(values: Iterable[Any], horizon: int) -> list[float]:
    series = _as_float_array(values)
    finite = series[np.isfinite(series)]
    last = float(finite[-1]) if len(finite) else 0.0
    return [last for _ in range(max(0, horizon))]


def evaluate_holdout(
    df: pd.DataFrame,
    target_col: str,
    prediction_col: str,
    baseline_col: str | None = None,
) -> dict[str, Any]:
    """Compare model predictions against actual values and an optional baseline."""
    if target_col not in df.columns or prediction_col not in df.columns:
        raise ValueError("target_col and prediction_col must exist in dataframe")

    model = regression_metrics(df[target_col], df[prediction_col])
    result: dict[str, Any] = {"model": model}
    if baseline_col and baseline_col in df.columns:
        baseline = regression_metrics(df[target_col], df[baseline_col])
        result["baseline"] = baseline
        result["mape_improvement_pct"] = round(
            ((baseline["mape"] - model["mape"]) / max(baseline["mape"], 1e-9)) * 100,
            2,
        )
    return result


@dataclass(frozen=True)
class ClassificationReport:
    accuracy: float
    precision_macro: float
    recall_macro: float
    labels: list[str]
    confusion_matrix: list[list[int]]

    def as_dict(self) -> dict[str, Any]:
        return {
            "accuracy": self.accuracy,
            "precision_macro": self.precision_macro,
            "recall_macro": self.recall_macro,
            "labels": self.labels,
            "confusion_matrix": self.confusion_matrix,
        }


def classification_metrics(actual: Iterable[str], predicted: Iterable[str]) -> dict[str, Any]:
    y_true = [str(x).lower() for x in actual]
    y_pred = [str(x).lower() for x in predicted]
    labels = sorted(set(y_true) | set(y_pred))
    if not labels:
        return ClassificationReport(0.0, 0.0, 0.0, [], []).as_dict()

    index = {label: i for i, label in enumerate(labels)}
    matrix = [[0 for _ in labels] for _ in labels]
    for truth, pred in zip(y_true, y_pred):
        matrix[index[truth]][index[pred]] += 1

    total = sum(sum(row) for row in matrix)
    correct = sum(matrix[i][i] for i in range(len(labels)))
    precisions = []
    recalls = []
    for i in range(len(labels)):
        tp = matrix[i][i]
        fp = sum(matrix[row][i] for row in range(len(labels)) if row != i)
        fn = sum(matrix[i][col] for col in range(len(labels)) if col != i)
        precisions.append(tp / max(tp + fp, 1))
        recalls.append(tp / max(tp + fn, 1))

    return ClassificationReport(
        accuracy=round(correct / max(total, 1), 3),
        precision_macro=round(float(np.mean(precisions)), 3),
        recall_macro=round(float(np.mean(recalls)), 3),
        labels=labels,
        confusion_matrix=matrix,
    ).as_dict()
