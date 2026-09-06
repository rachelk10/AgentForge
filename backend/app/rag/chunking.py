import re


def clean_text(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text)
    return normalized.strip()


def chunk_text(text: str, chunk_size: int = 120, overlap: int = 30) -> list[str]:
    if not text.strip():
        return []

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than 0")

    if overlap < 0:
        raise ValueError("overlap cannot be negative")

    if overlap >= chunk_size:
        raise ValueError("overlap must be smaller than chunk_size")

    words = text.split()
    if len(words) <= chunk_size:
        return [" ".join(words)]

    chunks: list[str] = []
    step = chunk_size - overlap
    for start in range(0, len(words), step):
        end = min(start + chunk_size, len(words))
        chunks.append(" ".join(words[start:end]).strip())
        if end == len(words):
            break
    return chunks
