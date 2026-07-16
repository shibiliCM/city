from typing import Literal

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.database import get_database
from app.core.security import get_current_user
from app.ml.models.risk_detector import AccidentRiskDetector, CongestionRiskDetector, FloodRiskDetector, PollutionRiskDetector
from app.services.analytics_service import compute_zone_analytics, feature_collection
from app.utils.mongo import serialize_mongo, utcnow

router = APIRouter()


class RiskAssessmentResponse(BaseModel):
    risk_type: str
    zones: list[dict]
    geojson: dict


class ZoneRisksResponse(BaseModel):
    zone_id: str
    risks: dict[str, dict]


async def _zones(db: AsyncIOMotorDatabase, city_id: str) -> list[dict]:
    zones = await db.city_zones.find({"city_id": city_id}).to_list(500)
    if zones:
        return serialize_mongo(zones)
    dataset_zones = await db.datasets.distinct("zone_id", {"city_id": city_id})
    return [{"zone_id": z, "name": z, "area_sqkm": 1} for z in dataset_zones]


async def _risk_for_zone(db: AsyncIOMotorDatabase, city_id: str, zone: dict, risk_type: str) -> dict:
    analytics = await compute_zone_analytics(db, city_id, zone["zone_id"])
    if risk_type == "flood":
        out = FloodRiskDetector().predict({
            "elevation_m": float(zone.get("elevation_m", 30)),
            "avg_rainfall_7day_mm": float(zone.get("avg_rainfall_7day_mm", 80)),
            "drainage_score": float(zone.get("drainage_score", 5)),
            "proximity_to_water_km": float(zone.get("proximity_to_water_km", 3)),
            "soil_permeability": float(zone.get("soil_permeability", 0.45)),
        })
    elif risk_type == "congestion":
        out = CongestionRiskDetector().predict(analytics["traffic_score"] * 100, float(zone.get("road_capacity_vehicles_per_hour", 7500)), 0.08)
    elif risk_type == "pollution":
        out = PollutionRiskDetector().predict(analytics["aqi"])
    else:
        out = AccidentRiskDetector().predict({"accident_history_count": analytics["accident_count"], "road_width": float(zone.get("road_width", 12)), "signal_density": float(zone.get("signal_density", 2)), "speed_limit": float(zone.get("speed_limit", 45))})
    return {**analytics, **out, "risk_type": risk_type, "timestamp": utcnow().isoformat()}


@router.get("/assessment", response_model=RiskAssessmentResponse)
async def assessment(city_id: str, type: Literal["flood", "congestion", "pollution", "accident"], db: AsyncIOMotorDatabase = Depends(get_database), user: dict = Depends(get_current_user)) -> dict:
    rows = [await _risk_for_zone(db, city_id, zone, type) for zone in await _zones(db, city_id)]
    return {"risk_type": type, "zones": rows, "geojson": feature_collection(rows, "risk_score")}


@router.get("/zone/{zone_id}", response_model=ZoneRisksResponse)
async def zone_risks(zone_id: str, city_id: str, db: AsyncIOMotorDatabase = Depends(get_database), user: dict = Depends(get_current_user)) -> dict:
    zone = await db.city_zones.find_one({"city_id": city_id, "zone_id": zone_id}) or {"zone_id": zone_id}
    risks = {kind: await _risk_for_zone(db, city_id, serialize_mongo(zone), kind) for kind in ["flood", "congestion", "pollution", "accident"]}
    return {"zone_id": zone_id, "risks": risks}
