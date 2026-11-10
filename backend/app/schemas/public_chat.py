import uuid
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.conversation import MessageResponse


class PublicAgentProfile(BaseModel):
    public_key: str
    agent_name: str
    opening_message: str
    language: Literal["he", "en"]
    primary_color: str
    logo_data: str | None
    is_active: bool
    paused_message: str | None = None


class PublicChatAction(BaseModel):
    type: Literal["lead_collection", "meeting_slots", "handoff"]
    values: dict[str, str] | None = None
    slot_id: str | None = Field(default=None, max_length=100)
    contact_preference: str | None = None
    contact_details: str | None = None


class PublicChatRequest(BaseModel):
    message: str | None = Field(default=None, min_length=1, max_length=4000)
    conversation_id: uuid.UUID | None = None
    language: Literal["he", "en"]
    action_response: PublicChatAction | None = None


class PublicChatResponse(BaseModel):
    conversation_id: uuid.UUID
    message: MessageResponse
    interaction: dict | None = None
