import uuid
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.schemas.agent import AgentCreate, AgentUpdate
from app.schemas.agent import AppearanceUpdate


class AgentService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, data: AgentCreate, owner_id: uuid.UUID) -> Agent:
        agent = Agent(**data.model_dump(), owner_id=owner_id)
        self.db.add(agent)
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def get_agents(self, owner_id: uuid.UUID) -> list[Agent]:
        result = await self.db.execute(
            select(Agent).where(Agent.owner_id == owner_id).order_by(Agent.created_at.desc())
        )
        return list(result.scalars().all())

    async def get(self, agent_id: uuid.UUID, owner_id: uuid.UUID) -> Agent:
        result = await self.db.execute(
            select(Agent).where(Agent.id == agent_id, Agent.owner_id == owner_id)
        )
        agent = result.scalar_one_or_none()
        if agent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        return agent

    async def update(self, agent_id: uuid.UUID, data: AgentUpdate, owner_id: uuid.UUID) -> Agent:
        agent = await self.get(agent_id, owner_id)
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if value is None and field in {
                "name",
                "model",
                "temperature",
                "rag_top_k",
                "rag_similarity_threshold",
                "is_active",
            }:
                continue
            setattr(agent, field, value)
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def delete(self, agent_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        agent = await self.get(agent_id, owner_id)
        await self.db.delete(agent)
        await self.db.commit()

    async def update_appearance(
        self, agent_id: uuid.UUID, data: AppearanceUpdate, owner_id: uuid.UUID
    ) -> Agent:
        agent = await self.get(agent_id, owner_id)
        agent.primary_color = data.primary_color
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def update_logo(self, agent_id: uuid.UUID, logo_data: str, owner_id: uuid.UUID) -> Agent:
        agent = await self.get(agent_id, owner_id)
        agent.logo_data = logo_data
        await self.db.commit()
        await self.db.refresh(agent)
        return agent

    async def publish(self, agent_id: uuid.UUID, owner_id: uuid.UUID) -> Agent:
        agent = await self.get(agent_id, owner_id)
        if not agent.public_key:
            agent.public_key = secrets.token_urlsafe(24)
        agent.is_published = True
        agent.published_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(agent)
        return agent
