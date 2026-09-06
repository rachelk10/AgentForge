---
name: "Backend Engineering Guidelines"
description: "Use when modifying the backend FastAPI API, services, SQLAlchemy models, Pydantic schemas, runtime, RAG, migrations, or backend tests."
applyTo: "backend/**"
---
# Backend Engineering Guidelines

- Keep API routers under `backend/app/api/` thin: parse requests, resolve dependencies, call a service, and return the response. Put business rules, authorization, and resource ownership checks in `backend/app/services/`.
- Preserve the layer boundaries: SQLAlchemy models belong in `backend/app/models/`, Pydantic contracts in `backend/app/schemas/`, database/session setup in `backend/app/database.py`, shared text processing in `backend/app/rag/`, and chat orchestration in `backend/app/runtime/`.
- Use `async` APIs for routes, services, database access, LLM calls, and embedding calls. Use UUID identifiers and explicit type hints consistent with neighboring code.
- Scope every user-owned resource query by the authenticated user. Check ownership across nested resources, including agent, conversation, document, skill, and tool relationships; do not rely on client-provided ownership IDs.
- Keep routes under `/api/v1` except for the intentional unprefixed `/health` endpoint. Preserve FastAPI response models, status codes, and OpenAPI behavior when changing endpoints.
- Treat database schema changes as Alembic migrations in `backend/migrations/versions/`. Make migrations reversible where practical and keep model, schema, and migration changes consistent.
- Keep external providers injectable so tests can use fakes or stubs. Never hard-code or expose values from `.env`, API keys, JWT secrets, database credentials, or other secrets.
- Tool metadata stored in the database is declarative only. Runtime tool execution must use handlers registered in the process-local registry; do not execute database strings as code.
- Reuse shared RAG chunking, cleaning, embedding, and retrieval utilities instead of duplicating text-processing logic in document services or runtime components.
- Add or update focused `pytest` and `pytest-asyncio` coverage for behavior changes, especially authorization, nested-resource ownership, migrations, provider failures, and runtime orchestration. Prefer lightweight fakes over live OpenAI or PostgreSQL dependencies in unit tests.
- Run backend checks from `backend/`: `py -m pytest tests -q`; when schema changes are involved, also run `py -m alembic upgrade head` against the configured development database.
