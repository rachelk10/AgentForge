import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    system_prompt: str | None = None
    model: str = "gpt-4o-mini"
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, gt=0, le=2_147_483_647)
    rag_top_k: int = Field(default=5, ge=1, le=50)
    rag_similarity_threshold: float = Field(default=0.30, ge=0.0, le=1.0)
    skills_top_k: int = Field(default=3, ge=1, le=50)
    skills_similarity_threshold: float = Field(default=0.75, ge=0.0, le=1.0)
    is_active: bool = True


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, gt=0, le=2_147_483_647)
    rag_top_k: int | None = Field(default=None, ge=1, le=50)
    rag_similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    skills_top_k: int | None = Field(default=None, ge=1, le=50)
    skills_similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    is_active: bool | None = None


class AgentResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    system_prompt: str | None
    model: str
    temperature: float
    max_tokens: int | None
    rag_top_k: int
    rag_similarity_threshold: float
    skills_top_k: int
    skills_similarity_threshold: float
    is_active: bool
    is_published: bool
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AppearanceUpdate(BaseModel):
    primary_color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class AppearanceSettingsResponse(BaseModel):
    primary_color: str
    is_published: bool
    public_key: str | None

    model_config = ConfigDict(from_attributes=True)


class AppearanceResponse(AppearanceSettingsResponse):
    logo_data: str | None


class PublishResponse(BaseModel):
    public_key: str
    published_at: datetime

    model_config = ConfigDict(from_attributes=True)
