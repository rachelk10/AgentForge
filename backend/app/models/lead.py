import uuid

from sqlalchemy import ForeignKey, JSON, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Lead(Base, TimestampMixin):
    __tablename__ = "leads"
    __table_args__ = (UniqueConstraint("conversation_id", name="uq_leads_conversation_id"),)

    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    details: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False)
    notification_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)


class HandoffRequest(Base, TimestampMixin):
    __tablename__ = "handoff_requests"
    __table_args__ = (UniqueConstraint("conversation_id", name="uq_handoff_requests_conversation_id"),)

    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(4000), nullable=False)
    contact_preference: Mapped[str] = mapped_column(String(20), nullable=False)
    contact_details: Mapped[str] = mapped_column(String(320), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    internal_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    notification_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
