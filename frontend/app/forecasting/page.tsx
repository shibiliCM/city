"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Play, CheckCircle, Clock, AlertTriangle, ChevronRight, Activity } from "lucide-react";
import { ForecastChart } from "@/components/charts/ForecastChart";
import { PrismTile } from "@/components/ui/PrismTile";
import { useForecast, useForecastValidation, useTriggerForecast } from "@/hooks/useCityData";
import { cityId } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

const TYPES = [
  { key: "traffic",    label: "Traffic",    color: "#FF8A3D", yLabel: "Vehicles / Score" },
  { key: "pollution",  label: "Pollution",  color: "#34D399", yLabel: "AQI" },
  { key: "population", label: "Population", color: "#38BDF8", yLabel: "People" },
  { key: "transport",  label: "Transport",  color: "#FBBF24", yLabel: "Bus Demand" },
] as const;
type ForecastType = (typeof TYPES)[number]["key"];

const HORIZONS = [
  { value: 30, label: "30 Days" },
  { value: 60, label: "60 Days" },
  { value: 90, label: "90 Days" },
];

const EVALUATION_METRICS = [
  { label: "MAE", key: "mae", suffix: "", desc: "Average absolute forecast miss" },
  { label: "RMSE", key: "rmse", suffix: "", desc: "Penalizes large misses" },
  { label: "MAPE", key: "mape", suffix: "%", desc: "Percentage error for business review" },
  { label: "Baseline", key: "baseline_mape", suffix: "%", desc: "Naive last-value comparison" },
] as const;

