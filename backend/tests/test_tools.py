import asyncio
import uuid
from types import SimpleNamespace

import pytest

from app.runtime.tools import ToolRegistry, execute_tool, tool_registry
from app.runtime.builtin_tools import register_builtin_tools


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
    result = await execute_tool(make_tool(execution_logic="tests.slow"), {"message": "hello"}, timeout_seconds=0.001)
    assert result.success is False
    assert result.error == "Tool execution timed out"


@pytest.mark.asyncio
async def test_run_python_builtin_returns_stdout_and_empty_error() -> None:
    register_builtin_tools()
    tool = make_tool(
        execution_logic="run_python",
        input_schema={"type": "object", "required": ["code"], "properties": {"code": {"type": "string"}}},
        output_schema={
            "type": "object",
            "required": ["output", "error"],
            "properties": {"output": {"type": "string"}, "error": {"type": "string"}},
        },
    )

    result = await execute_tool(tool, {"code": "print(2 + 3)"})

    assert result.success is True
    assert result.data == {"output": "5\n", "error": ""}


@pytest.mark.asyncio
async def test_run_python_builtin_returns_stderr_on_failure() -> None:
    register_builtin_tools()
    tool = make_tool(
        execution_logic="run_python",
        input_schema={"type": "object", "required": ["code"], "properties": {"code": {"type": "string"}}},
        output_schema={
            "type": "object",
            "required": ["output", "error"],
            "properties": {"output": {"type": "string"}, "error": {"type": "string"}},
        },
    )

    result = await execute_tool(tool, {"code": "raise ValueError('bad input')"})

    assert result.success is True
    assert result.data["output"] == ""
    assert "bad input" in result.data["error"]


def make_run_python_tool() -> SimpleNamespace:
    return make_tool(
        execution_logic="run_python",
        input_schema={"type": "object", "required": ["code"], "properties": {"code": {"type": "string"}}},
        output_schema={
            "type": "object",
            "required": ["output", "error"],
            "properties": {"output": {"type": "string"}, "error": {"type": "string"}},
        },
    )


@pytest.mark.asyncio
async def test_run_python_builtin_prints_trailing_expression() -> None:
    register_builtin_tools()

    result = await execute_tool(
        make_run_python_tool(),
        {"code": "numbers = [1, 2, 2, 3]\nmax(set(numbers), key=numbers.count)"},
    )

    assert result.success is True
    assert result.data == {"output": "2\n", "error": ""}


@pytest.mark.asyncio
async def test_run_python_builtin_hints_when_no_output() -> None:
    register_builtin_tools()

    result = await execute_tool(make_run_python_tool(), {"code": "x = 41"})

    assert result.success is True
    assert result.data["error"] == ""
    assert "no output" in result.data["output"]