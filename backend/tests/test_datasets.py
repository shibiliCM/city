from io import BytesIO

import pandas as pd
import pytest

from app.api.v1.datasets import DATASET_SCHEMAS
from app.ml.pipelines.data_quality import clean_dataframe, compute_quality_score


def test_csv_upload_schema_valid_file_headers():
    df = pd.read_csv(BytesIO(b"zone_id,timestamp,vehicles_count\nz1,2026-01-01,10\n"), nrows=5)
    assert DATASET_SCHEMAS["traffic"] - set(df.columns) == set()


def test_csv_upload_missing_required_columns():
    df = pd.read_csv(BytesIO(b"zone_id,timestamp\nz1,2026-01-01\n"), nrows=5)
    assert DATASET_SCHEMAS["traffic"] - set(df.columns) == {"vehicles_count"}


def test_invalid_type_rejected_by_allowed_schema_lookup():
    assert "pdf" not in DATASET_SCHEMAS


def test_oversized_file_constant_is_50mb():
    from app.core.constants import MAX_UPLOAD_BYTES

    assert MAX_UPLOAD_BYTES == 50 * 1024 * 1024


def test_validate_and_clean_endpoint_logic():
    df = pd.DataFrame({"zone_id": ["z1", "z1"], "timestamp": ["2026-01-01", "01/02/2026"], "vehicles_count": [10, None]})
    quality = compute_quality_score(df)
    cleaned, report = clean_dataframe(df)
    assert quality["overall_score"] <= 100
    assert cleaned["vehicles_count"].isna().sum() == 0
    assert "quality_after" in report
