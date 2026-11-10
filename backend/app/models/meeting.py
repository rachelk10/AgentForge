import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MeetingBooking(Base, TimestampMixin):
    __tablename__ = "meeting_bookings"
    __table_args__ = (
        UniqueConstraint("agent_id", "start_at", name="uq_meeting_bookings_agent_start"),
        UniqueConstraint("conversation_id", name="uq_meeting_bookings_conversation"),
    )

    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_email: Mapped[str] = mapped_column(String(320), nullable=False)
    owner_notification_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    customer_confirmation_message_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
