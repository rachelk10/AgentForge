"""add capabilities catalog and per-agent capability configuration

Revision ID: i9d0e1f2a3b4
Revises: h8c9d0e1f2a3
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "i9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "h8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _text(he: str, en: str) -> dict[str, str]:
    return {"he": he, "en": en}


def _option(value: str, he: str, en: str) -> dict:
    return {"value": value, "label": _text(he, en)}


SEED = [
    {
        "key": "lead_collection",
        "name": _text("איסוף פרטי לקוחות", "Collecting customer details"),
        "description": _text(
            "הסוכן מבקש מפונים להשאיר פרטים, והם נשלחים אליך בדוא\"ל.",
            "The agent asks visitors for their details and sends them to you by email.",
        ),
        "default_enabled": False,
        "locked": False,
        "sort_order": 10,
        "config_fields": [
            {
                "key": "fields",
                "type": "lead_fields",
                "label": _text("אילו פרטים לאסוף", "Which details to collect"),
                "required": True,
            },
            {
                "key": "whenToAsk",
                "type": "select",
                "label": _text("מתי לבקש את הפרטים", "When to ask for the details"),
                "required": True,
                "default": "interested",
                "options": [
                    _option("start", "בתחילת השיחה", "At the start of the conversation"),
                    _option("interested", "כשהלקוח מביע עניין", "When the customer shows interest"),
                    _option("end", "בסוף השיחה", "At the end of the conversation"),
                ],
            },
            {
                "key": "notificationEmail",
                "type": "email",
                "label": _text("כתובת לקבלת הפרטים", "Email address that receives the details"),
                "required": True,
            },
        ],
    },
    {
        "key": "meeting_scheduling",
        "name": _text("קביעת פגישות", "Scheduling meetings"),
        "description": _text(
            "הסוכן מציע ללקוחות זמנים פנויים וקובע איתם פגישה.",
            "The agent offers customers available times and books a meeting with them.",
        ),
        "default_enabled": False,
        "locked": False,
        "sort_order": 20,
        "config_fields": [
            {
                "key": "availability",
                "type": "weekly_availability",
                "label": _text("ימים ושעות זמינות", "Available days and hours"),
                "required": True,
            },
            {
                "key": "durationMinutes",
                "type": "number",
                "label": _text("משך פגישה (בדקות)", "Meeting length (minutes)"),
                "required": True,
                "min": 5,
                "max": 480,
                "default": 30,
            },
            {
                "key": "bufferMinutes",
                "type": "number",
                "label": _text("מרווח בין פגישות (בדקות)", "Time between meetings (minutes)"),
                "min": 0,
                "max": 240,
                "default": 0,
            },
            {
                "key": "timeZone",
                "type": "select",
                "label": _text("אזור זמן", "Time zone"),
                "required": True,
                "default": "Asia/Jerusalem",
                "options": [
                    _option("Asia/Jerusalem", "ישראל", "Israel"),
                    _option("Europe/London", "לונדון", "London"),
                    _option("Europe/Paris", "מרכז אירופה", "Central Europe"),
                    _option("America/New_York", "ניו יורק", "New York"),
                    _option("America/Los_Angeles", "לוס אנג'לס", "Los Angeles"),
                ],
            },
            {
                "key": "confirmationEmail",
                "type": "email",
                "label": _text("כתובת לאישורי פגישה", "Email address for meeting confirmations"),
                "required": True,
            },
        ],
    },
    {
        "key": "representative_handoff",
        "name": _text("העברה לנציג", "Handing off to a representative"),
        "description": _text(
            "כשהסוכן לא יכול לעזור, הבקשה נשמרת ומועברת לטיפולך.",
            "When the agent cannot help, the request is saved and passed on for your handling.",
        ),
        "default_enabled": False,
        "locked": False,
        "sort_order": 30,
        "config_fields": [
            {
                "key": "triggers",
                "type": "multiselect",
                "label": _text("מתי להעביר לנציג", "When to hand off"),
                "required": True,
                "default": ["customerRequest", "missingKnowledge"],
                "options": [
                    _option("customerRequest", "הלקוח מבקש לדבר עם אדם", "The customer asks for a person"),
                    _option("missingKnowledge", "לסוכן אין את המידע הנדרש", "The agent lacks the needed information"),
                    _option("definedTopics", "נושאים שהגדרתי מראש", "Topics I have defined"),
                ],
            },
            {
                "key": "topics",
                "type": "textarea",
                "label": _text("נושאים להעברה", "Topics to hand off"),
                "help": _text("אפשר לרשום כמה נושאים, כל אחד בשורה נפרדת.", "You can list several topics, one per line."),
                "max": 1000,
            },
            {
                "key": "notificationEmail",
                "type": "email",
                "label": _text("כתובת להתראות", "Notification email address"),
                "required": True,
            },
            {
                "key": "customerMessage",
                "type": "textarea",
                "label": _text("ההודעה שתוצג ללקוח", "Message shown to the customer"),
                "required": True,
                "max": 500,
            },
        ],
    },
    {
        "key": "calendar_sync",
        "name": _text("סנכרון ליומן", "Calendar sync"),
        "description": _text(
            "חיבור היומן שלך כדי שהסוכן יראה מתי אתה פנוי.",
            "Connect your calendar so the agent can see when you are free.",
        ),
        "default_enabled": False,
        "locked": True,
        "sort_order": 40,
        "config_fields": [],
    },
]


def upgrade() -> None:
    capabilities = op.create_table(
        "capabilities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(length=100), nullable=False, unique=True),
        sa.Column("name", sa.JSON(), nullable=False),
        sa.Column("description", sa.JSON(), nullable=False),
        sa.Column("default_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("config_fields", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "agent_capabilities",
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), primary_key=True),
        sa.Column(
            "capability_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("capabilities.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("config", sa.JSON(), nullable=False),
    )
    op.bulk_insert(capabilities, [{"id": uuid.uuid4(), **item} for item in SEED])


def downgrade() -> None:
    op.drop_table("agent_capabilities")
    op.drop_table("capabilities")
