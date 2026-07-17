"""Deterministic teaching model of a tool-using agent loop."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ToolCall:
    call_id: str
    name: str
    args: tuple[int, int]


@dataclass(frozen=True)
class ModelReply:
    text: str | None = None
    tool_calls: tuple[ToolCall, ...] = ()


@dataclass(frozen=True)
class RunResult:
    answer: str
    events: tuple[str, ...]


class FakeModel:
    """Requests one addition, then turns the tool result into an answer."""

    def __init__(self, duplicate_call: bool = False) -> None:
        self.duplicate_call = duplicate_call

    def next(self, transcript: list[dict[str, object]]) -> ModelReply:
        tool_results = [item for item in transcript if item["role"] == "tool"]
        if tool_results:
            return ModelReply(text=f"The answer is {tool_results[-1]['content']}.")

        call = ToolCall(call_id="call-1", name="add", args=(2, 3))
        calls = (call, call) if self.duplicate_call else (call,)
        return ModelReply(tool_calls=calls)


def run_agent(
    prompt: str,
    model: FakeModel,
    tools: dict[str, Callable[[int, int], int]],
    max_turns: int = 4,
) -> RunResult:
    transcript: list[dict[str, object]] = [{"role": "user", "content": prompt}]
    settled: dict[str, int] = {}
    events: list[str] = ["input_admitted"]

    for turn in range(1, max_turns + 1):
        reply = model.next(transcript)
        events.append(f"model_turn:{turn}")

        if reply.text is not None:
            events.append("run_completed")
            return RunResult(reply.text, tuple(events))

        if not reply.tool_calls:
            raise RuntimeError("model returned neither text nor tool calls")

        for call in reply.tool_calls:
            if call.call_id in settled:
                result = settled[call.call_id]
                events.append(f"tool_reused:{call.call_id}")
            else:
                tool = tools.get(call.name)
                if tool is None:
                    raise RuntimeError(f"unknown tool: {call.name}")
                result = tool(*call.args)
                settled[call.call_id] = result
                events.append(f"tool_settled:{call.call_id}")

            transcript.append(
                {
                    "role": "tool",
                    "call_id": call.call_id,
                    "content": result,
                }
            )

    raise RuntimeError("agent exceeded max_turns")


if __name__ == "__main__":
    output = run_agent(
        "What is 2 + 3?",
        model=FakeModel(),
        tools={"add": lambda left, right: left + right},
    )
    print(output.answer)
    print("\n".join(output.events))
