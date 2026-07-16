from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CityTwin AI"
    environment: str = "development"
    mongodb_uri: str = Field(default="mongodb://mongodb:27017", alias="MONGODB_URI")
    mongodb_db_name: str = Field(default="citytwin", alias="MONGODB_DB_NAME")
    jwt_secret: str = Field(default="change-me-in-production", alias="JWT_SECRET")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_minutes: int = Field(default=15, alias="ACCESS_TOKEN_MINUTES")
    refresh_token_days: int = Field(default=7, alias="REFRESH_TOKEN_DAYS")
    mongo_max_pool_size: int = Field(default=10, alias="MONGO_MAX_POOL_SIZE")
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-1.5-flash", alias="GEMINI_MODEL")
    mapbox_token: str = Field(default="", alias="MAPBOX_TOKEN")
    allowed_origins: List[str] = Field(default_factory=lambda: ["http://localhost:3000"], alias="ALLOWED_ORIGINS")
    max_upload_mb: int = 50

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True)

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            import json
            cleaned = value.strip()
            if cleaned.startswith("[") and cleaned.endswith("]"):
                try:
                    return json.loads(cleaned)
                except Exception:
                    pass
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("allowed_origins")
    @classmethod
    def validate_production_origins(cls, value: list[str], info) -> list[str]:
        # Enforce that allowed origins do not contain '*' or wildcards in production
        env = info.data.get("environment", "development")
        if env == "production":
            for origin in value:
                if "*" in origin:
                    raise ValueError("Wildcard CORS origins are forbidden in production mode")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
