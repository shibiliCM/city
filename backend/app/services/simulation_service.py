from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
import inspect
from typing import Any

import networkx as nx
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.constants import (
    BOUNDS_ADD_BUSES,
    BOUNDS_POPULATION_GROWTH,
    BOUNDS_RESTRICT_VEHICLES,
    DEFAULT_ROAD_CAPACITY,
    SIM_ADD_ROAD_TRAFFIC_REDUCTION,
    SIM_BUILD_HOSPITAL_COVERAGE_INCREASE,
    SIM_BUILD_HOSPITAL_TRAFFIC_INCREASE,
    SIM_MAX_MODAL_SHIFT,
    SIM_MODAL_SHIFT_FACTOR,
)
from app.services.analytics_service import compute_zone_analytics


async def _resolve_awaitable(value: Any) -> Any:
    while inspect.isawaitable(value):
        value = await value
    return value


async def build_city_graph(db: AsyncIOMotorDatabase, city_id: str) -> nx.Graph:
    """
    Builds the city connectivity graph where nodes are zones and edges are roads.
    Assesses nodes for congestion, pollution, and service coverage metrics.
    """
    graph = nx.Graph()
    zones = await db.city_zones.find({"city_id": city_id}).to_list(500)
    for zone in zones:
        analytics = await _resolve_awaitable(compute_zone_analytics(db, city_id, zone["zone_id"]))
        graph.add_node(
            zone["zone_id"],
            population=analytics.get("population", 0),
            area=analytics.get("area_sqkm", 1.0),
            road_capacity=zone.get("road_capacity_vehicles_per_hour", DEFAULT_ROAD_CAPACITY),
            bus_routes=zone.get("bus_routes", 0),
            facilities=zone.get("facilities", []),
            traffic=analytics.get("traffic_score", 0.0),
            aqi=analytics.get("aqi", 0.0),
            coverage=zone.get("coverage_pct", 55.0),
        )
    roads = await db.roads.find({"city_id": city_id}).to_list(1000)
    for road in roads:
        graph.add_edge(
            road["zone_a"],
            road["zone_b"],
            weight=road.get("travel_time_minutes", 10.0),
            capacity=road.get("capacity", DEFAULT_ROAD_CAPACITY),
        )
    
    return graph


def _metrics(graph: nx.Graph) -> dict[str, float]:
    """Computes high-level aggregated metrics for the city graph."""
    nodes = list(graph.nodes(data=True))
    count = max(len(nodes), 1)
    traffic = sum(float(data.get("traffic", 0)) for _, data in nodes) / count
    aqi = sum(float(data.get("aqi", 0)) for _, data in nodes) / count
    coverage = sum(float(data.get("coverage", 0)) for _, data in nodes) / count
    congestion = sum(
        float(data.get("traffic", 0)) / max(float(data.get("road_capacity", 1)) / 100, 1.0)
        for _, data in nodes
    ) / count
    return {
        "traffic": round(traffic, 2),
        "aqi": round(aqi, 2),
        "coverage": round(coverage, 2),
        "congestion": round(congestion, 2),
    }


def _pct(before: float, after: float) -> float:
    return round((after - before) / max(abs(before), 1.0) * 100, 2)


