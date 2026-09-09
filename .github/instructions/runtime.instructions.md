---
name: "Agent Runtime Engineering"
description: "Use when modifying the agent execution runtime, LLM orchestration, conversation context, RAG retrieval, skill ranking, tool execution, or builtin tools under backend/app/runtime."
applyTo: "backend/app/runtime/**"
---
# Agent Runtime Guidelines

- Keep `agent_runtime.py` as the orchestration layer. Delegate conversation context, LLM-provider interaction, retrieval, skill ranking, and tool execution to their dedicated runtime modules.
- Keep provider-specific behavior isolated. Inject replaceable dependencies such as database sessions and embedding providers through constructors or function parameters so tests can use fakes without network access.
- Use `async` APIs for database, LLM, embedding, subprocess, and other I/O. Run unavoidable synchronous handlers with `asyncio.to_thread()` and bound external work with an explicit timeout.
- Preserve agent scoping for runtime data. Retrieval must filter by the active `agent_id`; enabled tools and skills must be joined through their enabled agent associations.
- Treat persisted tool metadata as declarative only. Resolve executable handlers exclusively through the process-local `tool_registry`; never evaluate stored execution strings as code.
- Validate tool inputs before execution and outputs before returning them. Expected tool failures, including timeouts, should be logged and returned as `ToolResult(success=False, ...)`, rather than crashing the chat flow.
- Keep LLM messages in the provider's expected structured format. Add RAG and skill instructions as system messages without mutating the persisted conversation history.
- Use module loggers and structured fields such as `agent_id`, `conversation_id`, counts, and `duration_ms`; never log secrets or full sensitive prompts/documents.
- Add focused async tests using fake providers or registered test handlers for runtime behavior changes; do not call live external services in unit tests.
