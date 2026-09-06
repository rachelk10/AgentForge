"""finalize RAG similarity threshold default

Revision ID: f4c5d6e7f8a9
Revises: f3b4c5d6e7f8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "f3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "agents",
        "rag_similarity_threshold",
        server_default=sa.text("0.45"),
    )
    op.execute(
        sa.text(
            "UPDATE agents SET rag_similarity_threshold = 0.45 "
            "WHERE rag_similarity_threshold = 0.75"
        )
    )


def downgrade() -> None:
    op.alter_column(
        "agents",
        "rag_similarity_threshold",
        server_default=sa.text("0.75"),
    )
    op.execute(
        sa.text(
            "UPDATE agents SET rag_similarity_threshold = 0.75 "
            "WHERE rag_similarity_threshold = 0.45"
        )
    )