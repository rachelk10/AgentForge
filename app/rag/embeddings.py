from collections.abc import Sequence
from typing import Protocol

from openai import AsyncOpenAI

from app.config import settings


class EmbeddingProvider(Protocol):
    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        ...


class OpenAIEmbeddingProvider:
    def __init__(
        self,
        client: AsyncOpenAI | None = None,
        model: str | None = None,
    ) -> None:
        self.client = client or AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = model or settings.embedding_model

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []

        response = await self.client.embeddings.create(
            model=self.model,
            input=list(texts),
        )
        return [item.embedding for item in sorted(response.data, key=lambda item: item.index)]
