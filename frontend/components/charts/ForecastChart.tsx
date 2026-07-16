"use client";

import dynamic from "next/dynamic";
import React, { useMemo, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { chartThemeFor } from "@/lib/chart-theme";

interface PlotComponentProps {
  data: Array<Record<string, unknown>>;
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
  style: React.CSSProperties;
}

const Plot = dynamic<PlotComponentProps>(() => import("react-plotly.js"), { ssr: false });

interface ForecastChartProps {
  x: (string | number)[];
  y: number[];
  yUpper?: number[];
  yLower?: number[];
  title?: string;
  yLabel?: string;
  color?: string;
  height?: number;
  loading?: boolean;
  category?: "traffic" | "pollution" | "population" | "accident" | "transport" | "violet" | "default";
}

function ForecastChartComponent({
  x, y, yUpper, yLower,
  title = "Forecast",
  yLabel = "Value",
  color = "#7C5CFC",
  height = 360,
  loading = false,
  category = "default",
}: ForecastChartProps) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? theme === "dark" : true;

  const chartTheme = useMemo(() => {
    return chartThemeFor(category, isDark);
  }, [category, isDark]);

  const data = useMemo<Array<Record<string, unknown>>>(() => {
    const traces: Array<Record<string, unknown>> = [];

    if (yUpper && yLower && yUpper.length === x.length) {
      traces.push({
        x: [...x, ...[...x].reverse()],
        y: [...yUpper, ...[...yLower].reverse()],
        fill: "toself",
        fillcolor: color + "66",
        line: { color: "transparent" },
        hoverinfo: "skip",
        showlegend: false,
        type: "scatter",
      });
    }

    traces.push({
      x,
      y,
      type: "scatter",
      mode: "lines",
      name: "Predicted",
      line: { color, width: 2.5, shape: "spline" },
      hovertemplate: `<b>%{y:.1f}</b><extra>${yLabel}</extra>`,
    });
    return traces;
  }, [color, x, y, yLabel, yLower, yUpper]);

  if (loading) {
    return (
      <div className="skeleton" style={{ height, borderRadius: 12 }} />
    );
  }

  if (!x?.length) {
    return (
      <div style={{
        height, display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--city-surface-2)", borderRadius: 12,
        color: "var(--city-text-muted)", fontSize: 13
      }}>
        No forecast data — trigger a forecast to populate this chart.
      </div>
    );
  }

  return (
    <Plot
      data={data}
      layout={{
        ...chartTheme.layout,
        title: {
          text: title,
          font: {
            size: 13,
            color: isDark ? "#F4F4F8" : "#1E1B2E",
            family: "var(--font-display), Sora, sans-serif"
          }
        },
        height,
        margin: { l: 52, r: 20, t: 44, b: 48 },
        yaxis: {
          ...chartTheme.layout.yaxis,
          title: { text: yLabel, font: chartTheme.layout.yaxis.title.font },
        },
        hovermode: "x unified",
      }}
      config={chartTheme.config}
      style={{ width: "100%" }}
    />
  );
}

export const ForecastChart = React.memo(ForecastChartComponent);
