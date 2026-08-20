import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentMetadata(BaseModel):
    source_type: str | None = None
    chunk_count: int | None = None
    extracted_chars: int | None = None

    model_config = ConfigDict(from_attributes=True)


class DocumentResponse(BaseModel):
    id: uuid.UUID
    agent_id: uuid.UUID
    filename: str
    content_type: str | None
    file_size: int
    status: str
    extracted_text: str | None
    metadata_: DocumentMetadata | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentChunkResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    agent_id: uuid.UUID
    chunk_index: int
    content: str
    embedding: list[float]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
