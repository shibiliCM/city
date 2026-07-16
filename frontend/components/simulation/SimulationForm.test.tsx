import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SimulationForm } from "./SimulationForm";

describe("SimulationForm", () => {
  it("disables submit when required values are invalid", () => {
    render(<SimulationForm onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeDisabled();
  });

  it("validates bus count bounds", () => {
    render(<SimulationForm onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "zone-1" } });
    fireEvent.change(screen.getByLabelText("Bus count"), { target: { value: "999" } });
    expect(screen.getByRole("button", { name: /run simulation/i })).toBeDisabled();
  });

  it("submits valid values", () => {
    const onSubmit = vi.fn();
    render(<SimulationForm onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "zone-1" } });
    fireEvent.click(screen.getByRole("button", { name: /run simulation/i }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ zone_id: "zone-1" }));
  });
});
