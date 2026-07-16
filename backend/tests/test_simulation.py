from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.simulation_service import run_simulation


def _find_return(items):
    return MagicMock(to_list=AsyncMock(return_value=items))


@pytest.mark.asyncio
async def test_add_road_scenario_decreases_travel_time():
    db = MagicMock()
    zones = [{"zone_id": "a", "area_sqkm": 1, "population": 1000}, {"zone_id": "b", "area_sqkm": 1, "population": 1000}]
    roads = [{"zone_a": "a", "zone_b": "b", "travel_time_minutes": 20, "capacity": 1000}]
    db.city_zones.find.return_value = _find_return(zones)
    db.roads.find.return_value = _find_return(roads)

    with patch("app.services.simulation_service.compute_zone_analytics", AsyncMock(return_value={"population": 1000, "area_sqkm": 1, "traffic_score": 50, "aqi": 80})):
        result = await run_simulation(db, "ADD_ROAD", {"zone_a": "a", "zone_b": "b", "capacity": 8000}, "city-1")

    assert result["after_metrics"]["travel_time_between_zones"] < 20


@pytest.mark.asyncio
async def test_population_growth_facility_demand_increases_proportionally():
    db = MagicMock()
    zones = [{"zone_id": "a", "area_sqkm": 1, "population": 1000}]
    db.city_zones.find.return_value = _find_return(zones)
    db.roads.find.return_value = _find_return([])

    with patch("app.services.simulation_service.compute_zone_analytics", AsyncMock(return_value={"population": 1000, "area_sqkm": 1, "traffic_score": 50, "aqi": 80})):
        result = await run_simulation(db, "POPULATION_GROWTH", {"zone_id": "a", "growth_pct": 20}, "city-1")

    assert result["after_metrics"]["coverage"] < result["before_metrics"]["coverage"]
    assert result["delta_metrics"]["traffic_change_pct"] > 0
