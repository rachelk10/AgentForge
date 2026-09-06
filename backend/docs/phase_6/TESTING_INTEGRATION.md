"""
Integration Test Helper

This file documents the integration flow for Stage 6 only.
It describes the current runtime foundation and a basic validation path
for the Agent Runtime implementation. It is not a full end-to-end test suite
for the entire application.

Note: This document refers only to the initial Stage 6 architecture.
It covers the current message flow through the runtime and LLM integration,
while future capabilities such as RAG, tools, skills, and MCP remain planned.

Run the following to test:
1. Start the server: uvicorn app.main:app --reload
2. Register a user
3. Create an agent
4. Send a chat message
5. Verify response is received

Expected Flow:
POST /agents/{agent_id}/chat
  ↓ (ChatRequest with message and optional conversation_id)
Chat Endpoint (app/api/chat.py)
  ↓
ChatService.chat() (app/services/chat.py)
  ↓
AgentRuntime.process_message() (app/runtime/agent_runtime.py)
  ├─ _get_or_create_conversation()
  ├─ ConversationContext.load() (app/runtime/context.py)
  ├─ LLMComponent.generate_response() (app/runtime/llm.py)
  └─ Persist messages
  ↓
ChatResponse with conversation_id and message
"""

# Example curl command to test:
# curl -X POST http://localhost:8000/agents/{agent_id}/chat \
#   -H "Authorization: Bearer {token}" \
#   -H "Content-Type: application/json" \
#   -d '{"message": "Hello, agent!", "conversation_id": null}'
