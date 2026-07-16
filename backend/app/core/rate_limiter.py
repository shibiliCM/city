"""
Rate Limiter Module
===================
Enforces per-user API rate limiting using MongoDB to track request history.
Prevents rapid abuse of expensive resources (AI chat, simulations, forecasts, reports).
"""
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.constants import RATE_LIMIT_PER_MINUTE, RATE_LIMIT_WINDOW_SECONDS
from app.core.database import get_database
from app.core.security import get_current_user
from app.utils.mongo import utcnow


class RateLimiter:
    def __init__(self, key_prefix: str):
        self.key_prefix = key_prefix

    async def __call__(
        self,
        user: dict = Depends(get_current_user),
        db: AsyncIOMotorDatabase = Depends(get_database),
    ) -> None:
        user_id = str(user["_id"])
        now = utcnow()
        window_start = now - timedelta(seconds=RATE_LIMIT_WINDOW_SECONDS)

        # Clear expired log entries older than the window
        await db.rate_limits.delete_many(
            {"user_id": user_id, "endpoint": self.key_prefix, "timestamp": {"$lt": window_start}}
        )

        # Count recent requests
        recent_count = await db.rate_limits.count_documents(
            {"user_id": user_id, "endpoint": self.key_prefix, "timestamp": {"$gte": window_start}}
        )

        if recent_count >= RATE_LIMIT_PER_MINUTE:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Maximum {RATE_LIMIT_PER_MINUTE} requests per minute on {self.key_prefix}.",
            )

        # Log current request
        await db.rate_limits.insert_one(
            {
                "user_id": user_id,
                "endpoint": self.key_prefix,
                "timestamp": now,
            }
        )
