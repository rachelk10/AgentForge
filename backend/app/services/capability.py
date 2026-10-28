import re
import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent
from app.models.capability import AgentCapability, Capability
from app.schemas.capability import AgentCapabilityResponse, AgentCapabilityUpdate, ConfigField

WEEKDAYS = ("sun", "mon", "tue", "wed", "thu", "fri", "sat")
MAX_LEAD_FIELDS = 20
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_FIELD_KEY = re.compile(r"^[a-z][a-zA-Z0-9_]*$")


class ConfigError(ValueError):
    pass


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _validate_value(field: ConfigField, value: Any) -> Any:
    if field.type in ("text", "textarea", "email", "select"):
        if not isinstance(value, str):
            raise ConfigError("must be text")
        value = value.strip()
        if field.type == "email" and not _EMAIL.match(value):
            raise ConfigError("must be a valid email address")
        if field.type == "select" and value not in {option.value for option in field.options}:
            raise ConfigError("must be one of the available options")
        if field.max is not None and len(value) > field.max:
            raise ConfigError("is too long")
        return value
    if field.type == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ConfigError("must be a number")
        if field.min is not None and value < field.min:
            raise ConfigError("is below the minimum")
        if field.max is not None and value > field.max:
            raise ConfigError("is above the maximum")
        return value
    if field.type == "multiselect":
        allowed = {option.value for option in field.options}
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise ConfigError("must be a list")
        if len(set(value)) != len(value) or not set(value) <= allowed:
            raise ConfigError("must contain unique available options")
        return value
    if field.type == "lead_fields":
        return _validate_lead_fields(value)
    return _validate_availability(value)


def _validate_lead_fields(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or len(value) > MAX_LEAD_FIELDS:
        raise ConfigError("must be a list of fields")
    cleaned: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, dict):
            raise ConfigError("must be a list of fields")
        key, label, required = item.get("key"), item.get("label"), item.get("required", False)
        if not isinstance(key, str) or not _FIELD_KEY.match(key) or key in seen:
            raise ConfigError("contains an invalid or duplicate field")
        if not isinstance(label, str) or not label.strip() or len(label) > 100 or not isinstance(required, bool):
            raise ConfigError("contains an invalid field")
        seen.add(key)
        cleaned.append({"key": key, "label": label.strip(), "required": required})
    return cleaned


def _validate_availability(value: Any) -> dict[str, list[dict[str, str]]]:
    if not isinstance(value, dict) or not set(value) <= set(WEEKDAYS):
        raise ConfigError("must be a weekly schedule")
    cleaned: dict[str, list[dict[str, str]]] = {}
    for day, ranges in value.items():
        if not isinstance(ranges, list):
            raise ConfigError("must be a weekly schedule")
        day_ranges: list[dict[str, str]] = []
        for item in ranges:
            start = item.get("start") if isinstance(item, dict) else None
            end = item.get("end") if isinstance(item, dict) else None
            if not (isinstance(start, str) and isinstance(end, str) and _TIME.match(start) and _TIME.match(end)):
                raise ConfigError("contains an invalid time")
            if start >= end:
                raise ConfigError("contains a range that ends before it starts")
            day_ranges.append({"start": start, "end": end})
        day_ranges.sort(key=lambda item: item["start"])
        for previous, current in zip(day_ranges, day_ranges[1:]):
            if current["start"] < previous["end"]:
                raise ConfigError("contains overlapping ranges")
        if day_ranges:
            cleaned[day] = day_ranges
    return cleaned


def validate_config(fields: list[ConfigField], config: dict[str, Any], enabled: bool) -> dict[str, Any]:
    """Validate a config against its field definitions; required fields are enforced only when enabled."""
    by_key = {field.key: field for field in fields}
    errors: dict[str, str] = {key: "is not a known setting" for key in config if key not in by_key}
    cleaned: dict[str, Any] = {}
    for field in fields:
        value = config.get(field.key)
        if _is_empty(value):
            if enabled and field.required:
                errors[field.key] = "is required"
            continue
        try:
            cleaned[field.key] = _validate_value(field, value)
        except ConfigError as exc:
            errors[field.key] = str(exc)
    if errors:
        raise HTTPException(
            status_code=422,
            detail=[{"loc": ["body", "config", key], "msg": message, "type": "value_error"} for key, message in errors.items()],
        )
    return cleaned


class CapabilityService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_catalog(self) -> list[Capability]:
        result = await self.db.execute(
            select(Capability).where(Capability.enabled.is_(True)).order_by(Capability.sort_order, Capability.key)
        )
        return list(result.scalars().all())

    async def _get_agent(self, agent_id: uuid.UUID, owner_id: uuid.UUID) -> Agent:
        result = await self.db.execute(select(Agent).where(Agent.id == agent_id, Agent.owner_id == owner_id))
        agent = result.scalar_one_or_none()
        if agent is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
        return agent

    async def list_agent_capabilities(self, agent_id: uuid.UUID, owner_id: uuid.UUID) -> list[AgentCapabilityResponse]:
        await self._get_agent(agent_id, owner_id)
        catalog = await self.list_catalog()
        result = await self.db.execute(select(AgentCapability).where(AgentCapability.agent_id == agent_id))
        links = {link.capability_id: link for link in result.scalars().all()}
        responses = []
        for capability in catalog:
            link = links.get(capability.id)
            if link is not None:
                enabled, config = link.enabled and not capability.locked, link.config
            else:
                enabled, config = capability.default_enabled and not capability.locked, {}
            responses.append(AgentCapabilityResponse(capability_id=capability.id, enabled=enabled, config=config))
        return responses

    async def set_agent_capability(
        self, agent_id: uuid.UUID, capability_id: uuid.UUID, data: AgentCapabilityUpdate, owner_id: uuid.UUID
    ) -> AgentCapabilityResponse:
        await self._get_agent(agent_id, owner_id)
        result = await self.db.execute(
            select(Capability).where(Capability.id == capability_id, Capability.enabled.is_(True))
        )
        capability = result.scalar_one_or_none()
        if capability is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capability not found")
        if capability.locked and data.enabled:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Capability is not available in this plan")

        fields = [ConfigField.model_validate(field) for field in capability.config_fields]
        config = validate_config(fields, data.config, data.enabled)

        link_result = await self.db.execute(
            select(AgentCapability).where(
                AgentCapability.agent_id == agent_id, AgentCapability.capability_id == capability_id
            )
        )
        link = link_result.scalar_one_or_none()
        if link is None:
            link = AgentCapability(agent_id=agent_id, capability_id=capability_id)
            self.db.add(link)
        link.enabled = data.enabled
        link.config = config
        await self.db.commit()
        return AgentCapabilityResponse(capability_id=capability_id, enabled=link.enabled, config=link.config)
