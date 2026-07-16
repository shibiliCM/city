from collections.abc import AsyncGenerator
import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from fastapi import HTTPException, status

from app.core.config import get_settings


logger = logging.getLogger(__name__)


class MongoState:
    client: AsyncIOMotorClient | None = None
    database: AsyncIOMotorDatabase | None = None


mongo_state = MongoState()


async def connect_to_mongo() -> None:
    """Open MongoDB connection and create required production indexes."""
    settings = get_settings()
    try:
        mongo_state.client = AsyncIOMotorClient(
            settings.mongodb_uri,
            uuidRepresentation="standard",
            maxPoolSize=settings.mongo_max_pool_size,
            serverSelectionTimeoutMS=3000,
        )
        mongo_state.database = mongo_state.client[settings.mongodb_db_name]
        await mongo_state.database.command("ping")
    except Exception:
        logger.exception("MongoDB connection failed; API will start in degraded mode")
        if mongo_state.client:
            mongo_state.client.close()
        mongo_state.client = None
        mongo_state.database = None
        return

    try:
        await ensure_indexes(mongo_state.database)
    except Exception:
        logger.exception("MongoDB index creation failed; continuing with existing indexes")


async def close_mongo_connection() -> None:
    """Close MongoDB connection for app shutdown."""
    if mongo_state.client:
        mongo_state.client.close()
    mongo_state.client = None
    mongo_state.database = None


def get_database_sync() -> AsyncIOMotorDatabase:
    """Return initialized database for background tasks."""
    if mongo_state.database is None:
        raise RuntimeError("MongoDB is not initialized")
    return mongo_state.database


async def get_database() -> AsyncGenerator[AsyncIOMotorDatabase, None]:
    """FastAPI dependency yielding the initialized MongoDB database."""
    if mongo_state.database is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is unavailable. Start MongoDB and restart the backend.",
        )
    yield mongo_state.database


async def ensure_indexes(db: AsyncIOMotorDatabase) -> None:
    """Create idempotent MongoDB indexes required for production queries."""
    await db.users.create_index("email", unique=True)
    await db.datasets.create_index([("city_id", 1), ("type", 1), ("status", 1)])
    await db.datasets.create_index("status")

    await db.city_zones.create_index("zone_id", unique=True)
    await db.city_zones.create_index([("city_id", 1), ("zone_id", 1)], unique=True)
    await db.city_zones.create_index([("geometry", "2dsphere")], name="geometry_2dsphere")
    await db.city_zones.create_index([("centroid", "2dsphere")], name="centroid_2dsphere")

    await db.analytics_snapshots.create_index([("zone_id", 1), ("timestamp", -1)])
    await db.analytics_snapshots.create_index([("city_id", 1), ("zone_id", 1), ("timestamp", -1)])

    await db.forecasts.create_index([("zone_id", 1), ("forecast_type", 1), ("created_at", -1)])
    await db.jobs.create_index("created_at")
    await db.jobs.create_index([("type", 1), ("status", 1), ("payload.zone_id", 1), ("payload.forecast_type", 1)])

    await db.simulations.create_index("created_at")
    await db.simulations.create_index([("city_id", 1), ("created_at", -1)])
    await db.reports.create_index([("city_id", 1), ("generated_by", 1), ("created_at", -1)])
    await db.planning_recommendations.create_index([("city_id", 1), ("created_at", -1)])
    await db.risk_assessments.create_index([("city_id", 1), ("zone_id", 1), ("risk_type", 1)])

    await db.refresh_tokens.create_index("token_hash", unique=True)
    await db.refresh_tokens.create_index([("user_id", 1), ("is_revoked", 1), ("is_used", 1)])
    await db.rate_limits.create_index("timestamp", expireAfterSeconds=120)
