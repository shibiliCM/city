"use client";

import { useState } from "react";
import { Bot, Play, TrendingUp, TrendingDown, Minus, History, ChevronRight, Trash2 } from "lucide-react";
import { useRunSimulation, useSimulations, useClearSimulations } from "@/hooks/useCityData";
import { cityId } from "@/lib/utils";
import { PrismTile } from "@/components/ui/PrismTile";

const AVAILABLE_ZONES = ["zone-1", "zone-2", "zone-3", "downtown", "north-sector", "industrial-belt", "east-suburbs", "west-end"];

const SCENARIOS = [
  {
    key: "ADD_ROAD",
    label: "Add Road",
    description: "Connect two zones with a new road segment",
    color: "#FF8A3D",
    category: "traffic",
    fields: [
      { key: "zone_a", label: "From Zone", type: "zone", placeholder: "zone-1" },
      { key: "zone_b", label: "To Zone", type: "zone", placeholder: "zone-2" },
      { key: "capacity", label: "Road Capacity (vehicles/hr)", type: "number", placeholder: "6000" },
    ],
  },
  {
    key: "ADD_BUSES",
    label: "Add Buses",
    description: "Increase public transport capacity in a zone",
    color: "#FBBF24",
    category: "transport",
    fields: [
      { key: "zone_id", label: "Target Zone", type: "zone", placeholder: "zone-1" },
      { key: "bus_count", label: "Bus Count", type: "number", placeholder: "50" },
    ],
  },
  {
    key: "POPULATION_GROWTH",
    label: "Population Growth",
    description: "Simulate population increase and downstream impacts",
    color: "#38BDF8",
    category: "population",
    fields: [
      { key: "zone_id", label: "Zone", type: "zone", placeholder: "zone-1" },
      { key: "growth_pct", label: "Growth %", type: "number", placeholder: "10" },
    ],
  },
  {
    key: "BUILD_HOSPITAL",
    label: "Build Hospital",
    description: "Add a hospital and recompute healthcare coverage",
    color: "#FB7185",
    category: "accident",
    fields: [
      { key: "zone_id", label: "Zone", type: "zone", placeholder: "zone-1" },
    ],
  },
  {
    key: "RESTRICT_VEHICLES",
    label: "Restrict Vehicles",
    description: "Apply traffic restriction and observe modal shift",
    color: "#34D399",
    category: "pollution",
    fields: [
      { key: "zone_id", label: "Zone", type: "zone", placeholder: "zone-1" },
      { key: "restriction_pct", label: "Restriction %", type: "number", placeholder: "25" },
    ],
  },
] as const;

type ScenarioKey = (typeof SCENARIOS)[number]["key"];

function MetricCompare({ label, before, after }: { label: string; before: number; after: number }) {
  const beforeNum = Number(before) || 0;
  const afterNum = Number(after) || 0;
  const delta = afterNum - beforeNum;
  const pct = beforeNum !== 0 ? ((delta / Math.abs(beforeNum)) * 100) : 0;
  
  // Try to determine category based on metric name for the gradient
  const l = label.toLowerCase();
  let category: any = "violet";
  if (l.includes("traffic") || l.includes("time") || l.includes("congestion")) category = "traffic";
  if (l.includes("aqi") || l.includes("pollution")) category = "pollution";
  if (l.includes("pop")) category = "population";
  if (l.includes("coverage") || l.includes("accident")) category = "accident";

  return (
    <PrismTile
      title={label.replace(/_/g, " ")}
      value={afterNum.toFixed(1)}
      trend={pct}
      category={category}
      subtitle={`Before: ${beforeNum.toFixed(1)}`}
    />
  );
}

