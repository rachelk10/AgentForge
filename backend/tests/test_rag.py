import uuid
from types import SimpleNamespace

import pytest

from app.runtime.rag import RAGKnowledgeBase
from app.rag import OpenAIEmbeddingProvider, chunk_text, clean_text
from app.services.document import DocumentService


@pytest.mark.asyncio
async def test_document_service_chunks_and_embeds_text() -> None:
    service = DocumentService(db=None)  # type: ignore[arg-type]

    text = "Sentence one about sales. Sentence two about support. Sentence three about onboarding."
    chunks = service.chunk_text(text, chunk_size=8, overlap=2)

    assert len(chunks) >= 2
    assert all(chunk.strip() for chunk in chunks)

def test_rag_utilities_are_shared_with_document_service() -> None:
    text = "  First   paragraph\nSecond paragraph  "

    assert DocumentService.clean_text(text) == clean_text(text)
    assert DocumentService.chunk_text(text, chunk_size=2, overlap=0) == chunk_text(
        text,
        chunk_size=2,
        overlap=0,
    )
def test_text_extraction_always_returns_text() -> None:
    extracted = DocumentService.extract_text_from_bytes("notes.txt", b"hello")

    assert extracted == "hello"
    assert isinstance(extracted, str)


@pytest.mark.asyncio
async def test_openai_embedding_provider_returns_embeddings_in_index_order() -> None:
    response = SimpleNamespace(
        data=[
            SimpleNamespace(index=1, embedding=[0.2, 0.3]),
            SimpleNamespace(index=0, embedding=[0.1, 0.2]),
        ]
    )

    class FakeEmbeddings:
        async def create(self, **kwargs: object) -> object:
            assert kwargs["input"] == ["first text", "second text"]
            return response

    client = SimpleNamespace(embeddings=FakeEmbeddings())
    provider = OpenAIEmbeddingProvider(client=client)  # type: ignore[arg-type]

    embeddings = await provider.embed(["first text", "second text"])

    assert embeddings == [[0.1, 0.2], [0.2, 0.3]]


@pytest.mark.asyncio
async def test_rag_knowledge_base_retrieves_relevant_chunks() -> None:
    kb = RAGKnowledgeBase(db=None)  # type: ignore[arg-type]

    sample_chunks = [
        {"content": "The company policy is to refund orders within 30 days.", "embedding": [1.0, 0.0, 0.0]},
        {"content": "The welcome guide explains the onboarding checklist.", "embedding": [0.0, 1.0, 0.0]},
        {"content": "Customer support replies within 24 hours during business days.", "embedding": [0.0, 0.0, 1.0]},
    ]

    query_embedding = [1.0, 0.1, 0.0]

    results = kb.rank_chunks(query_embedding, sample_chunks, limit=2)

    assert results[0]["content"] == "The company policy is to refund orders within 30 days."
    assert len(results) == 2


def test_rag_rank_chunks_applies_similarity_threshold() -> None:
    chunks = [
        {"content": "strong", "embedding": [1.0, 0.0]},
        {"content": "weak", "embedding": [0.0, 1.0]},
    ]

    results = RAGKnowledgeBase.rank_chunks(
        [1.0, 0.0],
        chunks,
        limit=5,
        similarity_threshold=0.9,
    )

    assert [chunk["content"] for chunk in results] == ["strong"]
