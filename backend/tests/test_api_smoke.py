import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://admin:password@localhost:5432/agentdb")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

import httpx
import pytest

from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_openapi_contains_all_api_groups() -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/openapi.json")

    assert response.status_code == 200
    paths = response.json()["paths"]
    expected_paths = {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/agents",
        "/api/v1/tools",
        "/api/v1/skills",
        "/api/v1/agents/{agent_id}/skills",
    }
    assert expected_paths <= paths.keys()

    assert "post" in paths["/api/v1/skills"]
    assert "security" in paths["/api/v1/skills"]["post"]
    assert "get" in paths["/api/v1/skills"]
    assert "security" in paths["/api/v1/skills"]["get"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/skills"),
        ("POST", "/api/v1/skills"),
        ("GET", "/api/v1/agents/00000000-0000-0000-0000-000000000001/skills"),
    ],
)
async def test_skill_endpoints_require_authentication(method: str, path: str) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.request(method, path)

    assert response.status_code == 401