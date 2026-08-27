"""add semantic Skill retrieval fields

Revision ID: e1f2a3b4c5d6
Revises: d0f1a2b3c4d5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("skills_top_k", sa.Integer(), server_default="3", nullable=False))
    op.add_column(
        "agents",
        sa.Column("skills_similarity_threshold", sa.Float(), server_default="0.75", nullable=False),
    )
    op.add_column("skills", sa.Column("embedding", Vector(1536), nullable=True))
    op.add_column("skills", sa.Column("embedding_source_hash", sa.String(64), nullable=True))
    op.create_index(
        "ix_skills_embedding_hnsw",
        "skills",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_skills_embedding_hnsw", table_name="skills")
    op.drop_column("skills", "embedding_source_hash")
    op.drop_column("skills", "embedding")
    op.drop_column("agents", "skills_similarity_threshold")
    op.drop_column("agents", "skills_top_k")