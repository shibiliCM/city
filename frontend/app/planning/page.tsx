"use client";

import { useState, useRef } from "react";
import { WandSparkles, MapPin, Loader2, ChevronRight, Clock, TrendingUp, Building2, Bus, Route, Trash2 } from "lucide-react";
import { CityMap } from "@/components/map/CityMap";
// Custom CircularGauge component to replace deleted HaloGauge
function CircularGauge({ value, size = 88 }: { value: number; size?: number }) {
  const radius = (size - 10) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.05)"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="var(--city-violet)"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--city-text)", fontFamily: "var(--font-display)" }}>
          {value.toFixed(0)}%
        </span>
        <span style={{ fontSize: 8, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: -2 }}>
          Confidence
        </span>
      </div>
    </div>
  );
}

import { useRecommend, useRecommendations, useClearRecommendations } from "@/hooks/useCityData";
import { cityId } from "@/lib/utils";

const EXAMPLE_QUERIES = [
  { icon: Building2, label: "Where should a new hospital be built?", color: "#FB7185" },
  { icon: Bus,       label: "Which area needs more buses?",           color: "#FBBF24" },
  { icon: Route,     label: "Which roads should be expanded?",        color: "#FF8A3D" },
  { icon: Building2, label: "Where to build a new school?",           color: "#38BDF8" },
  { icon: TrendingUp,label: "Which zone needs pollution mitigation?", color: "#34D399" },
];

const getQueryColor = (queryText: string): string => {
  const q = (queryText || "").toLowerCase();
  if (q.includes("hospital")) return "#FB7185";
  if (q.includes("bus")) return "#FBBF24";
  if (q.includes("road") || q.includes("expand")) return "#FF8A3D";
  if (q.includes("school")) return "#38BDF8";
  if (q.includes("pollution") || q.includes("aqi") || q.includes("air")) return "#34D399";
  return "var(--city-violet)";
};

function DataPoint({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--city-border-light)" }}>
      <span style={{ fontSize: 12, color: "var(--city-text-muted)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--city-text)" }}>{typeof value === "number" ? Number(value).toFixed(2) : value ?? "—"}</span>
    </div>
  );
}

