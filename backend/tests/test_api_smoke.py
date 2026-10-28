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
        "/api/v1/agents/{agent_id}/documents/website/scan",
        "/api/v1/agents/{agent_id}/documents/website",
        "/api/v1/agents/{agent_id}/chat",
        "/api/v1/agents/{agent_id}/appearance",
        "/api/v1/agents/{agent_id}/appearance/logo",
        "/api/v1/agents/{agent_id}/publish",
    }
    assert expected_paths <= paths.keys()

    assert "post" in paths["/api/v1/skills"]
    assert "security" in paths["/api/v1/skills"]["post"]
    assert "get" in paths["/api/v1/skills"]
    assert "security" in paths["/api/v1/skills"]["get"]
    chat_schema = paths["/api/v1/agents/{agent_id}/chat"]["post"]["requestBody"]["content"]["application/json"]["schema"]
    chat_schema_name = chat_schema["$ref"].rsplit("/", 1)[-1]
    assert "is_test" in response.json()["components"]["schemas"][chat_schema_name]["properties"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/skills"),
        ("POST", "/api/v1/skills"),
        ("GET", "/api/v1/agents/00000000-0000-0000-0000-000000000001/skills"),
        ("POST", "/api/v1/agents/00000000-0000-0000-0000-000000000001/documents/website/scan"),
        ("POST", "/api/v1/agents/00000000-0000-0000-0000-000000000001/chat"),
        ("GET", "/api/v1/agents/00000000-0000-0000-0000-000000000001/appearance"),
        ("PUT", "/api/v1/agents/00000000-0000-0000-0000-000000000001/appearance"),
        ("POST", "/api/v1/agents/00000000-0000-0000-0000-000000000001/appearance/logo"),
        ("POST", "/api/v1/agents/00000000-0000-0000-0000-000000000001/publish"),
    ],
)
async def test_skill_endpoints_require_authentication(method: str, path: str) -> None:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.request(method, path)

    assert response.status_code == 401