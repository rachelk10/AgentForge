import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from types import SimpleNamespace
from uuid import uuid4

from app.runtime.skills import (
    rank_skills,
    skill_canonical_text,
    skill_embedding_source_hash,
)
from app.runtime.activation import is_valid_tool_schema
from app.runtime.activation import SkillActivationPolicy
from app.runtime.agent_runtime import AgentRuntime
from app.runtime.tools import tool_registry
from app.schemas.skill import SkillCatalogResponse, SkillCreate, SkillUpdate
from app.services.skill import SkillService


def test_skill_ranking_applies_threshold_before_top_k() -> None:
    skills = [
        {"id": "strong", "embedding": [1.0, 0.0]},
        {"id": "weak", "embedding": [0.8, 0.6]},
        {"id": "irrelevant", "embedding": [0.0, 1.0]},
    ]

    selected = rank_skills([1.0, 0.0], skills, limit=2, similarity_threshold=0.95)

    assert [skill["id"] for skill in selected] == ["strong"]
    assert selected[0]["similarity_score"] == 1.0


def test_skill_ranking_supports_null_embeddings_and_semantic_languages() -> None:
    selected = rank_skills(
        [1.0, 0.0],
        [
            {"id": "missing", "embedding": None},
            {"id": "עברית", "embedding": [1.0, 0.0]},
        ],
        limit=3,
        similarity_threshold=0.75,
    )

    assert [skill["id"] for skill in selected] == ["עברית"]


def test_skill_ranking_is_deterministic_for_equal_scores() -> None:
    selected = rank_skills(
        [1.0, 0.0],
        [
            {"id": "skill-b", "embedding": [1.0, 0.0]},
            {"id": "skill-a", "embedding": [1.0, 0.0]},
        ],
        limit=2,
        similarity_threshold=0.75,
    )

    assert [skill["id"] for skill in selected] == ["skill-a", "skill-b"]


def test_skill_hash_changes_only_for_canonical_fields() -> None:
    base = {"tags": ["support"], "runtime_endpoint": "/internal"}
    changed_discovery = {**base, "tags": ["sales"]}
    changed_runtime = {**base, "runtime_endpoint": "/other"}

    original = skill_embedding_source_hash("support", "ענה על שאלות", base)
    assert skill_embedding_source_hash("support", "ענה על שאלות", changed_discovery) != original
    assert skill_embedding_source_hash("support", "ענה על שאלות", changed_runtime) == original
    assert "instructions" not in skill_canonical_text("support", "ענה על שאלות", base)


def test_skill_create_defaults_to_draft_global_catalog() -> None:
    payload = SkillCreate(
        name="knowledge-assistant",
        description="Helps classify and route support requests",
        instructions="Follow the support routing protocol.",
    )

    assert payload.status == "draft"
    assert payload.visibility == "global"


def test_skill_update_rejects_non_global_visibility() -> None:
    with pytest.raises(ValidationError):
        SkillUpdate(visibility="team")


def test_public_catalog_response_excludes_platform_managed_fields() -> None:
    skill = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001",
        name="support",
        description="Routes support requests",
        instructions="Internal procedure",
        configuration={"private": True},
        skill_metadata={"category": "support"},
        resources=["internal-resource"],
        required_tool_names=["ticket_lookup"],
        version=1,
        enabled=True,
        status="published",
        visibility="global",
        owner_id="00000000-0000-0000-0000-000000000002",
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    response = SkillCatalogResponse.model_validate(skill)

    assert response.model_dump().keys() == {
        "id",
        "name",
        "description",
        "required_tool_names",
        "version",
        "enabled",
        "status",
        "visibility",
        "created_at",
        "updated_at",
    }


def test_public_catalog_filter_requires_published_enabled_global_skill() -> None:
    clauses = [str(clause) for clause in SkillService._public_catalog_filter()]

    assert any("skills.enabled IS true" in clause for clause in clauses)
    assert any("skills.status =" in clause for clause in clauses)
    assert any("skills.visibility =" in clause for clause in clauses)
    assert any("skills.scope =" in clause for clause in clauses)


def test_activation_tool_schema_validation_rejects_malformed_schema() -> None:
    assert is_valid_tool_schema({"type": "object", "properties": {}})
    assert not is_valid_tool_schema({"type": "unknown"})
    assert not is_valid_tool_schema({"type": "object", "required": "message"})


class FakeResult:
    def __init__(self, scalar=None, scalars=None):
        self.scalar = scalar
        self.scalar_values = scalars or []

    def scalar_one_or_none(self):
        return self.scalar

    def scalars(self):
        return self

    def all(self):
        return self.scalar_values


class FakeDb:
    def __init__(self, *results):
        self.results = list(results)

    async def execute(self, _query):
        return self.results.pop(0)


def make_activation_objects(**overrides):
    agent = SimpleNamespace(id=uuid4(), is_active=True)
    skill = SimpleNamespace(
        id=uuid4(),
        enabled=True,
        status="published",
        visibility="global",
        scope="global",
        instructions="Use the approved procedure.",
        required_tool_names=[],
    )
    for name, value in overrides.items():
        setattr(skill, name, value)
    return agent, skill


