import asyncio
import uuid
from types import SimpleNamespace

import pytest

from app.runtime.tools import ToolRegistry, execute_tool, tool_registry


def make_tool(**overrides: object) -> SimpleNamespace:
    values = {
        "id": uuid.uuid4(),
        "enabled": True,
        "execution_logic": "tests.echo",
        "input_schema": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string"}}},
        "output_schema": {"type": "object", "required": ["message"], "properties": {"message": {"type": "string"}}},
    }
    values.update(overrides)
    return SimpleNamespace(**values)


@pytest.mark.asyncio
async def test_tool_execution_validates_input_and_returns_contract() -> None:
    tool_registry.register("tests.echo", lambda arguments: {"message": arguments["message"]})
    result = await execute_tool(make_tool(), {"message": "hello"})
    assert result.success is True
    assert result.data == {"message": "hello"}

    invalid = await execute_tool(make_tool(), {})
    assert invalid.success is False
    assert "missing required" in (invalid.error or "")


@pytest.mark.asyncio
async def test_tool_timeout_is_returned_as_error() -> None:
    async def slow(_: dict) -> dict:
        await asyncio.sleep(0.05)
        return {"message": "done"}

    tool_registry.register("tests.slow", slow)
    result = await execute_tool(make_tool(execution_logic="tests.slow"), {}, timeout_seconds=0.001)
    assert result.success is False
    assert result.error == "Tool execution timed out"