"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cityId as defaultCityId } from "@/lib/utils";

// ─── KPIs ─────────────────────────────────────────────────────────────────
export function useKpis(city: string = defaultCityId) {
  return useQuery({
    queryKey: ["kpis", city],
    queryFn: () =>
      apiFetch<Record<string, number>>(`/analytics/kpis?city_id=${city}`).catch(() => ({
        total_population: 0,
        avg_traffic_score: 0,
        city_aqi: 0,
        accident_count: 0,
        city_health_score: 0,
      })),
    staleTime: 60_000,
    retry: 1,
  });
}

// ─── Heatmap GeoJSON ───────────────────────────────────────────────────────
export function useHeatmap(metric: string = "traffic", city: string = defaultCityId) {
  return useQuery({
    queryKey: ["heatmap", metric, city],
    queryFn: () =>
      apiFetch<any>(`/analytics/heatmap?city_id=${city}&metric=${metric}`).catch(() => null),
    staleTime: 120_000,
    retry: 1,
  });
}

export function useTrafficTrend(city: string = defaultCityId, days = 30) {
  return useQuery({
    queryKey: ["traffic-trend", city, days],
    queryFn: () =>
      apiFetch<Array<{ date: string; traffic_score: number; vehicles_count: number }>>(
        `/analytics/traffic-trend?city_id=${city}&days=${days}`
      ).catch(() => []),
    staleTime: 120_000,
    retry: 1,
  });
}
// ─── Hotspots / zone rankings ──────────────────────────────────────────────
export function useHotspots(type: string = "traffic", city: string = defaultCityId) {
  return useQuery({
    queryKey: ["hotspots", type, city],
    queryFn: () =>
      apiFetch<any[]>(`/analytics/hotspots?city_id=${city}&dataset_type=${type}`).catch(() => []),
    staleTime: 120_000,
    retry: 1,
  });
}

// ─── Single zone profile ───────────────────────────────────────────────────
export function useZone(zoneId: string, city: string = defaultCityId) {
  return useQuery({
    queryKey: ["zone", zoneId, city],
    queryFn: () =>
      apiFetch<any>(`/analytics/zone/${zoneId}?city_id=${city}`).catch(() => null),
    enabled: Boolean(zoneId),
    staleTime: 120_000,
    retry: 1,
  });
}

// ─── Risk Assessment ───────────────────────────────────────────────────────
export function useRisks(city: string = defaultCityId) {
  return useQuery({
    queryKey: ["risks", city],
    queryFn: () =>
      apiFetch<any[]>(`/risks/assess?city_id=${city}`).catch(() => []),
    staleTime: 90_000,
    retry: 1,
  });
}

export function useRiskZone(zoneId: string, city: string = defaultCityId) {
  return useQuery({
    queryKey: ["risk-zone", zoneId, city],
    queryFn: () =>
      apiFetch<any>(`/risks/zone/${zoneId}?city_id=${city}`).catch(() => null),
    enabled: Boolean(zoneId),
    staleTime: 90_000,
    retry: 1,
  });
}

export function useForecastValidation(zoneId: string, type: string, city: string = defaultCityId) {
  return useQuery({
    queryKey: ["forecast-validation", zoneId, type, city],
    queryFn: () =>
      apiFetch<{
        mae: number;
        rmse: number;
        mape: number;
        baseline_mae: number;
        baseline_rmse: number;
        baseline_mape: number;
        improvement_pct: number;
        samples: number;
        status: string;
      }>(`/forecasts/validation?city_id=${city}&zone_id=${zoneId}&forecast_type=${type}`).catch(() => ({
        mae: 0,
        rmse: 0,
        mape: 0,
        baseline_mae: 0,
        baseline_rmse: 0,
        baseline_mape: 0,
        improvement_pct: 0,
        samples: 0,
        status: "unavailable",
      })),
    enabled: Boolean(zoneId && type),
    staleTime: 120_000,
    retry: 1,
  });
}
// ─── Forecasting ───────────────────────────────────────────────────────────
export function useForecast(zoneId: string, type: string, city: string = defaultCityId) {
  return useQuery({
    queryKey: ["forecast", zoneId, type, city],
    queryFn: () =>
      apiFetch<{ x: any[]; y: number[]; y_upper?: number[]; y_lower?: number[] }>(
        `/forecasts/results?city_id=${city}&zone_id=${zoneId}&forecast_type=${type}`
      ).catch(() => ({ x: [], y: [] })),
    enabled: Boolean(zoneId && type),
    staleTime: 300_000,
    retry: 1,
  });
}

