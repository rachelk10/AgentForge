import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.document import DocumentResponse
from app.schemas.website import (
    WebsiteImportRequest,
    WebsitePageResponse,
    WebsiteScanRequest,
    WebsiteScanResponse,
)
from app.services.agent import AgentService
from app.services.document import DocumentService
from app.services.website import WebsiteService

router = APIRouter(prefix="/agents/{agent_id}/documents", tags=["Documents"])


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    responses={400: {"description": "File is empty"}, 404: {"description": "Agent not found"}},
)
async def upload_document(
    agent_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    """Upload a document and build an embedded knowledge base for the agent."""
    await AgentService(db).get(agent_id, current_user.id)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")

    document = await DocumentService(db).upload_document(
        agent_id=agent_id,
        filename=file.filename or "upload.bin",
        content=content,
        content_type=file.content_type,
    )
    return DocumentResponse.model_validate(document)


@router.get(
    "",
    response_model=list[DocumentResponse],
    responses={404: {"description": "Agent not found"}},
)
async def list_documents(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentResponse]:
    """List all documents attached to an agent."""
    await AgentService(db).get(agent_id, current_user.id)
    documents = await DocumentService(db).list_documents(agent_id)
    return [DocumentResponse.model_validate(document) for document in documents]


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    responses={404: {"description": "Agent or document not found"}},
)
async def get_document(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DocumentResponse:
    """Retrieve a single document and its metadata."""
    await AgentService(db).get(agent_id, current_user.id)
    document = await DocumentService(db).get_document(agent_id, document_id)
    return DocumentResponse.model_validate(document)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Agent or document not found"}},
)
async def delete_document(
    agent_id: uuid.UUID,
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a document and all of its chunks."""
    await AgentService(db).get(agent_id, current_user.id)
    await DocumentService(db).delete_document(agent_id, document_id)


@router.post(
    "/website/scan",
    response_model=WebsiteScanResponse,
    responses={422: {"description": "Website is invalid, inaccessible, or exceeds scan limits"}},
)
async def scan_website(
    agent_id: uuid.UUID,
    data: WebsiteScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WebsiteScanResponse:
    await AgentService(db).get(agent_id, current_user.id)
    pages = await WebsiteService(db).scan(str(data.url))
    return WebsiteScanResponse(
        pages=[WebsitePageResponse(url=page.url, title=page.title) for page in pages],
    )


@router.post(
    "/website",
    response_model=list[DocumentResponse],
    status_code=status.HTTP_201_CREATED,
    responses={404: {"description": "Agent not found"}, 422: {"description": "Selected pages could not be read"}},
)
async def import_website_pages(
    agent_id: uuid.UUID,
    data: WebsiteImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DocumentResponse]:
    await AgentService(db).get(agent_id, current_user.id)
    documents = await WebsiteService(db).import_pages(
        agent_id,
        str(data.url),
        [str(page) for page in data.pages],
    )
    return [DocumentResponse.model_validate(document) for document in documents]
