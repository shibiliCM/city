from __future__ import annotations

import glob
import math
import os
import pickle
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import LinearRegression

from app.core.constants import MODEL_ARTIFACT_DIR

try:
    from prophet import Prophet
except Exception:
    Prophet = None

try:
    from xgboost import XGBRegressor
except Exception:
    XGBRegressor = None


def _future_dates(horizon_days: int) -> pd.DatetimeIndex:
    return pd.date_range(datetime.now(timezone.utc).date() + timedelta(days=1), periods=horizon_days, freq="D")


def _fallback_series(history: pd.Series, horizon_days: int) -> list[dict[str, Any]]:
    base = float(history.dropna().iloc[-1]) if not history.dropna().empty else 0.0
    slope = float((history.dropna().iloc[-1] - history.dropna().iloc[0]) / max(len(history.dropna()) - 1, 1)) if len(history.dropna()) > 1 else 0.0
    result = []
    for i, date in enumerate(_future_dates(horizon_days), start=1):
        value = max(0.0, base + slope * i)
        result.append({
            "date": date.strftime("%Y-%m-%d"),
            "predicted": round(value, 2),
            "y_lower": round(value * 0.9, 2),
            "y_upper": round(value * 1.1, 2)
        })
    return result


def _clean_predictions(preds: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Replaces all NaN and Inf values in prediction dicts with None/null for JSON sanitization."""
    cleaned = []
    for p in preds:
        item = {}
        for k, v in p.items():
            if isinstance(v, (int, float)):
                if np.isnan(v) or np.isinf(v) or math.isnan(v) or math.isinf(v):
                    item[k] = None
                else:
                    item[k] = v
            else:
                item[k] = v
        cleaned.append(item)
    return cleaned


# ─── Model Versioning Helpers ──────────────────────────────────────────────────

def _save_model_artifact(model: Any, model_type: str, zone_id: str) -> str:
    try:
        from app.utils.mongo import utcnow
        timestamp = utcnow().strftime("%Y%m%d_%H%M%S")
        artifacts_dir = os.path.abspath(
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), MODEL_ARTIFACT_DIR)
        )
        os.makedirs(artifacts_dir, exist_ok=True)
        filename = os.path.join(artifacts_dir, f"{model_type}_{zone_id}_{timestamp}.pkl")
        with open(filename, "wb") as f:
            pickle.dump(model, f)
        return filename
    except Exception:
        return ""


def _load_latest_model_artifact(model_type: str, zone_id: str) -> Any:
    try:
        artifacts_dir = os.path.abspath(
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), MODEL_ARTIFACT_DIR)
        )
        if not os.path.exists(artifacts_dir):
            return None
        pattern = os.path.join(artifacts_dir, f"{model_type}_{zone_id}_*.pkl")
        files = glob.glob(pattern)
        if not files:
            return None
        latest_file = max(files, key=os.path.getctime)
        with open(latest_file, "rb") as f:
            return pickle.load(f)
    except Exception:
        return None


# ─── Forecaster Classes ─────────────────────────────────────────────────────────

class TrafficForecaster:
    def predict(self, df: pd.DataFrame, horizon_days: int, zone_id: str = "default") -> list[dict[str, Any]]:
        # Enforce fit check bounds
        data = df.copy()
        if data.empty or "timestamp" not in data.columns or "vehicles_count" not in data.columns:
            raise ValueError("Insufficient data for forecasting (minimum 30 records required)")

        data["timestamp"] = pd.to_datetime(data["timestamp"], errors="coerce")
        daily = data.dropna(subset=["timestamp"]).groupby(data["timestamp"].dt.date)["vehicles_count"].mean().reset_index()
        
        if len(daily) < 30:
            raise ValueError("Insufficient data for forecasting (minimum 30 records required)")

        # Try to load cached pre-trained model
        cached = _load_latest_model_artifact("traffic", zone_id)
        if cached:
            try:
                model, residual_model = cached
                future = model.make_future_dataframe(periods=horizon_days)
                forecast = model.predict(future).tail(horizon_days)
                residuals = daily["vehicles_count"].to_numpy()[-30:]
                correction = residual_model.predict(np.arange(len(residuals), len(residuals) + horizon_days).reshape(-1, 1))
                forecast["yhat"] = forecast["yhat"] + correction
                out = [{"date": r.ds.strftime("%Y-%m-%d"), "predicted": round(max(0.0, r.yhat), 2), "y_lower": round(max(0.0, r.yhat_lower), 2), "y_upper": round(max(0.0, r.yhat_upper), 2)} for r in forecast.itertuples()]
                return _clean_predictions(out)
            except Exception:
                pass # Fallback to refit

        if Prophet is None:
            return _clean_predictions(_fallback_series(daily.get("vehicles_count", pd.Series(dtype=float)), horizon_days))

        prophet_df = daily.rename(columns={"timestamp": "ds", "vehicles_count": "y"})
        prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
        
        model = Prophet(weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False)
        try:
            model.fit(prophet_df)
        except Exception as exc:
            return _clean_predictions(_fallback_series(daily.get("vehicles_count", pd.Series(dtype=float)), horizon_days))

        future = model.make_future_dataframe(periods=horizon_days)
        forecast = model.predict(future).tail(horizon_days)
        
        residual_model_cls = XGBRegressor if XGBRegressor else GradientBoostingRegressor
        train_pred = model.predict(prophet_df[["ds"]])["yhat"]
        residuals = prophet_df["y"].to_numpy() - train_pred.to_numpy()
        x = np.arange(len(residuals)).reshape(-1, 1)
        residual_model = residual_model_cls(n_estimators=50, max_depth=3, random_state=42)
        residual_model.fit(x, residuals)
        
        correction = residual_model.predict(np.arange(len(residuals), len(residuals) + horizon_days).reshape(-1, 1))
        forecast["yhat"] = forecast["yhat"] + correction
        
        # Save model version
        _save_model_artifact((model, residual_model), "traffic", zone_id)
        
        out = [{"date": r.ds.strftime("%Y-%m-%d"), "predicted": round(max(0.0, r.yhat), 2), "y_lower": round(max(0.0, r.yhat_lower), 2), "y_upper": round(max(0.0, r.yhat_upper), 2)} for r in forecast.itertuples()]
        return _clean_predictions(out)


class PollutionForecaster:
    def predict(self, df: pd.DataFrame, horizon_days: int, zone_id: str = "default") -> list[dict[str, Any]]:
        data = df.copy()
        if data.empty or "timestamp" not in data.columns or "aqi" not in data.columns:
            raise ValueError("Insufficient data for forecasting (minimum 30 records required)")

        data["timestamp"] = pd.to_datetime(data["timestamp"], errors="coerce")
        daily = data.dropna(subset=["timestamp"]).groupby(data["timestamp"].dt.date).agg({"aqi": "mean"}).reset_index()
        
        if len(daily) < 30:
            raise ValueError("Insufficient data for forecasting (minimum 30 records required)")

        cached = _load_latest_model_artifact("pollution", zone_id)
        if cached:
            try:
                model = cached
                forecast = model.predict(model.make_future_dataframe(periods=horizon_days)).tail(horizon_days)
                out = [{"date": r.ds.strftime("%Y-%m-%d"), "predicted": round(max(0.0, r.yhat), 2), "y_lower": round(max(0.0, r.yhat_lower), 2), "y_upper": round(max(0.0, r.yhat_upper), 2)} for r in forecast.itertuples()]
                return _clean_predictions(out)
            except Exception:
                pass

        if Prophet is None:
            return _clean_predictions(_fallback_series(daily.get("aqi", pd.Series(dtype=float)), horizon_days))

        prophet_df = daily.rename(columns={"timestamp": "ds", "aqi": "y"})
        prophet_df["ds"] = pd.to_datetime(prophet_df["ds"])
        
        model = Prophet(weekly_seasonality=True, yearly_seasonality=True)
        try:
            model.fit(prophet_df)
        except Exception as exc:
            return _clean_predictions(_fallback_series(daily.get("aqi", pd.Series(dtype=float)), horizon_days))

        forecast = model.predict(model.make_future_dataframe(periods=horizon_days)).tail(horizon_days)
        
        _save_model_artifact(model, "pollution", zone_id)
        
        out = [{"date": r.ds.strftime("%Y-%m-%d"), "predicted": round(max(0.0, r.yhat), 2), "y_lower": round(max(0.0, r.yhat_lower), 2), "y_upper": round(max(0.0, r.yhat_upper), 2)} for r in forecast.itertuples()]
        return _clean_predictions(out)


class PopulationForecaster:
    def predict(self, df: pd.DataFrame, horizon_year: int = 2030, zone_id: str = "default") -> list[dict[str, Any]]:
        data = df.dropna(subset=["year", "population"]).copy()
        if len(data) < 2:  # require at least 2 points for trend estimation
            raise ValueError("Insufficient data for forecasting (minimum 30 records required)")
            
        x = data["year"].astype(int).to_numpy().reshape(-1, 1)
        y = data["population"].astype(float).to_numpy()
        
        model = LinearRegression().fit(x, y)
        years = range(int(max(data["year"])) + 1, horizon_year + 1)
        
        out = [{"year": year, "predicted": int(max(0.0, model.predict([[year]])[0]))} for year in years]
        return _clean_predictions(out)


class TransportDemandForecaster:
    def predict(self, df: pd.DataFrame, horizon_days: int, zone_id: str = "default") -> list[dict[str, Any]]:
        if df.empty or "bus_demand" not in df.columns:
            return _clean_predictions(_fallback_series(pd.Series([0.0]), horizon_days))
            
        data = df.copy()
        if len(data) < 30:
            raise ValueError("Insufficient data for forecasting (minimum 30 records required)")

        data["day_index"] = np.arange(len(data))
        features = [col for col in ["day_index", "population", "events", "temperature", "humidity"] if col in data.columns]
        
        model = RandomForestRegressor(n_estimators=80, random_state=42).fit(data[features], data["bus_demand"])
        last = data.iloc[-1:].copy()
        out = []
        for idx, date in enumerate(_future_dates(horizon_days), start=1):
            row = last.copy()
            row["day_index"] = int(data["day_index"].max()) + idx
            value = float(model.predict(row[features])[0])
            out.append({
                "date": date.strftime("%Y-%m-%d"),
                "predicted": round(max(0.0, value), 2),
                "y_lower": round(value * 0.9, 2),
                "y_upper": round(value * 1.1, 2)
            })
        return _clean_predictions(out)
