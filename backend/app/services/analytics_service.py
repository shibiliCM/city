from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
import inspect
from io import BytesIO
from typing import Any

import pandas as pd
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket

from app.core.constants import ANALYTICS_CACHE_TTL_SECONDS
from app.utils.mongo import serialize_mongo, utcnow

# In-memory KPI cache: city_id -> (timestamp, data)
_KPI_CACHE: dict[str, tuple[datetime, dict[str, Any]]] = {}


async def _resolve_awaitable(value: Any) -> Any:
    while inspect.isawaitable(value):
        value = await value
    return value


def clear_analytics_cache(city_id: str) -> None:
    """Clear KPI cache for a city."""
    _KPI_CACHE.pop(city_id, None)


def _normalize_zone_id(zid: str) -> str:
    mapping = {
        "ZONE_001": "zone-1",
        "ZONE_002": "zone-2",
        "ZONE_003": "zone-3",
        "ZONE_004": "downtown",
        "ZONE_005": "north-sector",
        "ZONE_006": "industrial-belt",
        "ZONE_007": "east-suburbs",
        "ZONE_008": "west-end"
    }
    return mapping.get(str(zid).strip(), str(zid).strip())

async def _published_frames(db: AsyncIOMotorDatabase, city_id: str, dataset_type: str) -> list[pd.DataFrame]:
    fs = AsyncIOMotorGridFSBucket(db)
    docs = await db.datasets.find({"city_id": city_id, "type": dataset_type, "status": "published"}).to_list(50)
    frames: list[pd.DataFrame] = []
    for doc in docs:
        file_id = doc.get("cleaned_gridfs_file_id") or doc.get("gridfs_file_id")
        if not file_id:
            continue
        stream = await fs.open_download_stream(ObjectId(file_id) if isinstance(file_id, str) else file_id)
        df = pd.read_csv(BytesIO(await stream.read()))
        if "zone_id" in df.columns:
            df["zone_id"] = df["zone_id"].apply(_normalize_zone_id)
        frames.append(df)
    return frames


def _concat(frames: list[pd.DataFrame]) -> pd.DataFrame:
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


async def _compute_and_save_snapshots(db: AsyncIOMotorDatabase, city_id: str) -> list[dict[str, Any]]:
    """Compute analytics snapshots for all zones from scratch and save them to MongoDB."""
    traffic = _concat(await _published_frames(db, city_id, "traffic"))
    pollution = _concat(await _published_frames(db, city_id, "pollution"))
    accidents = _concat(await _published_frames(db, city_id, "accident"))
    population = _concat(await _published_frames(db, city_id, "population"))
    
    zone_ids: set[str] = set()
    for df in [traffic, pollution, accidents, population]:
        if not df.empty and "zone_id" in df.columns:
            zone_ids.update(df["zone_id"].dropna().astype(str).unique().tolist())
            
    zones_meta = {}
    async for z in db.city_zones.find({"city_id": city_id}):
        zones_meta[z["zone_id"]] = z
        
    # If no zones metadata in DB, seed from data zone_ids
    if not zones_meta and zone_ids:
        for zid in zone_ids:
            zones_meta[zid] = {"zone_id": zid, "name": zid, "area_sqkm": 1.0, "population": 0}

    now = utcnow()
    snapshots = []
    for zid, meta in zones_meta.items():
        t_df = traffic[traffic["zone_id"] == zid] if not traffic.empty and "zone_id" in traffic.columns else pd.DataFrame()
        p_df = pollution[pollution["zone_id"] == zid] if not pollution.empty and "zone_id" in pollution.columns else pd.DataFrame()
        a_df = accidents[accidents["zone_id"] == zid] if not accidents.empty and "zone_id" in accidents.columns else pd.DataFrame()
        pop_df = population[population["zone_id"] == zid] if not population.empty and "zone_id" in population.columns else pd.DataFrame()
        
        v_mean = t_df["vehicles_count"].mean() if "vehicles_count" in t_df.columns else 0.0
        vehicles_mean = float(v_mean) if pd.notna(v_mean) else 0.0
        traffic_score = min(100.0, round(vehicles_mean / 1000.0 * 100.0, 2)) if vehicles_mean else 0.0
        
        a_mean = p_df["aqi"].mean() if "aqi" in p_df.columns else 0.0
        aqi = float(a_mean) if pd.notna(a_mean) else 0.0
        
        ac_sum = a_df["accident_count"].sum() if "accident_count" in a_df.columns else float(len(a_df))
        accident_count = float(ac_sum) if pd.notna(ac_sum) else 0.0
        
        area = float(meta.get("area_sqkm") or 1.0)
        pop_val = pop_df["population"].iloc[-1] if "population" in pop_df.columns and not pop_df.empty else meta.get("population", 0.0)
        pop = float(pop_val) if pd.notna(pop_val) else 0.0
        
        snap = {
            "city_id": city_id,
            "zone_id": zid,
            "zone_name": meta.get("name", zid),
            "geometry": meta.get("geometry"),
            "traffic_score": round(traffic_score, 2),
            "aqi": round(aqi, 2),
            "accident_count": int(accident_count),
            "accident_density": round(accident_count / max(area, 0.01), 2),
            "population_density": round(pop / max(area, 0.01), 2),
            "population": int(pop),
            "area_sqkm": area,
            "timestamp": now,
        }
        snapshots.append(snap)
        
    if snapshots:
        # Clear previous snapshots before writing new ones
        await db.analytics_snapshots.delete_many({"city_id": city_id})
        await db.analytics_snapshots.insert_many(snapshots)
        
    return serialize_mongo(snapshots)


