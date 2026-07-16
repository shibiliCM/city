import asyncio
import logging
from typing import AsyncGenerator

import google.generativeai as genai
from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.database import get_database
from app.core.rate_limiter import RateLimiter
from app.core.security import get_current_user
from app.services.analytics_service import (
    get_accident_prone_areas,
    get_kpi_summary,
    get_pollution_hotspots,
    get_traffic_hotspots,
)
from app.utils.mongo import utcnow

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are CityTwin AI, an expert urban intelligence analyst.
You have access to real-time city data including traffic, pollution, accident, and population metrics.
Provide concise, data-driven, actionable recommendations.
Always ground your responses in the provided context data."""


class ChatMessage(BaseModel):
    city_id: str
    message: str


class ChatHistoryResponse(BaseModel):
    session_id: str
    messages: list[dict]


async def _build_context(db: AsyncIOMotorDatabase, city_id: str) -> str:
    """Fetch live city metrics and format them as model context."""
    try:
        kpis = await get_kpi_summary(db, city_id)
        traffic = await get_traffic_hotspots(db, city_id, 5)
        pollution = await get_pollution_hotspots(db, city_id, 5)
        accidents = await get_accident_prone_areas(db, city_id, 5)

        def fmt_zones(zones: list[dict], key: str) -> str:
            return ", ".join(
                f"{z.get('zone_name', z.get('zone_id', 'unknown'))}: {float(z.get(key, 0)):.1f}"
                for z in zones[:3]
            )

        return (
            f"City KPIs - Population: {kpis.get('total_population', 0):,}, "
            f"Avg Traffic Score: {kpis.get('avg_traffic_score', 0):.1f}/100, "
            f"City AQI: {kpis.get('city_aqi', 0):.1f}, "
            f"Total Accidents: {kpis.get('accident_count', 0)}, "
            f"Health Score: {kpis.get('city_health_score', 0):.1f}/100. "
            f"Top traffic zones: {fmt_zones(traffic, 'traffic_score')}. "
            f"Top pollution zones: {fmt_zones(pollution, 'aqi')}. "
            f"Top accident zones: {fmt_zones(accidents, 'accident_density')}."
        )
    except Exception:
        logger.warning("chat_context_unavailable", extra={"city_id": city_id})
        return "City data temporarily unavailable. Recommendation based on available data."


async def _yield_words(answer: str, delay: float = 0.015) -> AsyncGenerator[str, None]:
    """Yield an answer as SSE token events, handling newlines properly."""
    words = answer.split(" ")
    for i, word in enumerate(words):
        if not word and i > 0:
            yield "data:  \n\n"
            await asyncio.sleep(delay)
            continue
        
        # Replace newlines with the SSE prefix so the client receives them on lines prefixed with data:
        formatted_word = word.replace("\n", "\ndata: ")
        
        suffix = " " if i < len(words) - 1 else ""
        yield f"data: {formatted_word}{suffix}\n\n"
        await asyncio.sleep(delay)


def _fallback_answer(message: str, context: str, reason: str | None = None) -> str:
    """Generate a useful local answer when the LLM provider is unavailable."""
    question = message.lower().strip()

    # Extract data using regex
    import re
    pop_m = re.search(r"Population:\s*([\d,]+)", context)
    traffic_m = re.search(r"Avg Traffic Score:\s*([\d.]+)", context)
    aqi_m = re.search(r"City AQI:\s*([\d.]+)", context)
    acc_m = re.search(r"Total Accidents:\s*(\d+)", context)
    health_m = re.search(r"Health Score:\s*([\d.]+)", context)

    pop = pop_m.group(1) if pop_m else "N/A"
    traffic_score = traffic_m.group(1) if traffic_m else "N/A"
    aqi = aqi_m.group(1) if aqi_m else "N/A"
    accidents = acc_m.group(1) if acc_m else "N/A"
    health = health_m.group(1) if health_m else "N/A"

    def parse_zones(match) -> list[str]:
        if not match:
            return []
        parts = match.group(1).split(",")
        res = []
        for p in parts:
            p = p.strip()
            if ":" in p:
                name, val = p.split(":", 1)
                res.append(f"• **{name.strip()}**: {val.strip()}")
            elif p:
                res.append(f"• {p}")
        return res

    traffic_zones = parse_zones(re.search(r"Top traffic zones:\s*([^.]+)", context))
    pollution_zones = parse_zones(re.search(r"Top pollution zones:\s*([^.]+)", context))
    accident_zones = parse_zones(re.search(r"Top accident zones:\s*([^.]+)", context))

    traffic_list = "\n".join(traffic_zones) if traffic_zones else "• No data available"
    pollution_list = "\n".join(pollution_zones) if pollution_zones else "• No data available"
    accident_list = "\n".join(accident_zones) if accident_zones else "• No data available"

    if not question or question in {"hi", "hello", "hey"}:
        return (
            f"Hello! I am CityTwin AI, your smart city analyst. I can help you with traffic patterns, "
            f"pollution levels, safety risks, forecasts, and planning recommendations.\n\n"
            f"Here is a quick snapshot of the city's current health status:\n"
            f"• **Population**: {pop}\n"
            f"• **Average Traffic Score**: {traffic_score}/100\n"
            f"• **Air Quality Index (AQI)**: {aqi}\n"
            f"• **Total Accidents**: {accidents}\n"
            f"• **Overall Health Score**: {health}/100"
        )

    if any(word in question for word in ["flood", "flooding", "rain", "drainage"]):
        return (
            "For flood risk mitigation, we prioritize low-elevation zones with weak drainage, high recent rainfall, "
            "and proximity to water bodies. In the dashboard, you can use the Risk Map and Zone Analytics modules "
            "to identify these zones, and then schedule field inspections for the highest-risk areas."
        )

    if any(word in question for word in ["accident", "crash", "safety"]):
        return (
            f"Here are the top accident-prone zones in the city:\n{accident_list}\n\n"
            "To improve road safety, we recommend reviewing signal timings, implementing speed calming measures, "
            "and increasing targeted enforcement in these high-risk areas."
        )

    if any(word in question for word in ["traffic", "congestion", "bus", "road"]):
        return (
            f"Here are the top traffic congestion hotspots in the city:\n{traffic_list}\n\n"
            "For immediate traffic intervention, we recommend starting with low-cost measures like optimizing signal "
            "timings or adding public transit buses on these overloaded corridors. You can also test road-capacity "
            "scenarios in the Simulation module before committing infrastructure budget."
        )

    if any(word in question for word in ["pollution", "aqi", "air"]):
        return (
            f"Here are the top air pollution hotspots in the city:\n{pollution_list}\n\n"
            "To mitigate air pollution, we recommend focusing on zones with high AQI that overlap with traffic congestion. "
            "Key actions include diverting heavy traffic, introducing public transit incentives, and issuing AQI alerts "
            "when forecasted values cross safe limits."
        )

    if any(word in question for word in ["forecast", "predict", "future", "trend"]):
        return (
            "You can use the Forecasting module to run zone-level time-series predictions. We recommend reviewing "
            "the confidence bands and validating the model's performance (using MAE, RMSE, and MAPE metrics) against "
            "the baseline before making key planning decisions."
        )

    if any(word in question for word in ["hospital", "school", "facility", "build"]):
        return (
            "When planning new facilities like hospitals or schools, we look for zones with high population density, "
            "low service coverage, and manageable traffic impact. We recommend running a 'Build Hospital' scenario "
            "in the Simulation module to evaluate the potential impact on surrounding areas."
        )

    # General default response
    return (
        f"Based on the current city data, here is a quick overview:\n"
        f"• **Population**: {pop}\n"
        f"• **Average Traffic Score**: {traffic_score}/100\n"
        f"• **Air Quality Index (AQI)**: {aqi}\n\n"
        f"You can explore the specific modules on the dashboard to view detailed traffic, pollution, and safety metrics, "
        f"or run simulations to evaluate urban interventions."
    )


async def _stream_gemini(message: str, context: str) -> AsyncGenerator[str, None]:
    """Stream tokens from Gemini with safe fallbacks for empty or failed output."""
    if not settings.gemini_api_key:
        answer = _fallback_answer(message, context, reason="missing Gemini API key")
        async for chunk in _yield_words(answer, delay=0.025):
            yield chunk
        yield "data: [DONE]\n\n"
        return

    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(model_name=settings.gemini_model, system_instruction=_SYSTEM_PROMPT)
        full_prompt = f"City Context Data:\n{context}\n\nUser Question: {message}"
        response = await asyncio.to_thread(
            lambda: model.generate_content(
                full_prompt,
                stream=True,
                generation_config=genai.types.GenerationConfig(temperature=0.4, max_output_tokens=1024),
            )
        )

        yielded_any = False
        for chunk in response:
            text = getattr(chunk, "text", "") or ""
            if text:
                yielded_any = True
                async for event in _yield_words(text):
                    yield event

        if not yielded_any:
            async for event in _yield_words(_fallback_answer(message, context, reason="empty Gemini response")):
                yield event

        yield "data: [DONE]\n\n"
    except Exception as exc:
        logger.exception("chat_generation_failed")
        async for event in _yield_words(_fallback_answer(message, context, reason=exc.__class__.__name__)):
            yield event
        yield "data: [DONE]\n\n"


@router.post("/message")
async def chat_message(
    payload: ChatMessage,
    request: Request,
    session_id: str = Header(default="default", alias="session-id"),
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
    _rate_limit: None = Depends(RateLimiter("chat")),
) -> StreamingResponse:
    """Stream an AI answer with city data context."""
    context = await _build_context(db, payload.city_id)

    async def event_stream() -> AsyncGenerator[bytes, None]:
        assistant_parts: list[str] = []
        async for chunk in _stream_gemini(payload.message, context):
            if await request.is_disconnected():
                logger.info("chat_client_disconnected", extra={"session_id": session_id})
                break
            for line in chunk.splitlines():
                if not line.startswith("data:"):
                    continue
                data = line.replace("data:", "", 1).strip()
                if data and data != "[DONE]":
                    assistant_parts.append(data)
            yield chunk.encode("utf-8")
        try:
            messages = [
                {"role": "user", "content": payload.message, "created_at": utcnow()},
            ]
            assistant_content = " ".join(assistant_parts).strip()
            if assistant_content:
                messages.append({"role": "assistant", "content": assistant_content, "created_at": utcnow()})
            await db.chat_sessions.update_one(
                {"session_id": session_id, "user_id": user["_id"]},
                {
                    "$push": {"messages": {"$each": messages}},
                    "$set": {"city_id": payload.city_id, "updated_at": utcnow()},
                    "$setOnInsert": {"created_at": utcnow()},
                },
                upsert=True,
            )
        except Exception:
            logger.warning("chat_session_persist_failed", extra={"session_id": session_id})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@router.get("/history", response_model=ChatHistoryResponse)
async def chat_history(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_database),
    user: dict = Depends(get_current_user),
) -> dict:
    """Retrieve message history for a session."""
    doc = await db.chat_sessions.find_one({"session_id": session_id, "user_id": user["_id"]})
    if not doc:
        return {"session_id": session_id, "messages": []}
    messages = doc.get("messages", [])
    for message in messages:
        if "created_at" in message and hasattr(message["created_at"], "isoformat"):
            message["created_at"] = message["created_at"].isoformat()
    return {"session_id": session_id, "messages": messages}
