"""Conversation Context Management

Handles loading and managing conversation context for the Agent Runtime.
Future: Will integrate with RAG, tools, skills, etc.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message, MessageRole

logger = logging.getLogger(__name__)


class ConversationContext:
    """Manages conversation context for a given conversation.
    
    Responsibilities:
    - Load conversation history
    - Format messages for LLM input
    - Manage context window (future)
    - Integrate RAG results (future)
    - Include tool/skill context (future)
    """

    def __init__(self, db: AsyncSession, conversation_id: uuid.UUID):
        self.db = db
        self.conversation_id = conversation_id
        self.history: list[Message] = []

    async def load(self) -> "ConversationContext":
        """Load conversation history from database."""
        result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == self.conversation_id)
            .order_by(Message.created_at.asc())
        )
        self.history = list(result.scalars().all())
        logger.debug(
            "Loaded %d messages for conversation %s",
            len(self.history),
            self.conversation_id,
        )
        return self

    def to_messages_list(self) -> list[dict[str, str]]:
        """Convert conversation history to LLM message format.
        
        Returns:
            List of dicts with 'role' and 'content' keys compatible with OpenAI API.
        """
        messages = []
        for msg in self.history:
            messages.append(
                {
                    "role": msg.role,
                    "content": msg.content,
                }
            )
        return messages

    def get_history_length(self) -> int:
        """Get the number of messages in conversation history."""
        return len(self.history)

    def add_user_message(self, content: str) -> Message:
        """Add user message to context (in-memory, not persisted yet)."""
        msg = Message(
            conversation_id=self.conversation_id,
            role=MessageRole.USER,
            content=content,
        )
        self.history.append(msg)
        return msg

    async def save_messages(self, *messages: Message) -> None:
        """Persist messages to database."""
        for msg in messages:
            self.db.add(msg)
        await self.db.commit()

        for msg in messages:
            await self.db.refresh(msg)
