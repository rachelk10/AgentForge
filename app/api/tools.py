import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.tool import ToolCreate, ToolExecutionRequest, ToolResponse, ToolResult, ToolUpdate
from app.services.tool import ToolService

router = APIRouter(prefix="/tools", tags=["Tools"])


@router.post(
    "",
    response_model=ToolResponse,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "A tool with this name already exists"}},
)
async def create_tool(data: ToolCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> ToolResponse:
    return await ToolService(db).create(data, current_user.id)


@router.get("", response_model=list[ToolResponse])
async def list_tools(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[ToolResponse]:
    return await ToolService(db).list_tools(current_user.id)


@router.get(
    "/{tool_id}",
    response_model=ToolResponse,
    responses={404: {"description": "Tool not found"}},
)
async def get_tool(tool_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> ToolResponse:
    return await ToolService(db).get_owned(tool_id, current_user.id)


@router.patch(
    "/{tool_id}",
    response_model=ToolResponse,
    responses={404: {"description": "Tool not found"}},
)
async def update_tool(tool_id: uuid.UUID, data: ToolUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> ToolResponse:
    return await ToolService(db).update(tool_id, data, current_user.id)


@router.delete(
    "/{tool_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Tool not found"}},
)
async def delete_tool(tool_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    await ToolService(db).delete(tool_id, current_user.id)


@router.put(
    "/{tool_id}/agents/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Tool or agent not found"}},
)
async def enable_tool_for_agent(tool_id: uuid.UUID, agent_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    await ToolService(db).set_agent_access(agent_id, tool_id, current_user.id, True)


@router.delete(
    "/{tool_id}/agents/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Tool or agent not found"}},
)
async def disable_tool_for_agent(tool_id: uuid.UUID, agent_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    await ToolService(db).set_agent_access(agent_id, tool_id, current_user.id, False)


@router.delete(
    "/{tool_id}/agents/{agent_id}/remove",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Tool or agent not found"}},
)
async def remove_tool_from_agent(tool_id: uuid.UUID, agent_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    await ToolService(db).remove_from_agent(agent_id, tool_id, current_user.id)

@router.post(
    "/{tool_id}/agents/{agent_id}/execute",
    response_model=ToolResult,
    responses={403: {"description": "Tool is not enabled for this agent"}, 404: {"description": "Tool not found"}},
)
async def execute_tool_for_agent(tool_id: uuid.UUID, agent_id: uuid.UUID, data: ToolExecutionRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> ToolResult:
    return await ToolService(db).execute_for_agent(agent_id, tool_id, data, current_user.id)