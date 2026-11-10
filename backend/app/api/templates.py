from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.database import get_db
from app.models.capability import Capability
from app.models.user import User

router = APIRouter(prefix="/templates", tags=["Templates"])


def _localized(he: str, en: str) -> dict[str, str]:
    return {"he": he, "en": en}


TEMPLATE_DEFINITIONS = (
    {
        "id": "customer-service",
        "name": _localized("שירות לקוחות", "Customer service"),
        "description": _localized(
            "עונה על שאלות נפוצות ומסביר את מדיניות העסק.",
            "Answers common questions and explains your policies.",
        ),
        "capability_keys": ["representative_handoff"],
        "defaults": {
            "businessDescription": _localized(
                "אנו עוזרים ללקוחותינו בשאלות על המוצרים, ההזמנות והמדיניות שלנו.",
                "We help our customers with questions about our products, orders and policies.",
            ),
            "openingMessage": _localized(
                "שלום, אני כאן כדי לענות על שאלותיך. במה אוכל לעזור היום?",
                "Hello, I am here to answer your questions. How can I help you today?",
            ),
            "tone": "professional",
        },
    },
    {
        "id": "sales-leads",
        "name": _localized("מכירות ואיסוף לידים", "Sales and lead collection"),
        "description": _localized(
            "מציג את ההצעה שלכם ואוסף פרטים מלקוחות מתעניינים.",
            "Presents your offering and collects details from interested customers.",
        ),
        "capability_keys": ["lead_collection"],
        "defaults": {
            "businessDescription": _localized(
                "אנו מציעים מוצרים ושירותים ללקוחות המחפשים פתרון מתאים.",
                "We offer products and services to customers who are looking for a suitable solution.",
            ),
            "openingMessage": _localized(
                "שלום, ברוכים הבאים. ספרו לי מה אתם מחפשים ואעזור לכם למצוא זאת.",
                "Hello, welcome. Tell me what you are looking for and I will help you find it.",
            ),
            "tone": "friendly",
        },
    },
    {
        "id": "appointments",
        "name": _localized("תיאום תורים ופגישות", "Appointments and meetings"),
        "description": _localized(
            "מאפשר ללקוחות לבחור מועד פנוי ומאשר את הפגישה.",
            "Lets customers choose an available time and confirms the meeting.",
        ),
        "capability_keys": ["meeting_scheduling", "representative_handoff"],
        "defaults": {
            "businessDescription": _localized(
                "אנו מקבלים לקוחות בתיאום מראש ומציעים פגישות בשעות קבועות.",
                "We receive customers by appointment and offer meetings at set hours.",
            ),
            "openingMessage": _localized(
                "שלום, אוכל לעזור לכם לקבוע תור. מתי יהיה לכם נוח?",
                "Hello, I can help you book an appointment. When would suit you?",
            ),
            "tone": "friendly",
        },
    },
)


@router.get("")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> list[dict]:
    keys = {key for template in TEMPLATE_DEFINITIONS for key in template["capability_keys"]}
    result = await db.execute(select(Capability).where(Capability.key.in_(keys), Capability.enabled.is_(True)))
    capabilities = {capability.key: capability for capability in result.scalars().all()}
    missing = keys - capabilities.keys()
    if missing:
        raise HTTPException(
            status_code=503,
            detail="The capability catalog is not initialized",
        )

    return [
        {
            **template,
            "capabilities": [
                {
                    "id": str(capabilities[key].id),
                    "name": capabilities[key].name,
                }
                for key in template["capability_keys"]
            ],
        }
        for template in TEMPLATE_DEFINITIONS
    ]
