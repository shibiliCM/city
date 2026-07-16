import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api.v1 import analytics, auth, chat, datasets, forecasts, planning, reports, risks, simulations
from app.core.config import get_settings
from app.core.database import close_mongo_connection, connect_to_mongo

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    # Ensure analytics snapshots exist for all cities on startup
    from app.core.database import mongo_state
    from app.services.analytics_service import ensure_snapshots
    if mongo_state.database is not None:
        try:
            city_ids = await mongo_state.database.city_zones.distinct("city_id")
            for cid in city_ids:
                await ensure_snapshots(mongo_state.database, cid)
        except Exception:
            logger.exception("Startup analytics snapshot warmup failed; continuing")
    yield
    await close_mongo_connection()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)


class HealthResponse(BaseModel):
    status: str
    db: str
    service: str
    version: str

# CORS configuration: ALLOWED_ORIGINS should be strictly defined from env.
# config.py validates that wildcards are rejected in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Custom Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    else:
        response.headers["Strict-Transport-Security"] = "max-age=60"
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    # Do not leak specific trace details on bad requests
    response = JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    if exc.status_code == 401:
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        response.delete_cookie("ct_access_token", path="/")
        response.delete_cookie("ct_refresh_token", path="/")
    
    # Manually append CORS headers since exception handlers bypass CORSMiddleware
    origin = request.headers.get("origin")
    if origin and origin in settings.allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log the full exception stack trace internally
    logger.exception("Unhandled Server Exception: %s", str(exc))
    # Return a generic message to keep error responses sanitized
    response = JSONResponse(status_code=500, content={"detail": "Internal server error"})
    
    # Manually append CORS headers since exception handlers bypass CORSMiddleware
    origin = request.headers.get("origin")
    if origin and origin in settings.allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        
    return response


@app.get("/health", response_model=HealthResponse)
async def health(db=None) -> dict:
    from app.core.database import mongo_state
    db_connected = False
    if mongo_state.database is not None:
        try:
            await mongo_state.database.command("ping")
            db_connected = True
        except Exception:
            pass
            
    return {
        "status": "ok" if db_connected else "degraded",
        "db": "connected" if db_connected else "disconnected",
        "service": settings.app_name,
        "version": "1.0.0"
    }


app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(datasets.router, prefix="/api/v1/datasets", tags=["datasets"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["analytics"])
app.include_router(forecasts.router, prefix="/api/v1/forecasts", tags=["forecasts"])
app.include_router(risks.router, prefix="/api/v1/risks", tags=["risks"])
app.include_router(planning.router, prefix="/api/v1/planning", tags=["planning"])
app.include_router(simulations.router, prefix="/api/v1/simulations", tags=["simulations"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
