import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException

# Test Rate Limiter
from app.core.rate_limiter import RateLimiter
# Test Data Quality / Sniff
from app.ml.pipelines.data_quality import compute_quality_score, clean_dataframe
# Test Forecaster Fallbacks
from app.ml.models.forecaster import TrafficForecaster, _clean_predictions
# Test Risk Imputation
from app.ml.models.risk_detector import FloodRiskDetector, AccidentRiskDetector
# Test Disconnected Zones
from app.services.simulation_service import run_simulation
# Test Analytics caching
from app.services.analytics_service import get_kpi_summary, clear_analytics_cache


@pytest.mark.asyncio
async def test_rate_limiter_allows_under_limit():
    db = MagicMock()
    # Mock count_documents to return 2 (under limit of 10)
    db.rate_limits.count_documents = AsyncMock(return_value=2)
    db.rate_limits.delete_many = AsyncMock()
    db.rate_limits.insert_one = AsyncMock()
    
    limiter = RateLimiter("test_endpoint")
    user = {"_id": "user-123"}
    
    # Should run without raising HTTPException
    await limiter(user=user, db=db)
    
    assert db.rate_limits.delete_many.called
    assert db.rate_limits.insert_one.called


@pytest.mark.asyncio
async def test_rate_limiter_raises_429():
    db = MagicMock()
    # Mock count_documents to return 10 (at rate limit)
    db.rate_limits.count_documents = AsyncMock(return_value=10)
    db.rate_limits.delete_many = AsyncMock()
    
    limiter = RateLimiter("test_endpoint")
    user = {"_id": "user-123"}
    
    with pytest.raises(HTTPException) as exc_info:
        await limiter(user=user, db=db)
        
    assert exc_info.value.status_code == 429
    assert "Rate limit exceeded" in exc_info.value.detail


def test_data_quality_edge_cases():
    # 1. Empty DataFrame
    empty_df = pd.DataFrame()
    score = compute_quality_score(empty_df)
    assert score["overall_score"] == 100.0

    # 2. Single-row DataFrame (quantiles won't crash)
    single_row = pd.DataFrame([{"zone_id": "A", "val": 10.0}])
    score_single = compute_quality_score(single_row)
    assert score_single["overall_score"] == 100.0


def test_date_parsing_mixed_formats():
    # Mixed formats including standard ISO, US format, slash formatting, and NaNs
    df = pd.DataFrame({
        "timestamp": ["2026-06-01", "10/12/2026 14:30:00", None, "2026-06-03T12:00:00Z"],
        "vehicles_count": [100, 200, 150, 250]
    })
    cleaned, report = clean_dataframe(df)
    
    # Assert date column is standardized
    assert "timestamp" in report["date_columns_standardized"]
    # Verify values are ISO 8601 strings
    non_nulls = cleaned["timestamp"].dropna()
    assert len(non_nulls) == 3
    for val in non_nulls:
        assert val.endswith("Z") or "T" in val


def test_forecaster_under_30_rows():
    forecaster = TrafficForecaster()
    # Provide a dataframe with < 30 rows
    df = pd.DataFrame({
        "timestamp": pd.date_range("2026-06-01", periods=10),
        "vehicles_count": np.random.randint(100, 500, size=10)
    })
    
    with pytest.raises(ValueError) as exc_info:
        forecaster.predict(df, horizon_days=7)
        
    assert "minimum 30 records required" in str(exc_info.value)


def test_nan_inf_serialization_sanitizer():
    raw_predictions = [
        {"date": "2026-06-01", "predicted": float("nan"), "y_lower": 10.0},
        {"date": "2026-06-02", "predicted": float("inf"), "y_lower": float("-inf")},
    ]
    cleaned = _clean_predictions(raw_predictions)
    assert cleaned[0]["predicted"] is None
    assert cleaned[1]["predicted"] is None
    assert cleaned[1]["y_lower"] is None


def test_risk_imputation():
    detector = FloodRiskDetector()
    # Passing incomplete feature vector (some are None)
    features = {
        "avg_rainfall_7day_mm": None,
        "elevation_m": 12.0,
    }
    # Should impute average rainfall and compute risk successfully
    res = detector.predict(features)
    assert "risk_level" in res
    assert "risk_score" in res


@pytest.mark.asyncio
async def test_disconnected_zones_gravity():
    db = MagicMock()
    # Setup zones and roads mock to simulate disconnected graph
    zones = [
        {"zone_id": "zone-A", "city_id": "city-1", "area_sqkm": 2.0, "population": 5000},
        {"zone_id": "zone-B", "city_id": "city-1", "area_sqkm": 3.0, "population": 8000},
    ]
    
    # Stub database methods
    db.city_zones.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=zones)))
    db.roads.find = MagicMock(return_value=MagicMock(to_list=AsyncMock(return_value=[]))) # No roads between them
    
    # Mock compute_zone_analytics to return empty mock stats
    with patch("app.services.simulation_service.compute_zone_analytics") as mock_analytics:
        mock_analytics.side_effect = lambda db, cid, zid: AsyncMock(return_value={
            "population": 1000, "area_sqkm": 1.0, "traffic_score": 50.0, "aqi": 80.0
        })()
        
        # Run ADD_ROAD simulation to trigger travel time checks
        params = {"zone_a": "zone-A", "zone_b": "zone-B", "capacity": 5000}
        res = await run_simulation(db, "ADD_ROAD", params, "city-1")
        
        # Verify gravity fallback when no path exists
        assert res["after_metrics"]["travel_time_between_zones"] == "No road connection exists between zones"


@pytest.mark.asyncio
async def test_analytics_caching():
    db = MagicMock()
    city_id = "city-cache-test"
    
    # Mock internal compute function
    with patch("app.services.analytics_service._compute_kpi_summary") as mock_compute:
        mock_compute.return_value = AsyncMock(return_value={"total_population": 42000})()
        
        # Clear cache first
        clear_analytics_cache(city_id)
        
        # First call: computes
        res1 = await get_kpi_summary(db, city_id)
        assert res1["total_population"] == 42000
        assert mock_compute.call_count == 1
        
        # Second call: returns cached data without calling compute again
        res2 = await get_kpi_summary(db, city_id)
        assert res2["total_population"] == 42000
        assert mock_compute.call_count == 1
