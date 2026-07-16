"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { ReactNode } from "react";

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: number;
  tone?: "teal" | "blue" | "amber" | "coral" | "violet" | "default";
  icon?: ReactNode;
  subtitle?: string;
  loading?: boolean;
}

export function KpiCard({ title, value, unit, trend = 0, tone = "teal", icon, subtitle, loading }: KpiCardProps) {
  const TrendIcon = trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const trendColor = trend > 0 ? "#fb7185" : trend < 0 ? "#2dd4bf" : "var(--city-text-muted)";
  const trendBg   = trend > 0 ? "rgba(244,63,94,0.1)" : trend < 0 ? "rgba(20,184,166,0.1)" : "rgba(99,130,180,0.1)";

  if (loading) {
    return (
      <div className={`kpi-card ${tone}`}>
        <div className="skeleton" style={{ height: 12, width: "50%", marginBottom: 14 }} />
        <div className="skeleton" style={{ height: 32, width: "70%", marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 10, width: "40%" }} />
      </div>
    );
  }

  return (
    <div className={`kpi-card ${tone}`}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--city-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {title}
        </div>
        {icon && (
          <div style={{ padding: 6, borderRadius: 7, background: "var(--city-surface-2)", border: "1px solid var(--city-border-light)", color: "var(--city-text-dim)" }}>
            {icon}
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--city-text)", lineHeight: 1 }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {unit && <div style={{ fontSize: 13, color: "var(--city-text-muted)", marginBottom: 3 }}>{unit}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {subtitle && <div style={{ fontSize: 11, color: "var(--city-text-muted)" }}>{subtitle}</div>}
        {trend !== 0 && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 8px", borderRadius: 6,
            background: trendBg, color: trendColor,
            fontSize: 11, fontWeight: 600
          }}>
            <TrendIcon size={11} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
}
