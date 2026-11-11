import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.dashboard import DashboardConversationPage, DashboardOverviewResponse
from app.services.agent import AgentService
from app.services.dashboard import DashboardService

router = APIRouter(prefix="/agents/{agent_id}/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_overview(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardOverviewResponse:
    agent = await AgentService(db).get(agent_id, current_user.id)
    return await DashboardService(db).get_overview(agent)


@router.get("/conversations", response_model=DashboardConversationPage)
async def list_dashboard_conversations(
    agent_id: uuid.UUID,
    search: str | None = Query(default=None, max_length=200),
    tag: Literal["lead", "meeting", "handed_off"] | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DashboardConversationPage:
    await AgentService(db).get(agent_id, current_user.id)
    return await DashboardService(db).list_conversations(
        agent_id=agent_id,
        search=search,
        tag=tag,
        limit=limit,
        offset=offset,
    )
