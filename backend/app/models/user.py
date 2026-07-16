from datetime import datetime
from enum import Enum
from typing import List

from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    admin = "admin"
    city_analyst = "city_analyst"
    urban_planner = "urban_planner"
    traffic_dept = "traffic_dept"
    env_dept = "env_dept"
    executive = "executive"


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=120)
    role: UserRole = UserRole.city_analyst
    assigned_city_ids: List[str] = Field(default_factory=list)
    assigned_zone_ids: List[str] = Field(default_factory=list)


class UserInDB(BaseModel):
    id: str = Field(alias="_id")
    email: EmailStr
    password_hash: str
    full_name: str
    role: UserRole
    assigned_city_ids: List[str] = Field(default_factory=list)
    assigned_zone_ids: List[str] = Field(default_factory=list)
    is_active: bool = True
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"populate_by_name": True}


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    assigned_city_ids: List[str]
    assigned_zone_ids: List[str]
    is_active: bool
