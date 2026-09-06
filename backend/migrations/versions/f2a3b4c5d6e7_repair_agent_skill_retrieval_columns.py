"""repair missing agent skill retrieval columns

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
"""
from typing import Sequence, Union

from alembic import op


revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS skills_top_k INTEGER NOT NULL DEFAULT 3"
    )
    op.execute(
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS skills_similarity_threshold "
        "DOUBLE PRECISION NOT NULL DEFAULT 0.75"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS skills_similarity_threshold")
    op.execute("ALTER TABLE agents DROP COLUMN IF EXISTS skills_top_k")
