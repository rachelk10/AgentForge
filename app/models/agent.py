import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Agent(Base, TimestampMixin):
    __tablename__ = "agents"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str] = mapped_column(String(100), default="gpt-4o-mini", nullable=False)
    temperature: Mapped[float] = mapped_column(Float, default=0.7, nullable=False)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rag_top_k: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    rag_similarity_threshold: Mapped[float] = mapped_column(Float, default=0.75, nullable=False)
    skills_top_k: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    skills_similarity_threshold: Mapped[float] = mapped_column(Float, default=0.75, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    owner: Mapped["User"] = relationship("User", back_populates="agents")
    conversations: Mapped[list["Conversation"]] = relationship(
        "Conversation", back_populates="agent", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        "Document", back_populates="agent", cascade="all, delete-orphan"
    )
    document_chunks: Mapped[list["DocumentChunk"]] = relationship(
        "DocumentChunk", back_populates="agent", cascade="all, delete-orphan"
    )
    tool_links: Mapped[list["AgentTool"]] = relationship(
        "AgentTool", back_populates="agent", cascade="all, delete-orphan"
    )
    skill_links: Mapped[list["AgentSkill"]] = relationship(
        "AgentSkill", back_populates="agent", cascade="all, delete-orphan"
    )
