# Agent Runtime Architecture

> Status: Stage 6 implementation note
>
> This document describes the initial Agent Runtime architecture introduced in Stage 6 only. It provides a foundation for future capabilities such as RAG, tools, skills, and MCP, and should not be interpreted as the final end-to-end architecture of the full system.

## Overview

Stage 6 introduces the **Agent Runtime / AI Core** as a central orchestration layer that separates business logic from API concerns.

The current implementation provides the foundation for the agent execution flow:

**message → context → LLM → response**

The architecture is intentionally modular so that additional capabilities can be integrated through clear extension points as the system evolves.

## Current Architecture

```text
┌─────────────────────────────────┐
│       Chat API Endpoint         │
│     POST /agents/{id}/chat      │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│          ChatService            │
│         (thin wrapper)          │
│     Delegates to Runtime        │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────┐
│             AgentRuntime                   │
│             (orchestration)                 │
│                                             │
│  process_message():                        │
│  1. Get/Create Conversation                 │
│  2. Load Context                            │
│  3. Prepare Messages                        │
│  4. Call LLM                                │
│  5. Persist Messages                        │
│  6. Return Response                         │
└────────────┬────────────────┬───────────────┘
             │                │
             ▼                ▼
┌─────────────────────┐  ┌──────────────────┐
│ ConversationContext │  │   LLMComponent   │
│                     │  │                  │
│ - Load history      │  │ - OpenAI API     │
│ - Format messages   │  │ - Agent config   │
│ - Context window    │  │ - Response       │
│   management        │  │                  │
│   (future)          │  │ - Providers      │
│ - Extension points  │  │   (future)       │
└─────────────────────┘  └──────────────────┘
```

## Message Flow

The current request flow is:

```text
1. User sends a message
        ↓
2. Chat API endpoint receives the request
        ↓
3. ChatService.chat() is called
        ↓
4. AgentRuntime.process_message() is called
        ↓
5. Conversation is loaded or created
        ↓
6. ConversationContext loads message history
        ↓
7. Messages are prepared for the LLM
        ↓
8. LLMComponent generates a response
        ↓
9. User and assistant messages are persisted
        ↓
10. Response is returned to the API layer
```

## Components

### 1. `app/runtime/agent_runtime.py` — AgentRuntime

**Main orchestration layer**

Responsibilities:

* `process_message()`: Central method that coordinates the execution flow
* Loads or creates conversations
* Coordinates context loading
* Calls the LLM component
* Persists conversation messages
* Provides extension points for future capabilities

AgentRuntime is responsible for **orchestration**, not for implementing the internal details of each capability.

### 2. `app/runtime/context.py` — ConversationContext

**Conversation context management**

Responsibilities:

* Loads message history from the database
* Formats messages for LLM input
* Provides a foundation for context-window management
* Provides extension points for RAG and additional contextual information
* Keeps conversation-related context logic separate from orchestration

### 3. `app/runtime/llm.py` — LLMComponent

**LLM interaction layer**

Responsibilities:

* Handles communication with the OpenAI API
* Configures the model according to agent settings
* Generates the assistant response
* Isolates LLM-specific implementation details from the runtime

Future support for multiple LLM providers can be added behind this component.

### 4. `app/services/chat.py` — ChatService

**Thin application service layer**

Responsibilities:

* Receives chat requests from the API layer
* Delegates processing to `AgentRuntime`
* Keeps API-facing service logic separate from runtime orchestration

The service intentionally remains thin because the actual agent execution flow belongs to the runtime layer.

## Design Principles

### Single Responsibility Principle

Each component has a clear responsibility:

* **AgentRuntime** — orchestrates the execution flow
* **ConversationContext** — manages conversation context
* **LLMComponent** — handles LLM interaction
* **ChatService** — provides the application-facing service boundary

This keeps individual components easier to understand, test, and maintain.

### Separation of Concerns

The architecture separates the system into distinct layers:

