import pytest
from httpx import ASGITransport, AsyncClient

from app.core.database import get_database
from app.main import app


class DummyDb:
    pass


async def override_db():
    yield DummyDb()


@pytest.mark.asyncio
async def test_unauthorized_access_to_protected_endpoint():
    app.dependency_overrides[get_database] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/analytics/kpis?city_id=metro-city-01")
        assert response.status_code == 401
    finally:
        app.dependency_overrides.clear()


def test_register_login_refresh_logout_contracts_present():
    paths = {route.path for route in app.routes}
    assert "/api/v1/auth/register" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/auth/refresh" in paths
    assert "/api/v1/auth/logout" in paths
