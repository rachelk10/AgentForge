import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SkillCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z][A-Za-z0-9_. -]*$")
    description: str = Field(min_length=1)
    instructions: str = Field(min_length=1)
    configuration: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    resources: list[Any] = Field(default_factory=list)
    required_tool_names: list[str] = Field(default_factory=list)
    version: int = Field(default=1, ge=1)
    enabled: bool = True
    scope: Literal["user", "team", "organization", "system"] = "user"

    @field_validator("required_tool_names")
    @classmethod
    def unique_required_tools(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("required_tool_names must contain unique names")
        return value


class SkillUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100, pattern=r"^[A-Za-z][A-Za-z0-9_. -]*$")
    description: str | None = Field(default=None, min_length=1)
    instructions: str | None = Field(default=None, min_length=1)
    configuration: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    resources: list[Any] | None = None
    required_tool_names: list[str] | None = None
    version: int | None = Field(default=None, ge=1)
    enabled: bool | None = None
    scope: Literal["user", "team", "organization", "system"] | None = None

    @field_validator("required_tool_names")
    @classmethod
    def unique_required_tools(cls, value: list[str] | None) -> list[str] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("required_tool_names must contain unique names")
        return value


class SkillResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    instructions: str
    configuration: dict[str, Any]
    metadata: dict[str, Any] = Field(validation_alias="skill_metadata")
    resources: list[Any]
    required_tool_names: list[str]
    version: int
    enabled: bool
    scope: str
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
