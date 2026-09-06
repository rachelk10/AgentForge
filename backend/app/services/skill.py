import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.skill import AgentSkill, Skill
from app.models.tool import AgentTool, Tool
from app.models.user import User
from app.rag.embeddings import EmbeddingProvider, OpenAIEmbeddingProvider
from app.runtime.skills import skill_canonical_text, skill_embedding_source_hash
from app.schemas.skill import SkillCreate, SkillUpdate

logger = logging.getLogger(__name__)


class SkillService:
    def __init__(self, db: AsyncSession, embedding_provider: EmbeddingProvider | None = None) -> None:
        self.db = db
        self.embedding_provider = embedding_provider

    async def _generate_embedding(self, skill: Skill) -> None:
        source_hash = skill_embedding_source_hash(skill.name, skill.description, skill.skill_metadata)
        if skill.embedding is not None and skill.embedding_source_hash == source_hash:
            return
        try:
            provider = self.embedding_provider or OpenAIEmbeddingProvider()
            embeddings = await provider.embed([skill_canonical_text(skill.name, skill.description, skill.skill_metadata)])
            if len(embeddings) != 1 or len(embeddings[0]) != 1536:
                raise ValueError("Embedding provider returned an invalid result")
            skill.embedding = embeddings[0]
            skill.embedding_source_hash = source_hash
        except Exception as exc:
            skill.embedding = None
            skill.embedding_source_hash = None
            logger.warning("Skill embedding failed skill_id=%s reason=%s", skill.id, exc)

    async def get_owned(self, skill_id: uuid.UUID, owner_id: uuid.UUID | None) -> Skill:
        query = select(Skill).where(Skill.id == skill_id)
        if owner_id is not None:
            query = query.where(Skill.owner_id == owner_id)
        result = await self.db.execute(query)
        skill = result.scalar_one_or_none()
        if skill is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
        return skill

    async def get_visible(self, skill_id: uuid.UUID, user: User) -> Skill:
        """Return a catalog skill visible to the current user."""
        query = select(Skill).where(Skill.id == skill_id)
        if not user.is_admin:
            query = query.where(Skill.enabled.is_(True))
        result = await self.db.execute(query)
        skill = result.scalar_one_or_none()
        if skill is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
        return skill

    async def list_skills(self, include_disabled: bool = False) -> list[Skill]:
        query = select(Skill)
        if not include_disabled:
            query = query.where(Skill.enabled.is_(True))
        result = await self.db.execute(query.order_by(Skill.created_at.desc()))
        return list(result.scalars().all())

    async def _validate_required_tools(
        self, skill: Skill, agent_id: uuid.UUID, owner_id: uuid.UUID
    ) -> None:
        if not skill.enabled:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Skill is disabled")
        agent_result = await self.db.execute(select(Agent).where(Agent.id == agent_id, Agent.owner_id == owner_id))
        if agent_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        if not skill.required_tool_names:
            return
        result = await self.db.execute(
            select(Tool.name).join(AgentTool).where(
                Tool.name.in_(skill.required_tool_names),
                Tool.enabled.is_(True),
                AgentTool.agent_id == agent_id,
                AgentTool.enabled.is_(True),
            )
        )
        available = set(result.scalars().all())
        missing = sorted(set(skill.required_tool_names) - available)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Required tools are unavailable: {', '.join(missing)}",
            )

    async def create(self, data: SkillCreate, owner_id: uuid.UUID) -> Skill:
        if data.scope != "user":
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only user scope is supported")
        values = data.model_dump()
        values["skill_metadata"] = values.pop("metadata")
        skill = Skill(**values, owner_id=owner_id)
        self.db.add(skill)
        try:
            await self.db.flush()
            await self._generate_embedding(skill)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A skill with this name already exists") from exc
        await self.db.refresh(skill)
        return skill

    async def update(self, skill_id: uuid.UUID, data: SkillUpdate, owner_id: uuid.UUID | None) -> Skill:
        skill = await self.get_owned(skill_id, owner_id)
        values = data.model_dump(exclude_unset=True)
        if "metadata" in values:
            values["skill_metadata"] = values.pop("metadata")
        if values.get("scope") not in (None, "user"):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only user scope is supported")
        embedding_fields_changed = any(field in values for field in ("name", "description", "skill_metadata"))
        if "version" not in values and any(
            field in values for field in ("description", "instructions", "configuration", "skill_metadata", "resources", "required_tool_names")
        ):
            values["version"] = skill.version + 1
        for field, value in values.items():
            setattr(skill, field, value)
        try:
            if embedding_fields_changed:
                await self._generate_embedding(skill)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A skill with this name already exists") from exc
        await self.db.refresh(skill)
        return skill

    async def delete(self, skill_id: uuid.UUID, owner_id: uuid.UUID | None) -> None:
        skill = await self.get_owned(skill_id, owner_id)
        await self.db.delete(skill)
        await self.db.commit()

    async def set_agent_access(self, agent_id: uuid.UUID, skill_id: uuid.UUID, owner_id: uuid.UUID, enabled: bool) -> None:
        skill_query = select(Skill).where(Skill.id == skill_id)
        if enabled:
            skill_query = skill_query.where(Skill.enabled.is_(True))
        skill_result = await self.db.execute(skill_query)
        skill = skill_result.scalar_one_or_none()
        if skill is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
        if enabled:
            await self._validate_required_tools(skill, agent_id, owner_id)
        else:
            agent_result = await self.db.execute(select(Agent).where(Agent.id == agent_id, Agent.owner_id == owner_id))
            if agent_result.scalar_one_or_none() is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        result = await self.db.execute(select(AgentSkill).where(AgentSkill.agent_id == agent_id, AgentSkill.skill_id == skill_id))
        link = result.scalar_one_or_none()
        if enabled and link is None:
            self.db.add(AgentSkill(agent_id=agent_id, skill_id=skill_id, enabled=True))
        elif link is not None:
            link.enabled = enabled
        await self.db.commit()

    async def remove_from_agent(self, agent_id: uuid.UUID, skill_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        await self.set_agent_access(agent_id, skill_id, owner_id, False)
        await self.db.execute(delete(AgentSkill).where(AgentSkill.agent_id == agent_id, AgentSkill.skill_id == skill_id))
        await self.db.commit()