function DeltaBadge({ value, label }: { value: number; label: string }) {
  // Use Prism glass style classes instead of raw teal/coral where possible, 
  // but for positive/negative deltas, raw teal/coral works well as indicators.
  const numValue = Number(value) || 0;
  const isPositiveImpact = label.includes("coverage") ? numValue > 0 : numValue < 0; // mostly lower is better, except coverage
  const color = Math.abs(numValue) < 0.1 ? "var(--city-text-muted)" : isPositiveImpact ? "var(--city-teal)" : "var(--city-coral)";
  const bg = Math.abs(numValue) < 0.1 ? "var(--city-surface-3)" : isPositiveImpact ? "rgba(20, 184, 166, 0.12)" : "rgba(251, 113, 133, 0.12)";
  return (
    <div style={{ textAlign: "center", padding: "12px 16px", background: bg, borderRadius: 10, border: "1px solid", borderColor: Math.abs(numValue) < 0.1 ? "transparent" : `${color}40` }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginBottom: 4, fontFamily: "var(--font-display)" }}>
        {numValue > 0 ? "+" : ""}{numValue.toFixed(1)}%
      </div>
      <div style={{ fontSize: 11, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    </div>
  );
}

export default function SimulationPage() {
  const [scenario, setScenario] = useState<ScenarioKey>("ADD_ROAD");
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<any>(null);
  const runSim = useRunSimulation();
  const clearSimulations = useClearSimulations();
  const { data: history = [] } = useSimulations();

  const current = SCENARIOS.find(s => s.key === scenario)!;

  const handleRun = async () => {
    const parameters: Record<string, any> = {};
    current.fields.forEach(f => {
      const val = params[f.key] ?? f.placeholder;
      parameters[f.key] = f.type === "number" ? Number(val) : val;
    });
    try {
      const res = await runSim.mutateAsync({ city_id: cityId, scenario_type: scenario, parameters });
      setResult(res);
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 className="section-title">
          <Bot size={18} color="var(--city-violet)" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
          <span style={{ verticalAlign: "middle" }}>Digital Twin Simulation</span>
        </h1>
        <p className="section-sub">What-if scenario modelling on a live city graph</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20 }}>
        {/* Builder panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, fontFamily: "var(--font-display)" }}>Scenario Builder</div>
            {/* Scenario tabs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {SCENARIOS.map(({ key, label, description, color }) => (
                <button key={key} onClick={() => { setScenario(key); setParams({}); setResult(null); }}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px 10px 15px",
                    borderRadius: 8,
                    background: scenario === key ? color + "15" : "var(--city-surface-2)",
                    border: "1px solid",
                    borderColor: scenario === key ? color + "44" : "var(--city-border-light)",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    overflow: "hidden",
                    lineHeight: "1.4"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = color + "66"; e.currentTarget.style.background = color + "11"; }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = scenario === key ? color + "44" : "var(--city-border-light)";
                    e.currentTarget.style.background = scenario === key ? color + "15" : "var(--city-surface-2)";
                  }}
                >
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: color }} />
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--city-text)", marginBottom: 2 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 11, color: "var(--city-text-muted)" }}>{description}</div>
                </button>
              ))}
            </div>

            {/* Parameter fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {current.fields.map(field => (
                <div key={field.key}>
                  <label style={{ fontSize: 11, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6, display: "block" }}>{field.label}</label>
                  {field.type === "zone" ? (
                    <select
                      className="input select"
                      value={params[field.key] ?? field.placeholder}
                      onChange={e => setParams(p => ({ ...p, [field.key]: e.target.value }))}
                      style={{ width: "100%" }}
                    >
                      {AVAILABLE_ZONES.map(z => (
                        <option key={z} value={z}>{z.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type} className="input"
                      placeholder={field.placeholder}
                      value={params[field.key] ?? ""}
                      onChange={e => setParams(p => ({ ...p, [field.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>

            <button className="btn btn-primary" onClick={handleRun} disabled={runSim.isPending}
              style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>
              {runSim.isPending
                ? <span className="animate-spin" style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
                : <Play size={13} />
              }
              {runSim.isPending ? "Simulating…" : "Run Simulation"}
            </button>
          </div>

          {/* History */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--city-text-dim)" }}>
                <History size={13} /> History
              </div>
              <button 
                className="btn btn-secondary" 
                style={{ padding: "4px 8px", fontSize: 10, color: "var(--city-coral)", borderColor: "rgba(251,113,133,0.25)" }}
                onClick={() => { if(confirm("Clear all simulation history?")) clearSimulations.mutate(cityId); }}
                disabled={clearSimulations.isPending || history.length === 0}
              >
                {clearSimulations.isPending ? <span className="animate-spin" style={{ display: "inline-block", width: 10, height: 10, border: "1px solid rgba(255,255,255,0.3)", borderTopColor: "transparent", borderRadius: "50%" }} /> : <Trash2 size={10} />} Clear
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
              {(history as any[]).slice(0, 8).map((h: any) => {
                const scenarioColor = SCENARIOS.find(s => s.key === h.scenario_type)?.color || "var(--city-violet)";
                return (
                  <button key={h._id || h.id} onClick={() => setResult(h)}
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "var(--city-surface-2)",
                      border: "1px solid var(--city-border-light)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      overflow: "hidden",
                      lineHeight: "1.4"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = scenarioColor + "66"; e.currentTarget.style.background = scenarioColor + "11"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--city-border-light)"; e.currentTarget.style.background = "var(--city-surface-2)"; }}
                  >
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: scenarioColor }} />
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--city-text)", marginBottom: 4, display: "flex", justifyContent: "space-between", width: "100%" }}>
                      {h.scenario_type.replace(/_/g, " ")}
                      <span style={{ color: scenarioColor, fontSize: 10 }}>{((h.confidence || 0) * 100).toFixed(0)}% conf</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--city-text-muted)", lineHeight: "1.4" }}>
                      {new Date(h.created_at || "").toLocaleString()}
                    </div>
                  </button>
                )
              })}
              {!history.length && <div style={{ fontSize: 12, color: "var(--city-text-muted)", textAlign: "center", padding: 16 }}>No simulations yet</div>}
            </div>
          </div>
        </div>

        {/* Results panel */}
        <div>
          {!result && !runSim.isPending && (
            <div className="card" style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, minHeight: 400 }}>
              <Bot size={48} color="var(--city-surface-3)" />
              <div style={{ color: "var(--city-text-dim)", fontSize: 14 }}>Configure a scenario and run simulation</div>
              <div style={{ fontSize: 12, color: "var(--city-text-muted)", maxWidth: 300, textAlign: "center", lineHeight: 1.6 }}>
                The digital twin models the city as a graph and simulates the real-world impact of planning decisions.
              </div>
            </div>
          )}

          {runSim.isPending && (
            <div className="card" style={{ height: 400, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
              <div className="animate-spin" style={{ width: 40, height: 40, border: "3px solid var(--city-border)", borderTopColor: "var(--city-violet)", borderRadius: "50%" }} />
              <div style={{ color: "var(--city-text-dim)", fontSize: 14 }}>Running simulation on city graph…</div>
            </div>
          )}

          {result && !runSim.isPending && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="animate-fade-in">
              {/* Header */}
              <div className="card" style={{ borderColor: "rgba(124, 92, 252, 0.3)", background: "rgba(124, 92, 252, 0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--city-text)", fontFamily: "var(--font-display)" }}>
                    {result.scenario_type.replace(/_/g, " ")}
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(124, 92, 252, 0.15)", color: "var(--city-violet)", fontSize: 12, fontWeight: 600 }}>
                    {((result.confidence || 0) * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--city-text-muted)" }}>
                  Simulation generated from graph execution
                </div>
              </div>

              {/* Delta indicators */}
              {result.delta_metrics && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Impact Deltas</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                    {Object.entries(result.delta_metrics).map(([key, val]) => (
                      <DeltaBadge key={key} value={Number(val)} label={key.replace(/_change_pct/, "").replace(/_/g, " ")} />
                    ))}
                  </div>
                </div>
              )}

              {/* Before/After comparison */}
              {result.before_metrics && result.after_metrics && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Before vs After</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                    {Object.keys(result.before_metrics).map(key => (
                      <MetricCompare key={key}
                        label={key}
                        before={result.before_metrics[key]}
                        after={result.after_metrics[key]}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {result.recommendations?.length > 0 && (
                <div className="card-sm">
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, fontFamily: "var(--font-display)" }}>Mitigation & Next Steps</div>
                  {result.recommendations.map((r: string, i: number) => (
                    <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 13, color: "var(--city-text-dim)", lineHeight: 1.5 }}>
                      <ChevronRight size={14} color="var(--city-violet)" style={{ flexShrink: 0, marginTop: 2 }} />
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
