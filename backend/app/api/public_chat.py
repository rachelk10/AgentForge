import html
import re
import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.agent import Agent
from app.models.capability import AgentCapability, Capability
from app.models.conversation import Conversation
from app.models.lead import HandoffRequest, Lead
from app.models.meeting import MeetingBooking
from app.models.message import Message, MessageRole
from app.schemas.conversation import ChatRequest
from app.schemas.public_chat import PublicAgentProfile, PublicChatRequest, PublicChatResponse
from app.services.email import EmailConfigurationError, EmailDeliveryError, EmailService
from app.services.chat import ChatService

router = APIRouter(prefix="/public/agents", tags=["Public Chat"])
_LEAD_INTENT = re.compile(r"contact|email|call|price|quote|details|פרטים|קשר|דוא.?ל|טלפון|מחיר|הצעה|לחזור", re.I)
_HANDOFF_INTENT = re.compile(r"person|human|representative|staff|נציג|אדם|אנושי", re.I)
_MISSING_KNOWLEDGE = re.compile(
    r"don't know|do not know|not sure|can't help|cannot help|don't have that information|"
    r"לא יודע|אין לי מידע|לא בטוח|לא יכולה לעזור|לא יכול לעזור",
    re.I,
)
_LEAD_END_INTENT = re.compile(
    r"thank(s| you)?|goodbye|that's all|all done|תודה|זה הכל|זהו|להתראות",
    re.I,
)
_MEETING_INTENT = re.compile(r"schedule|meeting|appointment|book|פגישה|לקבוע|יומן|תור", re.I)
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_WEEKDAYS = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")


async def _published_agent(public_key: str, db: AsyncSession) -> Agent:
    result = await db.execute(
        select(Agent).where(Agent.public_key == public_key, Agent.is_published.is_(True))
    )
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This chat is not available")
    return agent


async def _enabled_capability(db: AsyncSession, agent_id: uuid.UUID, key: str) -> tuple[Capability, dict] | None:
    result = await db.execute(
        select(Capability, AgentCapability.config)
        .join(AgentCapability, AgentCapability.capability_id == Capability.id)
        .where(
            AgentCapability.agent_id == agent_id,
            AgentCapability.enabled.is_(True),
            Capability.key == key,
            Capability.enabled.is_(True),
        )
    )
    row = result.first()
    return (row[0], row[1]) if row else None


async def _interaction_for_message(
    db: AsyncSession,
    agent_id: uuid.UUID,
    message: str,
    language: str,
    assistant_reply: str,
) -> dict | None:
    handoff = await _enabled_capability(db, agent_id, "representative_handoff")
    if handoff:
        _, config = handoff
        triggers = config.get("triggers", [])
        if not isinstance(triggers, list):
            triggers = []
        topics = config.get("topics", "")
        is_handoff = (
            ("customerRequest" in triggers and bool(_HANDOFF_INTENT.search(message)))
            or ("missingKnowledge" in triggers and bool(_MISSING_KNOWLEDGE.search(assistant_reply)))
            or (
                "definedTopics" in triggers
                and isinstance(topics, str)
                and any(topic.strip().lower() in message.lower() for topic in topics.splitlines() if topic.strip())
            )
        )
        if not is_handoff:
            handoff = None
    if handoff:
        _, config = handoff
        configured_prompt = config.get("customerMessage")
        return {
            "type": "handoff",
            "prompt": configured_prompt or (
                "איך נוח לכם שניצור קשר?" if language == "he" else "How would you prefer us to contact you?"
            ),
            "contact_methods": (
                [{"id": "email", "label": "דוא״ל"}, {"id": "phone", "label": "טלפון"}]
                if language == "he"
                else [{"id": "email", "label": "Email"}, {"id": "phone", "label": "Phone"}]
            ),
        }

    meeting = await _enabled_capability(db, agent_id, "meeting_scheduling")
    if meeting and _MEETING_INTENT.search(message):
        _, config = meeting
        slots = await _available_meeting_slots(db, agent_id, config, language)
        return {
            "type": "meeting_slots",
            "prompt": (
                ("בחרו מועד לפגישה" if slots else "אין כרגע מועדים זמינים")
                if language == "he"
                else ("Choose an available meeting time" if slots else "There are no available times right now")
            ),
            "slots": slots,
        }

    lead = await _enabled_capability(db, agent_id, "lead_collection")
    if lead:
        _, config = lead
        if (
            config.get("whenToAsk") == "start"
            or (config.get("whenToAsk") == "interested" and _LEAD_INTENT.search(message))
            or (config.get("whenToAsk") == "end" and _LEAD_END_INTENT.search(message))
        ):
            fields = config.get("fields")
            if not isinstance(fields, list):
                return None
            return {
                "type": "lead_collection",
                "fields": [
                    {
                        "id": field["key"],
                        "label": field["label"],
                        "type": (
                            "email" if "email" in field["key"].lower()
                            else "tel" if any(word in field["key"].lower() for word in ("phone", "tel"))
                            else "text"
                        ),
                        "required": field.get("required", False),
                    }
                    for field in fields
                    if isinstance(field, dict)
                    and isinstance(field.get("key"), str)
                    and isinstance(field.get("label"), str)
                ],
            }
    return None


