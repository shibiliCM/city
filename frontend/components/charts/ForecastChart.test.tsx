import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ForecastChart } from "./ForecastChart";

vi.mock("next/dynamic", () => ({
  default: () => function MockPlot() {
    return <div data-testid="plotly-chart" />;
  },
}));

describe("ForecastChart", () => {
  it("renders with valid data", () => {
    render(<ForecastChart x={["2026-01-01"]} y={[10]} />);
    expect(screen.getByTestId("plotly-chart")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    const { container } = render(<ForecastChart x={[]} y={[]} loading />);
    expect(container.querySelector(".skeleton")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    render(<ForecastChart x={[]} y={[]} />);
    expect(screen.getByText(/No forecast data/i)).toBeInTheDocument();
  });
});
