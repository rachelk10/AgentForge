import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Capability(Base, TimestampMixin):
    """Business-facing catalog entry; platform managed and shared by all accounts."""

    __tablename__ = "capabilities"

    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[dict] = mapped_column(JSON, nullable=False)
    description: Mapped[dict] = mapped_column(JSON, nullable=False)
    default_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    config_fields: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    agent_links: Mapped[list["AgentCapability"]] = relationship(
        "AgentCapability", back_populates="capability", cascade="all, delete-orphan"
    )


class AgentCapability(Base):
    __tablename__ = "agent_capabilities"

    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True
    )
    capability_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("capabilities.id", ondelete="CASCADE"), primary_key=True
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    agent: Mapped["Agent"] = relationship("Agent", back_populates="capability_links")
    capability: Mapped[Capability] = relationship("Capability", back_populates="agent_links")
