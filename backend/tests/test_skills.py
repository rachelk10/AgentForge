from app.runtime.skills import (
    rank_skills,
    skill_canonical_text,
    skill_embedding_source_hash,
)


def test_skill_ranking_applies_threshold_before_top_k() -> None:
    skills = [
        {"id": "strong", "embedding": [1.0, 0.0]},
        {"id": "weak", "embedding": [0.8, 0.6]},
        {"id": "irrelevant", "embedding": [0.0, 1.0]},
    ]

    selected = rank_skills([1.0, 0.0], skills, limit=2, similarity_threshold=0.95)

    assert [skill["id"] for skill in selected] == ["strong"]


def test_skill_ranking_supports_null_embeddings_and_semantic_languages() -> None:
    selected = rank_skills(
        [1.0, 0.0],
        [
            {"id": "missing", "embedding": None},
            {"id": "עברית", "embedding": [1.0, 0.0]},
        ],
        limit=3,
        similarity_threshold=0.75,
    )

    assert [skill["id"] for skill in selected] == ["עברית"]


def test_skill_hash_changes_only_for_canonical_fields() -> None:
    base = {"tags": ["support"], "runtime_endpoint": "/internal"}
    changed_discovery = {**base, "tags": ["sales"]}
    changed_runtime = {**base, "runtime_endpoint": "/other"}

    original = skill_embedding_source_hash("support", "ענה על שאלות", base)
    assert skill_embedding_source_hash("support", "ענה על שאלות", changed_discovery) != original
    assert skill_embedding_source_hash("support", "ענה על שאלות", changed_runtime) == original
    assert "instructions" not in skill_canonical_text("support", "ענה על שאלות", base)