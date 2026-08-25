import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.skill import SkillCreate, SkillResponse, SkillUpdate
from app.services.skill import SkillService

router = APIRouter(prefix="/skills", tags=["Skills"])


@router.post("", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(data: SkillCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> SkillResponse:
    return await SkillService(db).create(data, current_user.id)


@router.get("", response_model=list[SkillResponse])
async def list_skills(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[SkillResponse]:
    return await SkillService(db).list_skills(current_user.id)


@router.get("/{skill_id}", response_model=SkillResponse)
async def get_skill(skill_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> SkillResponse:
    return await SkillService(db).get_owned(skill_id, current_user.id)


@router.patch("/{skill_id}", response_model=SkillResponse)
async def update_skill(skill_id: uuid.UUID, data: SkillUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> SkillResponse:
    return await SkillService(db).update(skill_id, data, current_user.id)


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(skill_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    await SkillService(db).delete(skill_id, current_user.id)


@router.post("/{skill_id}/enable", response_model=SkillResponse)
async def enable_skill(skill_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> SkillResponse:
    return await SkillService(db).update(skill_id, SkillUpdate(enabled=True), current_user.id)


@router.post("/{skill_id}/disable", response_model=SkillResponse)
async def disable_skill(skill_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> SkillResponse:
    return await SkillService(db).update(skill_id, SkillUpdate(enabled=False), current_user.id)


@router.put("/{skill_id}/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def enable_skill_for_agent(skill_id: uuid.UUID, agent_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    await SkillService(db).set_agent_access(agent_id, skill_id, current_user.id, True)


@router.delete("/{skill_id}/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disable_skill_for_agent(skill_id: uuid.UUID, agent_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    await SkillService(db).set_agent_access(agent_id, skill_id, current_user.id, False)


@router.delete("/{skill_id}/agents/{agent_id}/remove", status_code=status.HTTP_204_NO_CONTENT)
async def remove_skill_from_agent(skill_id: uuid.UUID, agent_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)) -> None:
    await SkillService(db).remove_from_agent(agent_id, skill_id, current_user.id)