async def _available_meeting_slots(
    db: AsyncSession,
    agent_id: uuid.UUID,
    config: dict,
    language: str,
) -> list[dict[str, str]]:
    try:
        zone = ZoneInfo(config["timeZone"])
        duration = int(config["durationMinutes"])
        buffer = int(config.get("bufferMinutes", 0))
        availability = config["availability"]
    except (KeyError, TypeError, ValueError, ZoneInfoNotFoundError):
        return []
    if duration <= 0 or buffer < 0 or not isinstance(availability, dict):
        return []

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(MeetingBooking.start_at, MeetingBooking.end_at).where(
            MeetingBooking.agent_id == agent_id,
            MeetingBooking.start_at >= now,
            MeetingBooking.start_at < now + timedelta(days=14),
        )
    )
    booked_ranges = [
        (
            start.astimezone(timezone.utc) if start.tzinfo else start.replace(tzinfo=timezone.utc),
            end.astimezone(timezone.utc) if end.tzinfo else end.replace(tzinfo=timezone.utc),
        )
        for start, end in result.all()
    ]

    slots: list[dict[str, str]] = []
    local_today = now.astimezone(zone).date()
    for day_offset in range(14):
        current_date = local_today + timedelta(days=day_offset)
        day_key = _WEEKDAYS[(current_date.weekday() + 1) % 7]
        ranges = availability.get(day_key, [])
        if not isinstance(ranges, list):
            continue
        for working_range in ranges:
            try:
                start_time = time.fromisoformat(working_range["start"])
                end_time = time.fromisoformat(working_range["end"])
            except (KeyError, TypeError, ValueError):
                continue
            range_start = datetime.combine(current_date, start_time, tzinfo=zone)
            range_end = datetime.combine(current_date, end_time, tzinfo=zone)
            slot_start = range_start
            while slot_start + timedelta(minutes=duration) <= range_end:
                slot_utc = slot_start.astimezone(timezone.utc)
                slot_end = slot_utc + timedelta(minutes=duration)
                overlaps = any(start < slot_end and end > slot_utc for start, end in booked_ranges)
                if slot_utc > now and not overlaps:
                    label = (
                        slot_start.strftime("%d/%m %H:%M")
                        if language == "he"
                        else slot_start.strftime("%a, %b %d at %H:%M")
                    )
                    slots.append({"id": slot_start.isoformat(), "label": label})
                    if len(slots) == 5:
                        return slots
                slot_start += timedelta(minutes=duration + buffer)
    return slots


