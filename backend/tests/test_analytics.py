from unittest.mock import AsyncMock, MagicMock

import pandas as pd
import pytest

from app.services.analytics_service import compute_zone_analytics, get_traffic_hotspots, get_traffic_trend


@pytest.mark.asyncio
async def test_kpi_empty_zone_handling_returns_defaults():
    db = MagicMock()
    db.analytics_snapshots.find_one = AsyncMock(return_value=None)
    db.city_zones.find_one = AsyncMock(return_value={"zone_id": "z1", "name": "Zone 1", "area_sqkm": 2, "population": 100})

    result = await compute_zone_analytics(db, "city-1", "z1")

    assert result["traffic_score"] == 0.0
    assert result["aqi"] == 0.0
    assert result["population_density"] == 50


@pytest.mark.asyncio
async def test_hotspot_ranking_correctness():
    db = MagicMock()
    with pytest.MonkeyPatch.context() as monkeypatch:
        async def rows(_db, _city_id):
            return [{"zone_id": "a", "traffic_score": 20}, {"zone_id": "b", "traffic_score": 90}]

        monkeypatch.setattr("app.services.analytics_service._all_zone_analytics", rows)
        result = await get_traffic_hotspots(db, "city-1", 2)

    assert [row["zone_id"] for row in result] == ["b", "a"]


@pytest.mark.asyncio
async def test_traffic_trend_uses_published_timestamped_rows():
    db = MagicMock()
    frame = pd.DataFrame(
        [
            {"zone_id": "a", "timestamp": "2026-06-18T09:00:00Z", "vehicles_count": 500},
            {"zone_id": "b", "timestamp": "2026-06-18T10:00:00Z", "vehicles_count": 700},
            {"zone_id": "a", "timestamp": "2026-06-19T09:00:00Z", "vehicles_count": 1000},
            {"zone_id": "a", "timestamp": None, "vehicles_count": 1000},
        ]
    )

    with pytest.MonkeyPatch.context() as monkeypatch:
        async def frames(_db, _city_id, _dataset_type):
            return [frame]

        monkeypatch.setattr("app.services.analytics_service._published_frames", frames)
        result = await get_traffic_trend(db, "city-1", 30)

    assert result == [
        {"date": "2026-06-18", "traffic_score": 60.0, "vehicles_count": 600.0},
        {"date": "2026-06-19", "traffic_score": 100.0, "vehicles_count": 1000.0},
    ]
