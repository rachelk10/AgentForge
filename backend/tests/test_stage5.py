import os
import xml.etree.ElementTree as ET

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost:5432/agentdb")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")

from app.api.agents import _sanitize_svg
from app.schemas.agent import AppearanceUpdate
from app.schemas.conversation import ChatRequest


def test_appearance_color_requires_a_six_digit_hex_value() -> None:
    assert AppearanceUpdate(primary_color="#12aBef").primary_color == "#12aBef"
    with pytest.raises(ValidationError):
        AppearanceUpdate(primary_color="red")


def test_svg_logo_removes_active_and_external_content() -> None:
    content = b"""
    <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
      <script>alert(1)</script>
      <rect width="20" height="20" fill="#ffffff" onclick="alert(1)" />
      <image href="https://example.com/image.png" />
    </svg>
    """

    sanitized = ET.fromstring(_sanitize_svg(content))

    assert sanitized.tag.endswith("svg")
    assert [element.tag.rsplit("}", 1)[-1] for element in sanitized] == ["rect"]
    assert "onload" not in sanitized.attrib
    rect = next(iter(sanitized))
    assert "onclick" not in rect.attrib
    assert rect.attrib["fill"] == "#ffffff"


def test_svg_logo_rejects_entity_definitions() -> None:
    with pytest.raises(HTTPException) as error:
        _sanitize_svg(b'<!DOCTYPE svg [<!ENTITY x "x">]><svg>&x;</svg>')

    assert error.value.status_code == 400


def test_chat_request_marks_test_mode_explicitly() -> None:
    assert ChatRequest(message="Hello").is_test is False
    assert ChatRequest(message="Hello", is_test=True).is_test is True
