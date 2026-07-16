"use client";

import { useMemo, useState } from "react";

export interface SimulationFormValues {
  scenario_type: "ADD_BUSES" | "POPULATION_GROWTH" | "ADD_ROAD";
  zone_id: string;
  bus_count: number;
  growth_pct: number;
}

interface SimulationFormProps {
  onSubmit: (values: SimulationFormValues) => void;
}

export function SimulationForm({ onSubmit }: SimulationFormProps) {
  const [values, setValues] = useState<SimulationFormValues>({
    scenario_type: "ADD_BUSES",
    zone_id: "",
    bus_count: 50,
    growth_pct: 10,
  });

  const errors = useMemo(() => {
    const next: Record<string, string> = {};
    if (!values.zone_id.trim()) next.zone_id = "Zone is required";
    if (values.scenario_type === "ADD_BUSES" && (values.bus_count < 1 || values.bus_count > 500)) {
      next.bus_count = "Bus count must be between 1 and 500";
    }
    if (values.scenario_type === "POPULATION_GROWTH" && (values.growth_pct < 1 || values.growth_pct > 100)) {
      next.growth_pct = "Growth percentage must be between 1 and 100";
    }
    return next;
  }, [values]);

  const isValid = Object.keys(errors).length === 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (isValid) onSubmit(values);
      }}
    >
      <label>
        Scenario
        <select
          aria-label="Scenario"
          value={values.scenario_type}
          onChange={(event) => setValues(prev => ({ ...prev, scenario_type: event.target.value as SimulationFormValues["scenario_type"] }))}
        >
          <option value="ADD_BUSES">Add buses</option>
          <option value="POPULATION_GROWTH">Population growth</option>
          <option value="ADD_ROAD">Add road</option>
        </select>
      </label>

      <label>
        Zone
        <input
          aria-label="Zone"
          value={values.zone_id}
          onChange={(event) => setValues(prev => ({ ...prev, zone_id: event.target.value }))}
        />
      </label>

      <label>
        Bus count
        <input
          aria-label="Bus count"
          type="number"
          value={values.bus_count}
          onChange={(event) => setValues(prev => ({ ...prev, bus_count: Number(event.target.value) }))}
        />
      </label>

      <label>
        Growth percentage
        <input
          aria-label="Growth percentage"
          type="number"
          value={values.growth_pct}
          onChange={(event) => setValues(prev => ({ ...prev, growth_pct: Number(event.target.value) }))}
        />
      </label>

      <button type="submit" disabled={!isValid}>Run simulation</button>
    </form>
  );
}