function Timeline({ items }: { items: Array<{ year: number; milestone: string }> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {items.map(({ year, milestone }, i) => (
        <div key={year} style={{ display: "flex", gap: 14, paddingBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: `linear-gradient(135deg, #7C5CFC, #5C3CFC)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, color: "white",
            }}>Y{year}</div>
            {i < items.length - 1 && (
              <div style={{ width: 1, flex: 1, background: "var(--city-border)", marginTop: 6 }} />
            )}
          </div>
          <div style={{ paddingTop: 4 }}>
            <div style={{ fontSize: 13, color: "var(--city-text)", lineHeight: 1.5 }}>{milestone}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationCard({ rec }: { rec: any }) {
  return (
    <div className="card animate-fade-in" style={{ borderColor: "rgba(124, 92, 252, 0.25)", background: "rgba(124, 92, 252, 0.04)" }}>
      {/* Zone + confidence */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--city-violet)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Recommended Zone
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--city-text)", display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)" }}>
            <MapPin size={18} color="var(--city-violet)" />
            {rec.recommended_zone || rec.zone_id}
          </div>
        </div>
        <div style={{ marginTop: -10, marginRight: -10 }}>
          <CircularGauge
            value={rec.confidence_percent || 0}
            size={90}
          />
        </div>
      </div>

      {/* Reasoning */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Reasoning</div>
        <div style={{ fontSize: 13, color: "var(--city-text-dim)", lineHeight: 1.65, background: "var(--city-surface-2)", padding: "12px 14px", borderRadius: 8, borderLeft: "3px solid var(--city-violet)" }}>
          {rec.reasoning}
        </div>
      </div>

      {/* Supporting data */}
      {rec.supporting_data_points?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Supporting Data</div>
          {rec.supporting_data_points.map((pt: any) => (
            <DataPoint key={pt.label} label={pt.label} value={pt.value} />
          ))}
        </div>
      )}

      {/* Timeline */}
      {rec.timeline?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>3-Year Implementation Timeline</div>
          <Timeline items={rec.timeline} />
        </div>
      )}
    </div>
  );
}

export default function PlanningPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);
  const recommend = useRecommend();
  const clearRecommendations = useClearRecommendations();
  const { data: history = [] } = useRecommendations();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    if (!query.trim()) return;
    try {
      const res = await recommend.mutateAsync({ query, city_id: cityId });
      setResult(res);
    } catch (e) { console.error(e); }
  };

  const markerForResult = result?.zone_id ? [{ lng: 77.21, lat: 28.66, popup: result.recommended_zone, color: "#7C5CFC" }] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div>
        <h1 className="section-title">
          <WandSparkles size={18} color="var(--city-violet)" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
          <span style={{ verticalAlign: "middle" }}>Urban Planning AI</span>
        </h1>
        <p className="section-sub">AI-powered zone recommendations backed by real city data</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
        {/* Main panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Query input */}
          <div className="card">
            <label style={{ fontSize: 13, marginBottom: 8, color: "var(--city-text)", textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-display)" }}>
              Ask a planning question
            </label>
            <textarea
              ref={textareaRef}
              className="input"
              style={{ height: 100, resize: "vertical", marginBottom: 12 }}
              placeholder="e.g. Where should a new hospital be built to reduce coverage gap?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit(); }}
            />
            {/* Example chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {EXAMPLE_QUERIES.map(({ icon: Icon, label, color }) => (
                <button key={label} onClick={() => { setQuery(label); textareaRef.current?.focus(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "5px 12px",
                    borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: "pointer",
                    background: color + "15", color, border: `1px solid ${color}33`, transition: "all 0.15s",
                  }}>
                  <Icon size={11} /> {label.length > 32 ? label.slice(0, 32) + "…" : label}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!query.trim() || recommend.isPending}
              style={{ alignSelf: "flex-start" }}>
              {recommend.isPending
                ? <Loader2 size={13} className="animate-spin" />
                : <ChevronRight size={13} />
              }
              {recommend.isPending ? "Analysing…" : "Get Recommendation"}
            </button>
          </div>

          {/* Result */}
          {recommend.isPending && (
            <div className="card" style={{ textAlign: "center", padding: 40 }}>
              <Loader2 size={32} color="var(--city-violet)" className="animate-spin" style={{ margin: "0 auto 12px" }} />
              <div style={{ color: "var(--city-text-dim)", fontSize: 14 }}>Analysing city data and generating recommendation…</div>
            </div>
          )}
          {result && !recommend.isPending && <RecommendationCard rec={result} />}

          {/* Map with pin */}
          {result && (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--city-border)", fontWeight: 600, fontSize: 14 }}>
                Recommended Zone Location
              </div>
              <CityMap
                markers={markerForResult as any}
                className="h-64 rounded-none"
              />
            </div>
          )}
        </div>

        {/* History sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "var(--city-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Recommendation History
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ padding: "4px 8px", fontSize: 10, color: "var(--city-coral)", borderColor: "rgba(251,113,133,0.25)" }}
              onClick={() => { if(confirm("Clear all recommendation history?")) clearRecommendations.mutate(cityId); }}
              disabled={clearRecommendations.isPending || history.length === 0}
            >
              {clearRecommendations.isPending ? <span className="animate-spin" style={{ display: "inline-block", width: 10, height: 10, border: "1px solid rgba(255,255,255,0.3)", borderTopColor: "transparent", borderRadius: "50%" }} /> : <Trash2 size={10} />} Clear
            </button>
          </div>
          {history.length === 0 && (
            <div className="card-sm" style={{ textAlign: "center", color: "var(--city-text-muted)", fontSize: 12, padding: 32 }}>
              No recommendations yet
            </div>
          )}
          {(history as any[]).map((rec: any) => {
            const queryColor = getQueryColor(rec.query);
            return (
              <button key={rec._id || rec.id}
                onClick={() => setResult(rec.recommendation || rec)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px 10px 15px",
                  borderRadius: 8,
                  background: "var(--city-surface-2)",
                  border: "1px solid var(--city-border-light)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  overflow: "hidden",
                  lineHeight: "1.4"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = queryColor + "66";
                  e.currentTarget.style.background = queryColor + "11";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--city-border-light)";
                  e.currentTarget.style.background = "var(--city-surface-2)";
                }}
              >
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: queryColor }} />
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "flex-start", marginBottom: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--city-text)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", flex: 1, paddingRight: 8 }}>
                    {rec.query}
                  </div>
                  <span style={{ color: queryColor, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                    <Clock size={10} />
                    {rec.confidence_score ? `${(rec.confidence_score * 100).toFixed(0)}% conf` : "—"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--city-text-muted)" }}>
                  <MapPin size={10} color={queryColor} />
                  <span>Zone: <strong style={{ color: "var(--city-text)" }}>{rec.zone_id}</strong></span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
