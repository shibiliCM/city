from datetime import timedelta
from typing import Callable

import bcrypt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.database import get_database
from app.models.user import UserRole
from app.utils.mongo import serialize_mongo, utcnow


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token(subject: str, role: str, token_type: str, expires_delta: timedelta, extra: dict | None = None) -> str:
    settings = get_settings()
    now = utcnow()
    payload = {
        "sub": subject,
        "role": role,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user: dict) -> str:
    settings = get_settings()
    return create_token(
        str(user["_id"]),
        user["role"],
        "access",
        timedelta(minutes=settings.access_token_minutes),
        {"assigned_city_ids": [str(x) for x in user.get("assigned_city_ids", [])], "assigned_zone_ids": user.get("assigned_zone_ids", [])},
    )


def create_refresh_token(user: dict) -> str:
    settings = get_settings()
    return create_token(str(user["_id"]), user["role"], "refresh", timedelta(days=settings.refresh_token_days))


def decode_token(token: str, expected_type: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    if payload.get("type") != expected_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload


async def get_current_user(request: Request, db: AsyncIOMotorDatabase = Depends(get_database)) -> dict:
    token = request.cookies.get("ct_access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token, "access")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"]), "is_active": True})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return serialize_mongo(user)


def require_roles(*roles: UserRole | str) -> Callable:
    allowed = {str(role.value if isinstance(role, UserRole) else role) for role in roles}

    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return checker


def ensure_city_scope(user: dict, city_id: str) -> None:
    if user["role"] == UserRole.admin.value:
        return
    if city_id not in user.get("assigned_city_ids", []):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="City is outside user scope")
