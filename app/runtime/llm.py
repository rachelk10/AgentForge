"""LLM Component

Handles interaction with Large Language Models (currently OpenAI).
Future: Will support multiple LLM providers.
"""

import logging

from openai import AsyncOpenAI

from app.config import settings
from app.models.agent import Agent

logger = logging.getLogger(__name__)


class LLMComponent:
    """Manages LLM interactions.
    
    Responsibilities:
    - Send prompts to LLM
    - Handle model configuration
    - Parse LLM responses
    - Support multiple LLM providers (future)
    """

    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def generate_response(
        self,
        agent: Agent,
        messages: list[dict[str, str]],
    ) -> str:
        """Generate LLM response based on agent config and messages.
        
        Args:
            agent: Agent configuration
            messages: Conversation messages in OpenAI format
            
        Returns:
            LLM generated response text
            
        Raises:
            Exception: If LLM call fails
        """
        # Build request kwargs based on agent configuration
        call_kwargs: dict = {
            "model": agent.model,
            "input": messages,
            "temperature": agent.temperature,
        }

        if agent.system_prompt:
            call_kwargs["instructions"] = agent.system_prompt

        if agent.max_tokens is not None:
            call_kwargs["max_output_tokens"] = agent.max_tokens

        logger.info(
            "Calling LLM model=%s messages_count=%d",
            agent.model,
            len(messages),
        )

        response = await self.client.responses.create(**call_kwargs)
        assistant_content = response.output_text or ""

        logger.debug(
            "LLM response received model=%s output_length=%d",
            agent.model,
            len(assistant_content),
        )

        return assistant_content