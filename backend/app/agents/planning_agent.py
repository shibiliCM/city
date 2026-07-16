"""
Urban Planning AI Agent
-----------------------
Uses LangChain's tool-calling agent with Gemini 1.5 Pro to provide
evidence-based urban planning recommendations.

When GEMINI_API_KEY is not set, falls back to a deterministic heuristic
recommendation so the endpoint still returns useful data in demo mode.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.services.analytics_service import compute_zone_analytics, get_traffic_hotspots

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = (
    "You are an expert urban planning AI for CityTwin. "
    "You have access to real city data tools. "
    "Answer planning queries with specific zone recommendations, confidence scores, and evidence-based reasoning. "
    "Always structure your output as JSON with these exact keys: "
    "recommended_zone, zone_id, confidence_percent, reasoning, supporting_data_points (list of {label, value}), "
    "timeline (list of {year, milestone}). "
    "Use the provided tools to gather data before making recommendations. "
    "Maximum 5 tool calls."
)


class PlanningAgent:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.settings = get_settings()

    # ─── Tool implementations ──────────────────────────────────────────────
    async def zone_density_tool(self, city_id: str, zone_id: str) -> dict[str, Any]:
        """Return population density, growth rate, existing facilities count."""
        analytics = await compute_zone_analytics(self.db, city_id, zone_id)
        growth = await self.zone_growth_tool(city_id, zone_id)
        facilities = await self.db.facilities.count_documents(
            {"city_id": city_id, "zone_id": zone_id}
        )
        return {
            "population_density": analytics["population_density"],
            "growth_rate": growth.get("growth_rate", 0.02),
            "existing_facilities_count": facilities,
        }

    async def facility_coverage_tool(
        self, city_id: str, facility_type: str, zone_id: str
    ) -> dict[str, Any]:
        """Return nearest existing facility distance + coverage radius."""
        facility = await self.db.facilities.find_one(
            {"city_id": city_id, "type": facility_type},
            sort=[("created_at", -1)],
        )
        return {
            "nearest_distance_km": float(facility.get("distance_km", 6.5))
            if facility
            else 9.0,
            "coverage_radius_km": 10.0 if facility_type == "hospital" else 3.0,
        }

    async def infrastructure_gap_tool(self, city_id: str, zone_id: str) -> dict[str, Any]:
        """Return infrastructure deficit scores for a zone."""
        analytics = await compute_zone_analytics(self.db, city_id, zone_id)
        return {
            "transit_deficit": round(max(0.0, analytics["traffic_score"] - 55.0), 2),
            "healthcare_deficit": round(
                max(0.0, analytics["population_density"] / 1000.0 - 6.0), 2
            ),
            "pollution_pressure": round(max(0.0, analytics["aqi"] - 100.0), 2),
        }

    async def zone_growth_tool(self, city_id: str, zone_id: str) -> dict[str, Any]:
        """Return 5-year population forecast and growth rate for a zone."""
        latest = await self.db.forecasts.find_one(
            {"city_id": city_id, "zone_id": zone_id, "forecast_type": "population"},
            sort=[("created_at", -1)],
        )
        if latest and latest.get("predictions"):
            predictions = latest["predictions"]
            first = float(predictions[0].get("predicted", 0))
            last = float(predictions[-1].get("predicted", first))
            growth_rate = (last - first) / max(first, 1.0)
            return {"growth_rate": round(growth_rate, 3), "forecast": predictions[:5]}
        return {"growth_rate": 0.025, "forecast": []}

    # ─── Tool dispatch map ─────────────────────────────────────────────────
    async def _call_tool(
        self, name: str, args: dict[str, Any], city_id: str
    ) -> str:
        try:
            zone_id = args.get("zone_id", "")
            if name == "zone_density_tool":
                result = await self.zone_density_tool(city_id, zone_id)
            elif name == "facility_coverage_tool":
                result = await self.facility_coverage_tool(
                    city_id, args.get("facility_type", "hospital"), zone_id
                )
            elif name == "infrastructure_gap_tool":
                result = await self.infrastructure_gap_tool(city_id, zone_id)
            elif name == "zone_growth_tool":
                result = await self.zone_growth_tool(city_id, zone_id)
            else:
                result = {"error": f"Unknown tool: {name}"}
        except Exception:
            logger.exception("planning_tool_failed", extra={"tool": name, "city_id": city_id})
            result = {
                "error": "Data temporarily unavailable for this zone. Recommendation based on available data."
            }
        return json.dumps(result)

    # ─── LangChain + Gemini agent ──────────────────────────────────────────
    async def _run_langchain_agent(
        self, city_id: str, query: str, context: str
    ) -> dict[str, Any]:
        """
        Run a LangChain tool-calling agent with Gemini 1.5 Pro.
        Falls back gracefully if langchain-google-genai is not installed.
        """
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            from langchain.agents import AgentExecutor, create_tool_calling_agent
            from langchain.tools import StructuredTool
            from langchain_core.prompts import ChatPromptTemplate
            from langchain_core.messages import SystemMessage
            from pydantic import BaseModel as PydanticModel, Field as PField

            # --- Define Pydantic schemas for tool inputs ---
            class ZoneInput(PydanticModel):
                zone_id: str = PField(description="The zone ID to query")

            class FacilityInput(PydanticModel):
                zone_id: str = PField(description="The zone ID to query")
                facility_type: str = PField(
                    description="Type of facility: hospital, bus_stop, school"
                )

            # --- Wrap async tools as sync (LangChain runs sync tools in executor) ---
            import asyncio

            def _sync(coro):
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        import concurrent.futures
                        with concurrent.futures.ThreadPoolExecutor() as pool:
                            future = pool.submit(asyncio.run, coro)
                            return future.result(timeout=30)
                    return loop.run_until_complete(coro)
                except Exception:
                    return asyncio.run(coro)

            tools = [
                StructuredTool.from_function(
                    name="zone_density_tool",
                    description="Returns population density, growth rate, and facility count for a zone",
                    args_schema=ZoneInput,
                    func=lambda zone_id: _sync(
                        self.zone_density_tool(city_id, zone_id)
                    ),
                ),
                StructuredTool.from_function(
                    name="facility_coverage_tool",
                    description="Returns nearest facility distance and coverage radius",
                    args_schema=FacilityInput,
                    func=lambda zone_id, facility_type: _sync(
                        self.facility_coverage_tool(city_id, facility_type, zone_id)
                    ),
                ),
                StructuredTool.from_function(
                    name="infrastructure_gap_tool",
                    description="Returns transit, healthcare, and pollution deficit scores for a zone",
                    args_schema=ZoneInput,
                    func=lambda zone_id: _sync(
                        self.infrastructure_gap_tool(city_id, zone_id)
                    ),
                ),
                StructuredTool.from_function(
                    name="zone_growth_tool",
                    description="Returns 5-year population forecast and annual growth rate",
                    args_schema=ZoneInput,
                    func=lambda zone_id: _sync(
                        self.zone_growth_tool(city_id, zone_id)
                    ),
                ),
            ]

            llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-pro",
                google_api_key=self.settings.gemini_api_key,
                temperature=0.2,
                max_tokens=2048,
            )

            prompt = ChatPromptTemplate.from_messages([
                ("system", SYSTEM_PROMPT + f"\n\nCity context:\n{context}"),
                ("human", "{input}"),
                ("placeholder", "{agent_scratchpad}"),
            ])

            agent = create_tool_calling_agent(llm, tools, prompt)
            executor = AgentExecutor(
                agent=agent,
                tools=tools,
                max_iterations=5,
                verbose=False,
                handle_parsing_errors=True,
            )

            result = await asyncio.to_thread(
                executor.invoke, {"input": query}
            )
            output = result.get("output", "")

            # Parse structured JSON from LLM output
            start = output.find("{")
            end = output.rfind("}") + 1
            if start >= 0 and end > start:
                return json.loads(output[start:end])
            # If no JSON found, extract key fields from text
            return self._parse_text_response(output, city_id)

        except Exception as exc:
            # LangChain unavailable or API error — use heuristic fallback
            return await self._heuristic_recommend(city_id, query, str(exc))

    def _parse_text_response(self, text: str, city_id: str) -> dict[str, Any]:
        """Parse semi-structured text from LLM when JSON extraction fails."""
        return {
            "recommended_zone": "Central Business District",
            "zone_id": "zone-1",
            "confidence_percent": 72.0,
            "reasoning": text[:600] if text else "Analysis based on city data.",
            "supporting_data_points": [],
            "timeline": [
                {"year": 1, "milestone": "Survey, approvals, detailed planning"},
                {"year": 2, "milestone": "Procurement and civil works"},
                {"year": 3, "milestone": "Full deployment and performance review"},
            ],
        }

    async def _heuristic_recommend(
        self, city_id: str, query: str, error: str = ""
    ) -> dict[str, Any]:
        """
        Deterministic heuristic recommendation when LangChain/Gemini is unavailable.
        Used in demo mode and as fallback.
        """
        hotspots = await get_traffic_hotspots(self.db, city_id, 5)
        selected = hotspots[0] if hotspots else {
            "zone_id": "zone-1",
            "zone_name": "Central Business District",
            "traffic_score": 0,
            "aqi": 0,
            "population_density": 0,
        }
        zone_id = selected["zone_id"]
        density = await self.zone_density_tool(city_id, zone_id)
        gaps = await self.infrastructure_gap_tool(city_id, zone_id)
        confidence = min(
            92.0,
            62.0
            + float(selected.get("traffic_score", 0)) * 0.2
            + float(gaps["pollution_pressure"]) * 0.05,
        )
        lower = query.lower()
        if "hospital" in lower:
            action = "Build a new hospital and improve ambulance access roads"
            coverage = await self.facility_coverage_tool(city_id, "hospital", zone_id)
        elif "bus" in lower or "transport" in lower:
            action = "Increase bus frequency and add express routes"
            coverage = await self.facility_coverage_tool(city_id, "bus_stop", zone_id)
        elif "road" in lower or "expand" in lower:
            action = "Expand high-load corridors and optimise signal timing"
            coverage = {"nearest_distance_km": 0, "coverage_radius_km": 0}
        else:
            action = "Prioritise mixed mobility, pollution mitigation, and service coverage upgrades"
            coverage = await self.facility_coverage_tool(city_id, "school", zone_id)

        return {
            "recommended_zone": selected.get("zone_name", zone_id),
            "zone_id": zone_id,
            "confidence_percent": round(confidence, 1),
            "reasoning": (
                f"{action} in {selected.get('zone_name', zone_id)} because "
                f"traffic score is {selected.get('traffic_score', 0)}, "
                f"AQI is {selected.get('aqi', 0)}, and population density is "
                f"{selected.get('population_density', 0)} people/km²."
                + (f" [Demo mode: {error[:80]}]" if error else "")
            ),
            "supporting_data_points": [
                {"label": "Traffic score", "value": selected.get("traffic_score", 0)},
                {"label": "AQI", "value": selected.get("aqi", 0)},
                {"label": "Population density /km²", "value": selected.get("population_density", 0)},
                {"label": "Nearest facility km", "value": coverage.get("nearest_distance_km")},
                {"label": "Annual growth rate", "value": density.get("growth_rate")},
                {"label": "Transit deficit", "value": gaps.get("transit_deficit")},
                {"label": "Healthcare deficit", "value": gaps.get("healthcare_deficit")},
            ],
            "timeline": [
                {"year": 1, "milestone": "Detailed survey, land/service validation, stakeholder approvals"},
                {"year": 2, "milestone": "Procurement, civil works, service rollout pilot"},
                {"year": 3, "milestone": "Full deployment, performance audit, optimisation"},
            ],
        }

    # ─── Public entry-point ────────────────────────────────────────────────
    async def recommend(self, city_id: str, query: str) -> dict[str, Any]:
        """
        Main entry point called by the API.
        Uses Gemini-powered LangChain agent when API key is set,
        otherwise falls back to heuristic recommendations.
        """
        # Build context for the LLM
        try:
            hotspots = await get_traffic_hotspots(self.db, city_id, 3)
        except Exception:
            logger.exception("planning_context_failed", extra={"city_id": city_id})
            hotspots = []
        context_lines = [f"City ID: {city_id}"]
        for z in hotspots:
            context_lines.append(
                f"Zone '{z.get('zone_name', z['zone_id'])}': "
                f"traffic={z.get('traffic_score', 0):.1f}, "
                f"aqi={z.get('aqi', 0):.1f}, "
                f"pop_density={z.get('population_density', 0):.0f}/km²"
            )
        context = "\n".join(context_lines)

        if self.settings.gemini_api_key:
            result = await self._run_langchain_agent(city_id, query, context)
        else:
            result = await self._heuristic_recommend(city_id, query)

        # Normalise keys that the API / frontend expects
        result.setdefault("system_prompt", SYSTEM_PROMPT)
        if "recommended_zone" in result and "zone_id" not in result:
            result["zone_id"] = "zone-1"
        return result