function JobStatusPill({ status }: { status: string }) {
  const cfg: Record<string, { color: string; bg: string; icon: any }> = {
    queued:    { color: "var(--city-text-muted)", bg: "var(--city-surface-3)", icon: Clock },
    running:   { color: "var(--city-violet)", bg: "rgba(124, 92, 252, 0.12)", icon: TrendingUp },
    completed: { color: "var(--city-teal)", bg: "var(--city-teal-dim)", icon: CheckCircle },
    failed:    { color: "var(--city-coral)", bg: "rgba(251, 113, 133, 0.12)",  icon: AlertTriangle },
  };
  const c = cfg[status] || cfg.queued;
  const Icon = c.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: c.bg, color: c.color, fontSize: 12, fontWeight: 600 }}>
      <Icon size={11} className={status === "running" ? "animate-spin" : ""} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ForecastSummary({ data, type }: { data: any; type: ForecastType }) {
  if (!data?.y?.length) return null;
  const vals: number[] = data.y.filter(Boolean);
  const peak = Math.max(...vals);
  const last = vals[vals.length - 1];
  const first = vals[0];
  const trend = last > first ? "rising" : last < first ? "falling" : "stable";

  const alertThresholds: Record<ForecastType, number> = { traffic: 80, pollution: 150, population: 2000000, transport: 500 };
  const alert = peak > alertThresholds[type];

  const trendIcon = trend === "rising" ? <TrendingUp size={14} /> : trend === "falling" ? <TrendingDown size={14} /> : <Activity size={14} />;
  const trendCategory = trend === "rising" ? "accident" : trend === "falling" ? "pollution" : "violet";
  const trendDesc = trend === "rising" ? "Upward trajectory" : trend === "falling" ? "Downward trajectory" : "Stable projection";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
      <PrismTile
        title="Trend"
        value={trend.charAt(0).toUpperCase() + trend.slice(1)}
        icon={trendIcon}
        category={trendCategory as any}
        subtitle={trendDesc}
      />
      <PrismTile
        title="Peak Value"
        value={peak.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        icon={<Activity size={14} />}
        category={type}
        subtitle="Highest forecasted point"
      />
      <PrismTile
        title="Alert"
        value={alert ? "Threshold Exceeded" : "Within Range"}
        icon={alert ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
        category={alert ? "accident" : "pollution"}
        subtitle={alert ? `Exceeded limit of ${alertThresholds[type].toLocaleString()}` : `Safe limit: ${alertThresholds[type].toLocaleString()}`}
      />
    </div>
  );
}

export default function ForecastingPage() {
  const [zone, setZone] = useState("zone-1");
  const [type, setType] = useState<ForecastType>("traffic");
  const [horizon, setHorizon] = useState(30);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [polling, setPolling] = useState(false);

  const { data: forecastData, isLoading, refetch } = useForecast(zone, type);
  const { data: validation } = useForecastValidation(zone, type);
  const trigger = useTriggerForecast();
  const current = TYPES.find(t => t.key === type)!;

  const handleTrigger = async () => {
    try {
      const res = await trigger.mutateAsync({ city_id: cityId, zone_id: zone, forecast_type: type, horizon_days: horizon });
      setJobId(res.job_id);
      setJobStatus("queued");
      setPolling(true);
      // Poll status
      const interval = setInterval(async () => {
        try {
          const status = await apiFetch<any>(`/forecasts/status/${res.job_id}`);
          setJobStatus(status.status);
          if (status.status === "completed" || status.status === "failed") {
            clearInterval(interval);
            setPolling(false);
            if (status.status === "completed") refetch();
          }
        } catch { clearInterval(interval); setPolling(false); }
      }, 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const exampleZones = ["zone-1", "zone-2", "zone-3", "downtown", "north-sector", "industrial-belt"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <h1 className="section-title">
          <TrendingUp size={18} color="var(--city-violet)" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
          <span style={{ verticalAlign: "middle" }}>Forecasting</span>
        </h1>
        <p className="section-sub">Prophet + XGBoost time-series predictions with confidence intervals</p>
      </div>

      {/* Controls */}
      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 16, alignItems: "flex-end" }}>
          <div>
            <label>Zone</label>
            <select className="input select" value={zone} onChange={e => setZone(e.target.value)}>
              {exampleZones.map(z => <option key={z} value={z}>{z.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
          </div>
          <div>
            <label>Forecast Type</label>
            <select className="input select" value={type} onChange={e => setType(e.target.value as ForecastType)}>
              {TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label>Horizon</label>
            <select className="input select" value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
              {HORIZONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" onClick={handleTrigger} disabled={trigger.isPending || polling}>
            {(trigger.isPending || polling)
              ? <span className="animate-spin" style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
              : <Play size={13} />
            }
            {polling ? "Running..." : "Run Forecast"}
          </button>
        </div>

        {/* Type selector chips */}
        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          {TYPES.map(({ key, label, color }) => (
            <button key={key} onClick={() => setType(key)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                cursor: "pointer", border: "1px solid",
                borderColor: type === key ? color : "var(--city-border)",
                background: type === key ? color + "22" : "transparent",
                color: type === key ? color : "var(--city-text-muted)",
                transition: "all 0.15s",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Job status */}
      {jobId && (
        <div className="card-sm" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--city-text-muted)" }}>Job ID:</span>
          <code style={{ fontSize: 11, color: "var(--city-violet)", fontFamily: "JetBrains Mono, monospace" }}>{jobId}</code>
          <JobStatusPill status={jobStatus} />
          {jobStatus === "completed" && (
            <span style={{ fontSize: 12, color: "var(--city-teal)", display: "flex", alignItems: "center", gap: 4 }}>
              <ChevronRight size={12} /> Results loaded below
            </span>
          )}
        </div>
      )}

      {/* Forecast Chart */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--city-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {current.label} Forecast — {zone.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </div>
          <span style={{ fontSize: 11, color: "var(--city-text-muted)" }}>
            {forecastData?.x?.length ? `${forecastData.x.length} data points` : "No data"}
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <ForecastChart
            x={forecastData?.x ?? []}
            y={forecastData?.y ?? []}
            yUpper={(forecastData as any)?.y_upper}
            yLower={(forecastData as any)?.y_lower}
            title=""
            yLabel={current.yLabel}
            color={current.color}
            category={type}
            height={340}
            loading={isLoading}
          />
        </div>
      </div>

      {/* Summary card */}
      {(forecastData?.y?.length ?? 0) > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--city-text-dim)", textTransform: "uppercase" }}>Forecast Summary</div>
          <ForecastSummary data={forecastData} type={type} />
        </div>
      )}

      <div className="card-sm">
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "var(--city-text)", fontFamily: "var(--font-display)" }}>
          Model Validation
          {validation?.samples !== undefined && (
            <span style={{ marginLeft: 8, color: "var(--city-text-muted)", fontSize: 11, fontWeight: 500 }}>
              {validation.status === "ok" ? `${validation.samples} holdout samples` : validation.status}
            </span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            {EVALUATION_METRICS.map(metric => {
              const categoryMap: Record<string, string> = {
                mae: "traffic",
                rmse: "pollution",
                mape: "population",
                baseline_mae: "traffic",
                baseline_rmse: "pollution",
                baseline_mape: "population",
                improvement_pct: "accident",
              };
              const iconMap: Record<string, JSX.Element> = {
                mae: <TrendingUp size={14} />, // traffic style
                rmse: <AlertTriangle size={14} />, // pollution style
                mape: <Activity size={14} />, // population style
                baseline_mae: <TrendingUp size={14} />, 
                baseline_rmse: <AlertTriangle size={14} />, 
                baseline_mape: <Activity size={14} />, 
                improvement_pct: <Activity size={14} />, 
              };
              const cat = categoryMap[metric.key] ?? "violet";
              const icon = iconMap[metric.key] ?? <Activity size={14} />;
              const value = validation?.status === "ok"
                ? Number(validation[metric.key] ?? 0).toFixed(metric.suffix ? 1 : 2)
                : "—";
              return (
                <PrismTile
                  key={metric.label}
                  title={metric.label}
                  value={value}
                  unit={metric.suffix}
                  category={cat as any}
                  icon={icon}
                  subtitle={metric.desc}
                />
              );
            })}
        </div>
        {validation?.status === "ok" && (
          <div style={{ marginTop: 10, color: validation.improvement_pct >= 0 ? "var(--city-teal)" : "var(--city-coral)", fontSize: 12, fontWeight: 600 }}>
            {validation.improvement_pct >= 0 ? "Model beats baseline by" : "Model trails baseline by"} {Math.abs(validation.improvement_pct).toFixed(1)}% MAPE
          </div>
        )}
      </div>
    </div>
  );
}
