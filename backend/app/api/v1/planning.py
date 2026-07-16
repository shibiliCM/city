from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.agents.planning_agent import PlanningAgent
from app.core.database import get_database
from app.core.security import get_current_user
from app.utils.mongo import serialize_mongo, utcnow

router = APIRouter()


class PlanningRequest(BaseModel):
    query: str = Field(min_length=3)
    city_id: str


class TimelineMilestone(BaseModel):
    year: int
    milestone: str


class DataPoint(BaseModel):
    label: str
    value: float


class PlanningResponse(BaseModel):
    recommended_zone: str
    zone_id: str
    confidence_percent: float
    reasoning: str
    supporting_data_points: List[DataPoint] = []
    timeline: List[TimelineMilestone] = []
    id: Optional[str] = None


class RecommendationsPagedResponse(BaseModel):
    page: int
    page_size: int
    total_count: int
    results: List[dict]  # Since nested recommendation contains raw JSON


@router.post("/recommend", response_model=PlanningResponse)
async def recommend(
    payload: PlanningRequest,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user)
) -> dict:
    result = await PlanningAgent(db).recommend(payload.city_id, payload.query)
    doc = {
        "city_id": payload.city_id,
        "query": payload.query,
        "zone_id": result.get("zone_id", "zone-1"),
        "recommendation": result,
        "confidence_score": result.get("confidence_percent", 70.0) / 100,
        "created_by": str(user["_id"]),
        "created_at": utcnow(),
        "updated_at": utcnow()
    }
    inserted = await db.planning_recommendations.insert_one(doc)
    result["id"] = str(inserted.inserted_id)
    return result


@router.get("/recommendations", response_model=RecommendationsPagedResponse)
async def history(
    city_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user)
) -> dict:
    query = {"city_id": city_id}
    skip = (page - 1) * page_size
    total_count = await db.planning_recommendations.count_documents(query)

    cursor = db.planning_recommendations.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    docs = await cursor.to_list(page_size)
    
    return {
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "results": serialize_mongo(docs),
    }


@router.delete("/recommendations")
async def clear_history(
    city_id: str = Query(default=""),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """Clear all recommendation history for the current user and city."""
    query = {"created_by": str(user["_id"])}
    if city_id:
        query["city_id"] = city_id
    
    result = await db.planning_recommendations.delete_many(query)
    return {"status": "success", "deleted_count": result.deleted_count}
