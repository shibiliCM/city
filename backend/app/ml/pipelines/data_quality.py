from __future__ import annotations

from typing import Any, Tuple, Dict, List
import numpy as np
import pandas as pd
from dateutil import parser as dateutil_parser

from app.core.constants import (
    IQR_MULTIPLIER,
    QUALITY_WEIGHT_MISSING,
    QUALITY_WEIGHT_DUPLICATES,
    QUALITY_WEIGHT_OUTLIERS,
    MAX_PENALTY_MISSING,
    MAX_PENALTY_DUPLICATES,
    MAX_PENALTY_OUTLIERS,
)


def _numeric_columns(df: pd.DataFrame) -> list[str]:
    return df.select_dtypes(include=[np.number]).columns.tolist()


def _parse_datetime(val: Any) -> pd.Timestamp | float:
    """Robust datetime parsing falling back to dateutil.parser for mixed formats."""
    if pd.isna(val):
        return np.nan
    val_str = str(val).strip()
    try:
        return pd.to_datetime(val_str, utc=True)
    except Exception:
        pass
    try:
        # Fallback to dateutil parser
        parsed = dateutil_parser.parse(val_str)
        # Ensure timezone-aware UTC
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=pd.UTC)
        return pd.Timestamp(parsed)
    except Exception:
        return np.nan


def compute_quality_score(df: pd.DataFrame) -> dict[str, Any]:
    """
    Computes a data quality score (0-100) based on missing data, duplicates, and outliers.
    Handles edge cases like empty dataframes, all-null columns, and single-row data.
    """
    # Edge case: Empty DataFrame
    if df.empty:
        return {
            "missing_count": {},
            "missing_pct": {},
            "duplicate_count": 0,
            "outlier_count": {},
            "overall_score": 100.0,
        }

    row_count = len(df)
    missing_count = df.isna().sum().to_dict()
    missing_pct = {col: round((count / row_count) * 100, 2) for col, count in missing_count.items()}
    duplicate_count = int(df.duplicated().sum())
    
    outlier_count: dict[str, int] = {}
    for col in _numeric_columns(df):
        # Handle all-null columns
        if df[col].isna().all():
            outlier_count[col] = 0
            continue
            
        q1 = df[col].quantile(0.25)
        q3 = df[col].quantile(0.75)
        iqr = q3 - q1
        
        # Handle single-row or uniform values (IQR is 0 or NaN)
        if pd.isna(iqr) or iqr == 0:
            outlier_count[col] = 0
            continue
            
        lower = q1 - IQR_MULTIPLIER * iqr
        upper = q3 + IQR_MULTIPLIER * iqr
        outlier_count[col] = int(((df[col] < lower) | (df[col] > upper)).sum())

    total_cells = row_count * max(len(df.columns), 1)
    total_missing_pct = float(sum(missing_count.values()) / max(total_cells, 1) * 100)
    duplicate_pct = (duplicate_count / row_count) * 100
    
    total_numeric_cols = max(len(outlier_count), 1)
    outlier_pct = sum(outlier_count.values()) / max(row_count * total_numeric_cols, 1) * 100

    # Subtract penalties limited by max caps
    penalty_missing = min(MAX_PENALTY_MISSING, total_missing_pct * QUALITY_WEIGHT_MISSING)
    penalty_duplicates = min(MAX_PENALTY_DUPLICATES, duplicate_pct * QUALITY_WEIGHT_DUPLICATES)
    penalty_outliers = min(MAX_PENALTY_OUTLIERS, outlier_pct * QUALITY_WEIGHT_OUTLIERS)
    
    score = 100.0 - penalty_missing - penalty_duplicates - penalty_outliers
    
    return {
        "missing_count": {k: int(v) for k, v in missing_count.items()},
        "missing_pct": missing_pct,
        "duplicate_count": duplicate_count,
        "outlier_count": outlier_count,
        "overall_score": round(max(0.0, min(100.0, score)), 2),
    }


def clean_dataframe(df: pd.DataFrame, config: dict[str, Any] | None = None) -> tuple[pd.DataFrame, dict[str, Any]]:
    """
    Cleans DataFrame: handles duplicates, parses mixed date formats, imputes missing values,
    and caps numeric outliers.
    """
    config = config or {}
    
    # Edge case: Empty DataFrame
    if df.empty:
        return df.copy(), {
            "duplicate_rows_removed": 0,
            "fill_strategy": {},
            "date_columns_standardized": [],
            "outliers_capped": {},
            "quality_after": compute_quality_score(df),
        }

    cleaned = df.copy()
    before_rows = len(cleaned)
    cleaned = cleaned.drop_duplicates().reset_index(drop=True)
    duplicate_rows_removed = before_rows - len(cleaned)
    
    fill_report: dict[str, str] = {}
    date_columns: list[str] = []
    
    for col in cleaned.columns:
        lower = col.lower()
        if "date" in lower or "time" in lower or lower == "timestamp" or lower == "year":
            # Don't try parsing numeric years as full ISO strings
            if lower == "year":
                continue
            # Mixed date formatting parser mapping
            parsed_series = cleaned[col].apply(_parse_datetime)
            if parsed_series.notna().sum() > 0:
                # Standardize to ISO 8601 UTC format
                cleaned[col] = parsed_series.dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                date_columns.append(col)

    for col in cleaned.columns:
        if cleaned[col].isna().sum() == 0:
            continue
            
        if pd.api.types.is_numeric_dtype(cleaned[col]):
            # If all are NaNs, fill with 0, otherwise fill with mean
            if cleaned[col].isna().all():
                cleaned[col] = cleaned[col].fillna(0.0)
            else:
                value = cleaned[col].mean()
                cleaned[col] = cleaned[col].fillna(0.0 if pd.isna(value) else value)
            fill_report[col] = "mean"
        elif col in date_columns:
            fill_report[col] = "preserve_missing"
        else:
            mode = cleaned[col].mode(dropna=True)
            cleaned[col] = cleaned[col].fillna(mode.iloc[0] if not mode.empty else "unknown")
            fill_report[col] = "mode"

    capped_outliers: dict[str, int] = {}
    for col in _numeric_columns(cleaned):
        q1 = cleaned[col].quantile(0.25)
        q3 = cleaned[col].quantile(0.75)
        iqr = q3 - q1
        
        if pd.isna(iqr) or iqr == 0:
            capped_outliers[col] = 0
            continue
            
        lower = q1 - IQR_MULTIPLIER * iqr
        upper = q3 + IQR_MULTIPLIER * iqr
        
        mask = (cleaned[col] < lower) | (cleaned[col] > upper)
        capped_outliers[col] = int(mask.sum())
        cleaned[col] = cleaned[col].clip(lower=lower, upper=upper)

    return cleaned, {
        "duplicate_rows_removed": duplicate_rows_removed,
        "fill_strategy": fill_report,
        "date_columns_standardized": date_columns,
        "outliers_capped": capped_outliers,
        "quality_after": compute_quality_score(cleaned),
    }
