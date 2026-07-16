"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Database, Upload, CheckCircle, AlertTriangle, Trash2,
  RefreshCw, Users, Eye, XCircle, BarChart2
} from "lucide-react";
import { useDatasets } from "@/hooks/useCityData";
import { API_BASE, apiFetch, apiHealth } from "@/lib/api";
import { StatusBadge } from "@/components/ui/RiskBadge";
import { cityId } from "@/lib/utils";

type DatasetType = "traffic" | "pollution" | "population" | "accident" | "transport";
const DATASET_TYPES: DatasetType[] = ["traffic", "pollution", "population", "accident", "transport"];

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
          Score
        </span>
      </div>
    </div>
  );
}

function QualityPanel({ report }: { report: any }) {
  if (!report) return null;
  return (
    <div className="card-sm" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <CircularGauge value={report.overall_score || 0} size={88} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, fontFamily: "var(--font-display)" }}>Quality Report</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--city-border-light)" }}>
              <span style={{ color: "var(--city-text-muted)" }}>Duplicate rows</span>
              <span style={{ fontWeight: 600, color: report.duplicate_count > 0 ? "var(--city-coral)" : "var(--city-teal)" }}>{report.duplicate_count}</span>
            </div>
            {Object.entries(report.outlier_count || {}).slice(0, 6).map(([col, cnt]) => (
              <div key={col} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--city-border-light)" }}>
                <span style={{ color: "var(--city-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{col} outliers</span>
                <span style={{ fontWeight: 600, color: (cnt as number) > 0 ? "var(--city-coral)" : "var(--city-teal)" }}>{cnt as number}</span>
              </div>
            ))}
            {Object.entries(report.missing_pct || {}).slice(0, 6).map(([col, pct]) => (
              <div key={col} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "1px solid var(--city-border-light)" }}>
                <span style={{ color: "var(--city-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{col} missing</span>
                <span style={{ fontWeight: 600, color: (pct as number) > 5 ? "var(--city-coral)" : "var(--city-teal)" }}>{Number(pct).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"upload" | "datasets" | "users">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [datasetType, setDatasetType] = useState<DatasetType>("traffic");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [health, setHealth] = useState<{ status: string; db: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: datasets = [], refetch: refetchDatasets } = useDatasets();

  useEffect(() => {
    apiHealth().then(setHealth);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".csv")) setFile(f);
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setError("");
    setUploading(true);
    setUploadProgress(10);
    const form = new FormData();
    form.append("file", file);
    form.append("dataset_type", datasetType);
    form.append("city_id", cityId);
    try {
      setUploadProgress(40);
      await apiFetch("/datasets/upload", { method: "POST", body: form });
      setUploadProgress(100);
      setFile(null);
      await refetchDatasets();
      setActiveTab("datasets");
    } catch (e: any) {
      setError(e.message || "Upload failed");
      await apiHealth().then(setHealth);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const doAction = async (action: string, id: string) => {
    setError("");
    setActionLoading(`${action}-${id}`);
    try {
      await apiFetch(`/datasets/${id}/${action}`, { method: "POST" });
      await refetchDatasets();
      if (selectedDataset?._id === id) {
        const updated = (await apiFetch<any[]>("/datasets?city_id=" + cityId)).find((d: any) => d._id === id);
        setSelectedDataset(updated || null);
      }
    } catch (e: any) {
      setError(e.message || "Action failed");
      await apiHealth().then(setHealth);
    }
    finally { setActionLoading(null); }
  };

  const deleteDataset = async (ds: any) => {
    if (!window.confirm(`Delete ${ds.name}? This removes the uploaded CSV from storage and updates analytics.`)) {
      return;
    }
    setError("");
    setActionLoading(`delete-${ds._id}`);
    try {
      await apiFetch(`/datasets/${ds._id}`, { method: "DELETE" });
      if (selectedDataset?._id === ds._id) setSelectedDataset(null);
      await refetchDatasets();
    } catch (e: any) {
      setError(e.message || "Delete failed");
      await apiHealth().then(setHealth);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 className="section-title">
          <Database size={18} color="var(--city-violet)" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
          <span style={{ verticalAlign: "middle" }}>Admin Console</span>
        </h1>
        <p className="section-sub">Dataset management, data quality, and user administration</p>
      </div>

      <div
        className="card-sm"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderColor: health?.status === "ok" ? "rgba(20,184,166,0.25)" : "rgba(251, 113, 133, 0.3)",
          background: health?.status === "ok" ? "var(--city-surface)" : "rgba(251, 113, 133, 0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {health?.status === "ok"
            ? <CheckCircle size={15} color="var(--city-teal)" />
            : <AlertTriangle size={15} color="var(--city-coral)" />
          }
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--city-text)", fontFamily: "var(--font-display)" }}>
              Backend {health?.status === "ok" ? "online" : "not ready"}
            </div>
            <div style={{ fontSize: 11, color: "var(--city-text-muted)" }}>
              API: {API_BASE} · Database: {health?.db || "checking"}
            </div>
          </div>
        </div>
        <button className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => apiHealth().then(setHealth)}>
          <RefreshCw size={12} /> Check
        </button>
      </div>

      {error && (
        <div className="card-sm" style={{ borderColor: "rgba(251, 113, 133, 0.3)", background: "rgba(251, 113, 133, 0.05)", color: "var(--city-coral)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <XCircle size={14} />
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {[
          { key: "upload", label: "Upload Dataset", icon: Upload },
          { key: "datasets", label: "Published Datasets", icon: BarChart2 },
          { key: "users", label: "User Management", icon: Users },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} className={`tab ${activeTab === key ? "active" : ""}`} onClick={() => setActiveTab(key as any)}>
            <Icon size={12} style={{ display: "inline", marginRight: 5 }} /> {label}
          </button>
        ))}
      </div>

      {/* Upload Tab */}
      {activeTab === "upload" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
          <div className="card">
            {/* Drop zone */}
            <div
              className={`upload-zone ${dragOver ? "drag-over" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }}
                onChange={e => setFile(e.target.files?.[0] || null)} />
              <Upload size={32} color="var(--city-violet)" style={{ margin: "0 auto 12px" }} />
              {file ? (
               <div>
                  <div style={{ fontWeight: 700, color: "var(--city-text)", marginBottom: 4, fontFamily: "var(--font-display)" }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: "var(--city-text-muted)" }}>{(file.size / 1024).toFixed(1)} KB</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, color: "var(--city-text)", marginBottom: 6, fontFamily: "var(--font-display)" }}>Drag & drop CSV file here</div>
                  <div style={{ fontSize: 12, color: "var(--city-text-muted)" }}>or click to browse · Max 50MB</div>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {uploadProgress > 0 && (
              <div className="progress" style={{ margin: "12px 0" }}>
                <div className="progress-bar" style={{ width: `${uploadProgress}%`, background: "linear-gradient(90deg, #7C5CFC, #5C3CFC)" }} />
              </div>
            )}

            {/* Type selector */}
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Dataset Type</label>
              <select className="input select" value={datasetType} onChange={e => setDatasetType(e.target.value as DatasetType)} style={{ width: "100%" }}>
                {DATASET_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>

            {/* Schema hint */}
            <div className="card-sm" style={{ marginTop: 14, fontSize: 12 }}>
              <div style={{ fontWeight: 600, color: "var(--city-text)", marginBottom: 6 }}>Required columns for <span style={{ color: "var(--city-violet)" }}>{datasetType}</span></div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--city-text-muted)", lineHeight: 1.7 }}>
                {datasetType === "traffic"    && "zone_id, timestamp, vehicles_count"}
                {datasetType === "pollution"  && "zone_id, timestamp, aqi"}
                {datasetType === "population" && "zone_id, year, population"}
                {datasetType === "accident"   && "zone_id, timestamp, accident_count"}
                {datasetType === "transport"  && "zone_id, timestamp, bus_demand"}
              </div>
            </div>

            <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading}
              style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>
              {uploading
                ? <span className="animate-spin" style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
                : <Upload size={13} />
              }
              {uploading ? "Uploading…" : "Upload Dataset"}
            </button>
          </div>

          {/* Instructions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="card-sm">
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, fontFamily: "var(--font-display)" }}>Workflow</div>
              {["Upload CSV", "Validate quality", "Clean data", "Publish for analytics"].map((step, i) => (
                <div key={step} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: "linear-gradient(135deg, #7C5CFC, #5C3CFC)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0,
                    boxShadow: "0 0 10px rgba(124, 92, 252, 0.3)"
                  }}>{i + 1}</div>
                  <span style={{ fontSize: 13, color: "var(--city-text-dim)" }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Datasets Tab */}
      {activeTab === "datasets" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--city-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 14, fontFamily: "var(--font-display)" }}>Datasets ({(datasets as any[]).length})</span>
              <button className="btn btn-secondary" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => refetchDatasets()}>
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Type</th><th>Rows</th><th>Quality</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(datasets as any[]).map((ds: any) => (
                    <tr key={ds._id} style={{ cursor: "pointer" }} onClick={() => setSelectedDataset(ds === selectedDataset ? null : ds)}>
                      <td style={{ fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ds.name}</td>
                      <td><span className="badge badge-queued" style={{ textTransform: "uppercase", fontSize: 10 }}>{ds.type}</span></td>
                      <td style={{ color: "var(--city-text-dim)" }}>{ds.row_count?.toLocaleString() ?? "—"}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 48, height: 4, background: "var(--city-surface-2)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${ds.quality_score ?? 0}%`, background: (ds.quality_score ?? 0) > 80 ? "var(--city-teal)" : (ds.quality_score ?? 0) > 60 ? "var(--city-violet)" : "var(--city-coral)", borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{ds.quality_score?.toFixed(0) ?? "—"}</span>
                        </div>
                      </td>
                      <td><StatusBadge status={ds.status} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => setSelectedDataset(ds)}
                            style={{ padding: "3px 8px", fontSize: 10 }}
                          >
                            <Eye size={10} /> Details
                          </button>
                          {["validate", "clean", "publish"].map(action => {
                            const disabled = actionLoading === `${action}-${ds._id}`;
                            const allowed = action === "validate" ? ds.status === "uploaded"
                              : action === "clean" ? ["uploaded","validated"].includes(ds.status)
                              : ["clean","validated"].includes(ds.status);
                            return (
                              <button key={action} disabled={!allowed || !!actionLoading}
                                onClick={() => doAction(action, ds._id)}
                                className="btn btn-secondary"
                                style={{ padding: "3px 8px", fontSize: 10, opacity: allowed ? 1 : 0.4 }}>
                                {disabled
                                  ? <span className="animate-spin" style={{ display: "inline-block", width: 10, height: 10, border: "1px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
                                  : action === "validate" ? <Eye size={10} /> : action === "clean" ? <CheckCircle size={10} /> : <Upload size={10} />
                                }
                                {action.charAt(0).toUpperCase() + action.slice(1)}
                              </button>
                            );
                          })}
                          <button
                            disabled={!!actionLoading}
                            onClick={() => deleteDataset(ds)}
                            className="btn btn-secondary"
                            style={{ padding: "3px 8px", fontSize: 10, color: "var(--city-coral)", borderColor: "rgba(251,113,133,0.25)" }}
                          >
                            {actionLoading === `delete-${ds._id}`
                              ? <span className="animate-spin" style={{ display: "inline-block", width: 10, height: 10, border: "1px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
                              : <Trash2 size={10} />
                            }
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!(datasets as any[]).length && (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "var(--city-text-muted)" }}>No datasets uploaded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quality details for selected */}
          {selectedDataset && (
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, fontFamily: "var(--font-display)" }}>Quality Details — {selectedDataset.name}</div>
              <QualityPanel report={selectedDataset.quality_report} />
              {selectedDataset.cleaning_report && (
                <div className="card-sm" style={{ marginTop: 12, fontSize: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, fontFamily: "var(--font-display)" }}>Cleaning Report</div>
                  <div>Duplicates removed: <strong style={{ color: "var(--city-violet)" }}>{selectedDataset.cleaning_report.duplicate_rows_removed}</strong></div>
                  <div>Date columns standardized: <strong style={{ color: "var(--city-violet)" }}>{selectedDataset.cleaning_report.date_columns_standardized?.join(", ") || "None"}</strong></div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--city-border)", fontWeight: 600, fontSize: 14, fontFamily: "var(--font-display)" }}>
            User Management
          </div>
          <div style={{ padding: 40, textAlign: "center", color: "var(--city-text-muted)", fontSize: 13 }}>
            <Users size={40} color="var(--city-surface-3)" style={{ margin: "0 auto 12px" }} />
            <div style={{ marginBottom: 8 }}>User management requires admin authentication.</div>
            <div style={{ fontSize: 12 }}>Register users via <code style={{ color: "var(--city-violet)", fontFamily: "monospace" }}>POST /api/v1/auth/register</code></div>
          </div>
        </div>
      )}
    </div>
  );
}
