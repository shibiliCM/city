from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.api.v1.planning import PlanningRequest, recommend


@pytest.mark.asyncio
async def test_planning_recommendation_contains_zone_confidence_reasoning():
    db = MagicMock()
    db.planning_recommendations.insert_one = AsyncMock(return_value=MagicMock(inserted_id="rec-1"))
    user = {"_id": "user-1"}

    with patch("app.api.v1.planning.PlanningAgent") as agent_cls:
        agent_cls.return_value.recommend = AsyncMock(return_value={
            "recommended_zone": "Zone 1",
            "zone_id": "zone-1",
            "confidence_percent": 88,
            "reasoning": "Traffic and AQI pressure are high.",
            "supporting_data_points": [{"label": "Traffic score", "value": 91}],
            "timeline": [{"year": 1, "milestone": "Pilot"}],
        })
        result = await recommend(PlanningRequest(city_id="city-1", query="Where add buses?"), db=db, user=user)

    assert result["zone_id"] == "zone-1"
    assert result["confidence_percent"] == 88
    assert "reasoning" in result
