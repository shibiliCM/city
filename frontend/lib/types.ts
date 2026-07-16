export interface KpiSummary {
  total_population: number;
  avg_traffic_score: number;
  city_aqi: number;
  accident_count: number;
  city_health_score: number;
}

export interface ForecastPoint {
  x: Array<string | number>;
  y: number[];
  y_upper: number[];
  y_lower: number[];
  zone_id: string;
  type: string;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties: Record<string, string | number | boolean | null>;
  }>;
}

export interface SimulationPayload {
  city_id: string;
  scenario_type: string;
  parameters: Record<string, string | number | string[]>;
}

export interface ChatRequest {
  city_id: string;
  message: string;
}
