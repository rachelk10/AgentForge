# AgentForge contributor guidance

## Project shape

AgentForge is an async FastAPI backend for configurable AI agents. Keep the existing boundaries intact:

- `app/api/`: thin routers, request parsing, dependency injection, and response models.
- `app/services/`: application use cases, authorization/ownership checks, and transaction boundaries.
- `app/models/`: SQLAlchemy ORM models and relationships.
- `app/schemas/`: Pydantic request/response validation.
- `app/runtime/`: agent execution orchestration and runtime components.
- `app/rag/`: shared text chunking and embedding providers.
- `migrations/`: Alembic schema history.
- `tests/`: pytest unit and in-process API tests.

Read [Specification.txt](Specification.txt) for the product scope. For runtime decisions and extension points, see [docs/phase_6/RUNTIME_ARCHITECTURE.md](docs/phase_6/RUNTIME_ARCHITECTURE.md); for tool registration and execution, see [docs/phase_8/TOOLS_ARCHITECTURE.md](docs/phase_8/TOOLS_ARCHITECTURE.md).

## Development workflow

- Run commands from the repository root (`AgentForge/`).
- Install dependencies from `requirements.txt`; the supported local environment is Python with the project virtual environment in `.venv/`.
- Set `DATABASE_URL`, `SECRET_KEY`, and `OPENAI_API_KEY` in an uncommitted `.env` before importing application settings. Use PostgreSQL with pgvector for the normal integration environment; `docker compose up --build -d` starts the database and API services.
- Run the fast suite with `pytest tests -q` (or `.\.venv\Scripts\python.exe -m pytest tests -q` on Windows).
- For schema changes, add an Alembic revision and verify it against the configured database; do not edit an already-applied migration. The migration environment imports all models through `app.models` for autogeneration.
- For full API contract coverage, follow [docs/API_TESTING.md](docs/API_TESTING.md). The Schemathesis runner is `scripts/run_api_tests.ps1`.

## Coding conventions

- Use Python type hints, async functions for database/API I/O, and the existing SQLAlchemy 2.x `Mapped`/`select` style.
- Inject sessions and replaceable providers through constructors or FastAPI dependencies. Avoid new module-level clients or database sessions in business logic.
- Keep routers thin: resolve the current user, validate the agent/resource relationship, delegate to a service, and return a schema/model response.
- Preserve ownership and visibility checks when adding or changing endpoints. User-owned agents/documents/conversations must not be readable through another user’s IDs; admin-only catalog operations must use the existing admin dependency.
- Commit and refresh ORM objects consistently with neighboring services. Convert `IntegrityError` into the project’s established HTTP error responses where appropriate.
- Reuse `app.rag` helpers for text cleaning/chunking rather than creating competing implementations. RAG retrieval is agent-scoped and uses cosine similarity thresholds and top-k settings from the agent.
- Treat `AgentRuntime` as the orchestration layer: keep provider-specific behavior in `app/runtime/llm.py`, retrieval in `app/runtime/rag.py`, tool execution in `app/runtime/tools.py`, and skill ranking in `app/runtime/skills.py`.
- Tool metadata is persisted, but handlers are registered in the process-local `tool_registry`; validate input/output schemas and retain execution timeouts and failure-as-result behavior.
- Keep secrets out of source control and do not log API keys, tokens, prompts containing sensitive data, or full document contents unnecessarily.

## Change validation

For behavior changes, add or update focused tests under `tests/`, then run the relevant test file and the full fast suite. For API changes, verify OpenAPI paths and authentication/ownership behavior; for model changes, verify migrations and relationship cascades. Prefer deterministic fake embedding/LLM clients in unit tests over network calls.

When a test import fails because settings are initialized eagerly, check the `.env`/environment configuration first rather than weakening application validation. Do not commit generated caches, local databases, virtual environments, or `.env` files; see [.gitignore](.gitignore).
