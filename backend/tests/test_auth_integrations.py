import hashlib
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/agentdb")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from app.config import settings
from app.core.security import verify_password
from app.schemas.user import GoogleAuthRequest, PasswordResetRequest
from app.services.auth import AuthService
from app.services.email import EmailDeliveryError


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class FakeDatabase:
    def __init__(self, user):
        self.user = user
        self.commits = 0

    async def execute(self, _statement):
        return FakeResult(self.user)

    async def commit(self):
        self.commits += 1


class RecordingEmailService:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.sent: list[tuple[str, str, str]] = []

    def ensure_configured(self):
        return None

    async def send(self, recipient: str, subject: str, html: str):
        if self.error:
            raise self.error
        self.sent.append((recipient, subject, html))
        return "email-id"


@pytest.mark.asyncio
async def test_password_recovery_sends_one_time_link_and_persists_only_token_hash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="owner@example.com",
        password_reset_token_hash=None,
        password_reset_expires_at=None,
    )
    db = FakeDatabase(user)
    email_service = RecordingEmailService()
    monkeypatch.setattr(settings, "password_reset_url", "https://app.example/reset-password")

    await AuthService(db).request_password_recovery(user.email, email_service)

    assert len(email_service.sent) == 1
    recipient, subject, html = email_service.sent[0]
    assert recipient == user.email
    assert subject == "Reset your AgentForge password"
    token = re.search(r"\?token=([^&\"]+)", html).group(1)
    assert user.password_reset_token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in user.password_reset_token_hash
    assert "https://app.example/reset-password" in html
    assert user.password_reset_expires_at > datetime.now(timezone.utc)
    assert db.commits == 1


@pytest.mark.asyncio
async def test_password_recovery_clears_token_if_provider_delivery_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = SimpleNamespace(
        id=uuid.uuid4(),
        email="owner@example.com",
        password_reset_token_hash=None,
        password_reset_expires_at=None,
    )
    db = FakeDatabase(user)
    email_service = RecordingEmailService(EmailDeliveryError("provider unavailable"))
    monkeypatch.setattr(settings, "password_reset_url", "https://app.example/reset-password")

    with pytest.raises(HTTPException) as error:
        await AuthService(db).request_password_recovery(user.email, email_service)

    assert error.value.status_code == 502
    assert user.password_reset_token_hash is None
    assert user.password_reset_expires_at is None
    assert db.commits == 2


@pytest.mark.asyncio
async def test_password_reset_hashes_new_password_and_invalidates_token() -> None:
    reset_token = "valid-token-for-password-reset-123456"
    user = SimpleNamespace(
        id=uuid.uuid4(),
        password_reset_token_hash=hashlib.sha256(reset_token.encode()).hexdigest(),
        password_reset_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        hashed_password="old-hash",
    )
    db = FakeDatabase(user)

    await AuthService(db).reset_password(
        PasswordResetRequest(token=reset_token, password="new-secure-password")
    )

    assert verify_password("new-secure-password", user.hashed_password)
    assert user.password_reset_token_hash is None
    assert user.password_reset_expires_at is None
    assert db.commits == 1


@pytest.mark.asyncio
async def test_google_sign_in_fails_explicitly_without_client_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "google_client_id", None)

    with pytest.raises(HTTPException) as error:
        await AuthService(FakeDatabase(None)).google_sign_in(
            GoogleAuthRequest(credential="not-a-real-credential")
        )

    assert error.value.status_code == 503
    assert error.value.detail == "Google sign-in is not configured"
