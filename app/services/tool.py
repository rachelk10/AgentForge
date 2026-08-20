import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.tool import AgentTool, Tool
from app.runtime.tools import execute_tool
from app.schemas.tool import ToolCreate, ToolExecutionRequest, ToolUpdate, ToolResult


class ToolService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_owned(self, tool_id: uuid.UUID, owner_id: uuid.UUID) -> Tool:
        result = await self.db.execute(select(Tool).where(Tool.id == tool_id, Tool.owner_id == owner_id))
        tool = result.scalar_one_or_none()
        if tool is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")
        return tool

    async def create(self, data: ToolCreate, owner_id: uuid.UUID) -> Tool:
        tool = Tool(**data.model_dump(), owner_id=owner_id)
        self.db.add(tool)
        await self.db.commit()
        await self.db.refresh(tool)
        return tool

    async def list_tools(self, owner_id: uuid.UUID) -> list[Tool]:
        result = await self.db.execute(select(Tool).where(Tool.owner_id == owner_id).order_by(Tool.created_at.desc()))
        return list(result.scalars().all())

    async def update(self, tool_id: uuid.UUID, data: ToolUpdate, owner_id: uuid.UUID) -> Tool:
        tool = await self.get_owned(tool_id, owner_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(tool, field, value)
        await self.db.commit()
        await self.db.refresh(tool)
        return tool

    async def delete(self, tool_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        tool = await self.get_owned(tool_id, owner_id)
        await self.db.delete(tool)
        await self.db.commit()

    async def set_agent_access(self, agent_id: uuid.UUID, tool_id: uuid.UUID, owner_id: uuid.UUID, enabled: bool) -> None:
        await self.get_owned(tool_id, owner_id)
        agent_result = await self.db.execute(select(Agent).where(Agent.id == agent_id, Agent.owner_id == owner_id))
        if agent_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        link_result = await self.db.execute(
            select(AgentTool).where(AgentTool.agent_id == agent_id, AgentTool.tool_id == tool_id)
        )
        link = link_result.scalar_one_or_none()
        if enabled and link is None:
            self.db.add(AgentTool(agent_id=agent_id, tool_id=tool_id, enabled=True))
        elif link is not None:
            link.enabled = enabled
        await self.db.commit()

    async def remove_from_agent(self, agent_id: uuid.UUID, tool_id: uuid.UUID, owner_id: uuid.UUID) -> None:
        await self.set_agent_access(agent_id, tool_id, owner_id, False)
        await self.db.execute(delete(AgentTool).where(AgentTool.agent_id == agent_id, AgentTool.tool_id == tool_id))
        await self.db.commit()

    async def execute_for_agent(
        self, agent_id: uuid.UUID, tool_id: uuid.UUID, arguments: ToolExecutionRequest, owner_id: uuid.UUID
    ) -> ToolResult:
        await self.get_owned(tool_id, owner_id)
        result = await self.db.execute(
            select(Tool).join(AgentTool).where(
                AgentTool.agent_id == agent_id,
                AgentTool.tool_id == tool_id,
                AgentTool.enabled.is_(True),
                Tool.id == tool_id,
                Tool.owner_id == owner_id,
            )
        )
        tool = result.scalar_one_or_none()
        if tool is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tool is not enabled for this agent")
        return await execute_tool(tool, arguments.arguments)