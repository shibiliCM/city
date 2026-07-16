from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.database import get_database
from app.core.security import get_current_user
from app.services.analytics_service import (
    compute_zone_analytics,
    feature_collection,
    get_accident_prone_areas,
    get_kpi_summary,
    get_pollution_hotspots,
    get_traffic_hotspots,
    get_traffic_trend,
    ensure_snapshots,
)

router = APIRouter()


class KpiSummaryResponse(BaseModel):
    total_population: int
    avg_traffic_score: float
    city_aqi: float
    accident_count: int
    city_health_score: float


class HeatmapResponse(BaseModel):
    type: str
    features: list[dict]


class ZoneAnalyticsResponse(BaseModel):
    zone_id: str
    zone_name: str | None = None
    traffic_score: float = 0.0
    aqi: float = 0.0
    accident_count: int = 0
    accident_density: float = 0.0
    population_density: float = 0.0
    population: int = 0
    area_sqkm: float = 1.0


class HotspotResponse(BaseModel):
    results: list[dict]


class TrafficTrendPoint(BaseModel):
    date: str
    traffic_score: float
    vehicles_count: float


@router.get("/kpis", response_model=KpiSummaryResponse)
async def kpis(
    city_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:

    return await get_kpi_summary(db, city_id)


@router.get("/hotspots", response_model=list[dict])
async def hotspots(
    city_id: str = Query(default=""),
    # Accept both "type" and "dataset_type" for frontend compatibility
    type: str = Query(default=None),
    dataset_type: str = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> list[dict]:
    # Resolve which param was used
    resolved = type or dataset_type or "traffic"
    valid = {"traffic", "pollution", "accident", "population", "transport"}
    if resolved not in valid:
        resolved = "traffic"
    if resolved == "traffic":
        return await get_traffic_hotspots(db, city_id)
    if resolved == "pollution":
        return await get_pollution_hotspots(db, city_id)
    if resolved in ("accident", "population", "transport"):
        return await get_accident_prone_areas(db, city_id)
    return []


@router.get("/zone/{zone_id}", response_model=ZoneAnalyticsResponse)
async def zone_profile(
    zone_id: str,
    city_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    return await compute_zone_analytics(db, city_id, zone_id)


@router.get("/traffic-trend", response_model=list[TrafficTrendPoint])
async def traffic_trend(
    city_id: str,
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> list[dict]:
    return await get_traffic_trend(db, city_id, days)


@router.get("/heatmap", response_model=HeatmapResponse)
async def heatmap(
    city_id: str = Query(default=""),
    metric: str = Query(default="traffic"),
    # also accept "type" for legacy calls
    type: str = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    resolved = type or metric or "traffic"
    valid = {"traffic", "pollution", "accident"}
    if resolved not in valid:
        resolved = "traffic"
    rows = await hotspots(city_id=city_id, type=resolved, dataset_type=None, db=db, user=user)
    metric_key = {
        "traffic": "traffic_score",
        "pollution": "aqi",
        "accident": "accident_density",
    }[resolved]
    return feature_collection(rows, metric_key)
