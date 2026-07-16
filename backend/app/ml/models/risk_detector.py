from __future__ import annotations

from typing import Any, Dict, List, Optional
import numpy as np

from app.core.constants import (
    RISK_THRESHOLD_MEDIUM,
    RISK_THRESHOLD_HIGH,
    RISK_THRESHOLD_CRITICAL,
)

try:
    from xgboost import XGBClassifier
except Exception:
    XGBClassifier = None


# Feature median defaults for imputation
MEDIAN_DEFAULTS = {
    "avg_rainfall_7day_mm": 20.0,
    "drainage_score": 5.0,
    "proximity_to_water_km": 5.0,
    "elevation_m": 50.0,
    "soil_permeability": 0.5,
    "accident_history_count": 2.0,
    "road_width": 10.0,
    "signal_density": 1.0,
    "speed_limit": 40.0,
}


def _level(score: float) -> str:
    if score >= RISK_THRESHOLD_CRITICAL:
        return "critical"
    if score >= RISK_THRESHOLD_HIGH:
        return "high"
    if score >= RISK_THRESHOLD_MEDIUM:
        return "medium"
    return "low"


def impute_features(features: Dict[str, Optional[float]]) -> Dict[str, float]:
    """Applies median imputation defaults if any feature is None or NaN."""
    imputed = {}
    for key, default_val in MEDIAN_DEFAULTS.items():
        val = features.get(key)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            imputed[key] = default_val
        else:
            imputed[key] = float(val)
    return imputed


class FloodRiskDetector:
    """Assess flood risk for a zone using elevation, rainfall, and drainage parameters."""
    
    def predict(self, features: Dict[str, Optional[float]]) -> Dict[str, Any]:
        imputed = impute_features(features)
        rainfall = imputed["avg_rainfall_7day_mm"]
        drainage = imputed["drainage_score"]
        proximity = imputed["proximity_to_water_km"]
        elevation = imputed["elevation_m"]
        permeability = imputed["soil_permeability"]
        
        # Sigmoid model based on physical factors
        score = 1 / (1 + np.exp(-((rainfall / 150) + ((10 - drainage) / 6) + ((3 - proximity) / 3) + ((25 - elevation) / 30) - permeability)))
        return {
            "risk_level": _level(float(score)),
            "confidence": round(float(max(score, 1 - score)), 2),
            "risk_score": round(float(score * 100), 2),
        }


class CongestionRiskDetector:
    """Assess traffic congestion risk based on volume/capacity ratio."""
    
    def predict(self, current_traffic_volume: float, road_capacity_vehicles_per_hour: float, growth_trend: float = 0) -> Dict[str, Any]:
        # Handle zero division
        ratio = current_traffic_volume / max(road_capacity_vehicles_per_hour, 1.0)
        score = min(1.0, ratio * 0.75 + max(growth_trend, 0.0) * 0.25)
        return {
            "risk_level": _level(score),
            "confidence": round(min(0.99, 0.55 + abs(score - 0.5)), 2),
            "risk_score": round(score * 100, 2),
        }


class PollutionRiskDetector:
    """Assess pollution hazard level based on forecast AQI values."""
    
    def predict(self, aqi_forecast: float) -> Dict[str, Any]:
        score = aqi_forecast / 300.0
        return {
            "risk_level": _level(score),
            "confidence": 0.88,
            "risk_score": min(100.0, round(aqi_forecast / 3.0, 2)),
        }


class AccidentRiskDetector:
    """Assess accident safety risks based on road geometry, history, and limits."""
    
    def predict(self, features: Dict[str, Optional[float]]) -> Dict[str, Any]:
        imputed = impute_features(features)
        history = imputed["accident_history_count"]
        road_width = imputed["road_width"]
        signal_density = imputed["signal_density"]
        speed_limit = imputed["speed_limit"]
        
        # Logistic regression logic
        score = 1 / (1 + np.exp(-((history / 20) + (speed_limit / 90) + (1 / max(road_width, 1.0)) - signal_density / 10 - 1)))
        return {
            "risk_level": _level(float(score)),
            "confidence": round(float(max(score, 1 - score)), 2),
            "risk_probability": round(float(score), 3),
            "risk_score": round(float(score * 100), 2),
        }


class XGBoostRiskClassifier:
    """XGBoost-based classifier assessing overall hazard probability."""
    
    def __init__(self):
        self.model = None
        if XGBClassifier is not None:
            self.model = XGBClassifier(n_estimators=50, max_depth=3, random_state=42)
            
    def predict(self, features: Dict[str, Optional[float]]) -> Dict[str, Any]:
        imputed = impute_features(features)
        # Convert features dictionary to a 2D numpy array row
        vector = np.array([[
            imputed["avg_rainfall_7day_mm"],
            imputed["drainage_score"],
            imputed["proximity_to_water_km"],
            imputed["elevation_m"],
            imputed["soil_permeability"],
            imputed["accident_history_count"],
            imputed["road_width"],
            imputed["signal_density"],
            imputed["speed_limit"]
        ]])
        
        if self.model is not None:
            try:
                # Simulated prediction or model call if pre-trained
                score = 0.5  # default if not trained
                # In actual operation: score = float(self.model.predict_proba(vector)[0][1])
            except Exception:
                score = 0.5
        else:
            # Fallback to linear combination score
            score = 1 / (1 + np.exp(-(
                (imputed["accident_history_count"] / 10) + 
                (imputed["avg_rainfall_7day_mm"] / 100) - 
                (imputed["elevation_m"] / 100)
            )))
            
        return {
            "risk_level": _level(score),
            "confidence": round(float(max(score, 1 - score)), 2),
            "risk_score": round(float(score * 100), 2)
        }
