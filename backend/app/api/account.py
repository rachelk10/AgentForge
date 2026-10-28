from typing import Any, Literal

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.agent import Agent
from app.models.user import User

router = APIRouter(prefix="/account", tags=["Account"])


@router.get("/agent-state")
async def agent_state(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)
) -> Literal["none", "draft", "published"]:
    """Summarize the current user's agents: none, draft or published."""
    rows = (await db.execute(select(Agent.is_published).where(Agent.owner_id == current_user.id))).scalars().all()
    if not rows:
        return "none"
    return "published" if any(rows) else "draft"


@router.get("/wizard-draft")
async def get_wizard_draft(current_user: User = Depends(get_current_user)) -> dict[str, Any] | None:
    """Return the saved wizard draft, or null if none exists."""
    return current_user.wizard_draft


@router.put("/wizard-draft")
async def save_wizard_draft(
    draft: dict[str, Any] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """Persist the wizard draft for the current user."""
    current_user.wizard_draft = draft
    await db.commit()
    return draft
