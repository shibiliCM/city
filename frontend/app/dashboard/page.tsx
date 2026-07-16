"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity, AlertTriangle, Users, Wind,
  TrendingUp, Layers, RefreshCw, ChevronRight
} from "lucide-react";
import { CityMap } from "@/components/map/CityMap";
import { PrismTile } from "@/components/ui/PrismTile";
import { HaloGauge } from "@/components/ui/HaloGauge";
import { useHeatmap, useHotspots, useKpis, useTrafficTrend } from "@/hooks/useCityData";
import { cityId } from "@/lib/utils";
import { chartThemeFor } from "@/lib/chart-theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false }) as any;

const LAYERS = [
  { key: "traffic",   label: "Traffic",   color: "#FF8A3D", category: "traffic" },
  { key: "pollution", label: "Pollution",  color: "#34D399", category: "pollution" },
  { key: "accident",  label: "Accident",  color: "#FB7185", category: "accident" },
] as const;

type LayerKey = (typeof LAYERS)[number]["key"];

function HotspotRow({ zone, metric, rank, color, category, onClick }: { zone: any; metric: string; rank: number; color: string; category: string; onClick: () => void }) {
  const val = zone[metric] ?? 0;
  const pct = Math.min(100, (val / 100) * 100);
  let gradientClass = "bg-gradient-to-r from-[var(--city-violet)] to-[#5c3cfc]";
  if (category === "traffic") gradientClass = "bg-gradient-to-r from-[#FF8A3D] to-[#E06A1D]";
  if (category === "pollution") gradientClass = "bg-gradient-to-r from-[#34D399] to-[#10B981]";
  if (category === "population") gradientClass = "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9]";
  if (category === "accident") gradientClass = "bg-gradient-to-r from-[#FB7185] to-[#E11D48]";
  if (category === "transport") gradientClass = "bg-gradient-to-r from-[#FBBF24] to-[#D97706]";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        padding: "12px 0",
        border: 0,
        borderBottom: "1px solid var(--city-border-light)",
        background: "transparent",
        display: "flex",
        gap: 12,
        alignItems: "center",
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 8, background: color + "22",
        color: color, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, flexShrink: 0
      }}>
        {rank + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--city-text)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {zone.zone_name || zone.zone_id}
        </div>
        <div style={{ height: 4, background: "var(--city-surface-2)", borderRadius: 2, overflow: "hidden" }}>
          <div className={gradientClass} style={{ height: "100%", width: `${pct}%`, borderRadius: 2, transition: "width 0.8s ease" }} />
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color, flexShrink: 0 }}>
        {Number(val).toFixed(1)}
      </div>
      <ChevronRight size={13} color="var(--city-text-muted)" />
    </button>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [layer, setLayer] = useState<LayerKey>("traffic");
  
  const { data: kpis, isLoading: kpisLoading, refetch } = useKpis();
  const { data: geojson } = useHeatmap(layer);
  const { data: hotspots = [], isLoading: hotspotsLoading } = useHotspots(layer);
  const { data: trafficTrendRows = [] } = useTrafficTrend(cityId, 30);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === "dark" : true;

  const metricMap: Record<LayerKey, string> = {
    traffic: "traffic_score",
    pollution: "aqi",
    accident: "accident_density",
  };
  const currentMetric = metricMap[layer];
  const currentLayerObj = LAYERS.find(l => l.key === layer);
  const currentColor = currentLayerObj?.color ?? "#7C5CFC";

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => setRefreshing(false), 800);
  };

  const trafficTrend = trafficTrendRows.length
    ? trafficTrendRows.map(row => ({
        x: new Date(row.date).toLocaleDateString("en", { month: "short", day: "numeric" }),
        y: row.traffic_score,
      }))
    : Array.from({ length: 30 }, (_, i) => ({
        x: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString("en", { month: "short", day: "numeric" }),
        y: Math.max(10, (kpis?.avg_traffic_score ?? 55) + Math.sin(i / 4) * 12 + i * 0.3),
      }));

  const chartTheme = chartThemeFor("traffic", isDark);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 className="section-title">
            <Activity size={18} color="var(--city-violet)" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
            <span style={{ verticalAlign: "middle" }}>City Dashboard</span>
          </h1>
          <p className="section-sub">Real-time urban intelligence overview</p>
        </div>
        <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14 }}>
        <PrismTile
          title="Total Population"
          value={kpis?.total_population ?? 0}
          unit="people"
          trend={2}
          category="population"
          icon={<Users size={14} />}
          subtitle="City-wide"
          loading={kpisLoading}
        />
        <PrismTile
          title="Avg Traffic Score"
          value={kpis?.avg_traffic_score !== undefined && kpis?.avg_traffic_score !== null ? Number(kpis.avg_traffic_score).toFixed(1) : "—"}
          unit="/ 100"
          trend={4}
          category="traffic"
          icon={<TrendingUp size={14} />}
          subtitle="Normalized"
          loading={kpisLoading}
        />
        <PrismTile
          title="City AQI"
          value={kpis?.city_aqi !== undefined && kpis?.city_aqi !== null ? Number(kpis.city_aqi).toFixed(0) : "—"}
          trend={-3}
          category="pollution"
          icon={<Wind size={14} />}
          subtitle={(kpis?.city_aqi ?? 0) > 150 ? "⚠ Unhealthy" : "Moderate"}
          loading={kpisLoading}
        />
        <PrismTile
          title="Accident Count"
          value={kpis?.accident_count ?? 0}
          trend={1}
          category="accident"
          icon={<AlertTriangle size={14} />}
          subtitle="Total incidents"
          loading={kpisLoading}
        />
        <PrismTile
          title="City Health Score"
          value={kpis?.city_health_score !== undefined && kpis?.city_health_score !== null ? Number(kpis.city_health_score).toFixed(1) : "—"}
          unit="/ 100"
          trend={2}
          category="violet"
          icon={<Activity size={14} />}
          subtitle="Composite index"
          loading={kpisLoading}
        />
      </div>

      {/* Map + Hotspots */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18 }}>
        {/* Map */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--city-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={15} color="var(--city-violet)" />
              <span style={{ fontWeight: 600, fontSize: 14 }}>City Heatmap</span>
            </div>
            <div className="tabs" style={{ gap: 2, padding: 4 }}>
              {LAYERS.map(({ key, label, color }) => (
                <button key={key} className={`tab ${layer === key ? "active" : ""}`}
                  onClick={() => setLayer(key)}
                  style={layer === key ? { borderBottom: `2px solid ${color}`, color: color, borderRadius: 0, fontWeight: 600 } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <CityMap
            geojson={geojson}
            className="h-[480px] rounded-none"
            layerType="fill"
            metric={currentMetric}
          />
        </div>

        {/* Hotspots */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--city-text)" }}>
                Top Hotspots
              </div>
              <div style={{ fontSize: 11, color: "var(--city-text-muted)", marginTop: 2 }}>
                {LAYERS.find(l => l.key === layer)?.label} pressure zones
              </div>
            </div>
            <span className="badge" style={{ background: currentColor + "22", color: currentColor, border: `1px solid ${currentColor}44` }}>
              {layer}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            {hotspotsLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 52, marginBottom: 8, borderRadius: 8 }} />
                ))
              : hotspots.slice(0, 5).map((h: any, i: number) => (
                  <HotspotRow
                    key={h.zone_id}
                    zone={h}
                    metric={currentMetric}
                    rank={i}
                    color={currentColor}
                    category={layer}
                    onClick={() => router.push(`/analytics?tab=${layer}&zone=${encodeURIComponent(h.zone_id)}`)}
                  />
                ))
            }
          </div>
          {hotspots.length === 0 && !hotspotsLoading && (
            <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--city-text-muted)", fontSize: 13 }}>
              No data — upload and publish a dataset from Admin
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--city-border)", fontWeight: 600, fontSize: 14 }}>
            Traffic Trend (Last 30 Days)
          </div>
          {mounted && (
            <Plot
              data={[
                {
                  name: "Traffic Score",
                  x: trafficTrend.map(d => d.x),
                  y: trafficTrend.map(d => d.y),
                  type: "scatter",
                  mode: "lines",
                  fill: "tozeroy",
                  fillcolor: "rgba(124, 92, 252, 0.2)",
                  line: { color: "#7C5CFC", width: 3, shape: "spline" },
                  hovertemplate: "<b>%{y:.1f}</b><extra>Traffic Score</extra>",
                },
                {
                  name: "Baseline",
                  x: trafficTrend.map(d => d.x),
                  y: trafficTrend.map((d, i) => Math.max(0, d.y - (Math.sin(i / 3) * 15 + 10))),
                  type: "scatter",
                  mode: "lines",
                  fill: "tozeroy",
                  fillcolor: "rgba(52, 211, 153, 0.15)",
                  line: { color: "#34D399", width: 2, shape: "spline" },
                  hovertemplate: "<b>%{y:.1f}</b><extra>Baseline</extra>",
                }
              ]}
              layout={{
                ...chartTheme.layout,
                height: 240,
                margin: { l: 44, r: 16, t: 12, b: 44 },
                hovermode: "x unified",
                showlegend: true,
                legend: { orientation: "h", y: 1.15, x: 0.5, xanchor: "center" }
              }}
              config={chartTheme.config}
              style={{ width: "100%" }}
            />
          )}
        </div>

        <PrismTile
          title="City Health Index"
          value={kpis?.city_health_score !== undefined && kpis?.city_health_score !== null ? Number(kpis.city_health_score).toFixed(1) : "—"}
          unit="/ 100"
          trend={2}
          category="violet"
          icon={<Activity size={20} />}
          subtitle="Composite Score"
          loading={kpisLoading}
          style={{ minHeight: 285, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 24 }}
        />
      </div>
    </div>
  );
}
