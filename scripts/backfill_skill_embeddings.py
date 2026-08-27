"""Generate missing or stale Skill embeddings during deployment."""
import asyncio
import logging

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models.skill import Skill
from app.rag.embeddings import OpenAIEmbeddingProvider
from app.runtime.skills import skill_canonical_text, skill_embedding_source_hash

logger = logging.getLogger(__name__)


async def backfill() -> None:
    provider = OpenAIEmbeddingProvider()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Skill))
        for skill in result.scalars().all():
            source_hash = skill_embedding_source_hash(skill.name, skill.description, skill.skill_metadata)
            if skill.embedding is not None and skill.embedding_source_hash == source_hash:
                continue
            try:
                embeddings = await provider.embed(
                    [skill_canonical_text(skill.name, skill.description, skill.skill_metadata)]
                )
                if len(embeddings) != 1 or len(embeddings[0]) != 1536:
                    raise ValueError("Embedding provider returned an invalid result")
                skill.embedding = embeddings[0]
                skill.embedding_source_hash = source_hash
            except Exception as exc:
                skill.embedding = None
                skill.embedding_source_hash = None
                logger.warning("Skill embedding backfill failed skill_id=%s reason=%s", skill.id, exc)
        await db.commit()


if __name__ == "__main__":
    asyncio.run(backfill())