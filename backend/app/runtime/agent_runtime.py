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
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.conversation import Conversation
from app.models.message import Message, MessageRole
from app.models.tool import AgentTool, Tool
from app.models.skill import AgentSkill, Skill
from app.runtime.context import ConversationContext, RuntimeExecutionContext
from app.runtime.activation import SkillActivationPolicy, is_valid_tool_schema
from app.runtime.llm import LLMComponent
from app.runtime.rag import RAGKnowledgeBase
from app.runtime.skills import rank_skills
from app.rag.embeddings import EmbeddingProvider, OpenAIEmbeddingProvider
from app.runtime.tools import execute_tool, tool_registry

logger = logging.getLogger(__name__)
RAG_FALLBACK_SIMILARITY_THRESHOLD = 0.15


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

    def __init__(self, db: AsyncSession, embedding_provider: EmbeddingProvider | None = None):
        self.db = db
        self.llm = LLMComponent()
        self.embedding_provider = embedding_provider

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
        execution_context = RuntimeExecutionContext(
            agent_instructions=agent.system_prompt,
            conversation_messages=context.to_messages_list(),
        )

        logger.debug(
            "LLM input prepared conversation_id=%s history_length=%d",
            conversation.id,
            context.get_history_length(),
        )

        # Step 4: Retrieve relevant RAG chunks for this agent and inject them into context
        provider = self.embedding_provider or OpenAIEmbeddingProvider()
        query_embedding: list[float] | None = None
        try:
            embeddings = await provider.embed([user_message])
            query_embedding = embeddings[0] if embeddings else None
        except Exception as exc:
            logger.warning("User message embedding failed conversation_id=%s reason=%s", conversation.id, exc)

        rag_context = []
        if query_embedding is not None:
            knowledge_base = RAGKnowledgeBase(self.db, provider)
            rag_context = await knowledge_base.retrieve(
                agent.id,
                user_message,
                limit=agent.rag_top_k,
                similarity_threshold=agent.rag_similarity_threshold,
                query_embedding=query_embedding,
            )
            if not rag_context and agent.rag_similarity_threshold > RAG_FALLBACK_SIMILARITY_THRESHOLD:
                rag_context = await knowledge_base.retrieve(
                    agent.id,
                    user_message,
                    limit=agent.rag_top_k,
                    similarity_threshold=RAG_FALLBACK_SIMILARITY_THRESHOLD,
                    query_embedding=query_embedding,
                )
                if rag_context:
                    logger.info(
                        "RAG fallback retrieval used agent_id=%s threshold=%s chunks=%d",
                        agent.id,
                        RAG_FALLBACK_SIMILARITY_THRESHOLD,
                        len(rag_context),
                    )
        execution_context.retrieved_knowledge = rag_context

        active_skills = await self._load_relevant_skills(agent, query_embedding)
        execution_context.activated_skill_instructions = [
            f"Skill: {skill.name} (version {skill.version})\n{skill.instructions}"
            for skill in active_skills
        ]

        enabled_tools_result = await self.db.execute(
            select(Tool).join(AgentTool).where(
                AgentTool.agent_id == agent.id,
                AgentTool.enabled.is_(True),
                Tool.enabled.is_(True),
            )
        )
        enabled_tools = [
            tool
            for tool in enabled_tools_result.scalars().all()
            if is_valid_tool_schema(tool.input_schema)
            and is_valid_tool_schema(tool.output_schema)
            and tool_registry.get(tool.execution_logic) is not None
        ]
        tool_definitions = [
            {
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.input_schema,
            }
            for tool in enabled_tools
        ]
        execution_context.available_tools = tool_definitions
        messages = execution_context.to_llm_messages()
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

    async def _load_relevant_skills(
        self, agent: Agent, query_embedding: list[float] | None
    ) -> list[Skill]:
        if query_embedding is None or agent.skills_top_k <= 0:
            return []
        result = await self.db.execute(
            select(
                Skill.id,
                Skill.name,
                Skill.embedding,
                Skill.version,
                Skill.required_tool_names,
            )
            .join(AgentSkill)
            .where(
                AgentSkill.agent_id == agent.id,
                AgentSkill.enabled.is_(True),
                Skill.enabled.is_(True),
                Skill.status == "published",
                Skill.visibility == "global",
                Skill.scope == "global",
                Skill.embedding.is_not(None),
            )
            .order_by(Skill.id.asc())
        )
        candidates = [
            {
                "id": row.id,
                "name": row.name,
                "embedding": row.embedding,
                "version": row.version,
                "required_tool_names": row.required_tool_names,
            }
            for row in result.all()
        ]
        selected = rank_skills(
            query_embedding,
            candidates,
            limit=agent.skills_top_k,
            similarity_threshold=agent.skills_similarity_threshold,
        )
        selected_ids = [candidate["id"] for candidate in selected]
        if not selected_ids:
            return []

        full_result = await self.db.execute(
            select(Skill).join(AgentSkill).where(
                Skill.id.in_(selected_ids),
                AgentSkill.agent_id == agent.id,
                AgentSkill.enabled.is_(True),
                Skill.enabled.is_(True),
            )
        )
        skills_by_id = {skill.id: skill for skill in full_result.scalars().all()}
        active: list[Skill] = []
        activation_policy = SkillActivationPolicy(self.db)
        for selected_skill in selected:
            skill = skills_by_id.get(selected_skill["id"])
            if skill is None:
                continue
            logger.info(
                "Skill discovered skill_id=%s score=%s version=%s required_tools=%s",
                skill.id,
                selected_skill["similarity_score"],
                skill.version,
                skill.required_tool_names,
            )
            decision = await activation_policy.evaluate(agent, skill)
            if not decision.allowed:
                logger.warning(
                    "Skill activation rejected skill_id=%s version=%s reason=%s missing_tools=%s",
                    skill.id,
                    skill.version,
                    decision.reason,
                    decision.missing_tools,
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