@pytest.mark.asyncio
async def test_activation_rejects_inactive_agent_before_database_access() -> None:
    agent, skill = make_activation_objects()
    agent.is_active = False

    decision = await SkillActivationPolicy(FakeDb()).evaluate(agent, skill)

    assert decision.allowed is False
    assert decision.reason == "agent_inactive"


@pytest.mark.asyncio
async def test_activation_rejects_disabled_assignment() -> None:
    agent, skill = make_activation_objects()

    decision = await SkillActivationPolicy(FakeDb(FakeResult())).evaluate(agent, skill)

    assert decision.allowed is False
    assert decision.reason == "agent_skill_disabled"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("overrides", "reason"),
    [
        ({"enabled": False}, "skill_disabled"),
        ({"status": "draft"}, "skill_not_published"),
        ({"visibility": "team"}, "skill_unavailable"),
        ({"instructions": "x" * 12_001}, "context_budget_exceeded"),
    ],
)
async def test_activation_rejects_unusable_catalog_skills(
    overrides: dict[str, object], reason: str
) -> None:
    agent, skill = make_activation_objects(**overrides)

    decision = await SkillActivationPolicy(FakeDb()).evaluate(agent, skill)

    assert decision.allowed is False
    assert decision.reason == reason


@pytest.mark.asyncio
async def test_activation_rejects_missing_required_tool() -> None:
    agent, skill = make_activation_objects(required_tool_names=["lookup"])

    decision = await SkillActivationPolicy(
        FakeDb(FakeResult(scalar=SimpleNamespace()), FakeResult(scalars=[]))
    ).evaluate(agent, skill)

    assert decision.allowed is False
    assert decision.reason == "missing_required_tool"
    assert decision.missing_tools == ["lookup"]


@pytest.mark.asyncio
async def test_activation_allows_registered_tool_with_valid_schemas() -> None:
    agent, skill = make_activation_objects(required_tool_names=["lookup"])
    tool_registry.register("tests.lookup", lambda arguments: arguments)
    tool = SimpleNamespace(
        name="lookup",
        execution_logic="tests.lookup",
        input_schema={"type": "object"},
        output_schema={"type": "object"},
    )

    decision = await SkillActivationPolicy(
        FakeDb(FakeResult(scalar=SimpleNamespace()), FakeResult(scalars=[tool]))
    ).evaluate(agent, skill)

    assert decision.allowed is True


@pytest.mark.asyncio
async def test_activation_rejects_tool_with_invalid_schema_or_handler() -> None:
    agent, skill = make_activation_objects(required_tool_names=["lookup"])
    tool = SimpleNamespace(
        name="lookup",
        execution_logic="tests.unregistered",
        input_schema={"type": "not-a-schema"},
        output_schema={"type": "object"},
    )

    decision = await SkillActivationPolicy(
        FakeDb(FakeResult(scalar=SimpleNamespace()), FakeResult(scalars=[tool]))
    ).evaluate(agent, skill)

    assert decision.allowed is False
    assert decision.reason == "missing_required_tool"
    assert decision.missing_tools == ["lookup"]


@pytest.mark.asyncio
async def test_runtime_discovers_and_activates_assigned_skill() -> None:
    agent_id = uuid4()
    skill_id = uuid4()
    agent = SimpleNamespace(
        id=agent_id,
        is_active=True,
        skills_top_k=1,
        skills_similarity_threshold=0.75,
    )
    skill = SimpleNamespace(
        id=skill_id,
        name="support",
        version=2,
        instructions="Follow the support procedure.",
        enabled=True,
        status="published",
        visibility="global",
        scope="global",
        required_tool_names=[],
    )
    candidate = SimpleNamespace(
        id=skill_id,
        name="support",
        embedding=[1.0, 0.0],
        version=2,
        required_tool_names=[],
    )
    db = FakeDb(
        FakeResult(scalars=[candidate]),
        FakeResult(scalars=[skill]),
        FakeResult(scalar=SimpleNamespace()),
    )
    runtime = AgentRuntime.__new__(AgentRuntime)
    runtime.db = db

    active_skills = await runtime._load_relevant_skills(agent, [1.0, 0.0])

    assert active_skills == [skill]


@pytest.mark.asyncio
async def test_assignment_rejects_skill_outside_public_catalog() -> None:
    service = SkillService(FakeDb(FakeResult(scalar=None)))

    with pytest.raises(HTTPException) as error:
        await service.set_agent_access(uuid4(), uuid4(), uuid4(), True)

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_assignment_rejects_agent_owned_by_another_user() -> None:
    service = SkillService(
        FakeDb(
            FakeResult(scalar=SimpleNamespace()),
            FakeResult(scalar=None),
        )
    )

    with pytest.raises(HTTPException) as error:
        await service.set_agent_access(uuid4(), uuid4(), uuid4(), True)

    assert error.value.status_code == 404