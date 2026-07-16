from datetime import datetime
from io import BytesIO, StringIO
from typing import Literal, List, Optional

import pandas as pd
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.constants import MAX_UPLOAD_BYTES
from app.core.database import get_database
from app.core.security import get_current_user
from app.ml.pipelines.data_quality import clean_dataframe, compute_quality_score
from app.utils.mongo import oid, serialize_mongo, utcnow

router = APIRouter()

DATASET_SCHEMAS = {
    "traffic": {"zone_id", "timestamp", "vehicles_count"},
    "pollution": {"zone_id", "timestamp", "aqi"},
    "population": {"zone_id", "year", "population"},
    "accident": {"zone_id", "timestamp", "accident_count"},
    "transport": {"zone_id", "timestamp", "bus_demand"},
}


class DatasetSchemaColumn(BaseModel):
    name: str
    required: bool


class DatasetSchemaInfo(BaseModel):
    columns: List[DatasetSchemaColumn]


class DatasetResponse(BaseModel):
    id: str = Field(alias="_id")
    city_id: str
    name: str
    source: str
    type: str
    upload_date: datetime | str
    uploaded_by: str
    quality_score: float
    status: str
    gridfs_file_id: str
    cleaned_gridfs_file_id: Optional[str] = None
    row_count: int
    column_count: int
    schema: DatasetSchemaInfo
    quality_report: dict
    created_at: datetime | str
    updated_at: datetime | str

    model_config = {"populate_by_name": True}


class DatasetsPagedResponse(BaseModel):
    page: int
    page_size: int
    total_count: int
    results: List[DatasetResponse]


class ValidateResponse(BaseModel):
    overall_score: float
    dimensions: dict
    anomalies: dict


class CleanResponse(BaseModel):
    dataset_id: str
    cleaned_gridfs_file_id: str
    cleaning_report: dict


class PublishResponse(BaseModel):
    dataset_id: str
    status: str


class DeleteResponse(BaseModel):
    dataset_id: str
    deleted: bool


async def _read_gridfs_csv(db: AsyncIOMotorDatabase, file_id: ObjectId) -> pd.DataFrame:
    fs = AsyncIOMotorGridFSBucket(db)
    stream = await fs.open_download_stream(file_id)
    data = await stream.read()
    return pd.read_csv(BytesIO(data))


async def _write_gridfs(db: AsyncIOMotorDatabase, filename: str, data: bytes, metadata: dict) -> ObjectId:
    fs = AsyncIOMotorGridFSBucket(db)
    return await fs.upload_from_stream(filename, data, metadata=metadata)


@router.post("/upload", response_model=DatasetResponse, status_code=201)
async def upload_dataset(
    file: UploadFile = File(...),
    dataset_type: Literal["traffic", "pollution", "population", "accident", "transport"] = Form(...),
    city_id: str = Form(...),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    # Enforce both server-reported MIME type and extension. The binary sniff below
    # catches common disguised non-CSV uploads before storage.
    allowed_content_types = {"text/csv", "application/csv", "application/vnd.ms-excel"}
    if file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV MIME types are allowed"
        )
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only .csv files are allowed")

    # 2. Read chunk-by-chunk to prevent memory exhaustion and enforce max file size limit
    chunks = []
    total_bytes = 0
    while True:
        chunk = await file.read(1024 * 1024)  # 1MB chunks
        if not chunk:
            break
        total_bytes += len(chunk)
        if total_bytes > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="File exceeds maximum allowed size of 50MB"
            )
        chunks.append(chunk)
    
    data = b"".join(chunks)

    # Sniff test for binary format (like PDF, Zip, etc. disguised as CSV)
    if b"\x00" in data[:1024]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only text-based CSV files are allowed"
        )

    # 3. Read header schema & validate
    try:
        df = pd.read_csv(BytesIO(data), nrows=5)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to parse CSV file headers"
        ) from exc

    headers = {str(col).strip() for col in df.columns}
    missing = DATASET_SCHEMAS[dataset_type] - headers
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV schema validation failed"
        )

    now = utcnow()
    file_id = await _write_gridfs(
        db,
        file.filename,
        data,
        {"dataset_type": dataset_type, "city_id": city_id, "uploaded_by": user["_id"]}
    )
    
    # Run quality scoring on the full dataset
    try:
        full_df = pd.read_csv(BytesIO(data))
        quality = compute_quality_score(full_df)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error calculating data quality metrics"
        ) from exc

    doc = {
        "city_id": city_id,
        "name": file.filename,
        "source": "csv_upload",
        "type": dataset_type,
        "upload_date": now,
        "uploaded_by": str(user["_id"]),
        "quality_score": quality["overall_score"],
        "status": "uploaded",
        "gridfs_file_id": str(file_id),
        "cleaned_gridfs_file_id": None,
        "row_count": len(full_df),
        "column_count": len(df.columns),
        "schema": {
            "columns": [{"name": c, "required": c in DATASET_SCHEMAS[dataset_type]} for c in df.columns]
        },
        "quality_report": quality,
        "created_at": now,
        "updated_at": now,
    }
    await db.datasets.insert_one(doc)
    return serialize_mongo(doc)


