from typing import List, Optional
from uuid import uuid4
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field

from app.core.database import get_database, get_database_sync
from app.core.rate_limiter import RateLimiter
from app.core.security import get_current_user
from app.services.report_service import generate_pdf_report, generate_pptx_report
from app.utils.mongo import oid, serialize_mongo, utcnow

router = APIRouter()


class ReportRequest(BaseModel):
    city_id: str
    report_type: str = "analytics"
    format: str = "pdf"


class ReportJobResponse(BaseModel):
    job_id: str
    status: str
    report_id: Optional[str] = None


class ReportResponse(BaseModel):
    id: str = Field(alias="_id")
    city_id: str
    type: str
    report_type: str
    file_id: str
    filename: str
    content_type: str
    generated_by: str
    created_at: datetime | str
    updated_at: datetime | str

    model_config = {"populate_by_name": True}


class ReportsPagedResponse(BaseModel):
    page: int
    page_size: int
    total_count: int
    results: List[ReportResponse]


async def _generate(job_id: str, payload: ReportRequest, user_id: str) -> None:
    db = get_database_sync()
    await db.jobs.update_one(
        {"job_id": job_id},
        {"$set": {"status": "running", "updated_at": utcnow()}},
    )
    report_id = None
    try:
        if payload.format not in {"pdf", "pptx"}:
            raise ValueError("Unsupported report format")
        stub = {
            "city_id": payload.city_id,
            "type": payload.format,
            "report_type": payload.report_type,
            "status": "generating",
            "file_id": "",
            "filename": "",
            "content_type": "",
            "generated_by": user_id,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
        stub_result = await db.reports.insert_one(stub)
        report_id = stub_result.inserted_id
        generated = await (
            generate_pptx_report(db, payload.city_id)
            if payload.format == "pptx"
            else generate_pdf_report(db, payload.city_id, payload.report_type)
        )
        doc = {
            "city_id": payload.city_id,
            "type": payload.format,
            "report_type": payload.report_type,
            "file_id": str(generated["file_id"]),
            "filename": generated["filename"],
            "content_type": generated["content_type"],
            "generated_by": user_id,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
        await db.reports.update_one({"_id": report_id}, {"$set": {**doc, "status": "ready"}})
        await db.jobs.update_one(
            {"job_id": job_id},
            {
                "$set": {
                    "status": "completed",
                    "report_id": str(report_id),
                    "updated_at": utcnow(),
                }
            },
        )
    except Exception as exc:
        if report_id is not None:
            await db.reports.update_one(
                {"_id": report_id},
                {"$set": {"status": "failed", "updated_at": utcnow()}},
            )
        await db.jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "failed", "error": str(exc) or "Report generation failed", "updated_at": utcnow()}},
        )


@router.post("/generate", response_model=ReportJobResponse)
async def generate(
    payload: ReportRequest,
    background_tasks: BackgroundTasks,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
    _rate_limit: None = Depends(RateLimiter("reports")),
) -> dict:
    if payload.format not in {"pdf", "pptx"}:
        raise HTTPException(status_code=400, detail="Unsupported report format")
    job_id = str(uuid4())
    await db.jobs.insert_one(
        {
            "job_id": job_id,
            "type": "report",
            "status": "queued",
            "payload": payload.model_dump(),
            "created_by": str(user["_id"]),
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
    )
    background_tasks.add_task(_generate, job_id, payload, str(user["_id"]))
    return {"job_id": job_id, "status": "queued"}


@router.get("/status/{job_id}", response_model=ReportJobResponse)
async def report_status(
    job_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """Poll the job collection for report generation status."""
    job = await db.jobs.find_one({"job_id": job_id, "type": "report"})
    if not job:
        job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Report job not found")
    return serialize_mongo(job)


@router.get("", response_model=ReportsPagedResponse)
async def list_reports(
    city_id: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """List all generated reports for a city, paginated."""
    query: dict = {}
    if city_id:
        query["city_id"] = city_id
    
    # Reports list is scoped: non-admins see only their own generated reports
    if user.get("role") != "admin":
        query["generated_by"] = str(user["_id"])

    skip = (page - 1) * page_size
    total_count = await db.reports.count_documents(query)

    cursor = db.reports.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    docs = await cursor.to_list(page_size)
    
    return {
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "results": serialize_mongo(docs),
    }


from bson import ObjectId


@router.get("/download/{report_id}")
async def download(
    report_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    report = await db.reports.find_one({"_id": oid(report_id)})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if report.get("status") != "ready" or not report.get("file_id"):
        raise HTTPException(status_code=409, detail="Report file is not ready")
        
    # Report permission verification: verify user is owner or admin
    if user.get("role") != "admin" and report.get("generated_by") != str(user["_id"]):
        raise HTTPException(status_code=403, detail="Forbidden from downloading this report")

    fs = AsyncIOMotorGridFSBucket(db)
    file_id = report["file_id"]
    stream = await fs.open_download_stream(ObjectId(file_id) if isinstance(file_id, str) else file_id)

    async def chunks():
        while True:
            data = await stream.readchunk()
            if not data:
                break
            yield data

    return StreamingResponse(
        chunks(),
        media_type=report.get("content_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename=\"{report.get('filename', 'citytwin-report')}\"",
            "X-Content-Type-Options": "nosniff",
        },
    )
