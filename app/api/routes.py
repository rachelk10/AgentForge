from fastapi import APIRouter

from app.api import agents, auth, chat, conversations


def create_router() -> APIRouter:
    router = APIRouter()

    @router.get("/health", tags=["Health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    router.include_router(auth.router, prefix="/api/v1")
    router.include_router(agents.router, prefix="/api/v1")
    router.include_router(conversations.router, prefix="/api/v1")
    router.include_router(chat.router, prefix="/api/v1")

    return router