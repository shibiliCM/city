from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.core.database import get_database
from app.core.rate_limiter import RateLimiter
from app.core.security import get_current_user
from app.services.simulation_service import run_simulation
from app.utils.mongo import oid, serialize_mongo, utcnow

router = APIRouter()


class SimulationRequest(BaseModel):
    city_id: str
    scenario_type: str
    parameters: dict


class SimulationMetrics(BaseModel):
    traffic: float
    aqi: float
    coverage: float
    congestion: float
    travel_time_between_zones: Optional[str | float] = None


class SimulationResponse(BaseModel):
    id: str = Field(alias="_id")
    scenario_type: str
    parameters: dict
    before_metrics: SimulationMetrics
    after_metrics: SimulationMetrics
    delta_metrics: dict
    confidence: float
    recommendations: List[str]
    city_id: str
    created_by: str
    created_at: datetime | str
    updated_at: datetime | str

    model_config = {"populate_by_name": True}


class SimulationsPagedResponse(BaseModel):
    page: int
    page_size: int
    total_count: int
    results: List[SimulationResponse]


@router.post("/run", response_model=SimulationResponse, status_code=200)
async def run(
    payload: SimulationRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
    _rate_limit: None = Depends(RateLimiter("simulations")),
) -> dict:
    try:
        result = await run_simulation(db, payload.scenario_type, payload.parameters, payload.city_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
        
    doc = {
        **result,
        "city_id": payload.city_id,
        "created_by": str(user["_id"]),
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    inserted = await db.simulations.insert_one(doc)
    doc["_id"] = str(inserted.inserted_id)
    return serialize_mongo(doc)


@router.get("", response_model=SimulationsPagedResponse)
async def list_simulations(
    city_id: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """
    GET /simulations?city_id=…&page=1&page_size=20
    Returns recent simulation history for the city, paginated.
    """
    # Simulation history is scoped per user: urban planners see only their own, unless admin
    query = {}
    if city_id:
        query["city_id"] = city_id
    if user.get("role") != "admin":
        query["created_by"] = str(user["_id"])

    skip = (page - 1) * page_size
    total_count = await db.simulations.count_documents(query)

    cursor = db.simulations.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    docs = await cursor.to_list(page_size)
    
    return {
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "results": serialize_mongo(docs),
    }


@router.get("/history", response_model=SimulationsPagedResponse)
async def history(
    city_id: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """Legacy alias kept for backward compatibility."""
    return await list_simulations(city_id=city_id, page=page, page_size=page_size, db=db, user=user)


@router.delete("/history")
async def clear_history(
    city_id: str = Query(default=""),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """Clear all simulation history for the current user and city."""
    query = {"created_by": str(user["_id"])}
    if city_id:
        query["city_id"] = city_id
    
    result = await db.simulations.delete_many(query)
    return {"status": "success", "deleted_count": result.deleted_count}


@router.get("/{simulation_id}", response_model=SimulationResponse)
async def detail(
    simulation_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    doc = await db.simulations.find_one({"_id": oid(simulation_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Simulation not found")
        
    # Security check: verify user owns simulation or is admin
    if user.get("role") != "admin" and doc.get("created_by") != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Forbidden from viewing this simulation")
        
    return serialize_mongo(doc)
