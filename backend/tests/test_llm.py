import json
from types import SimpleNamespace

import pytest

from app.runtime.llm import MAX_TOOL_ITERATIONS, LLMComponent


@pytest.mark.asyncio
async def test_generate_response_executes_tool_and_continues_conversation() -> None:
    function_call = SimpleNamespace(
        type="function_call",
        name="run_python",
        arguments=json.dumps({"code": "print(5)"}),
        call_id="call_123",
    )
    final_response = SimpleNamespace(output=[], output_text="המספר הוא 5")

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        async def create(self, **kwargs: object) -> object:
            self.calls.append(kwargs)
            if len(self.calls) == 1:
                return SimpleNamespace(output=[function_call], output_text="")
            follow_up_input = kwargs["input"]
            assert follow_up_input[1] == {
                "type": "function_call",
                "name": "run_python",
                "arguments": '{"code": "print(5)"}',
                "call_id": "call_123",
            }
            assert follow_up_input[-1] == {
                "type": "function_call_output",
                "call_id": "call_123",
                "output": json.dumps({"output": "5\n", "error": ""}),
            }
            return final_response

    component = LLMComponent.__new__(LLMComponent)
    component.client = SimpleNamespace(responses=FakeResponses())
    agent = SimpleNamespace(model="test-model", temperature=0.0, system_prompt=None, max_tokens=None)

    async def execute_tool(name: str, arguments: dict) -> dict:
        assert name == "run_python"
        assert arguments == {"code": "print(5)"}
        return {"output": "5\n", "error": ""}

    result = await component.generate_response(
        agent,
        [{"role": "user", "content": "run python"}],
        tools=[{"type": "function", "name": "run_python"}],
        tool_executor=execute_tool,
    )

    assert result == "המספר הוא 5"


@pytest.mark.asyncio
async def test_generate_response_forces_final_answer_when_tool_limit_reached() -> None:
    def make_call(call_id: str) -> SimpleNamespace:
        return SimpleNamespace(
            type="function_call",
            name="run_python",
            arguments=json.dumps({"code": "1 + 1"}),
            call_id=call_id,
        )

    class FakeResponses:
        def __init__(self) -> None:
            self.calls: list[dict] = []

        async def create(self, **kwargs: object) -> object:
            self.calls.append(kwargs)
            if "tools" not in kwargs:
                return SimpleNamespace(output=[], output_text="התשובה הסופית")
            return SimpleNamespace(output=[make_call(f"call_{len(self.calls)}")], output_text="")

    fake_responses = FakeResponses()
    component = LLMComponent.__new__(LLMComponent)
    component.client = SimpleNamespace(responses=fake_responses)
    agent = SimpleNamespace(model="test-model", temperature=0.0, system_prompt=None, max_tokens=None)

    async def execute_tool(name: str, arguments: dict) -> dict:
        return {"output": "2\n", "error": ""}

    result = await component.generate_response(
        agent,
        [{"role": "user", "content": "run python"}],
        tools=[{"type": "function", "name": "run_python"}],
        tool_executor=execute_tool,
    )

    assert result == "התשובה הסופית"
    assert len(fake_responses.calls) == MAX_TOOL_ITERATIONS + 2
    assert "tools" not in fake_responses.calls[-1]