from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.skill import AgentSkill, Skill
from app.models.tool import AgentTool, Tool
from app.runtime.tools import tool_registry

MAX_SKILL_INSTRUCTION_CHARS = 12_000
VALID_SCHEMA_TYPES = {"object", "array", "string", "number", "integer", "boolean", "null"}


@dataclass
class ActivationDecision:
    allowed: bool
    reason: str | None = None
    missing_tools: list[str] = field(default_factory=list)


def is_valid_tool_schema(schema: Any) -> bool:
    if not isinstance(schema, dict):
        return False
    schema_type = schema.get("type")
    if schema_type is not None and schema_type not in VALID_SCHEMA_TYPES:
        return False
    if "required" in schema and (
        not isinstance(schema["required"], list)
        or not all(isinstance(item, str) for item in schema["required"])
    ):
        return False
    return "properties" not in schema or isinstance(schema["properties"], dict)


class SkillActivationPolicy:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def evaluate(self, agent: Agent, skill: Skill) -> ActivationDecision:
        if not agent.is_active:
            return ActivationDecision(False, "agent_inactive")
        if not skill.enabled:
            return ActivationDecision(False, "skill_disabled")
        if skill.status != "published":
            return ActivationDecision(False, "skill_not_published")
        if skill.visibility != "global" or skill.scope != "global":
            return ActivationDecision(False, "skill_unavailable")
        if len(skill.instructions) > MAX_SKILL_INSTRUCTION_CHARS:
            return ActivationDecision(False, "context_budget_exceeded")

        assignment = await self.db.execute(
            select(AgentSkill).where(
                AgentSkill.agent_id == agent.id,
                AgentSkill.skill_id == skill.id,
                AgentSkill.enabled.is_(True),
            )
        )
        if assignment.scalar_one_or_none() is None:
            return ActivationDecision(False, "agent_skill_disabled")

        if not skill.required_tool_names:
            return ActivationDecision(True)

        result = await self.db.execute(
            select(Tool).join(AgentTool).where(
                Tool.name.in_(skill.required_tool_names),
                Tool.enabled.is_(True),
                AgentTool.agent_id == agent.id,
                AgentTool.enabled.is_(True),
            )
        )
        available = {
            tool.name
            for tool in result.scalars().all()
            if is_valid_tool_schema(tool.input_schema)
            and is_valid_tool_schema(tool.output_schema)
            and tool_registry.get(tool.execution_logic) is not None
        }
        missing = sorted(set(skill.required_tool_names) - available)
        if missing:
            return ActivationDecision(False, "missing_required_tool", missing)
        return ActivationDecision(True)