async def _validate_meeting_start(
    db: AsyncSession,
    agent_id: uuid.UUID,
    slot_id: str,
    config: dict,
) -> tuple[datetime, datetime]:
    try:
        zone = ZoneInfo(config["timeZone"])
        duration = int(config["durationMinutes"])
        buffer = int(config.get("bufferMinutes", 0))
        slot = datetime.fromisoformat(slot_id)
        availability = config["availability"]
    except (KeyError, TypeError, ValueError, ZoneInfoNotFoundError) as exc:
        raise HTTPException(status_code=422, detail="Choose a valid meeting time") from exc
    if slot.tzinfo is None or not isinstance(availability, dict) or duration <= 0 or buffer < 0:
        raise HTTPException(status_code=422, detail="Choose a valid meeting time")

    local_slot = slot.astimezone(zone)
    day_key = _WEEKDAYS[(local_slot.weekday() + 1) % 7]
    candidate_time = local_slot.timetz().replace(tzinfo=None)
    end_time = (local_slot + timedelta(minutes=duration)).timetz().replace(tzinfo=None)
    allowed = False
    for working_range in availability.get(day_key, []):
        try:
            range_start = time.fromisoformat(working_range["start"])
            range_end = time.fromisoformat(working_range["end"])
        except (KeyError, TypeError, ValueError):
            continue
        start_minute = range_start.hour * 60 + range_start.minute
        candidate_minute = candidate_time.hour * 60 + candidate_time.minute
        interval = duration + buffer
        if (
            range_start <= candidate_time
            and end_time <= range_end
            and candidate_time.second == 0
            and (candidate_minute - start_minute) % interval == 0
        ):
            allowed = True
            break
    if not allowed or local_slot.astimezone(timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="Choose an available meeting time")

    start_utc = local_slot.astimezone(timezone.utc)
    end_utc = start_utc + timedelta(minutes=duration)
    result = await db.execute(
        select(MeetingBooking).where(
            MeetingBooking.agent_id == agent_id,
            MeetingBooking.start_at < end_utc,
            MeetingBooking.end_at > start_utc,
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="That meeting time has already been booked")
    return start_utc, end_utc


async def _get_public_conversation(
    db: AsyncSession,
    agent: Agent,
    conversation_id: uuid.UUID | None,
) -> Conversation:
    if conversation_id is None:
        raise HTTPException(status_code=422, detail="A conversation is required for this action")
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.agent_id == agent.id,
            Conversation.user_id == agent.owner_id,
            Conversation.is_test.is_(False),
        )
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


