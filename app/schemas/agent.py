import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    system_prompt: str | None = None
    model: str = "gpt-4o-mini"
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, gt=0)
    is_active: bool = True


class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    system_prompt: str | None = None
    model: str | None = None
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, gt=0)
    is_active: bool | None = None


class AgentResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    system_prompt: str | None
    model: str
    temperature: float
    max_tokens: int | None
    is_active: bool
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
