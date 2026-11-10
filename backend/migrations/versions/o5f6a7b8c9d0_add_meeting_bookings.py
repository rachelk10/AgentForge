"""persist meeting bookings

Revision ID: o5f6a7b8c9d0
Revises: n4e5f6a7b8c9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "o5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "n4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "meeting_bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("customer_email", sa.String(length=320), nullable=False),
        sa.Column("owner_notification_message_id", sa.String(length=100), nullable=True),
        sa.Column("customer_confirmation_message_id", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("agent_id", "start_at", name="uq_meeting_bookings_agent_start"),
        sa.UniqueConstraint("conversation_id", name="uq_meeting_bookings_conversation"),
    )
    op.create_index("ix_meeting_bookings_agent_id", "meeting_bookings", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_meeting_bookings_agent_id", table_name="meeting_bookings")
    op.drop_table("meeting_bookings")
