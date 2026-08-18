import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.schemas.conversation import ChatRequest, ChatResponse
from app.services.agent import AgentService
from app.services.chat import ChatService

router = APIRouter(prefix="/agents/{agent_id}/chat", tags=["Chat"])


@router.post("", response_model=ChatResponse)
async def chat(
    agent_id: uuid.UUID,
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatResponse:
    """Send a message to an agent and receive its response.

    If `conversation_id` is omitted a new conversation is created automatically.
    The full conversation history is sent to the LLM on every call so context is preserved.
    """
    agent = await AgentService(db).get(agent_id, current_user.id)
    conversation, assistant_message = await ChatService(db).chat(agent, current_user.id, request)
    return ChatResponse(
        conversation_id=conversation.id,
        message=assistant_message,
    )
