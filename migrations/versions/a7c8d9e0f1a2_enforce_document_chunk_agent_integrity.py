"""enforce document chunk agent ownership

Revision ID: a7c8d9e0f1a2
Revises: f1a2b3c4d5e6
"""
from typing import Sequence, Union

from alembic import op


revision: str = "a7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_documents_agent_id_id",
        "documents",
        ["agent_id", "id"],
    )
    op.create_foreign_key(
        "fk_document_chunks_agent_document",
        "document_chunks",
        "documents",
        ["agent_id", "document_id"],
        ["agent_id", "id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_document_chunks_agent_document",
        "document_chunks",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_documents_agent_id_id",
        "documents",
        type_="unique",
    )