async def _save_public_reply(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    content: str,
) -> Message:
    message = Message(
        conversation_id=conversation_id,
        role=MessageRole.ASSISTANT,
        content=content,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message


def _email_failure(exc: EmailConfigurationError | EmailDeliveryError) -> HTTPException:
    status_code = 503 if isinstance(exc, EmailConfigurationError) else 502
    return HTTPException(status_code=status_code, detail=str(exc))


async def _submit_lead(
    db: AsyncSession,
    agent: Agent,
    data: PublicChatRequest,
) -> PublicChatResponse:
    action = data.action_response
    if action is None or action.values is None:
        raise HTTPException(status_code=422, detail="Lead details are required")
    conversation = await _get_public_conversation(db, agent, data.conversation_id)
    enabled = await _enabled_capability(db, agent.id, "lead_collection")
    if enabled is None:
        raise HTTPException(status_code=422, detail="Lead collection is not enabled")
    _, config = enabled
    fields = config.get("fields")
    destination = config.get("notificationEmail")
    if not isinstance(fields, list) or not isinstance(destination, str):
        raise HTTPException(status_code=422, detail="Lead collection is not configured")

    allowed = {
        field["key"]: field
        for field in fields
        if isinstance(field, dict) and isinstance(field.get("key"), str)
    }
    values = action.values
    if set(values) - set(allowed) or any(not isinstance(value, str) or len(value) > 1000 for value in values.values()):
        raise HTTPException(status_code=422, detail="Lead details are invalid")
    if any(field.get("required") and not values.get(key, "").strip() for key, field in allowed.items()):
        raise HTTPException(status_code=422, detail="Required lead details are missing")
    try:
        email_service = EmailService()
        email_service.ensure_configured()
    except EmailConfigurationError as exc:
        raise _email_failure(exc)

    result = await db.execute(select(Lead).where(Lead.conversation_id == conversation.id))
    lead = result.scalar_one_or_none()
    if lead is None:
        lead = Lead(agent_id=agent.id, conversation_id=conversation.id, details=values)
        db.add(lead)
        await db.commit()
        await db.refresh(lead)

    if not lead.notification_message_id:
        details_html = "".join(
            f"<li><strong>{html.escape(allowed[key]['label'])}</strong>: {html.escape(value)}</li>"
            for key, value in values.items()
        )
        try:
            message_id = await email_service.send(
                destination,
                f"New lead for {agent.name}",
                f"<p>A visitor submitted details for {html.escape(agent.name)}.</p><ul>{details_html}</ul>",
                idempotency_key=f"agentforge-lead-{lead.id}",
            )
        except (EmailConfigurationError, EmailDeliveryError) as exc:
            raise _email_failure(exc)
        lead.notification_message_id = message_id
        await db.commit()

    confirmation = (
        "תודה, הפרטים נשלחו לעסק."
        if data.language == "he"
        else "Thank you. Your details have been sent to the business."
    )
    message = await _save_public_reply(db, conversation.id, confirmation)
    return PublicChatResponse(conversation_id=conversation.id, message=message, interaction=None)


async def _submit_handoff(
    db: AsyncSession,
    agent: Agent,
    data: PublicChatRequest,
) -> PublicChatResponse:
    action = data.action_response
    preference = action.contact_preference if action else None
    contact_details = action.contact_details.strip() if action and action.contact_details else ""
    if preference not in {"email", "phone"} or not contact_details or len(contact_details) > 320:
        raise HTTPException(status_code=422, detail="Provide valid contact details")
    if preference == "email" and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", contact_details):
        raise HTTPException(status_code=422, detail="Provide a valid email address")
    if preference == "phone" and not re.fullmatch(r"\+?[0-9\s().-]{7,30}", contact_details):
        raise HTTPException(status_code=422, detail="Provide a valid phone number")
    conversation = await _get_public_conversation(db, agent, data.conversation_id)
    enabled = await _enabled_capability(db, agent.id, "representative_handoff")
    if enabled is None:
        raise HTTPException(status_code=422, detail="Representative handoff is not enabled")
    _, config = enabled
    destination = config.get("notificationEmail")
    if not isinstance(destination, str):
        raise HTTPException(status_code=422, detail="Representative handoff is not configured")
    try:
        email_service = EmailService()
        email_service.ensure_configured()
    except EmailConfigurationError as exc:
        raise _email_failure(exc)

    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id, Message.role == MessageRole.USER)
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    source_message = result.scalar_one_or_none()
    reason = source_message.content[:4000] if source_message else "Customer requested a representative"
    result = await db.execute(
        select(HandoffRequest).where(HandoffRequest.conversation_id == conversation.id)
    )
    handoff_request = result.scalar_one_or_none()
    if handoff_request is None:
        handoff_request = HandoffRequest(
            agent_id=agent.id,
            conversation_id=conversation.id,
            reason=reason,
            contact_preference=preference,
            contact_details=contact_details,
        )
        db.add(handoff_request)
        await db.commit()
        await db.refresh(handoff_request)

    if not handoff_request.notification_message_id:
        try:
            message_id = await email_service.send(
                destination,
                f"Customer requested a representative for {agent.name}",
                (
                    f"<p>A customer requested a representative.</p>"
                    f"<p>Reason: {html.escape(reason)}</p>"
                    f"<p>Preferred contact method: {html.escape(preference)}</p>"
                    f"<p>Contact details: {html.escape(handoff_request.contact_details)}</p>"
                    f"<p>Conversation: {conversation.id}</p>"
                ),
                idempotency_key=f"agentforge-handoff-{handoff_request.id}",
            )
        except (EmailConfigurationError, EmailDeliveryError) as exc:
            raise _email_failure(exc)
        handoff_request.notification_message_id = message_id
        await db.commit()

    confirmation = (
        "הבקשה הועברה לעסק ויחזרו אליכם לפי ההעדפה שבחרתם."
        if data.language == "he"
        else "Your request has been sent to the business. They will contact you using your preference."
    )
    message = await _save_public_reply(db, conversation.id, confirmation)
    return PublicChatResponse(conversation_id=conversation.id, message=message, interaction=None)


