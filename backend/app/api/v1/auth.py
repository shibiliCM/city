import hashlib
from datetime import datetime, timedelta
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr

from app.core.config import get_settings
from app.core.database import get_database
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
    get_current_user,
)
from app.models.user import UserCreate, UserResponse
from app.utils.mongo import serialize_mongo, utcnow

router = APIRouter()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


def cookie_options(max_age: int) -> dict:
    settings = get_settings()
    return {
        "httponly": True,
        "secure": settings.environment == "production",
        "samesite": "lax",
        "max_age": max_age,
        "path": "/",
    }


def to_user_response(user: dict) -> UserResponse:
    data = serialize_mongo(user)
    return UserResponse(
        id=data["_id"],
        email=data["email"],
        full_name=data["full_name"],
        role=data["role"],
        assigned_city_ids=data.get("assigned_city_ids", []),
        assigned_zone_ids=data.get("assigned_zone_ids", []),
        is_active=data.get("is_active", True),
    )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _save_refresh_token(db: AsyncIOMotorDatabase, user_id: str, token: str) -> None:
    settings = get_settings()
    token_hash = _hash_token(token)
    now = utcnow()
    expires_at = now + timedelta(days=settings.refresh_token_days)
    await db.refresh_tokens.insert_one({
        "user_id": user_id,
        "token_hash": token_hash,
        "expires_at": expires_at,
        "is_used": False,
        "is_revoked": False,
        "created_at": now,
    })


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(payload: UserCreate, db: AsyncIOMotorDatabase = Depends(get_database)) -> UserResponse:
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email is already registered")
    now = utcnow()
    doc = {
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "role": payload.role.value,
        "assigned_city_ids": payload.assigned_city_ids,
        "assigned_zone_ids": payload.assigned_zone_ids,
        "is_active": True,
        "last_login_at": None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return to_user_response(doc)


@router.post("/login")
async def login(payload: LoginRequest, response: Response, db: AsyncIOMotorDatabase = Depends(get_database)) -> dict:
    user = await db.users.find_one({"email": payload.email.lower(), "is_active": True})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    
    access = create_access_token(user)
    refresh = create_refresh_token(user)
    
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": utcnow(), "updated_at": utcnow()}})
    await _save_refresh_token(db, str(user["_id"]), refresh)
    
    response.set_cookie("ct_access_token", access, **cookie_options(15 * 60))
    response.set_cookie("ct_refresh_token", refresh, **cookie_options(7 * 24 * 60 * 60))
    return {"user": to_user_response(user), "access_token": access, "refresh_token": refresh}


@router.get("/me", response_model=UserResponse)
async def me(user: dict = Depends(get_current_user)) -> UserResponse:
    return to_user_response(user)


@router.post("/refresh")
async def refresh(request: Request, response: Response, db: AsyncIOMotorDatabase = Depends(get_database)) -> dict:
    token = request.cookies.get("ct_refresh_token")
    if not token:
        # Fallback to Authorization header if cookies aren't used
        auth = request.headers.get("Authorization", "")
        token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    
    token_hash = _hash_token(token)
    stored_token = await db.refresh_tokens.find_one({"token_hash": token_hash})
    
    if not stored_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        
    user_id = stored_token["user_id"]

    # Replay attack detection (token reuse)
    if stored_token.get("is_used", False) or stored_token.get("is_revoked", False):
        # Revoke all active refresh tokens for this user
        await db.refresh_tokens.update_many(
            {"user_id": user_id},
            {"$set": {"is_revoked": True}}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. All sessions revoked."
        )

    if stored_token["expires_at"] < utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Mark old token as used
    await db.refresh_tokens.update_one(
        {"_id": stored_token["_id"]},
        {"$set": {"is_used": True}}
    )

    user = await db.users.find_one({"_id": ObjectId(user_id), "is_active": True})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Rotate tokens: create new pair
    access = create_access_token(user)
    new_refresh = create_refresh_token(user)
    
    await _save_refresh_token(db, user_id, new_refresh)
    
    response.set_cookie("ct_access_token", access, **cookie_options(15 * 60))
    response.set_cookie("ct_refresh_token", new_refresh, **cookie_options(7 * 24 * 60 * 60))
    
    return {"access_token": access, "refresh_token": new_refresh}


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncIOMotorDatabase = Depends(get_database)) -> dict:
    token = request.cookies.get("ct_refresh_token")
    if token:
        token_hash = _hash_token(token)
        await db.refresh_tokens.update_many(
            {"token_hash": token_hash},
            {"$set": {"is_revoked": True}}
        )
    response.delete_cookie("ct_access_token", path="/")
    response.delete_cookie("ct_refresh_token", path="/")
    return {"status": "logged_out"}
