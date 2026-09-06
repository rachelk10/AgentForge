import asyncio
import inspect
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.models.tool import Tool
from app.schemas.tool import ToolResult

logger = logging.getLogger(__name__)
ToolHandler = Callable[[dict[str, Any]], Any | Awaitable[Any]]


class ToolRegistry:
    """Process-local handler registry; tool metadata remains persisted in the DB."""

    def __init__(self) -> None:
        self._handlers: dict[str, ToolHandler] = {}

    def register(self, execution_logic: str, handler: ToolHandler) -> None:
        self._handlers[execution_logic] = handler

    def unregister(self, execution_logic: str) -> None:
        self._handlers.pop(execution_logic, None)

    def get(self, execution_logic: str) -> ToolHandler | None:
        return self._handlers.get(execution_logic)


tool_registry = ToolRegistry()


def _validate_schema(value: Any, schema: dict[str, Any], path: str = "arguments") -> None:
    expected = schema.get("type")
    type_checks = {
        "object": lambda item: isinstance(item, dict),
        "array": lambda item: isinstance(item, list),
        "string": lambda item: isinstance(item, str),
        "number": lambda item: isinstance(item, (int, float)) and not isinstance(item, bool),
        "integer": lambda item: isinstance(item, int) and not isinstance(item, bool),
        "boolean": lambda item: isinstance(item, bool),
        "null": lambda item: item is None,
    }
    if expected in type_checks and not type_checks[expected](value):
        raise ValueError(f"{path} must be {expected}")
    if "enum" in schema and value not in schema["enum"]:
        raise ValueError(f"{path} must be one of the allowed values")
    if isinstance(value, dict):
        properties = schema.get("properties", {})
        missing = set(schema.get("required", [])) - value.keys()
        if missing:
            raise ValueError(f"{path} is missing required fields: {', '.join(sorted(missing))}")
        if schema.get("additionalProperties") is False:
            unknown = set(value) - properties.keys()
            if unknown:
                raise ValueError(f"{path} contains unknown fields: {', '.join(sorted(unknown))}")
        for key, child_schema in properties.items():
            if key in value:
                _validate_schema(value[key], child_schema, f"{path}.{key}")
    if isinstance(value, list) and isinstance(schema.get("items"), dict):
        for index, item in enumerate(value):
            _validate_schema(item, schema["items"], f"{path}[{index}]")


async def execute_tool(tool: Tool, arguments: dict[str, Any], timeout_seconds: float = 10.0) -> ToolResult:
    started = time.perf_counter()
    try:
        if not tool.enabled:
            return ToolResult(success=False, error="Tool is disabled")
        _validate_schema(arguments, tool.input_schema)
        handler = tool_registry.get(tool.execution_logic)
        if handler is None:
            return ToolResult(success=False, error="Tool execution handler is not registered")
        async def run_handler() -> Any:
            if inspect.iscoroutinefunction(handler):
                return await handler(arguments)
            return await asyncio.to_thread(handler, arguments)

        data = await asyncio.wait_for(run_handler(), timeout=timeout_seconds)
        _validate_schema(data, tool.output_schema, "result")
        return ToolResult(success=True, data=data)
    except asyncio.TimeoutError:
        return ToolResult(success=False, error="Tool execution timed out")
    except Exception as exc:
        logger.exception("Tool execution failed tool_id=%s", tool.id)
        return ToolResult(success=False, error=str(exc))
    finally:
        logger.info("Tool execution tool_id=%s duration_ms=%.2f", tool.id, (time.perf_counter() - started) * 1000)