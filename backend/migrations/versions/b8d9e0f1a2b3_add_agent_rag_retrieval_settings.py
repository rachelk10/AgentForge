"""add per-agent RAG retrieval settings

Revision ID: b8d9e0f1a2b3
Revises: a7c8d9e0f1a2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "a7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("rag_top_k", sa.Integer(), server_default="5", nullable=False),
    )
    op.add_column(
        "agents",
        sa.Column(
            "rag_similarity_threshold",
            sa.Float(),
            server_default="0.75",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("agents", "rag_similarity_threshold")
    op.drop_column("agents", "rag_top_k")