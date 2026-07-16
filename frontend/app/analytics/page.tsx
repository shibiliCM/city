"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { BarChart3, Activity, Wind, Users, AlertTriangle, Calendar } from "lucide-react";
import { useHotspots, useZone } from "@/hooks/useCityData";
import { PrismTile } from "@/components/ui/PrismTile";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { cityId } from "@/lib/utils";
import { chartThemeFor } from "@/lib/chart-theme";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false }) as any;

const TABS = [
  { key: "traffic",    label: "Traffic",    icon: Activity,      color: "#FF8A3D", metric: "traffic_score" },
  { key: "pollution",  label: "Pollution",  icon: Wind,          color: "#34D399", metric: "aqi" },
  { key: "population", label: "Population", icon: Users,         color: "#38BDF8", metric: "population_density" },
  { key: "accident",   label: "Accidents",  icon: AlertTriangle, color: "#FB7185", metric: "accident_density" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function StatRow({ label, value, unit = "" }: { label: string; value: any; unit?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--city-border-light)" }}>
      <span style={{ fontSize: 12, color: "var(--city-text-muted)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--city-text)" }}>
        {typeof value === "number" ? Number(value).toFixed(2) : value ?? "—"} {unit}
      </span>
    </div>
  );
}

function AreaTable({
  rows,
  metric,
  color,
  category,
  selectedZone,
  onSelect,
}: {
  rows: any[];
  metric: string;
  color: string;
  category: string;
  selectedZone: string;
  onSelect: (zoneId: string) => void;
}) {
  let gradientClass = "bg-gradient-to-r from-[var(--city-violet)] to-[#5c3cfc]";
  if (category === "traffic") gradientClass = "bg-gradient-to-r from-[#FF8A3D] to-[#E06A1D]";
  if (category === "pollution") gradientClass = "bg-gradient-to-r from-[#34D399] to-[#10B981]";
  if (category === "population") gradientClass = "bg-gradient-to-r from-[#38BDF8] to-[#0EA5E9]";
  if (category === "accident") gradientClass = "bg-gradient-to-r from-[#FB7185] to-[#E11D48]";
  if (category === "transport") gradientClass = "bg-gradient-to-r from-[#FBBF24] to-[#D97706]";
  if (!rows.length) return (
    <div style={{ textAlign: "center", padding: 40, color: "var(--city-text-muted)", fontSize: 13 }}>
      No zone data available. Upload and publish datasets from Admin.
    </div>
  );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Zone</th>
            <th>Score</th>
            <th>Population</th>
            <th>Area km²</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const val = Number(row[metric] ?? 0);
            const risk = val > 75 ? "critical" : val > 50 ? "high" : val > 25 ? "medium" : "low";
            const isSelected = selectedZone === row.zone_id;
            return (
              <tr
                key={row.zone_id}
                onClick={() => onSelect(row.zone_id)}
                style={{
                  cursor: "pointer",
                  background: isSelected ? `${color}18` : undefined,
                  transition: "background 0.2s",
                }}
              >
                <td style={{ color: "var(--city-text-muted)", fontWeight: 600 }}>{i + 1}</td>
                <td style={{ fontWeight: 600 }}>{row.zone_name || row.zone_id}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: "var(--city-surface-3)", borderRadius: 3, minWidth: 60 }}>
                      <div className={gradientClass} style={{ height: "100%", width: `${Math.min(100, val)}%`, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color }}>{val.toFixed(1)}</span>
                  </div>
                </td>
                <td style={{ color: "var(--city-text-dim)" }}>{Number(row.population || 0).toLocaleString()}</td>
                <td style={{ color: "var(--city-text-dim)" }}>{Number(row.area_sqkm || 0).toFixed(1)}</td>
                <td><RiskBadge level={risk} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ZoneProfile({ zoneId }: { zoneId: string }) {
  const { data: zone, isLoading } = useZone(zoneId);
  if (isLoading) return <div className="skeleton" style={{ height: 200, borderRadius: 10 }} />;
  if (!zone) return null;
  return (
    <div className="card-sm" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: "var(--city-text)", fontFamily: "var(--font-display)" }}>
        Zone Profile: {zone.zone_name || zone.zone_id}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
        <StatRow label="Traffic Score" value={zone.traffic_score} unit="/ 100" />
        <StatRow label="AQI" value={zone.aqi} />
        <StatRow label="Population" value={zone.population?.toLocaleString()} />
        <StatRow label="Population Density" value={zone.population_density} unit="/ km²" />
        <StatRow label="Accident Count" value={zone.accident_count} />
        <StatRow label="Accident Density" value={zone.accident_density} unit="/ km²" />
        <StatRow label="Area" value={zone.area_sqkm} unit="km²" />
      </div>
    </div>
  );
}

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as TabKey | null;
  const [tab, setTab] = useState<TabKey>(TABS.some(t => t.key === requestedTab) ? requestedTab! : "traffic");
  const [selectedZone, setSelectedZone] = useState(searchParams.get("zone") || "");
  const { data: rows = [], isLoading } = useHotspots(
    tab === "population" || tab === "accident" ? "accident" : tab as any,
    cityId
  );
  
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const { data: trafficRows = [] } = useHotspots("traffic", cityId);
  const { data: pollutionRows = [] } = useHotspots("pollution", cityId);
  const { data: accidentRows = [] } = useHotspots("accident", cityId);

  const current = TABS.find(t => t.key === tab)!;

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === "dark" : true;

  useEffect(() => {
    const nextTab = searchParams.get("tab") as TabKey | null;
    if (TABS.some(t => t.key === nextTab)) setTab(nextTab!);
    setSelectedZone(searchParams.get("zone") || "");
  }, [searchParams]);

  const chartRows = tab === "traffic" ? trafficRows
    : tab === "pollution" ? pollutionRows
    : accidentRows;

  const allZoneIds = Array.from(new Set([
    ...trafficRows.map((r: any) => r.zone_id),
    ...pollutionRows.map((r: any) => r.zone_id),
    ...accidentRows.map((r: any) => r.zone_id),
  ]));

  const chartTheme = chartThemeFor(tab, isDark);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="section-title">
            <BarChart3 size={18} color="var(--city-violet)" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
            <span style={{ verticalAlign: "middle" }}>Analytics</span>
          </h1>
          <p className="section-sub">Zone-level performance metrics and comparative analysis</p>
        </div>
        {/* Zone selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Calendar size={14} color="var(--city-text-muted)" />
          <select className="input select" style={{ width: 180 }} value={selectedZone} onChange={e => setSelectedZone(e.target.value)}>
            <option value="">All Zones</option>
            {allZoneIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(({ key, label, icon: Icon, color }) => (
          <button key={key} className={`tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
            style={tab === key ? { borderBottom: `2px solid ${color}`, color: color, borderRadius: 0, fontWeight: 600 } : {}}
          >
            <Icon size={13} style={{ display: "inline", marginRight: 5 }} />
            {label}
          </button>
        ))}
      </div>

      {/* Bar Chart */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--city-border)", fontWeight: 600, fontSize: 14 }}>
          {current.label} by Zone
        </div>
        {isLoading
          ? <div className="skeleton" style={{ height: 280, margin: 20, borderRadius: 8 }} />
          : mounted && (
            <Plot
              data={[{
                x: (chartRows as any[]).map((r: any) => r.zone_name || r.zone_id),
                y: (chartRows as any[]).map((r: any) => Number(r[current.metric] ?? 0)),
                type: "bar",
                marker: {
                  color: (chartRows as any[]).map((row) =>
                    row.zone_id === selectedZone ? current.color : `${current.color}CC`
                  ),
                  line: {
                    color: current.color,
                    width: (chartRows as any[]).map((row) =>
                      row.zone_id === selectedZone ? 2 : 0
                    )
                  }
                },
                hovertemplate: `<b>%{x}</b><br>${current.label}: <b>%{y:.2f}</b><extra></extra>`,
              }]}
              layout={{
                ...chartTheme.layout,
                height: 280,
                margin: { l: 50, r: 16, t: 12, b: 60 },
                xaxis: {
                  ...chartTheme.layout.xaxis,
                  tickangle: -20,
                },
                hovermode: "closest",
              }}
              config={chartTheme.config}
              style={{ width: "100%" }}
              onClick={(event: any) => {
                const pointIndex = event?.points?.[0]?.pointIndex;
                const row = typeof pointIndex === "number" ? (chartRows as any[])[pointIndex] : null;
                if (row?.zone_id) {
                  setSelectedZone(row.zone_id === selectedZone ? "" : row.zone_id);
                }
              }}
            />
          )
        }
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        {[
          { label: `Max ${current.label}`, value: Math.max(0, ...(chartRows as any[]).map((r: any) => Number(r[current.metric] ?? 0))).toFixed(1), icon: <Activity size={14}/> },
          { label: `Min ${current.label}`, value: Math.min(Infinity, ...(chartRows as any[]).map((r: any) => Number(r[current.metric] ?? 0)) as number[]) === Infinity ? "—" : Math.min(...(chartRows as any[]).map((r: any) => Number(r[current.metric] ?? 0))).toFixed(1), icon: <Activity size={14}/> },
          { label: "Zones Analyzed", value: chartRows.length, icon: <BarChart3 size={14}/> },
          { label: "Above Average", value: (() => { const avg = (chartRows as any[]).reduce((a, b) => a + Number(b[current.metric] ?? 0), 0) / Math.max(chartRows.length, 1); return (chartRows as any[]).filter(r => Number(r[current.metric] ?? 0) > avg).length; })(), icon: <AlertTriangle size={14}/> },
        ].map(s => (
          <PrismTile
            key={s.label}
            title={s.label}
            value={s.value}
            category={current.key as any}
            icon={s.icon}
          />
        ))}
      </div>

      {/* Zone profile */}
      {selectedZone && <ZoneProfile zoneId={selectedZone} />}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--city-border)", fontWeight: 600, fontSize: 14 }}>
          Zone Rankings — {current.label}
        </div>
        <div style={{ padding: 0 }}>
          <AreaTable
            rows={chartRows as any[]}
            metric={current.metric}
            color={current.color}
            category={current.key}
            selectedZone={selectedZone}
            onSelect={setSelectedZone}
          />
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 280, borderRadius: 10 }} />}>
      <AnalyticsContent />
    </Suspense>
  );
}
