# AgentForge

## Repository shape

- `backend/` is an async FastAPI service using SQLAlchemy, PostgreSQL, and pgvector.
- `frontend/` is a separate React/Vite admin and end-to-end test client. Run it independently; there is no Vite API proxy.
- The product scope and intended future capabilities are documented in [backend/Specification.txt](backend/Specification.txt).

## Architecture

- API routers live in `backend/app/api/` and should stay thin.
- Business logic, resource ownership checks, and authorization belong in `backend/app/services/`.
- SQLAlchemy models are in `backend/app/models/`; Pydantic request/response contracts are in `backend/app/schemas/`.
- Database engine and sessions are centralized in `backend/app/database.py`; schema changes use Alembic migrations in `backend/migrations/`.
- Chat flows from the router through `ChatService` and `AgentRuntime`, then through context, RAG, skills/tools, and the LLM components.
- Tool metadata stored in the database is not executable by itself. Runtime handlers must be registered in the process-local tool registry.
- Shared text processing belongs in `backend/app/rag/`; document services should delegate chunking and embedding work there.

## Development commands

Run backend commands from `backend/`, where `.env` is loaded:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
.\.venv\Scripts\python.exe -m pytest tests -q
```

Run the frontend from `frontend/`:

```powershell
npm install
npm run dev
npm run build
npm run preview
```

For live authenticated OpenAPI coverage, start Compose and run `backend/scripts/run_api_tests.ps1`. Set `$env:API_BASE_URL` to target a non-default API. Stop services with `docker compose down`.

## Implementation conventions

- Prefer async functions for API, service, database, LLM, and embedding code.
- Use UUID identifiers and type hints.
- Keep API routes under `/api/v1`; `/health` is intentionally unprefixed.
- Enforce user and agent ownership in services, including nested resources and conversation/agent relationships.
- Prefer dependency injection for database and provider dependencies so tests can use fakes or stubs.
- Add focused pytest coverage for behavior changes. Existing tests use `pytest`, `pytest-asyncio`, and lightweight fakes; no frontend test or lint script is configured.
- Frontend API calls belong in `frontend/src/api/api.js`; current UI state and orchestration are concentrated in `frontend/src/App.jsx` and styling in `frontend/src/index.css`.

## Environment pitfalls

- `backend/app/config.py` requires `DATABASE_URL`, `SECRET_KEY`, and `OPENAI_API_KEY` when imported. Never commit or expose `.env` secrets.
- When FastAPI runs locally, use a database URL with host `localhost` or `127.0.0.1`. The Compose database hostname `db` only resolves when the app also runs inside Compose.
- Compose startup runs migrations and skill-embedding backfill before Uvicorn, so it needs database connectivity and a working OpenAI key.
- Document upload, RAG, and semantic skill retrieval require OpenAI embeddings and pgvector.
- The frontend defaults to `http://localhost:8000/api/v1`; override it with `VITE_API_BASE_URL`. CORS currently allows `http://localhost:5173`.

## Useful references

- [API testing workflow](backend/docs/API_TESTING.md)
- [Runtime architecture](backend/docs/phase_6/RUNTIME_ARCHITECTURE.md)
- [Integration testing flow](backend/docs/phase_6/TESTING_INTEGRATION.md)
- [Tools architecture](backend/docs/phase_8/TOOLS_ARCHITECTURE.md)
- [FastAPI application setup](backend/app/main.py)
- [Runtime orchestration](backend/app/runtime/agent_runtime.py)
- [Ownership-scoped service example](backend/app/services/agent.py)