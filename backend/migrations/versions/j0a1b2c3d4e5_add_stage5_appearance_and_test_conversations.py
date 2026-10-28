"""add appearance and publishing fields and mark test conversations

Revision ID: j0a1b2c3d4e5
Revises: i9d0e1f2a3b4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "i9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("primary_color", sa.String(length=7), nullable=False, server_default="#2369a8"),
    )
    op.add_column("agents", sa.Column("logo_data", sa.Text(), nullable=True))
    op.add_column(
        "agents",
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("agents", sa.Column("public_key", sa.String(length=64), nullable=True))
    op.create_index("ix_agents_public_key", "agents", ["public_key"], unique=True)
    op.add_column("agents", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "conversations",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("conversations", "is_test")
    op.drop_column("agents", "published_at")
    op.drop_index("ix_agents_public_key", table_name="agents")
    op.drop_column("agents", "public_key")
    op.drop_column("agents", "is_published")
    op.drop_column("agents", "logo_data")
    op.drop_column("agents", "primary_color")
