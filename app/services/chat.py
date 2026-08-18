import logging
import uuid

from fastapi import HTTPException, status
from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.agent import Agent
from app.models.conversation import Conversation
from app.models.message import Message, MessageRole
from app.schemas.conversation import ChatRequest

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def chat(
        self,
        agent: Agent,
        user_id: uuid.UUID,
        request: ChatRequest,
    ) -> tuple[Conversation, Message]:
        """Send a message to an agent and return the conversation and assistant reply."""
        conversation = await self._get_or_create_conversation(agent, user_id, request)

        # Load existing history ordered by creation time
        history_result = await self.db.execute(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.asc())
        )
        history = list(history_result.scalars().all())

        # Build OpenAI input list for the Responses API
        input_messages: list[dict[str, str]] = []
        for msg in history:
            input_messages.append({"role": msg.role, "content": msg.content})
        input_messages.append({"role": MessageRole.USER, "content": request.message})

        # Call OpenAI
        call_kwargs: dict = {
            "model": agent.model,
            "input": input_messages,
            "temperature": agent.temperature,
        }
        if agent.system_prompt:
            call_kwargs["instructions"] = agent.system_prompt
        if agent.max_tokens is not None:
            call_kwargs["max_output_tokens"] = agent.max_tokens

        logger.info(
            "OpenAI request model=%s conversation_id=%s history_len=%d",
            agent.model,
            conversation.id,
            len(history),
        )
        response = await self.client.responses.create(**call_kwargs)
        assistant_content = response.output_text or ""

        # Persist user message
        user_message = Message(
            conversation_id=conversation.id,
            role=MessageRole.USER,
            content=request.message,
        )
        self.db.add(user_message)

        # Persist assistant message
        assistant_message = Message(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content=assistant_content,
        )
        self.db.add(assistant_message)

        await self.db.commit()
        await self.db.refresh(conversation)
        await self.db.refresh(assistant_message)

        return conversation, assistant_message

    async def _get_or_create_conversation(
        self,
        agent: Agent,
        user_id: uuid.UUID,
        request: ChatRequest,
    ) -> Conversation:
        if request.conversation_id is not None:
            result = await self.db.execute(
                select(Conversation).where(
                    Conversation.id == request.conversation_id,
                    Conversation.user_id == user_id,
                    Conversation.agent_id == agent.id,
                )
            )
            conversation = result.scalar_one_or_none()
            if conversation is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation not found",
                )
            return conversation

        # Auto-title from first 80 chars of the message
        title = request.message[:80]
        conversation = Conversation(
            agent_id=agent.id,
            user_id=user_id,
            title=title,
        )
        self.db.add(conversation)
        await self.db.flush()
        return conversation