@router.get("", response_model=DatasetsPagedResponse)
async def list_datasets(
    city_id: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    query = {"city_id": city_id} if city_id else {}
    if user.get("role") != "admin":
        allowed_city_ids = user.get("assigned_city_ids", [])
        if city_id and city_id not in allowed_city_ids:
            raise HTTPException(status_code=403, detail="Forbidden")
        if not city_id and allowed_city_ids:
            query["city_id"] = {"$in": allowed_city_ids}
    
    # Pagination
    skip = (page - 1) * page_size
    total_count = await db.datasets.count_documents(query)
    
    cursor = db.datasets.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    docs = await cursor.to_list(page_size)
    
    return {
        "page": page,
        "page_size": page_size,
        "total_count": total_count,
        "results": serialize_mongo(docs),
    }


@router.delete("/{dataset_id}", response_model=DeleteResponse)
async def delete_dataset(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    dataset = await db.datasets.find_one({"_id": oid(dataset_id)})
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    uploaded_by = str(dataset.get("uploaded_by", ""))
    current_user = str(user.get("_id", ""))
    if user.get("role") != "admin" and uploaded_by != current_user:
        raise HTTPException(status_code=403, detail="Forbidden")

    fs = AsyncIOMotorGridFSBucket(db)
    for file_key in ("gridfs_file_id", "cleaned_gridfs_file_id"):
        file_id = dataset.get(file_key)
        if not file_id:
            continue
        try:
            await fs.delete(ObjectId(file_id))
        except Exception:
            # The dataset document is the source of truth. If an old GridFS file
            # was already removed, still let the admin clean up the visible row.
            pass

    await db.datasets.delete_one({"_id": dataset["_id"]})

    from app.services.analytics_service import clear_analytics_cache, _compute_and_save_snapshots
    clear_analytics_cache(dataset["city_id"])
    try:
        await _compute_and_save_snapshots(db, dataset["city_id"])
    except Exception:
        pass

    return {"dataset_id": dataset_id, "deleted": True}


@router.post("/{dataset_id}/validate", response_model=ValidateResponse)
async def validate_dataset(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    dataset = await db.datasets.find_one({"_id": oid(dataset_id)})
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    df = await _read_gridfs_csv(db, ObjectId(dataset["gridfs_file_id"]))
    report = compute_quality_score(df)
    
    await db.datasets.update_one(
        {"_id": dataset["_id"]},
        {
            "$set": {
                "quality_score": report["overall_score"],
                "quality_report": report,
                "status": "validated",
                "updated_at": utcnow()
            }
        }
    )
    return report


@router.post("/{dataset_id}/clean", response_model=CleanResponse)
async def clean_dataset(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    dataset = await db.datasets.find_one({"_id": oid(dataset_id)})
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    df = await _read_gridfs_csv(db, ObjectId(dataset["gridfs_file_id"]))
    cleaned, report = clean_dataframe(df)
    
    data = cleaned.to_csv(index=False).encode("utf-8")
    file_id = await _write_gridfs(db, f"cleaned_{dataset['name']}", data, {"dataset_id": dataset_id, "cleaned": True})
    
    await db.datasets.update_one(
        {"_id": dataset["_id"]},
        {
            "$set": {
                "cleaned_gridfs_file_id": str(file_id),
                "status": "clean",
                "cleaning_report": report,
                "quality_score": report["quality_after"]["overall_score"],
                "updated_at": utcnow()
            }
        }
    )
    return serialize_mongo({
        "dataset_id": dataset_id,
        "cleaned_gridfs_file_id": str(file_id),
        "cleaning_report": report
    })


@router.post("/{dataset_id}/publish", response_model=PublishResponse)
async def publish_dataset(
    dataset_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    dataset = await db.datasets.find_one({"_id": oid(dataset_id)})
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    result = await db.datasets.update_one(
        {"_id": dataset["_id"]},
        {"$set": {"status": "published", "published_at": utcnow(), "updated_at": utcnow()}}
    )
    
    # Invalidate cached analytics and compute updated snapshots
    from app.services.analytics_service import clear_analytics_cache, _compute_and_save_snapshots
    clear_analytics_cache(dataset["city_id"])
    await _compute_and_save_snapshots(db, dataset["city_id"])
    
    return {"dataset_id": dataset_id, "status": "published"}
