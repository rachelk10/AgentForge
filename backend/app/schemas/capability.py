import uuid
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

LocalizedText = dict[str, str]

ConfigFieldType = Literal[
    "text",
    "textarea",
    "email",
    "number",
    "select",
    "multiselect",
    "lead_fields",
    "weekly_availability",
]


class ConfigFieldOption(BaseModel):
    value: str
    label: LocalizedText


class ConfigField(BaseModel):
    key: str = Field(pattern=r"^[a-z][a-zA-Z0-9_]*$")
    type: ConfigFieldType
    label: LocalizedText
    help: LocalizedText | None = None
    required: bool = False
    options: list[ConfigFieldOption] = Field(default_factory=list)
    min: float | None = None
    max: float | None = None
    default: Any = None


class CapabilityResponse(BaseModel):
    id: uuid.UUID
    key: str
    name: LocalizedText
    description: LocalizedText
    default_enabled: bool
    locked: bool
    config_fields: list[ConfigField]

    model_config = ConfigDict(from_attributes=True)


class AgentCapabilityResponse(BaseModel):
    capability_id: uuid.UUID
    enabled: bool
    config: dict[str, Any]


class AgentCapabilityUpdate(BaseModel):
    enabled: bool
    config: dict[str, Any] = Field(default_factory=dict)
