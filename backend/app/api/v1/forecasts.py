from datetime import datetime
from io import BytesIO
from typing import Literal, Optional, List
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field

from app.core.database import get_database, get_database_sync
from app.core.rate_limiter import RateLimiter
from app.core.security import get_current_user
from app.ml.models.forecaster import (
    PollutionForecaster,
    PopulationForecaster,
    TrafficForecaster,
    TransportDemandForecaster,
)
from app.ml.evaluation import regression_metrics
from app.utils.mongo import serialize_mongo, utcnow

router = APIRouter()


class ForecastTrigger(BaseModel):
    city_id: str
    zone_id: str
    forecast_type: Literal["traffic", "pollution", "population", "transport"]
    horizon_days: int = Field(default=30, ge=1, le=90)


class JobResponse(BaseModel):
    job_id: str
    status: str
    forecast_id: Optional[str] = None


class ForecastPoint(BaseModel):
    x: List[str | int]
    y: List[float]
    y_upper: List[float]
    y_lower: List[float]
    zone_id: str
    type: str


class ForecastValidationResponse(BaseModel):
    mae: float
    rmse: float
    mape: float
    baseline_mae: float
    baseline_rmse: float
    baseline_mape: float
    improvement_pct: float
    samples: int
    status: str


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

async def _frame_for_zone(
    db: AsyncIOMotorDatabase, city_id: str, zone_id: str, dataset_type: str
) -> pd.DataFrame:
    fs = AsyncIOMotorGridFSBucket(db)
    docs = await db.datasets.find(
        {"city_id": city_id, "type": dataset_type, "status": "published"}
    ).to_list(25)
    frames = []
    for doc in docs:
        fid = doc.get("cleaned_gridfs_file_id") or doc.get("gridfs_file_id")
        if not fid:
            continue
        stream = await fs.open_download_stream(ObjectId(fid) if isinstance(fid, str) else fid)
        frame = pd.read_csv(BytesIO(await stream.read()))
        if "zone_id" in frame.columns:
            frame["zone_id"] = frame["zone_id"].apply(_normalize_zone_id)
            frame = frame[frame["zone_id"].astype(str) == zone_id]
        frames.append(frame)
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()


from bson import ObjectId


def _daily_series_for_validation(frame: pd.DataFrame, forecast_type: str) -> pd.Series:
    if frame.empty:
        return pd.Series(dtype=float)

    if forecast_type == "population":
        if "year" not in frame.columns or "population" not in frame.columns:
            return pd.Series(dtype=float)
        data = frame[["year", "population"]].copy()
        data["year"] = pd.to_numeric(data["year"], errors="coerce")
        data["population"] = pd.to_numeric(data["population"], errors="coerce")
        data = data.dropna().groupby("year")["population"].mean().sort_index()
        return data.astype(float)

    target = {
        "traffic": "vehicles_count",
        "pollution": "aqi",
        "transport": "bus_demand",
    }.get(forecast_type)
    if not target or "timestamp" not in frame.columns or target not in frame.columns:
        return pd.Series(dtype=float)

    data = frame[["timestamp", target]].copy()
    data["timestamp"] = pd.to_datetime(data["timestamp"], errors="coerce")
    data[target] = pd.to_numeric(data[target], errors="coerce")
    data = data.dropna(subset=["timestamp", target])
    if data.empty:
        return pd.Series(dtype=float)
    return data.groupby(data["timestamp"].dt.date)[target].mean().sort_index().astype(float)


