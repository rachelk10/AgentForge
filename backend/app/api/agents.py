import uuid
import base64
import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.agent import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    AppearanceResponse,
    AppearanceSettingsResponse,
    AppearanceUpdate,
    PublishResponse,
)
from app.schemas.skill import SkillAssignmentResponse
from app.services.agent import AgentService
from app.services.skill import SkillService

router = APIRouter(prefix="/agents", tags=["Agents"])
MAX_LOGO_SIZE = 2 * 1024 * 1024
SAFE_SVG_TAGS = {
    "svg", "g", "defs", "path", "circle", "ellipse", "rect", "line",
    "polyline", "polygon", "title", "desc", "linearGradient", "radialGradient", "stop",
    "clipPath", "mask",
}
SAFE_SVG_ATTRIBUTES = {
    "id", "class", "viewBox", "width", "height", "fill", "stroke", "stroke-width",
    "stroke-linecap", "stroke-linejoin", "opacity", "transform", "d", "cx", "cy",
    "r", "rx", "ry", "x", "y", "x1", "x2", "y1", "y2", "points", "offset",
    "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
    "preserveAspectRatio", "xmlns",
}


def _sanitize_svg(data: bytes) -> bytes:
    if b"<!doctype" in data.lower() or b"<!entity" in data.lower():
        raise HTTPException(status_code=400, detail="Invalid SVG image")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise HTTPException(status_code=400, detail="Invalid SVG image") from exc
    if root.tag.rsplit("}", 1)[-1] != "svg":
        raise HTTPException(status_code=400, detail="Invalid SVG image")

    pending = [root]
    while pending:
        element = pending.pop()
        for child in list(element):
            if child.tag.rsplit("}", 1)[-1] not in SAFE_SVG_TAGS:
                element.remove(child)
            else:
                pending.append(child)
        for name in list(element.attrib):
            local_name = name.rsplit("}", 1)[-1]
            value = element.attrib[name]
            if (
                local_name not in SAFE_SVG_ATTRIBUTES
                or local_name.lower().startswith("on")
                or "url(" in value.lower()
                or "javascript:" in value.lower()
            ):
                del element.attrib[name]

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    data: AgentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentResponse:
    """Create a new agent."""
    return await AgentService(db).create(data, current_user.id)


@router.get("", response_model=list[AgentResponse])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[AgentResponse]:
    """List all agents owned by the current user."""
    return await AgentService(db).get_agents(current_user.id)


@router.get("/{agent_id}/skills", response_model=list[SkillAssignmentResponse])
async def list_agent_skills(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[SkillAssignmentResponse]:
    return await SkillService(db).list_agent_skills(agent_id, current_user.id)


@router.get(
    "/{agent_id}",
    response_model=AgentResponse,
    responses={404: {"description": "Agent not found"}},
)
async def get_agent(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentResponse:
    """Get a specific agent by ID."""
    return await AgentService(db).get(agent_id, current_user.id)


@router.patch(
    "/{agent_id}",
    response_model=AgentResponse,
    responses={404: {"description": "Agent not found"}},
)
async def update_agent(
    agent_id: uuid.UUID,
    data: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AgentResponse:
    """Update an agent (partial update)."""
    return await AgentService(db).update(agent_id, data, current_user.id)


@router.delete(
    "/{agent_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Agent not found"}},
)
async def delete_agent(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete an agent."""
    await AgentService(db).delete(agent_id, current_user.id)


@router.get("/{agent_id}/appearance", response_model=AppearanceResponse)
async def get_appearance(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AppearanceResponse:
    agent = await AgentService(db).get(agent_id, current_user.id)
    return AppearanceResponse(
        primary_color=agent.primary_color,
        logo_data=agent.logo_data,
        is_published=agent.is_published,
        public_key=agent.public_key,
    )


@router.put("/{agent_id}/appearance", response_model=AppearanceSettingsResponse)
async def update_appearance(
    agent_id: uuid.UUID,
    data: AppearanceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AppearanceSettingsResponse:
    agent = await AgentService(db).update_appearance(agent_id, data, current_user.id)
    return AppearanceSettingsResponse(
        primary_color=agent.primary_color,
        is_published=agent.is_published,
        public_key=agent.public_key,
    )


@router.post("/{agent_id}/appearance/logo", response_model=AppearanceResponse)
async def upload_logo(
    agent_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AppearanceResponse:
    await AgentService(db).get(agent_id, current_user.id)
    content = await file.read(MAX_LOGO_SIZE + 1)
    if not content or len(content) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=413, detail="Logo must be 2 MB or smaller")

    content_type = file.content_type
    if content_type == "image/png" and content.startswith(b"\x89PNG\r\n\x1a\n"):
        safe_content = content
    elif content_type in {"image/jpeg", "image/jpg"} and content.startswith(b"\xff\xd8\xff"):
        content_type = "image/jpeg"
        safe_content = content
    elif content_type == "image/svg+xml":
        safe_content = _sanitize_svg(content)
    else:
        raise HTTPException(status_code=400, detail="Upload a PNG, JPG, or SVG image")

    encoded = base64.b64encode(safe_content).decode("ascii")
    logo_data = f"data:{content_type};base64,{encoded}"
    agent = await AgentService(db).update_logo(agent_id, logo_data, current_user.id)
    return AppearanceResponse(
        primary_color=agent.primary_color,
        logo_data=agent.logo_data,
        is_published=agent.is_published,
        public_key=agent.public_key,
    )


@router.post("/{agent_id}/publish", response_model=PublishResponse)
async def publish_agent(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PublishResponse:
    agent = await AgentService(db).publish(agent_id, current_user.id)
    return PublishResponse(public_key=agent.public_key, published_at=agent.published_at)
