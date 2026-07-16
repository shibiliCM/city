import pytest

from app.api.v1.chat import _fallback_answer, _stream_gemini


def test_chat_fallback_answers_simple_greeting():
    answer = _fallback_answer("hi", "City KPIs - Health Score: 88/100.")

    assert "Hello" in answer
    assert "traffic patterns" in answer
    assert "Health Score" in answer


def test_chat_fallback_answers_domain_question():
    answer = _fallback_answer(
        "Which areas are most at risk of flooding?",
        "Top traffic zones: downtown: 90. Top pollution zones: industrial: 180.",
        reason="provider failed",
    )

    assert "AI provider is temporarily unavailable" not in answer
    assert "flood risk" in answer.lower()
    assert "drainage" in answer.lower()


@pytest.mark.asyncio
async def test_stream_gemini_never_returns_rephrase_dead_end(monkeypatch):
    monkeypatch.setattr("app.api.v1.chat.settings.gemini_api_key", "bad-test-key")

    async def broken_to_thread(*args, **kwargs):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr("app.api.v1.chat.asyncio.to_thread", broken_to_thread)

    chunks = []
    async for chunk in _stream_gemini("hi", "City KPIs - Health Score: 88/100."):
        chunks.append(chunk)

    text = "".join(chunks)
    assert "I wasn't able to generate a response. Please rephrase your question." not in text
    assert "traffic" in text.lower()
    assert "[DONE]" in text
