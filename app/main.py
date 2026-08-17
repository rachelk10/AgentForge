import logging

from fastapi import FastAPI

from app.api.routes import create_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Agent Platform",
        version="0.1.0",
        description="Backend API for the AI Agent SaaS Platform",
    )

    router = create_router()
    app.include_router(router)

    return app


app = create_app()
    