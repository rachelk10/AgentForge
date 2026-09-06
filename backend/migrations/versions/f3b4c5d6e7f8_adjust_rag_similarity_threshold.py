"""adjust default RAG similarity threshold

Revision ID: f3b4c5d6e7f8
Revises: f2a3b4c5d6e7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE agents SET rag_similarity_threshold = 0.45 "
            "WHERE rag_similarity_threshold = 0.75"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE agents SET rag_similarity_threshold = 0.75 "
            "WHERE rag_similarity_threshold = 0.45"
        )
    )