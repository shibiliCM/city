export function chartThemeFor(
  category: "traffic" | "pollution" | "population" | "accident" | "transport" | "violet" | "default",
  isDark: boolean
) {
  const brandViolet = "#7C5CFC";
  const categoryColor = {
    traffic: "#FF8A3D",
    pollution: "#34D399",
    population: "#38BDF8",
    accident: "#FB7185",
    transport: "#FBBF24",
    violet: "#7C5CFC",
    default: "#7C5CFC",
  }[category] || brandViolet;

  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(30, 27, 46, 0.08)";
  const textColor = isDark ? "#9A9AB0" : "#6B6680";
  const titleColor = isDark ? "#F4F4F8" : "#1E1B2E";

  return {
    layout: {
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: {
        family: "var(--font-sans), Inter, sans-serif",
        color: textColor,
        size: 11,
      },
      xaxis: {
        gridcolor: gridColor,
        linecolor: gridColor,
        tickfont: { family: "var(--font-sans), Inter, sans-serif", color: textColor, size: 10 },
        title: { font: { family: "var(--font-display), Sora, sans-serif", color: textColor, size: 12 } },
      },
      yaxis: {
        gridcolor: gridColor,
        linecolor: gridColor,
        tickfont: { family: "var(--font-sans), Inter, sans-serif", color: textColor, size: 10 },
        title: { font: { family: "var(--font-display), Sora, sans-serif", color: textColor, size: 12 } },
      },
      colorway: [categoryColor, brandViolet, "#A78BFA", "#F472B6", "#60A5FA"],
      margin: { t: 40, r: 10, b: 40, l: 40 },
    },
    config: {
      responsive: true,
      displayModeBar: false,
    }
  };
}
