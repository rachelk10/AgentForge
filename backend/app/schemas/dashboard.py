import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


DashboardTag = Literal["lead", "meeting", "handed_off"]
DashboardRecommendation = Literal[
    "completeBusiness",
    "addInformation",
    "enableCapability",
    "publishAgent",
]


class DashboardMetricCounts(BaseModel):
    conversations: int
    messages: int
    leads: int
    meetings: int


class DailyConversationCount(BaseModel):
    date: date
    count: int


class DashboardOverviewResponse(BaseModel):
    is_active: bool
    counts_7_days: DashboardMetricCounts
    counts_30_days: DashboardMetricCounts
    conversations_by_day: list[DailyConversationCount]
    recommendations: list[DashboardRecommendation]


class DashboardConversationResponse(BaseModel):
    id: uuid.UUID
    title: str | None
    first_message: str | None
    message_count: int
    tags: list[DashboardTag]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DashboardConversationPage(BaseModel):
    conversations: list[DashboardConversationResponse]
    total: int
    limit: int
    offset: int