```text
API Layer
    ↓
Service Layer
    ↓
Runtime / Orchestration Layer
    ↓
Specialized Components
    ├── Context
    └── LLM
```

This prevents API concerns from becoming tightly coupled with agent execution logic.

### Dependency Injection

The runtime and its components receive their dependencies rather than creating them internally.

This makes the architecture easier to:

* Test with mocks or stubs
* Replace individual implementations
* Configure different runtime dependencies
* Extend the system without tightly coupling components

### Extensibility

The runtime provides clear extension points for future capabilities such as:

* **RAG** — retrieval and contextual augmentation
* **Tools** — external actions and function execution
* **Skills** — reusable agent capabilities
* **MCP** — Model Context Protocol integrations

These capabilities can be integrated into the runtime flow while keeping their implementation details isolated from the API layer.

The architecture is therefore **prepared for extension**, rather than claiming that all future capabilities can be added without any changes to existing code.

## Future Evolution

As additional agent capabilities are implemented, the runtime flow can evolve toward:

```text
User Message
     ↓
Conversation
     ↓
Load Context
     ↓
Retrieve Relevant Knowledge (RAG)
     ↓
Prepare Agent Context
     ↓
LLM Reasoning
     ↓
Tool / Skill Execution
     ↓
Additional LLM Calls if Required
     ↓
Final Response
     ↓
Persist Conversation
```

The exact execution flow will depend on the requirements of the future RAG, Tools, Skills, and MCP implementations.

A conceptual future implementation may look like:

```python
async def process_message(...):
    # 1. Get/create conversation
    conversation = await self._get_or_create_conversation(...)

    # 2. Load conversation context
    context = await self.context.load(...)

    # 3. [FUTURE] Retrieve relevant knowledge
    # context = await self.rag.retrieve(context, ...)

    # 4. [FUTURE] Prepare tool/skill context
    # context = await self.tools.prepare(context, ...)
    # context = await self.skills.prepare(context, ...)

    # 5. Call LLM
    response = await self.llm.generate_response(agent, context)

    # 6. [FUTURE] Execute tools/skills when requested
    # tool_results = await self.tools.execute(response, ...)
    # skill_results = await self.skills.execute(response, ...)

    # 7. [FUTURE] Continue the LLM flow if required
    # response = await self.llm.generate_response(...)

    # 8. Persist conversation
    await self._persist_messages(...)

    # 9. Return response
    return response
```

This code represents the intended extension direction, not the complete implementation of those future capabilities.

## Project Files

### New files introduced in Stage 6

```text
app/runtime/
├── __init__.py
├── agent_runtime.py
├── context.py
└── llm.py
```

### Updated files

```text
app/services/chat.py
```

The API layer remains unchanged and continues to use the existing chat service interface.

## Benefits

1. **Maintainability**
   Clear separation of responsibilities makes the codebase easier to understand and maintain.

2. **Testability**
   Individual components can be tested independently using mocked dependencies.

3. **Extensibility**
   The runtime provides clear integration points for future RAG, Tools, Skills, and MCP capabilities.

4. **Separation of Concerns**
   API, application services, orchestration, context management, and LLM interaction remain separated.

5. **Reusability**
   AgentRuntime can potentially be reused by other application entry points that need to execute agents.

6. **Scalability**
   The architecture provides a foundation for more advanced agent execution flows as the system grows.

## Stage 6 Scope

Stage 6 establishes the **initial Agent Runtime / AI Core foundation**.

The current implementation focuses on:

```text
Conversation
    ↓
Context Loading
    ↓
Message Preparation
    ↓
LLM Call
    ↓
Persistence
    ↓
Response
```

RAG, Tools, Skills, and MCP are **future capabilities** that the architecture is designed to accommodate, but they are not part of the current Stage 6 implementation.

---

**Stage 6 establishes the runtime foundation for the agent system while keeping the architecture modular and ready for future AI capabilities.**
