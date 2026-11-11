import os
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/agentdb")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from app.services.dashboard import DashboardService
from app.services.conversation import ConversationService
from fastapi import HTTPException


class FakeResult:
    def __init__(self, value):
        self.value = value

    def one(self):
        return self.value

    def all(self):
        return self.value if isinstance(self.value, list) else []

    def scalar_one(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self


class FakeDatabase:
    def __init__(self, results):
        self.results = iter(results)
        self.statements = []

    async def execute(self, statement):
        self.statements.append(str(statement.compile(compile_kwargs={"literal_binds": True})))
        return FakeResult(next(self.results))


@pytest.mark.asyncio
async def test_overview_excludes_test_conversations_and_fills_empty_chart_days() -> None:
    agent_id = uuid.uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        business_name="A business",
        description="A description",
        is_published=True,
        is_active=False,
    )
    db = FakeDatabase(
        [
            (2, 6, 1, 1, 5, 14, 2, 2),
            [],
            (1, 1),
        ]
    )
    now = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)

    overview = await DashboardService(db).get_overview(agent, now=now)

    assert overview.is_active is False
    assert overview.counts_7_days.conversations == 2
    assert overview.counts_30_days.messages == 14
    assert overview.recommendations == []
    assert len(overview.conversations_by_day) == 30
    assert all(day.count == 0 for day in overview.conversations_by_day)
    assert all("conversations.is_test IS false" in statement for statement in db.statements[:2])
    assert "agent_capabilities.enabled IS true" in db.statements[2]


@pytest.mark.asyncio
async def test_conversation_list_search_and_tags_exclude_test_records() -> None:
    agent_id = uuid.uuid4()
    conversation_id = uuid.uuid4()
    created_at = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
    conversation = SimpleNamespace(
        id=conversation_id,
        title=None,
        created_at=created_at,
        updated_at=created_at,
    )
    db = FakeDatabase(
        [
            1,
            [(conversation, 2, "Can you help me?")],
            [conversation_id],
            [],
            [],
        ]
    )

    page = await DashboardService(db).list_conversations(
        agent_id=agent_id,
        search="help",
        tag="lead",
        limit=50,
        offset=0,
    )

    assert page.total == 1
    assert page.conversations[0].first_message == "Can you help me?"
    assert page.conversations[0].message_count == 2
    assert page.conversations[0].tags == ["lead"]
    assert "conversations.is_test IS false" in db.statements[0]
    assert "EXISTS" in db.statements[0]
    assert "LIKE" in db.statements[0]


@pytest.mark.asyncio
async def test_dashboard_endpoint_checks_agent_ownership(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.api import dashboard

    agent_id = uuid.uuid4()
    owner_id = uuid.uuid4()
    observed = {}
    agent = SimpleNamespace(
        id=agent_id,
        business_name="Business",
        description="Description",
        is_published=True,
        is_active=True,
    )

    class FakeAgentService:
        def __init__(self, _db):
            pass

        async def get(self, requested_agent_id, requested_owner_id):
            observed["ids"] = (requested_agent_id, requested_owner_id)
            return agent

    class FakeDashboardService:
        def __init__(self, _db):
            pass

        async def get_overview(self, requested_agent):
            observed["agent"] = requested_agent
            return SimpleNamespace(is_active=True)

    monkeypatch.setattr(dashboard, "AgentService", FakeAgentService)
    monkeypatch.setattr(dashboard, "DashboardService", FakeDashboardService)

    response = await dashboard.get_overview(
        agent_id,
        db=object(),
        current_user=SimpleNamespace(id=owner_id),
    )

    assert observed["ids"] == (agent_id, owner_id)
    assert observed["agent"] is agent
    assert response.is_active is True


@pytest.mark.asyncio
async def test_conversation_detail_hides_test_conversations() -> None:
    db = FakeDatabase([None])

    with pytest.raises(HTTPException) as error:
        await ConversationService(db).get(
            agent_id=uuid.uuid4(),
            conversation_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
        )

    assert error.value.status_code == 404
    assert "conversations.is_test IS false" in db.statements[0]
