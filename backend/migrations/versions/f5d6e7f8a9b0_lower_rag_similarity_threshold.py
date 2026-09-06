"""lower RAG similarity threshold for multilingual queries

Revision ID: f5d6e7f8a9b0
Revises: f4c5d6e7f8a9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "f4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "agents",
        "rag_similarity_threshold",
        server_default=sa.text("0.30"),
    )
    op.execute(
        sa.text(
            "UPDATE agents SET rag_similarity_threshold = 0.30 "
            "WHERE rag_similarity_threshold = 0.45"
        )
    )


def downgrade() -> None:
    op.alter_column(
        "agents",
        "rag_similarity_threshold",
        server_default=sa.text("0.45"),
    )
    op.execute(
        sa.text(
            "UPDATE agents SET rag_similarity_threshold = 0.45 "
            "WHERE rag_similarity_threshold = 0.30"
        )
    )