def _holdout_validation(series: pd.Series) -> dict:
    values = series.dropna().astype(float).to_numpy()
    if len(values) < 6:
        return {
            "mae": 0.0,
            "rmse": 0.0,
            "mape": 0.0,
            "baseline_mae": 0.0,
            "baseline_rmse": 0.0,
            "baseline_mape": 0.0,
            "improvement_pct": 0.0,
            "samples": int(len(values)),
            "status": "needs more historical data",
        }

    holdout = max(3, min(14, len(values) // 5))
    train = values[:-holdout]
    actual = values[-holdout:]

    x_train = pd.Series(range(len(train)), dtype=float).to_numpy().reshape(-1, 1)
    x_holdout = pd.Series(range(len(train), len(values)), dtype=float).to_numpy().reshape(-1, 1)
    from sklearn.linear_model import LinearRegression

    model = LinearRegression().fit(x_train, train)
    predicted = model.predict(x_holdout)
    baseline = [float(train[-1])] * holdout

    model_metrics = regression_metrics(actual, predicted)
    baseline_metrics = regression_metrics(actual, baseline)
    improvement = (
        (baseline_metrics["mape"] - model_metrics["mape"]) / max(baseline_metrics["mape"], 1e-9)
    ) * 100

    return {
        "mae": model_metrics["mae"],
        "rmse": model_metrics["rmse"],
        "mape": model_metrics["mape"],
        "baseline_mae": baseline_metrics["mae"],
        "baseline_rmse": baseline_metrics["rmse"],
        "baseline_mape": baseline_metrics["mape"],
        "improvement_pct": round(float(improvement), 2),
        "samples": int(holdout),
        "status": "ok",
    }


async def run_forecast_job(job_id: str, payload: ForecastTrigger) -> None:
    db = get_database_sync()
    await db.jobs.update_one(
        {"job_id": job_id},
        {"$set": {"status": "running", "updated_at": utcnow()}},
    )
    try:
        dtype = (
            "transport"
            if payload.forecast_type == "transport"
            else payload.forecast_type
        )
        frame = await _frame_for_zone(db, payload.city_id, payload.zone_id, dtype)
        
        import asyncio
        loop = asyncio.get_running_loop()
        
        def _predict():
            if payload.forecast_type == "traffic":
                return TrafficForecaster().predict(frame, payload.horizon_days, zone_id=payload.zone_id)
            elif payload.forecast_type == "pollution":
                return PollutionForecaster().predict(frame, payload.horizon_days, zone_id=payload.zone_id)
            elif payload.forecast_type == "population":
                return PopulationForecaster().predict(frame, zone_id=payload.zone_id)
            else:
                return TransportDemandForecaster().predict(frame, payload.horizon_days, zone_id=payload.zone_id)
                
        predictions = await loop.run_in_executor(None, _predict)

        doc = {
            "city_id": payload.city_id,
            "zone_id": payload.zone_id,
            "forecast_type": payload.forecast_type,
            "horizon_days": payload.horizon_days,
            "predictions": predictions,
            "model_used": payload.forecast_type,
            "job_id": job_id,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
        result = await db.forecasts.insert_one(doc)
        await db.jobs.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "completed",
                    "forecast_id": str(result.inserted_id),
                    "updated_at": utcnow(),
                }
            },
        )
    except Exception as exc:
        await db.jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "failed", "error": str(exc), "updated_at": utcnow()}},
        )


@router.post("/trigger", response_model=JobResponse)
async def trigger_forecast(
    payload: ForecastTrigger,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
    _rate_limit: None = Depends(RateLimiter("forecasts")),
) -> dict:
    # Forecast job deduplication logic
    existing_job = await db.jobs.find_one({
        "type": "forecast",
        "status": {"$in": ["queued", "running"]},
        "payload.zone_id": payload.zone_id,
        "payload.forecast_type": payload.forecast_type,
        "payload.city_id": payload.city_id
    })
    if existing_job:
        return {"job_id": existing_job["job_id"], "status": existing_job["status"]}

    job_id = str(uuid4())
    await db.jobs.insert_one(
        {
            "job_id": job_id,
            "type": "forecast",
            "status": "queued",
            "payload": payload.model_dump(),
            "created_by": str(user["_id"]),
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
    )
    background_tasks.add_task(run_forecast_job, job_id, payload)
    return {"job_id": job_id, "status": "queued"}


@router.get("/status/{job_id}", response_model=JobResponse)
async def forecast_status(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return serialize_mongo(job)


@router.get("/results", response_model=ForecastPoint)
async def forecast_results(
    zone_id: str = Query(...),
    forecast_type: str = Query(default="traffic"),
    city_id: str = Query(default=""),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Fetch the latest stored forecast for a zone+type.
    """
    query: dict = {"zone_id": zone_id, "forecast_type": forecast_type}
    if city_id:
        query["city_id"] = city_id
    doc = await db.forecasts.find_one(query, sort=[("created_at", -1)])
    if not doc:
        return {"zone_id": zone_id, "type": forecast_type, "x": [], "y": [], "y_upper": [], "y_lower": []}
    predictions = doc.get("predictions", [])
    x_key = "year" if forecast_type == "population" else "date"
    return {
        "zone_id": zone_id,
        "type": forecast_type,
        "x": [p.get(x_key) for p in predictions],
        "y": [float(p.get("predicted", 0)) for p in predictions],
        "y_upper": [float(p.get("y_upper", p.get("predicted", 0))) for p in predictions],
        "y_lower": [float(p.get("y_lower", p.get("predicted", 0))) for p in predictions],
    }


@router.get("/validation", response_model=ForecastValidationResponse)
async def forecast_validation(
    zone_id: str = Query(...),
    forecast_type: Literal["traffic", "pollution", "population", "transport"] = Query(default="traffic"),
    city_id: str = Query(default=""),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    frame = await _frame_for_zone(db, city_id, zone_id, forecast_type)
    series = _daily_series_for_validation(frame, forecast_type)
    return _holdout_validation(series)


@router.get("/results/{zone_id}", response_model=ForecastPoint)
async def forecast_results_path(
    zone_id: str,
    type: Literal["traffic", "pollution", "population", "transport"] = Query(default="traffic"),
    city_id: str = Query(default=""),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """Legacy path-param route kept for backwards compatibility."""
    return await forecast_results(
        zone_id=zone_id, forecast_type=type, city_id=city_id, db=db, user=user
    )