async def compute_zone_analytics(db: AsyncIOMotorDatabase, city_id: str, zone_id: str) -> dict[str, Any]:
    """Retrieves analytics for a single zone, falling back to zero-filled defaults on cold-start."""
    snap = await db.analytics_snapshots.find_one({"city_id": city_id, "zone_id": zone_id}, sort=[("timestamp", -1)])
    if snap:
        return serialize_mongo(snap)
        
    # Cold start: Zero-filled defaults
    zone = await db.city_zones.find_one({"city_id": city_id, "zone_id": zone_id})
    area = float(zone.get("area_sqkm") or 1.0) if zone else 1.0
    pop = float(zone.get("population") or 0.0) if zone else 0.0
    
    return {
        "zone_id": zone_id,
        "zone_name": zone.get("name", zone_id) if zone else zone_id,
        "geometry": zone.get("geometry") if zone else None,
        "traffic_score": 0.0,
        "aqi": 0.0,
        "accident_count": 0,
        "accident_density": 0.0,
        "population_density": round(pop / max(area, 0.01), 2),
        "population": int(pop),
        "area_sqkm": area,
    }


async def _all_zone_analytics(db: AsyncIOMotorDatabase, city_id: str) -> list[dict[str, Any]]:
    """Retrieves analytics for all zones using Motor aggregation pipeline."""
    # Find latest snapshots grouped by zone_id
    pipeline = [
        {"$match": {"city_id": city_id}},
        {"$sort": {"timestamp": -1}},
        {
            "$group": {
                "_id": "$zone_id",
                "latest": {"$first": "$$ROOT"}
            }
        },
        {"$replaceRoot": {"newRoot": "$latest"}}
    ]
    cursor = db.analytics_snapshots.aggregate(pipeline)
    results = await cursor.to_list(None)
    
    # If empty, trigger calculation from scratch
    if not results:
        results = await _compute_and_save_snapshots(db, city_id)
        
    return serialize_mongo(results)


async def get_traffic_hotspots(db: AsyncIOMotorDatabase, city_id: str, top_n: int = 5) -> list[dict[str, Any]]:
    rows = await _all_zone_analytics(db, city_id)
    return sorted(rows, key=lambda x: x.get("traffic_score", 0.0), reverse=True)[:top_n]


