import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KpiCard } from "./KpiCard";

describe("KpiCard", () => {
  it("renders value, label, and trend indicator", () => {
    render(<KpiCard title="Traffic" value={82} unit="score" trend={4} />);

    expect(screen.getByText("Traffic")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
    expect(screen.getByText("score")).toBeInTheDocument();
    expect(screen.getByText("4%")).toBeInTheDocument();
  });
});