async def run_simulation(
    db: AsyncIOMotorDatabase, scenario_type: str, parameters: dict[str, Any], city_id: str
) -> dict[str, Any]:
    """
    Simulates the impact of urban planning scenarios on traffic, pollution, and facility access.
    Validates parameter bounds and handles gravity-model routing metrics.
    """
    # ─── Parameter Validation ────────────────────────────────────────────────
    if scenario_type == "ADD_BUSES":
        bus_count = int(parameters.get("bus_count", 50))
        lower, upper = BOUNDS_ADD_BUSES
        if not (lower <= bus_count <= upper):
            raise ValueError(f"buses_count must be between {lower} and {upper} (got {bus_count})")
    elif scenario_type == "POPULATION_GROWTH":
        growth_pct = float(parameters.get("growth_pct", 10))
        lower, upper = BOUNDS_POPULATION_GROWTH
        if not (lower <= growth_pct <= upper):
            raise ValueError(f"growth_pct must be between {lower} and {upper} (got {growth_pct})")
    elif scenario_type == "RESTRICT_VEHICLES":
        restriction_pct = float(parameters.get("restriction_pct", 25))
        lower, upper = BOUNDS_RESTRICT_VEHICLES
        if not (lower <= restriction_pct <= upper):
            raise ValueError(f"restriction_pct must be between {lower} and {upper} (got {restriction_pct})")

    graph = await build_city_graph(db, city_id)
    before_graph = deepcopy(graph)
    before = _metrics(before_graph)
    
    # ─── Execute Simulation Scenarios ────────────────────────────────────────
    if scenario_type == "ADD_ROAD":
        a = parameters["zone_a"]
        b = parameters["zone_b"]
        capacity = float(parameters.get("capacity", 6000.0))
        # Formulate weight based on capacity (inverse relation)
        weight = max(4.0, 20.0 - capacity / 1000.0)
        graph.add_edge(a, b, weight=weight, capacity=capacity)
        # Moderate traffic on both terminal nodes
        for node in [a, b]:
            if node in graph:
                graph.nodes[node]["traffic"] = max(0.0, graph.nodes[node].get("traffic", 0.0) * SIM_ADD_ROAD_TRAFFIC_REDUCTION)
                
    elif scenario_type == "ADD_BUSES":
        zones = parameters.get("target_zones") or [parameters.get("zone_id")]
        bus_count = int(parameters.get("bus_count", 50))
        shift = min(SIM_MAX_MODAL_SHIFT, (bus_count / 50) * SIM_MODAL_SHIFT_FACTOR)
        for zone in filter(None, zones):
            if zone in graph:
                graph.nodes[zone]["traffic"] *= (1 - shift)
                graph.nodes[zone]["coverage"] = min(100.0, graph.nodes[zone].get("coverage", 0.0) + shift * 100.0)
                graph.nodes[zone]["aqi"] *= (1 - shift * 0.2)
                
    elif scenario_type == "POPULATION_GROWTH":
        zone = parameters["zone_id"]
        pct = float(parameters.get("growth_pct", 10.0)) / 100.0
        if zone in graph:
            graph.nodes[zone]["population"] *= (1 + pct)
            graph.nodes[zone]["traffic"] *= (1 + pct * 0.55)
            graph.nodes[zone]["aqi"] *= (1 + pct * 0.25)
            graph.nodes[zone]["coverage"] *= max(0.65, 1 - pct * 0.25)
            
    elif scenario_type == "BUILD_HOSPITAL":
        zone = parameters["zone_id"]
        if zone in graph:
            graph.nodes[zone]["facilities"] = graph.nodes[zone].get("facilities", []) + ["hospital"]
            graph.nodes[zone]["coverage"] = min(100.0, graph.nodes[zone].get("coverage", 0.0) + SIM_BUILD_HOSPITAL_COVERAGE_INCREASE)
            graph.nodes[zone]["traffic"] *= SIM_BUILD_HOSPITAL_TRAFFIC_INCREASE
            
    elif scenario_type == "RESTRICT_VEHICLES":
        zone = parameters["zone_id"]
        pct = float(parameters.get("restriction_pct", 25.0)) / 100.0
        if zone in graph:
            reduced = graph.nodes[zone]["traffic"] * pct
            graph.nodes[zone]["traffic"] -= reduced
            graph.nodes[zone]["aqi"] *= (1 - pct * 0.35)
            neighbors = list(graph.neighbors(zone))
            for neighbor in neighbors:
                graph.nodes[neighbor]["traffic"] += (reduced / max(len(neighbors), 1)) * 0.45

    after = _metrics(graph)
    delta = {f"{key}_change_pct": _pct(before[key], after[key]) for key in before}
    
    # ─── Shortest Path / Gravity Routing Assessment ──────────────────────────
    if scenario_type == "ADD_ROAD":
        a = parameters.get("zone_a")
        b = parameters.get("zone_b")
        if a and b:
            try:
                had_existing_path = a in before_graph and b in before_graph and nx.has_path(before_graph, a, b)
                # If path existed before the scenario, calculate updated travel time.
                # Otherwise preserve the disconnected-zone fallback for baseline reporting.
                if had_existing_path and a in graph and b in graph and nx.has_path(graph, a, b):
                    travel_time = nx.shortest_path_length(graph, source=a, target=b, weight="weight")
                    after["travel_time_between_zones"] = round(travel_time, 2)
                    delta["travel_time_change_pct"] = _pct(
                        nx.shortest_path_length(before_graph, source=a, target=b, weight="weight"),
                        travel_time
                    )
                else:
                    after["travel_time_between_zones"] = "No road connection exists between zones"
            except Exception:
                after["travel_time_between_zones"] = "No road connection exists between zones"
    
    confidence = 0.78 if graph.number_of_nodes() > 2 else 0.62
    return {
        "scenario_type": scenario_type,
        "parameters": parameters,
        "before_metrics": before,
        "after_metrics": after,
        "delta_metrics": delta,
        "confidence": confidence,
        "recommendations": [
            "Validate scenario assumptions with field survey data.",
            "Run a sensitivity test on cost, capacity, and adoption parameters.",
            "Monitor affected adjacent zones during rollout.",
        ],
    }
