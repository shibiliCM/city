"use client";

import { useState } from "react";
import { FileText, Download, RefreshCw, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { apiDownload, apiFetch } from "@/lib/api";
import { cityId } from "@/lib/utils";

const REPORT_TYPES = [
  { key: "analytics",   label: "Analytics Report",   desc: "KPIs, hotspots, zone stats" },
  { key: "forecast",    label: "Forecast Report",     desc: "Traffic, pollution, population predictions" },
  { key: "planning",    label: "Planning Report",     desc: "AI recommendations and timelines" },
  { key: "simulation",  label: "Simulation Report",  desc: "Before/after scenario comparisons" },
] as const;

const FORMATS = [
  { key: "pdf",  label: "PDF",  icon: "📄" },
  { key: "pptx", label: "PPTX", icon: "📊" },
] as const;

type ReportType = (typeof REPORT_TYPES)[number]["key"];
type FormatKey  = (typeof FORMATS)[number]["key"];

interface Job { job_id: string; status: string; report_id?: string; error?: string; report_type: string; format: string; created_at: Date; }

function JobRow({
  job,
  downloading,
  onDownload,
}: {
  job: Job;
  downloading: boolean;
  onDownload: (id: string) => void;
}) {
  const statusIcon = {
    queued:    <Clock size={13} color="var(--city-text-muted)" />,
    running:   <Loader2 size={13} color="var(--city-violet)" className="animate-spin" />,
    completed: <CheckCircle size={13} color="var(--city-teal)" />,
    failed:    <AlertCircle size={13} color="var(--city-coral)" />,
  }[job.status] ?? <Clock size={13} />;

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{job.report_type}</td>
      <td><span className="badge badge-queued" style={{ textTransform: "uppercase", fontSize: 10 }}>{job.format}</span></td>
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {statusIcon}
          <span style={{ fontSize: 12, textTransform: "capitalize" }}>{job.status}</span>
        </div>
      </td>
      <td style={{ color: "var(--city-text-muted)", fontSize: 12 }}>{job.created_at?.toLocaleTimeString?.() || "—"}</td>
      <td>
        {job.status === "completed" && job.report_id && (
          <button
            className="btn btn-secondary"
            style={{ padding: "5px 12px", fontSize: 12 }}
            onClick={() => onDownload(job.report_id!)}
            disabled={downloading}
          >
            {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {downloading ? "Downloading" : "Download"}
          </button>
        )}
      </td>
    </tr>
  );
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("analytics");
  const [format, setFormat] = useState<FormatKey>("pdf");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [generating, setGenerating] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch<{ job_id: string; status: string }>("/reports/generate", {
        method: "POST",
        body: JSON.stringify({ city_id: cityId, report_type: reportType, format }),
      });
      const newJob: Job = { job_id: res.job_id, status: "queued", report_type: reportType, format, created_at: new Date() };
      setJobs(prev => [newJob, ...prev]);

      // Poll status
      const interval = setInterval(async () => {
        try {
          const status = await apiFetch<any>(`/reports/status/${res.job_id}`).catch(() =>
            apiFetch<any>(`/forecasts/status/${res.job_id}`)
          );
          setJobs(prev => prev.map(j =>
            j.job_id === res.job_id ? { ...j, status: status.status, report_id: status.report_id, error: status.error } : j
          ));
          if (status.status === "completed" || status.status === "failed") clearInterval(interval);
        } catch (e) {
          clearInterval(interval);
          setError(e instanceof Error ? e.message : "Unable to refresh report status");
        }
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (reportId: string) => {
    setDownloadingId(reportId);
    setError(null);
    try {
      const { blob, filename } = await apiDownload(`/reports/download/${reportId}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 className="section-title">
          <FileText size={18} color="var(--city-violet)" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
          <span style={{ verticalAlign: "middle" }}>Reports</span>
        </h1>
        <p className="section-sub">Generate PDF and PowerPoint city intelligence reports</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20 }}>
        {/* Generator */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16, fontFamily: "var(--font-display)" }}>Report Generator</div>

            <label style={{ fontSize: 11, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Report Type</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {REPORT_TYPES.map(({ key, label, desc }) => (
                <button key={key} onClick={() => setReportType(key)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start",
                    padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                    background: reportType === key ? "rgba(124, 92, 252, 0.1)" : "var(--city-surface-2)",
                    border: "1px solid", borderColor: reportType === key ? "rgba(124, 92, 252, 0.35)" : "var(--city-border-light)",
                    transition: "all 0.15s", textAlign: "left",
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: reportType === key ? "var(--city-violet)" : "var(--city-text)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: "var(--city-text-muted)" }}>{desc}</div>
                </button>
              ))}
            </div>

            <label style={{ fontSize: 11, color: "var(--city-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Format</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {FORMATS.map(({ key, label, icon }) => (
                <button key={key} onClick={() => setFormat(key)}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 8, cursor: "pointer",
                    background: format === key ? "rgba(124, 92, 252, 0.1)" : "var(--city-surface-2)",
                    border: "1px solid", borderColor: format === key ? "rgba(124, 92, 252, 0.35)" : "var(--city-border-light)",
                    color: format === key ? "var(--city-violet)" : "var(--city-text-dim)",
                    fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  }}>
                  <span style={{ fontSize: 20 }}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}
              style={{ width: "100%", justifyContent: "center" }}>
              {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {generating ? "Generating…" : "Generate Report"}
            </button>
            {error && (
              <div style={{ marginTop: 12, color: "var(--city-coral)", fontSize: 12, lineHeight: 1.5 }}>
                {error}
              </div>
            )}
          </div>

          {/* Info card */}
          <div className="card-sm" style={{ fontSize: 12, color: "var(--city-text-muted)", lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: "var(--city-text)", marginBottom: 8, fontFamily: "var(--font-display)" }}>What's included?</div>
            <ul style={{ paddingLeft: 16 }}>
              <li>Executive Summary & KPI Cards</li>
              <li>Top Hotspots Table</li>
              <li>Forecast Charts</li>
              <li>Risk Assessment Overview</li>
              <li>Planning Recommendations</li>
              <li>Simulation Results</li>
            </ul>
          </div>
        </div>

        {/* Jobs table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--city-border)", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-display)" }}>
            Generated Reports
            <span style={{ fontSize: 12, color: "var(--city-text-muted)" }}>{jobs.length} report{jobs.length !== 1 ? "s" : ""}</span>
          </div>
          {jobs.length === 0 ? (
            <div style={{ padding: 60, textAlign: "center", color: "var(--city-text-muted)", fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <FileText size={40} color="var(--city-surface-3)" />
              <div>No reports generated yet.<br />Select a type and click Generate.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Format</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map(job => (
                    <JobRow
                      key={job.job_id}
                      job={job}
                      downloading={downloadingId === job.report_id}
                      onDownload={handleDownload}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