async def get_traffic_trend(db: AsyncIOMotorDatabase, city_id: str, days: int = 30) -> list[dict[str, Any]]:
    frames = await _published_frames(db, city_id, "traffic")
    traffic = _concat(frames)
    if traffic.empty or "timestamp" not in traffic.columns or "vehicles_count" not in traffic.columns:
        return []

    data = traffic[["timestamp", "vehicles_count"]].copy()
    data["timestamp"] = pd.to_datetime(data["timestamp"], errors="coerce", utc=True)
    data["vehicles_count"] = pd.to_numeric(data["vehicles_count"], errors="coerce")
    data = data.dropna(subset=["timestamp", "vehicles_count"])
    if data.empty:
        return []

    data["date"] = data["timestamp"].dt.date
    grouped = (
        data.groupby("date", as_index=False)["vehicles_count"]
        .mean()
        .sort_values("date")
        .tail(max(1, min(days, 365)))
    )
    return [
        {
            "date": row["date"].isoformat(),
            "traffic_score": round(min(100.0, float(row["vehicles_count"]) / 1000.0 * 100.0), 2),
            "vehicles_count": round(float(row["vehicles_count"]), 2),
        }
        for _, row in grouped.iterrows()
    ]


async def get_pollution_hotspots(db: AsyncIOMotorDatabase, city_id: str, top_n: int = 5) -> list[dict[str, Any]]:
    rows = await _all_zone_analytics(db, city_id)
    return sorted(rows, key=lambda x: x.get("aqi", 0.0), reverse=True)[:top_n]


async def get_accident_prone_areas(db: AsyncIOMotorDatabase, city_id: str, top_n: int = 5) -> list[dict[str, Any]]:
    rows = await _all_zone_analytics(db, city_id)
    return sorted(rows, key=lambda x: x.get("accident_density", 0.0), reverse=True)[:top_n]


async def _compute_kpi_summary(db: AsyncIOMotorDatabase, city_id: str) -> dict[str, Any]:
    rows = await _all_zone_analytics(db, city_id)
    if not rows:
        return {"total_population": 0, "avg_traffic_score": 0.0, "city_aqi": 0.0, "accident_count": 0, "city_health_score": 100.0}
    avg_traffic = sum(x.get("traffic_score", 0.0) for x in rows) / len(rows)
    avg_aqi = sum(x.get("aqi", 0.0) for x in rows) / len(rows)
    accidents = sum(x.get("accident_count", 0) for x in rows)
    avg_accident_density = sum(x.get("accident_density", 0.0) for x in rows) / len(rows)
    accident_pressure = min(100.0, avg_accident_density * 12.0)
    health = max(
        0.0,
        100.0
        - avg_traffic * 0.35
        - min(avg_aqi, 300.0) * 0.12
        - accident_pressure * 0.25,
    )
    return {
        "total_population": int(sum(x.get("population", 0) for x in rows)),
        "avg_traffic_score": round(avg_traffic, 2),
        "city_aqi": round(avg_aqi, 2),
        "accident_count": int(accidents),
        "city_health_score": round(health, 2),
    }


async def get_kpi_summary(db: AsyncIOMotorDatabase, city_id: str) -> dict[str, Any]:
    """Fetches KPI summary with 30-minute in-memory caching."""
    now = utcnow()
    if city_id in _KPI_CACHE:
        ts, cached = _KPI_CACHE[city_id]
        if (now - ts).total_seconds() < ANALYTICS_CACHE_TTL_SECONDS:
            return cached
            
    summary = await _resolve_awaitable(_compute_kpi_summary(db, city_id))
    _KPI_CACHE[city_id] = (now, summary)
    return summary


def feature_collection(rows: list[dict[str, Any]], metric: str) -> dict[str, Any]:
    features = []
    for row in rows:
        geometry = row.get("geometry") or {"type": "Point", "coordinates": [0, 0]}
        features.append({"type": "Feature", "geometry": geometry, "properties": {**row, "intensity": row.get(metric, 0)}})
    return {"type": "FeatureCollection", "features": features}

async def ensure_snapshots(db: AsyncIOMotorDatabase, city_id: str) -> None:
    """Ensure analytics snapshots exist for the given city.
    If none are present, compute and store them.
    """
    count = await db.analytics_snapshots.count_documents({"city_id": city_id})
    if count == 0:
        await _compute_and_save_snapshots(db, city_id)
