import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.capability import AgentCapabilityResponse, AgentCapabilityUpdate, CapabilityResponse
from app.services.capability import CapabilityService

router = APIRouter(tags=["Capabilities"])


@router.get("/capabilities", response_model=list[CapabilityResponse])
async def list_capabilities(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[CapabilityResponse]:
    return await CapabilityService(db).list_catalog()


@router.get(
    "/agents/{agent_id}/capabilities",
    response_model=list[AgentCapabilityResponse],
    responses={404: {"description": "Agent not found"}},
)
async def list_agent_capabilities(
    agent_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[AgentCapabilityResponse]:
    return await CapabilityService(db).list_agent_capabilities(agent_id, current_user.id)


@router.put(
    "/agents/{agent_id}/capabilities/{capability_id}",
    response_model=AgentCapabilityResponse,
    responses={
        403: {"description": "Capability is not available in this plan"},
        404: {"description": "Agent or capability not found"},
    },
)
async def set_agent_capability(
    agent_id: uuid.UUID,
    capability_id: uuid.UUID,
    data: AgentCapabilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentCapabilityResponse:
    return await CapabilityService(db).set_agent_capability(agent_id, capability_id, data, current_user.id)
