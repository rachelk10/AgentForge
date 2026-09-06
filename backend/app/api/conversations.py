import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.conversation import (
    ConversationCreate,
    ConversationResponse,
    ConversationWithMessages,
    MessageResponse,
)
from app.services.agent import AgentService
from app.services.conversation import ConversationService

router = APIRouter(prefix="/agents/{agent_id}/conversations", tags=["Conversations"])


@router.post(
    "",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    responses={404: {"description": "Agent not found"}},
)
async def create_conversation(
    agent_id: uuid.UUID,
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationResponse:
    """Create a new conversation for an agent."""
    await AgentService(db).get(agent_id, current_user.id)
    return await ConversationService(db).create(agent_id, current_user.id, data)


@router.get(
    "",
    response_model=list[ConversationResponse],
    responses={404: {"description": "Agent not found"}},
)
async def list_conversations(
    agent_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationResponse]:
    """List all conversations for an agent."""
    await AgentService(db).get(agent_id, current_user.id)
    return await ConversationService(db).get_conversations(agent_id, current_user.id)


@router.get(
    "/{conversation_id}",
    response_model=ConversationWithMessages,
    responses={404: {"description": "Agent or conversation not found"}},
)
async def get_conversation(
    agent_id: uuid.UUID,
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationWithMessages:
    """Get a conversation with its full message history."""
    await AgentService(db).get(agent_id, current_user.id)
    return await ConversationService(db).get(agent_id, conversation_id, current_user.id)


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "Agent or conversation not found"}},
)
async def delete_conversation(
    agent_id: uuid.UUID,
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a conversation and all its messages."""
    await AgentService(db).get(agent_id, current_user.id)
    await ConversationService(db).delete(agent_id, conversation_id, current_user.id)


@router.get(
    "/{conversation_id}/messages",
    response_model=list[MessageResponse],
    responses={404: {"description": "Agent or conversation not found"}},
)
async def list_messages(
    agent_id: uuid.UUID,
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MessageResponse]:
    """List all messages in a conversation ordered by time."""
    await AgentService(db).get(agent_id, current_user.id)
    return await ConversationService(db).get_messages(agent_id, conversation_id, current_user.id)
