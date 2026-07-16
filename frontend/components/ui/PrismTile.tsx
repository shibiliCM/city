"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { ReactNode } from "react";

interface PrismTileProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: number;
  category?: "traffic" | "pollution" | "population" | "accident" | "transport" | "violet" | "default";
  icon?: ReactNode;
  subtitle?: string;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function PrismTile({
  title,
  value,
  unit,
  trend = 0,
  category = "default",
  icon,
  subtitle,
  loading,
  className = "",
  style
}: PrismTileProps) {
  const TrendIcon = trend > 0 ? ArrowUpRight : trend < 0 ? ArrowDownRight : Minus;
  const trendBg = trend > 0 ? "rgba(255,255,255,0.2)" : trend < 0 ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)";
  const trendColor = "#ffffff";

  const gradientClass = {
    traffic: "bg-prism-traffic",
    pollution: "bg-prism-pollution",
    population: "bg-prism-population",
    accident: "bg-prism-accident",
    transport: "bg-prism-transport",
    violet: "bg-gradient-to-br from-[#7C5CFC] to-[#5C3CFC]",
    default: "bg-prism-traffic"
  }[category];

  if (loading) {
    return (
      <div className={`prism-tile ${gradientClass} animate-pulse`} style={{ height: 130 }}>
        <div style={{ height: 12, width: "50%", background: "rgba(255,255,255,0.3)", borderRadius: 4, marginBottom: 14 }} />
        <div style={{ height: 32, width: "70%", background: "rgba(255,255,255,0.3)", borderRadius: 4, marginBottom: 8 }} />
        <div style={{ height: 10, width: "40%", background: "rgba(255,255,255,0.3)", borderRadius: 4 }} />
      </div>
    );
  }

  return (
    <div className={`prism-tile ${gradientClass} ${className}`} style={style}>
      {/* Glow overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-white/20 pointer-events-none" />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, position: "relative" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {title}
        </div>
        {icon && (
          <div style={{ padding: 6, borderRadius: 8, background: "rgba(255,255,255,0.12)", color: "white", backdropFilter: "blur(4px)" }}>
            {icon}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 8, position: "relative" }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "#ffffff", lineHeight: 1, letterSpacing: "-0.02em" }}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {unit && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginBottom: 3 }}>{unit}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>{subtitle}</div>
        {trend !== 0 && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 8px", borderRadius: 6,
            background: trendBg, color: trendColor,
            fontSize: 10, fontWeight: 700
          }}>
            <TrendIcon size={11} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
}
