import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from app.api.routes import create_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

logger = logging.getLogger(__name__)


def custom_openapi(app: FastAPI) -> dict:
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    for operation in (
        operation
        for path in schema["paths"].values()
        for operation in path.values()
        if isinstance(operation, dict)
    ):
        if operation.get("security"):
            operation.setdefault("responses", {}).setdefault(
                "401",
                {
                    "description": "Authentication required",
                },
            )

    app.openapi_schema = schema
    return schema


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Agent Platform",
        version="0.1.0",
        description="Backend API for the AI Agent SaaS Platform",
    )

    allowed_methods: dict[str, set[str]] = {}

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        if exc.status_code != 405:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=exc.headers)
        methods: set[str] = set()
        for path, methods_for_path in allowed_methods.items():
            template_parts = path.strip("/").split("/")
            request_parts = request.url.path.strip("/").split("/")
            matches = len(template_parts) == len(request_parts) and all(
                template_part.startswith("{") or template_part == request_part
                for template_part, request_part in zip(template_parts, request_parts)
            )
            if matches:
                methods.update(methods_for_path)
        return JSONResponse(
            status_code=405,
            content={"detail": "Method Not Allowed"},
            headers={"Allow": ", ".join(sorted(methods))},
        )

    router = create_router()
    app.include_router(router)
    app.openapi = lambda: custom_openapi(app)  # type: ignore[method-assign]
    allowed_methods.update(
        {
            path: {method.upper() for method in operations if method != "parameters"}
            for path, operations in app.openapi().get("paths", {}).items()
        }
    )
    allowed_methods.update(
        {
            "/api/v1/agents": {"GET", "POST"},
            "/api/v1/agents/{agent_id}": {"GET", "PATCH", "DELETE"},
            "/api/v1/agents/{agent_id}/conversations": {"GET", "POST"},
            "/api/v1/agents/{agent_id}/conversations/{conversation_id}": {"GET", "DELETE"},
            "/api/v1/agents/{agent_id}/documents": {"GET", "POST"},
            "/api/v1/agents/{agent_id}/documents/{document_id}": {"GET", "DELETE"},
            "/api/v1/tools": {"GET", "POST"},
            "/api/v1/tools/{tool_id}": {"GET", "PATCH", "DELETE"},
            "/api/v1/tools/{tool_id}/agents/{agent_id}": {"PUT", "DELETE"},
        }
    )

    return app


app = create_app()
    