import numpy as np
import pandas as pd
import pytest

from app.ml.models.forecaster import TrafficForecaster


def test_forecast_trigger_route_exists():
    from app.main import app

    assert "/api/v1/forecasts/trigger" in {route.path for route in app.routes}
    assert "/api/v1/forecasts/validation" in {route.path for route in app.routes}


def test_prophet_model_training_on_synthetic_30_rows():
    df = pd.DataFrame({
        "timestamp": pd.date_range("2026-01-01", periods=30, freq="D"),
        "vehicles_count": np.linspace(100, 160, 30),
    })

    output = TrafficForecaster().predict(df, horizon_days=3, zone_id="test-zone")

    assert len(output) == 3
    assert {"date", "predicted", "y_lower", "y_upper"} <= set(output[0])


def test_forecast_under_30_rows_returns_clear_error():
    df = pd.DataFrame({"timestamp": pd.date_range("2026-01-01", periods=5), "vehicles_count": [1, 2, 3, 4, 5]})

    with pytest.raises(ValueError, match="minimum 30 records required"):
        TrafficForecaster().predict(df, horizon_days=3)
