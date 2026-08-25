"""Agent Runtime

Central orchestration layer for Agent execution.

Architecture:
    Chat API
       ↓
    Agent Runtime (this module)
       ↓
    Context Loader
       ↓
    LLM Component
       ↓
    Response

This layer is designed to be easily extensible for future additions:
- RAG (Retrieval-Augmented Generation)
- Tools execution
- Skills execution
- MCP server integration
"""

import logging
import re
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.conversation import Conversation
from app.models.message import Message, MessageRole
from app.models.tool import AgentTool, Tool
from app.models.skill import AgentSkill, Skill
from app.runtime.context import ConversationContext
from app.runtime.llm import LLMComponent
from app.runtime.rag import RAGKnowledgeBase
from app.runtime.tools import execute_tool

logger = logging.getLogger(__name__)


class AgentRuntime:
    """Central runtime for executing agents.
    
    Responsibilities:
    - Orchestrate the conversation flow
    - Load and manage conversation context
    - Call LLM and other components
    - Persist results
    
    Future responsibilities (slots already prepared):
    - RAG integration
    - Tool execution
    - Skill execution
    - MCP integration
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.llm = LLMComponent()

    async def process_message(
        self,
        agent: Agent,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
        user_message: str,
    ) -> tuple[Conversation, Message]:
        """Process a user message and generate agent response.
        
        Main flow:
        1. Load/create conversation
        2. Load conversation context
        3. Add user message to context
        4. Generate LLM response
        5. Persist messages
        6. Return conversation and response
        
        Args:
            agent: The agent to process the message with
            user_id: ID of the user sending the message
            conversation_id: Existing conversation ID (None to create new)
            user_message: The user's message text
            
        Returns:
            Tuple of (conversation, assistant_message)
        """
        logger.info(
            "Processing message agent_id=%s user_id=%s conversation_id=%s",
            agent.id,
            user_id,
            conversation_id,
        )

        # Step 1: Get or create conversation
        conversation = await self._get_or_create_conversation(
            agent, user_id, conversation_id
        )

        # Step 2: Load conversation context
        context = await ConversationContext(self.db, conversation.id).load()

        # Step 3: Prepare messages for LLM
        user_msg = context.add_user_message(user_message)
        messages = context.to_messages_list() 

        logger.debug(
            "LLM input prepared conversation_id=%s history_length=%d",
            conversation.id,
            context.get_history_length(),
        )

        # Step 4: Retrieve relevant RAG chunks for this agent and inject them into context
        rag_context = await RAGKnowledgeBase(self.db).retrieve(
            agent.id,
            user_message,
            limit=agent.rag_top_k,
            similarity_threshold=agent.rag_similarity_threshold,
        )
        if rag_context:
            knowledge_context = "\n\n".join(rag_context)
            messages = [
                {"role": "system", "content": f"Use the following knowledge base context when relevant:\n\n{knowledge_context}"},
                *messages,
            ]

        active_skills = await self._load_relevant_skills(agent, user_message)
        if active_skills:
            skill_context = "\n\n".join(
                f"Skill: {skill.name} (version {skill.version})\n{skill.instructions}"
                for skill in active_skills
            )
            messages = [
                {"role": "system", "content": f"Apply these relevant skills when appropriate:\n\n{skill_context}"},
                *messages,
            ]

        enabled_tools_result = await self.db.execute(
            select(Tool).join(AgentTool).where(
                AgentTool.agent_id == agent.id,
                AgentTool.enabled.is_(True),
                Tool.enabled.is_(True),
                Tool.owner_id == agent.owner_id,
            )
        )
        enabled_tools = list(enabled_tools_result.scalars().all())
        tool_definitions = [
            {
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema,
            }
            for tool in enabled_tools
        ]
        tools_by_name = {tool.name: tool for tool in enabled_tools}

        async def execute_agent_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
            tool = tools_by_name.get(name)
            if tool is None:
                return {"success": False, "error": "Tool is not enabled for this agent"}
            result = await execute_tool(tool, arguments)
            return result.model_dump()

        # Step 5: Call LLM
        assistant_content = await self.llm.generate_response(
            agent,
            messages,
            tools=tool_definitions or None,
            tool_executor=execute_agent_tool if enabled_tools else None,
        )

        # Step 6: Persist messages
        assistant_msg = Message(
            conversation_id=conversation.id,
            role=MessageRole.ASSISTANT,
            content=assistant_content,
        )

        await context.save_messages(user_msg, assistant_msg)

        logger.info(
            "Message processed successfully conversation_id=%s",
            conversation.id,
        )

        return conversation, assistant_msg

    async def _load_relevant_skills(self, agent: Agent, user_message: str) -> list[Skill]:
        result = await self.db.execute(
            select(Skill.id, Skill.name, Skill.description, Skill.skill_metadata).join(AgentSkill).where(
                AgentSkill.agent_id == agent.id,
                AgentSkill.enabled.is_(True),
                Skill.enabled.is_(True),
                Skill.owner_id == agent.owner_id,
            )
        )
        skill_metadata = list(result.all())
        request_terms = set(re.findall(r"[a-z0-9]+", user_message.lower()))
        active: list[Skill] = []
        for metadata in skill_metadata:
            metadata_terms = " ".join(str(value) for value in (metadata.skill_metadata or {}).values())
            searchable = f"{metadata.name} {metadata.description} {metadata_terms}".lower()
            searchable_terms = set(re.findall(r"[a-z0-9]+", searchable))
            logger.info("Skill metadata checked skill_id=%s", metadata.id)
            if not request_terms.intersection(searchable_terms):
                continue
            full_result = await self.db.execute(
                select(Skill).join(AgentSkill).where(
                    Skill.id == metadata.id,
                    AgentSkill.agent_id == agent.id,
                    AgentSkill.enabled.is_(True),
                    Skill.enabled.is_(True),
                    Skill.owner_id == agent.owner_id,
                )
            )
            skill = full_result.scalar_one_or_none()
            if skill is None:
                continue
            logger.info(
                "Skill checked skill_id=%s version=%s required_tools=%s",
                skill.id,
                skill.version,
                skill.required_tool_names,
            )
            missing_tools = await self._missing_skill_tools(skill, agent.id)
            if missing_tools:
                logger.warning(
                    "Skill rejected skill_id=%s version=%s reason=required_tools_unavailable tools=%s",
                    skill.id,
                    skill.version,
                    missing_tools,
                )
                continue
            active.append(skill)
            logger.info("Skill activated skill_id=%s version=%s", skill.id, skill.version)
        return active

    async def _missing_skill_tools(self, skill: Skill, agent_id: uuid.UUID) -> list[str]:
        if not skill.required_tool_names:
            return []
        result = await self.db.execute(
            select(Tool.name).join(AgentTool).where(
                Tool.name.in_(skill.required_tool_names),
                Tool.owner_id == skill.owner_id,
                Tool.enabled.is_(True),
                AgentTool.agent_id == agent_id,
                AgentTool.enabled.is_(True),
            )
        )
        return sorted(set(skill.required_tool_names) - set(result.scalars().all()))

    async def _get_or_create_conversation(
        self,
        agent: Agent,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
    ) -> Conversation:
        """Get existing conversation or create new one.
        
        Args:
            agent: The agent
            user_id: ID of the user
            conversation_id: Existing conversation ID (None to create new)
            
        Returns:
            Conversation object
            
        Raises:
            HTTPException: If conversation not found or doesn't belong to user
        """
        if conversation_id is not None:
            result = await self.db.execute(
                select(Conversation).where(
                    Conversation.id == conversation_id,
                    Conversation.user_id == user_id,
                    Conversation.agent_id == agent.id,
                )
            )
            conversation = result.scalar_one_or_none()

            if conversation is None:
                from fastapi import HTTPException, status

                logger.warning(
                    "Conversation not found conversation_id=%s user_id=%s",
                    conversation_id,
                    user_id,
                )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation not found",
                )

            return conversation

        # Create new conversation
        conversation = Conversation(
            agent_id=agent.id,
            user_id=user_id,
        )
        self.db.add(conversation)
        await self.db.commit()
        await self.db.refresh(conversation)

        logger.info(
            "New conversation created conversation_id=%s agent_id=%s",
            conversation.id,
            agent.id,
        )

        return conversation
