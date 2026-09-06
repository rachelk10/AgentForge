import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.conversation import Conversation
from app.models.message import Message
from app.runtime.agent_runtime import AgentRuntime
from app.schemas.conversation import ChatRequest

logger = logging.getLogger(__name__)


class ChatService:
    """Thin wrapper around Agent Runtime for chat operations.
    
    This service delegates the main processing logic to Agent Runtime,
    keeping itself focused on API-level concerns only.
    
    The actual orchestration happens in app.runtime.AgentRuntime.
    """

    def __init__(self, db: AsyncSession) -> None:
        self.runtime = AgentRuntime(db)

    async def chat(
        self,
        agent: Agent,
        user_id: uuid.UUID,
        request: ChatRequest,
    ) -> tuple[Conversation, Message]:
        """Send a message to an agent and return the conversation and assistant reply.
        
        Delegates to Agent Runtime for processing.
        """
        conversation, assistant_message = await self.runtime.process_message(
            agent=agent,
            user_id=user_id,
            conversation_id=request.conversation_id,
            user_message=request.message,
        )

        return conversation, assistant_message
