import math
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.rag.embeddings import (
    EmbeddingProvider,
    OpenAIEmbeddingProvider,
)


class RAGKnowledgeBase:
    """Simple retrieval layer for agent-specific knowledge bases."""

    def __init__(
        self,
        db: AsyncSession | None,
        embedding_provider: EmbeddingProvider | None = None,
    ):
        self.db = db
        self.embedding_provider = embedding_provider

    @staticmethod
    def _dot_product(left: list[float], right: list[float]) -> float:
        return sum(a * b for a, b in zip(left, right, strict=False))

    @staticmethod
    def _magnitude(vector: list[float]) -> float:
        return math.sqrt(sum(value * value for value in vector))

    @staticmethod
    def rank_chunks(
        query_embedding: list[float],
        chunks: list[dict[str, Any]],
        limit: int = 5,
        similarity_threshold: float = 0.0,
    ) -> list[dict[str, Any]]:
        if limit <= 0:
            return []
        if not 0.0 <= similarity_threshold <= 1.0:
            raise ValueError("similarity_threshold must be between 0 and 1")

        ranked: list[tuple[float, dict[str, Any]]] = []
        for chunk in chunks:
            embedding = chunk.get("embedding") or []
            if not embedding:
                continue
            numerator = RAGKnowledgeBase._dot_product(query_embedding, embedding)
            denominator = (
                RAGKnowledgeBase._magnitude(query_embedding)
                * RAGKnowledgeBase._magnitude(embedding)
            )
            score = numerator / denominator if denominator else 0.0
            if score < similarity_threshold:
                continue
            ranked.append((score, chunk))

        ranked.sort(key=lambda item: item[0], reverse=True)
        return [chunk for _, chunk in ranked[:limit]]

    async def retrieve(
        self,
        agent_id: uuid.UUID,
        query: str,
        limit: int = 5,
        similarity_threshold: float = 0.0,
        query_embedding: list[float] | None = None,
    ) -> list[str]:
        if self.db is None:
            return []
        if limit <= 0:
            return []
        if not 0.0 <= similarity_threshold <= 1.0:
            raise ValueError("similarity_threshold must be between 0 and 1")

        from app.models.document import DocumentChunk

        if query_embedding is None:
            provider = self.embedding_provider or OpenAIEmbeddingProvider()
            query_embeddings = await provider.embed([query])
            if not query_embeddings:
                return []
            query_embedding = query_embeddings[0]
        distance = DocumentChunk.embedding.cosine_distance(query_embedding)
        result = await self.db.execute(
            select(DocumentChunk)
            .where(
                DocumentChunk.agent_id == agent_id,
                distance <= 1.0 - similarity_threshold,
            )
            .order_by(distance)
            .limit(limit)
        )
        chunks = result.scalars().all()
        if not chunks:
            return []

        return [chunk.content for chunk in chunks if chunk.content]

