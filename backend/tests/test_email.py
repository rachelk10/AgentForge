import json
import os

import httpx
import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/agentdb")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from app.services.email import EmailConfigurationError, EmailDeliveryError, EmailService


@pytest.mark.asyncio
async def test_resend_email_service_sends_using_server_side_credentials() -> None:
    sent: list[tuple[str, str | None, dict]] = []

    async def send(request: httpx.Request) -> httpx.Response:
        sent.append(
            (
                request.headers["authorization"],
                request.headers.get("idempotency-key"),
                json.loads(await request.aread()),
            )
        )
        return httpx.Response(200, json={"id": "email_123"})

    service = EmailService(
        api_key="test-resend-key",
        from_email="AgentForge <noreply@example.com>",
        transport=httpx.MockTransport(send),
    )

    message_id = await service.send(
        "owner@example.com",
        "New lead",
        "<p>Details</p>",
        idempotency_key="lead-123",
    )

    assert message_id == "email_123"
    assert sent == [
        (
            "Bearer test-resend-key",
            "lead-123",
            {
                "from": "AgentForge <noreply@example.com>",
                "to": ["owner@example.com"],
                "subject": "New lead",
                "html": "<p>Details</p>",
            },
        )
    ]


@pytest.mark.asyncio
async def test_resend_service_fails_explicitly_when_not_configured() -> None:
    service = EmailService(api_key="", from_email="")

    with pytest.raises(EmailConfigurationError, match="not configured"):
        await service.send("owner@example.com", "New lead", "<p>Details</p>")


@pytest.mark.asyncio
async def test_resend_service_surfaces_provider_failures() -> None:
    async def reject(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "invalid"})

    service = EmailService(
        api_key="test-resend-key",
        from_email="AgentForge <noreply@example.com>",
        transport=httpx.MockTransport(reject),
    )

    with pytest.raises(EmailDeliveryError, match="status 401"):
        await service.send("owner@example.com", "New lead", "<p>Details</p>")
