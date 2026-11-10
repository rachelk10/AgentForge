import os
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/agentdb")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from app.api import public_chat
from app.schemas.conversation import MessageResponse
from app.schemas.public_chat import PublicChatRequest


class FakeResult:
    def __init__(self, value):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def first(self):
        return None

    def all(self):
        return self.value if isinstance(self.value, list) else []

    def scalars(self):
        return self


class FakeDatabase:
    def __init__(self, value):
        self.value = value
        self.added = []

    async def execute(self, _statement):
        return FakeResult(self.value)

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        pass

    async def rollback(self):
        pass

    async def refresh(self, value):
        if getattr(value, "id", None) is None:
            value.id = uuid.uuid4()
        if getattr(value, "created_at", None) is None:
            value.created_at = datetime.now(timezone.utc)
        if getattr(value, "updated_at", None) is None:
            value.updated_at = datetime.now(timezone.utc)


def published_agent(*, is_active: bool = True):
    return SimpleNamespace(
        id=uuid.uuid4(),
        owner_id=uuid.uuid4(),
        name="Assistant",
        opening_message="Welcome",
        conversation_language="en",
        primary_color="#2369a8",
        logo_data=None,
        is_active=is_active,
        is_published=True,
        public_key="public-key",
    )


@pytest.mark.asyncio
async def test_public_profile_uses_persisted_published_agent_data() -> None:
    agent = published_agent()

    profile = await public_chat.get_public_agent("public-key", FakeDatabase(agent))

    assert profile.public_key == "public-key"
    assert profile.agent_name == "Assistant"
    assert profile.opening_message == "Welcome"
    assert profile.is_active is True


@pytest.mark.asyncio
async def test_unpublished_agent_is_not_available_publicly() -> None:
    with pytest.raises(HTTPException) as error:
        await public_chat._published_agent("missing", FakeDatabase(None))

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_public_chat_persists_a_non_test_conversation(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = published_agent()
    now = datetime.now(timezone.utc)
    conversation_id = uuid.uuid4()
    reply = MessageResponse(
        id=uuid.uuid4(),
        conversation_id=conversation_id,
        role="assistant",
        content="A real reply",
        created_at=now,
    )
    observed = {}

    class FakeChatService:
        def __init__(self, _db):
            pass

        async def chat(self, *, agent, user_id, request):
            observed["agent"] = agent
            observed["user_id"] = user_id
            observed["request"] = request
            return SimpleNamespace(id=conversation_id), reply

    monkeypatch.setattr(public_chat, "ChatService", FakeChatService)
    response = await public_chat.public_chat(
        "public-key",
        PublicChatRequest(message="Hello", language="en"),
        FakeDatabase(agent),
    )

    assert response.conversation_id == conversation_id
    assert response.message.content == "A real reply"
    assert observed["agent"] is agent
    assert observed["user_id"] == agent.owner_id
    assert observed["request"].is_test is False


@pytest.mark.asyncio
async def test_paused_agent_rejects_public_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = published_agent(is_active=False)

    async def get_paused_agent(*_args):
        return agent

    monkeypatch.setattr(public_chat, "_published_agent", get_paused_agent)

    with pytest.raises(HTTPException) as error:
        await public_chat.public_chat(
            "public-key",
            PublicChatRequest(message="Hello", language="en"),
            FakeDatabase(agent),
        )

    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_lead_submission_persists_and_sends_escaped_details(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = published_agent()
    conversation = SimpleNamespace(id=uuid.uuid4())
    sent = []

    class FakeEmailService:
        def ensure_configured(self):
            pass

        async def send(self, recipient, subject, body, *, idempotency_key=None):
            sent.append((recipient, subject, body, idempotency_key))
            return "email-lead"

    async def get_conversation(*_args):
        return conversation

    async def get_capability(_db, _agent_id, key):
        if key == "lead_collection":
            return SimpleNamespace(), {
                "fields": [{"key": "name", "label": "Name", "required": True}],
                "notificationEmail": "owner@example.com",
            }
        return None

    monkeypatch.setattr(public_chat, "_get_public_conversation", get_conversation)
    monkeypatch.setattr(public_chat, "_enabled_capability", get_capability)
    monkeypatch.setattr(public_chat, "EmailService", FakeEmailService)
    db = FakeDatabase(None)
    response = await public_chat._submit_lead(
        db,
        agent,
        PublicChatRequest(
            language="en",
            conversation_id=conversation.id,
            action_response={"type": "lead_collection", "values": {"name": "<script>alert(1)</script>"}},
        ),
    )

    assert response.message.content == "Thank you. Your details have been sent to the business."
    assert len(sent) == 1
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in sent[0][2]
    assert "agentforge-lead-" in sent[0][3]
    assert db.added[0].details == {"name": "<script>alert(1)</script>"}


@pytest.mark.asyncio
async def test_meeting_booking_persists_and_sends_both_confirmations(monkeypatch: pytest.MonkeyPatch) -> None:
    agent = published_agent()
    conversation = SimpleNamespace(id=uuid.uuid4())
    sent = []
    zone = timezone.utc
    start = (datetime.now(zone) + timedelta(days=2)).replace(hour=10, minute=30, second=0, microsecond=0)
    config = {
        "timeZone": "UTC",
        "durationMinutes": 30,
        "bufferMinutes": 15,
        "availability": {day: [{"start": "09:00", "end": "17:00"}] for day in public_chat._WEEKDAYS},
        "confirmationEmail": "owner@example.com",
    }

    class FakeEmailService:
        def ensure_configured(self):
            pass

        async def send(self, recipient, subject, body, *, idempotency_key=None):
            sent.append((recipient, subject, body, idempotency_key))
            return f"email-{len(sent)}"

    async def get_conversation(*_args):
        return conversation

    async def get_capability(_db, _agent_id, key):
        return (SimpleNamespace(), config) if key == "meeting_scheduling" else None

    monkeypatch.setattr(public_chat, "_get_public_conversation", get_conversation)
    monkeypatch.setattr(public_chat, "_enabled_capability", get_capability)
    monkeypatch.setattr(public_chat, "EmailService", FakeEmailService)
    db = FakeDatabase(None)
    response = await public_chat._submit_meeting(
        db,
        agent,
        PublicChatRequest(
            language="en",
            conversation_id=conversation.id,
            action_response={
                "type": "meeting_slots",
                "slot_id": start.isoformat(),
                "values": {"name": "Sam", "email": "sam@example.com"},
            },
        ),
    )

    assert "booked" in response.message.content
    assert [email[0] for email in sent] == ["owner@example.com", "sam@example.com"]
    booking = db.added[0]
    assert booking.start_at == start
    assert booking.customer_email == "sam@example.com"


@pytest.mark.asyncio
async def test_meeting_booking_rejects_a_slot_off_the_configured_grid() -> None:
    start = (datetime.now(timezone.utc) + timedelta(days=2)).replace(
        hour=10, minute=10, second=0, microsecond=0
    )
    config = {
        "timeZone": "UTC",
        "durationMinutes": 30,
        "bufferMinutes": 15,
        "availability": {day: [{"start": "09:00", "end": "17:00"}] for day in public_chat._WEEKDAYS},
    }

    with pytest.raises(HTTPException) as error:
        await public_chat._validate_meeting_start(
            FakeDatabase(None),
            uuid.uuid4(),
            start.isoformat(),
            config,
        )

    assert error.value.status_code == 422
