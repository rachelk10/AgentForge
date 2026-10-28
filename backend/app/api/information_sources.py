import re
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.document import Document
from app.models.user import User
from app.services.agent import AgentService
from app.services.document import DocumentService

router = APIRouter(prefix="/agents/{agent_id}/information-sources", tags=["Information Sources"])


class InformationSourceResponse(BaseModel):
    id: uuid.UUID
    kind: Literal["text", "website"]
    title: str
    content: str | None = None
    status: Literal["pending", "processing", "ready", "failed"]
    failureReason: str | None = None
    pages: list[str] | None = None


class FreeTextSourceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)


class InformationSourceUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str | None = None
    pages: list[str] | None = None


def _to_source(document: Document) -> InformationSourceResponse:
    metadata = document.metadata_ or {}
    is_website = metadata.get("source_type") == "website"
    title = metadata.get("title") or document.filename
    return InformationSourceResponse(
        id=document.id,
        kind="website" if is_website else "text",
        title=title,
        content=None if is_website else document.extracted_text,
        status="ready" if document.status == "processed" else "failed",
        failureReason=None if document.status == "processed" else document.status,
        pages=[metadata["source_url"]] if is_website and metadata.get("source_url") else None,
    )


def _filename(title: str) -> str:
    safe = re.sub(r'[\\/:*?"<>|\s]+', "_", title).strip("_")[:100] or "source"
    return f"{safe}.txt"


async def _create_text_document(
    service: DocumentService, agent_id: uuid.UUID, title: str, content: str
) -> Document:
    return await service.upload_document(
        agent_id=agent_id,
        filename=_filename(title),
        content=content.encode("utf-8"),
        content_type="text/plain",
        source_metadata={"source_kind": "text", "title": title},
    )


@router.get("", response_model=list[InformationSourceResponse], response_model_exclude_none=True)
async def list_information_sources(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InformationSourceResponse]:
    await AgentService(db).get(agent_id, current_user.id)
    return [_to_source(document) for document in await DocumentService(db).list_documents(agent_id)]


@router.post(
    "/text",
    response_model=InformationSourceResponse,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
)
async def add_free_text_source(
    agent_id: uuid.UUID,
    data: FreeTextSourceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InformationSourceResponse:
    await AgentService(db).get(agent_id, current_user.id)
    document = await _create_text_document(DocumentService(db), agent_id, data.title, data.content)
    return _to_source(document)


@router.put("/{source_id}", response_model=InformationSourceResponse, response_model_exclude_none=True)
async def update_information_source(
    agent_id: uuid.UUID,
    source_id: uuid.UUID,
    data: InformationSourceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InformationSourceResponse:
    await AgentService(db).get(agent_id, current_user.id)
    service = DocumentService(db)
    document = await service.get_document(agent_id, source_id)
    if (document.metadata_ or {}).get("source_type") == "website" or data.content is None:
        metadata = dict(document.metadata_ or {})
        metadata["title"] = data.title
        document.metadata_ = metadata
        await db.commit()
        await db.refresh(document)
        return _to_source(document)

    # Re-embedding requires a fresh document; the old one is removed afterwards.
    replacement = await _create_text_document(service, agent_id, data.title, data.content)
    await service.delete_document(agent_id, source_id)
    return _to_source(replacement)


@router.post("/{source_id}/retry", response_model=InformationSourceResponse, response_model_exclude_none=True)
async def retry_information_source(
    agent_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InformationSourceResponse:
    await AgentService(db).get(agent_id, current_user.id)
    return _to_source(await DocumentService(db).get_document(agent_id, source_id))


@router.delete("/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_information_source(
    agent_id: uuid.UUID,
    source_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    await AgentService(db).get(agent_id, current_user.id)
    await DocumentService(db).delete_document(agent_id, source_id)
