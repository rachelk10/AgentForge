"""persist public agent profile fields

Revision ID: l2c3d4e5f6a7
Revises: k1b2c3d4e5f6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "k1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("business_name", sa.String(length=200), nullable=True))
    op.add_column(
        "agents",
        sa.Column("opening_message", sa.Text(), nullable=False, server_default=""),
    )
    op.add_column(
        "agents",
        sa.Column("conversation_language", sa.String(length=2), nullable=False, server_default="en"),
    )


def downgrade() -> None:
    op.drop_column("agents", "conversation_language")
    op.drop_column("agents", "opening_message")
    op.drop_column("agents", "business_name")