async def _submit_meeting(
    db: AsyncSession,
    agent: Agent,
    data: PublicChatRequest,
) -> PublicChatResponse:
    action = data.action_response
    values = action.values if action else None
    if (
        action is None
        or not action.slot_id
        or values is None
        or set(values) != {"name", "email"}
    ):
        raise HTTPException(status_code=422, detail="Choose a meeting time and provide your details")
    name = values.get("name", "").strip()
    email = values.get("email", "").strip()
    if not name or len(name) > 200 or not _EMAIL.fullmatch(email) or len(email) > 320:
        raise HTTPException(status_code=422, detail="Provide a valid name and email address")

    conversation = await _get_public_conversation(db, agent, data.conversation_id)
    enabled = await _enabled_capability(db, agent.id, "meeting_scheduling")
    if enabled is None:
        raise HTTPException(status_code=422, detail="Meeting scheduling is not enabled")
    _, config = enabled
    owner_email = config.get("confirmationEmail")
    if not isinstance(owner_email, str):
        raise HTTPException(status_code=422, detail="Meeting scheduling is not configured")
    start_at, end_at = await _validate_meeting_start(db, agent.id, action.slot_id, config)
    try:
        email_service = EmailService()
        email_service.ensure_configured()
    except EmailConfigurationError as exc:
        raise _email_failure(exc)

    result = await db.execute(
        select(MeetingBooking).where(MeetingBooking.conversation_id == conversation.id)
    )
    booking = result.scalar_one_or_none()
    if booking is not None:
        if booking.start_at != start_at or booking.customer_email != email:
            raise HTTPException(status_code=409, detail="This conversation already has a different booking")
    else:
        booking = MeetingBooking(
            agent_id=agent.id,
            conversation_id=conversation.id,
            start_at=start_at,
            end_at=end_at,
            customer_name=name,
            customer_email=email,
        )
        db.add(booking)
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise HTTPException(status_code=409, detail="That meeting time has already been booked") from exc
        await db.refresh(booking)

    zone = ZoneInfo(config["timeZone"])
    formatted_time = start_at.astimezone(zone).strftime("%Y-%m-%d %H:%M %Z")
    safe_agent_name = html.escape(agent.name)
    safe_customer_name = html.escape(booking.customer_name)
    if not booking.owner_notification_message_id:
        try:
            message_id = await email_service.send(
                owner_email,
                f"Meeting booked for {agent.name}",
                (
                    f"<p>{safe_customer_name} booked a meeting for {safe_agent_name}.</p>"
                    f"<p>Time: {html.escape(formatted_time)}</p>"
                    f"<p>Contact: {html.escape(booking.customer_email)}</p>"
                ),
                idempotency_key=f"agentforge-meeting-owner-{booking.id}",
            )
        except (EmailConfigurationError, EmailDeliveryError) as exc:
            raise _email_failure(exc)
        booking.owner_notification_message_id = message_id
        await db.commit()

    if not booking.customer_confirmation_message_id:
        try:
            message_id = await email_service.send(
                booking.customer_email,
                f"Meeting with {agent.name}",
                (
                    f"<p>Hello {safe_customer_name},</p>"
                    f"<p>Your meeting with {safe_agent_name} is booked for "
                    f"{html.escape(formatted_time)}.</p>"
                ),
                idempotency_key=f"agentforge-meeting-customer-{booking.id}",
            )
        except (EmailConfigurationError, EmailDeliveryError) as exc:
            raise _email_failure(exc)
        booking.customer_confirmation_message_id = message_id
        await db.commit()

    confirmation = (
        f"הפגישה נקבעה ל-{formatted_time}. אישור נשלח לכתובת הדוא״ל שלכם."
        if data.language == "he"
        else f"Your meeting is booked for {formatted_time}. A confirmation was sent to your email."
    )
    message = await _save_public_reply(db, conversation.id, confirmation)
    return PublicChatResponse(conversation_id=conversation.id, message=message, interaction=None)


@router.get("/{public_key}", response_model=PublicAgentProfile)
async def get_public_agent(
    public_key: str,
    db: AsyncSession = Depends(get_db),
) -> PublicAgentProfile:
    agent = await _published_agent(public_key, db)
    return PublicAgentProfile(
        public_key=public_key,
        agent_name=agent.name,
        opening_message=agent.opening_message,
        language=agent.conversation_language,
        primary_color=agent.primary_color,
        logo_data=agent.logo_data,
        is_active=agent.is_active,
    )


@router.post("/{public_key}/chat", response_model=PublicChatResponse)
async def public_chat(
    public_key: str,
    data: PublicChatRequest,
    db: AsyncSession = Depends(get_db),
) -> PublicChatResponse:
    agent = await _published_agent(public_key, db)
    if not agent.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This assistant is temporarily unavailable",
        )
    if data.action_response is not None:
        if data.action_response.type == "lead_collection":
            return await _submit_lead(db, agent, data)
        if data.action_response.type == "handoff":
            return await _submit_handoff(db, agent, data)
        return await _submit_meeting(db, agent, data)
    if data.message is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A message is required",
        )

    conversation, assistant_message = await ChatService(db).chat(
        agent=agent,
        user_id=agent.owner_id,
        request=ChatRequest(
            message=data.message,
            conversation_id=data.conversation_id,
            is_test=False,
        ),
    )
    interaction = await _interaction_for_message(
        db,
        agent.id,
        data.message,
        data.language,
        assistant_message.content,
    )
    return PublicChatResponse(
        conversation_id=conversation.id,
        message=assistant_message,
        interaction=interaction,
    )