export function useForecastJob(jobId: string | null) {
  return useQuery({
    queryKey: ["forecast-job", jobId],
    queryFn: () =>
      apiFetch<{ status: string; job_id: string }>(`/forecasts/status/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (data: any) => {
      const status = data?.state?.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 2000;
    },
    retry: 2,
  });
}

export function useTriggerForecast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      city_id: string;
      zone_id: string;
      forecast_type: string;
      horizon_days: number;
    }) => apiFetch<{ job_id: string; status: string }>("/forecasts/trigger", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forecast"] });
    },
  });
}

// ─── Planning / Recommendations ────────────────────────────────────────────
export function useRecommendations(city: string = defaultCityId) {
  return useQuery({
    queryKey: ["recommendations", city],
    queryFn: () =>
      apiFetch<any>(`/planning/recommendations?city_id=${city}`).then(res => res.results || []).catch(() => []),
    staleTime: 180_000,
    retry: 1,
  });
}

export function useRecommend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { query: string; city_id: string }) =>
      apiFetch<any>("/planning/recommend", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

export function useClearRecommendations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (city: string = defaultCityId) =>
      apiFetch<any>(`/planning/recommendations?city_id=${city}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}

// ─── Simulation ────────────────────────────────────────────────────────────
export function useSimulations(city: string = defaultCityId) {
  return useQuery({
    queryKey: ["simulations", city],
    queryFn: () =>
      apiFetch<any>(`/simulations?city_id=${city}`).then(res => res.results || []).catch(() => []),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useRunSimulation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      city_id: string;
      scenario_type: string;
      parameters: Record<string, any>;
    }) =>
      apiFetch<any>("/simulations/run", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["simulations"] });
    },
  });
}

export function useClearSimulations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (city: string = defaultCityId) =>
      apiFetch<any>(`/simulations/history?city_id=${city}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["simulations"] });
    },
  });
}

// ─── Datasets / Admin ──────────────────────────────────────────────────────
export function useDatasets(city: string = defaultCityId) {
  return useQuery({
    queryKey: ["datasets", city],
    queryFn: () =>
      apiFetch<any>(`/datasets?city_id=${city}`).then(res => res.results || []).catch(() => []),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useDataset(id: string) {
  return useQuery({
    queryKey: ["dataset", id],
    queryFn: () => apiFetch<any>(`/datasets/${id}`).catch(() => null),
    enabled: Boolean(id),
    staleTime: 30_000,
    retry: 1,
  });
}

// ─── Reports ───────────────────────────────────────────────────────────────
export function useReports(city: string = defaultCityId) {
  return useQuery({
    queryKey: ["reports", city],
    queryFn: () =>
      apiFetch<any[]>(`/reports?city_id=${city}`).catch(() => []),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useReportJob(jobId: string | null) {
  return useQuery({
    queryKey: ["report-job", jobId],
    queryFn: () =>
      apiFetch<{ status: string; report_id?: string }>(`/reports/status/${jobId}`),
    enabled: Boolean(jobId),
    refetchInterval: (data: any) => {
      const status = data?.state?.data?.status;
      if (status === "completed" || status === "failed") return false;
      return 3000;
    },
    retry: 2,
  });
}
