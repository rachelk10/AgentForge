import hashlib
import json
import math
from typing import Any


DISCOVERY_METADATA_KEYS = ("keywords", "tags", "category", "domain", "examples", "triggers")


def skill_canonical_text(name: str, description: str, metadata: dict[str, Any] | None) -> str:
    discovery_metadata = {
        key: (metadata or {}).get(key)
        for key in DISCOVERY_METADATA_KEYS
        if key in (metadata or {})
    }
    relevant_metadata = json.dumps(
        discovery_metadata,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return f"{name}\n{description}\n{relevant_metadata}"


def skill_embedding_source_hash(name: str, description: str, metadata: dict[str, Any] | None) -> str:
    return hashlib.sha256(skill_canonical_text(name, description, metadata).encode("utf-8")).hexdigest()


def cosine_similarity(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right, strict=False))
    denominator = math.sqrt(sum(value * value for value in left)) * math.sqrt(
        sum(value * value for value in right)
    )
    return numerator / denominator if denominator else 0.0


def rank_skills(
    query_embedding: list[float],
    skills: list[dict[str, Any]],
    limit: int,
    similarity_threshold: float,
) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    if not 0.0 <= similarity_threshold <= 1.0:
        raise ValueError("similarity_threshold must be between 0 and 1")

    ranked = []
    for skill in skills:
        embedding = skill.get("embedding")
        if not embedding:
            continue
        score = cosine_similarity(query_embedding, embedding)
        if score >= similarity_threshold:
            ranked.append((score, skill))
    ranked.sort(key=lambda item: (-item[0], str(item[1]["id"])))
    return [skill for _, skill in ranked[:limit]]