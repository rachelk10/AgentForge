import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.capability import AgentCapability
from app.models.conversation import Conversation
from app.models.document import Document
from app.models.lead import HandoffRequest, Lead
from app.models.meeting import MeetingBooking
from app.models.message import Message
from app.schemas.dashboard import (
    DashboardConversationPage,
    DashboardConversationResponse,
    DashboardMetricCounts,
    DashboardOverviewResponse,
    DashboardRecommendation,
    DailyConversationCount,
)


class DashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_overview(
        self,
        agent: Agent,
        now: datetime | None = None,
    ) -> DashboardOverviewResponse:
        current_time = now or datetime.now(timezone.utc)
        seven_day_cutoff = current_time - timedelta(days=7)
        thirty_day_cutoff = current_time - timedelta(days=30)

        def conversation_count(cutoff: datetime):
            return (
                select(func.count(Conversation.id))
                .where(
                    Conversation.agent_id == agent.id,
                    Conversation.is_test.is_(False),
                    Conversation.created_at >= cutoff,
                )
                .scalar_subquery()
            )

        def message_count(cutoff: datetime):
            return (
                select(func.count(Message.id))
                .select_from(Message)
                .join(Conversation, Message.conversation_id == Conversation.id)
                .where(
                    Conversation.agent_id == agent.id,
                    Conversation.is_test.is_(False),
                    Message.role != "system",
                    Message.created_at >= cutoff,
                )
                .scalar_subquery()
            )

        def lead_count(cutoff: datetime):
            return (
                select(func.count(Lead.id))
                .select_from(Lead)
                .join(Conversation, Lead.conversation_id == Conversation.id)
                .where(
                    Lead.agent_id == agent.id,
                    Conversation.is_test.is_(False),
                    Lead.created_at >= cutoff,
                )
                .scalar_subquery()
            )

        def meeting_count(cutoff: datetime):
            return (
                select(func.count(MeetingBooking.id))
                .select_from(MeetingBooking)
                .join(Conversation, MeetingBooking.conversation_id == Conversation.id)
                .where(
                    MeetingBooking.agent_id == agent.id,
                    Conversation.is_test.is_(False),
                    MeetingBooking.created_at >= cutoff,
                )
                .scalar_subquery()
            )

        counts = (
            await self.db.execute(
                select(
                    conversation_count(seven_day_cutoff),
                    message_count(seven_day_cutoff),
                    lead_count(seven_day_cutoff),
                    meeting_count(seven_day_cutoff),
                    conversation_count(thirty_day_cutoff),
                    message_count(thirty_day_cutoff),
                    lead_count(thirty_day_cutoff),
                    meeting_count(thirty_day_cutoff),
                )
            )
        ).one()

        daily_start = current_time.date() - timedelta(days=29)
        daily_rows = (
            await self.db.execute(
                select(func.date(Conversation.created_at), func.count(Conversation.id))
                .where(
                    Conversation.agent_id == agent.id,
                    Conversation.is_test.is_(False),
                    Conversation.created_at >= thirty_day_cutoff,
                )
                .group_by(func.date(Conversation.created_at))
                .order_by(func.date(Conversation.created_at))
            )
        ).all()
        daily_counts = {row[0]: row[1] for row in daily_rows}
        conversations_by_day = [
            DailyConversationCount(
                date=daily_start + timedelta(days=day_offset),
                count=daily_counts.get(daily_start + timedelta(days=day_offset), 0),
            )
            for day_offset in range(30)
        ]

        source_count, enabled_capability_count = (
            await self.db.execute(
                select(
                    select(func.count(Document.id))
                    .where(
                        Document.agent_id == agent.id,
                        Document.status == "processed",
                    )
                    .scalar_subquery(),
                    select(func.count())
                    .select_from(AgentCapability)
                    .where(
                        AgentCapability.agent_id == agent.id,
                        AgentCapability.enabled.is_(True),
                    )
                    .scalar_subquery(),
                )
            )
        ).one()

        recommendations: list[DashboardRecommendation] = []
        if not agent.business_name or not agent.description:
            recommendations.append("completeBusiness")
        if source_count == 0:
            recommendations.append("addInformation")
        if enabled_capability_count == 0:
            recommendations.append("enableCapability")
        if not agent.is_published:
            recommendations.append("publishAgent")

        return DashboardOverviewResponse(
            is_active=agent.is_active,
            counts_7_days=DashboardMetricCounts(
                conversations=counts[0],
                messages=counts[1],
                leads=counts[2],
                meetings=counts[3],
            ),
            counts_30_days=DashboardMetricCounts(
                conversations=counts[4],
                messages=counts[5],
                leads=counts[6],
                meetings=counts[7],
            ),
            conversations_by_day=conversations_by_day,
            recommendations=recommendations,
        )

    async def list_conversations(
        self,
        agent_id: uuid.UUID,
        search: str | None,
        tag: str | None,
        limit: int,
        offset: int,
    ) -> DashboardConversationPage:
        filters = [
            Conversation.agent_id == agent_id,
            Conversation.is_test.is_(False),
        ]
        if search:
            pattern = f"%{search.strip()}%"
            filters.append(
                or_(
                    Conversation.title.ilike(pattern),
                    exists(
                        select(1).where(
                            Message.conversation_id == Conversation.id,
                            Message.content.ilike(pattern),
                        )
                    ),
                )
            )
        if tag == "lead":
            filters.append(
                exists(
                    select(1).where(
                        Lead.conversation_id == Conversation.id,
                        Lead.agent_id == agent_id,
                    )
                )
            )
        elif tag == "meeting":
            filters.append(
                exists(
                    select(1).where(
                        MeetingBooking.conversation_id == Conversation.id,
                        MeetingBooking.agent_id == agent_id,
                    )
                )
            )
        elif tag == "handed_off":
            filters.append(
                exists(
                    select(1).where(
                        HandoffRequest.conversation_id == Conversation.id,
                        HandoffRequest.agent_id == agent_id,
                    )
                )
            )

        total = (
            await self.db.execute(
                select(func.count(Conversation.id)).where(*filters)
            )
        ).scalar_one()

        message_count = (
            select(func.count(Message.id))
            .where(
                Message.conversation_id == Conversation.id,
                Message.role != "system",
            )
            .correlate(Conversation)
            .scalar_subquery()
        )
        first_message = (
            select(Message.content)
            .where(
                Message.conversation_id == Conversation.id,
                Message.role == "user",
            )
            .order_by(Message.created_at.asc(), Message.id.asc())
            .limit(1)
            .correlate(Conversation)
            .scalar_subquery()
        )
        rows = (
            await self.db.execute(
                select(Conversation, message_count, first_message)
                .where(*filters)
                .order_by(Conversation.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
        ).all()

        conversation_ids = [row[0].id for row in rows]
        tags_by_conversation: dict[uuid.UUID, list[str]] = {
            conversation_id: [] for conversation_id in conversation_ids
        }
        if conversation_ids:
            tag_models = (
                ("lead", Lead),
                ("meeting", MeetingBooking),
                ("handed_off", HandoffRequest),
            )
            for tag_name, model in tag_models:
                result = await self.db.execute(
                    select(model.conversation_id).where(
                        model.agent_id == agent_id,
                        model.conversation_id.in_(conversation_ids),
                    )
                )
                for conversation_id in result.scalars().all():
                    tags_by_conversation[conversation_id].append(tag_name)

        items = [
            DashboardConversationResponse(
                id=conversation.id,
                title=conversation.title,
                first_message=first_message_text,
                message_count=message_count_value,
                tags=tags_by_conversation[conversation.id],
                created_at=conversation.created_at,
                updated_at=conversation.updated_at,
            )
            for conversation, message_count_value, first_message_text in rows
        ]
        return DashboardConversationPage(
            conversations=items,
            total=total,
            limit=limit,
            offset=offset,
        )
