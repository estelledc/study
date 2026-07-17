"""Small, deterministic LangGraph lab without model or network calls."""

from __future__ import annotations

import operator
from typing import Annotated

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict


class ResearchState(TypedDict):
    topic: str
    findings: Annotated[list[str], operator.add]
    summary: str


def source_a(state: ResearchState) -> dict[str, list[str]]:
    return {"findings": [f"A:{state['topic']}"]}


def source_b(state: ResearchState) -> dict[str, list[str]]:
    return {"findings": [f"B:{state['topic']}"]}


def summarize(state: ResearchState) -> dict[str, str]:
    return {"summary": " | ".join(sorted(state["findings"]))}


def build_research_graph(checkpointer=None):  # type: ignore[no-untyped-def]
    builder = StateGraph(ResearchState)
    builder.add_node("source_a", source_a)
    builder.add_node("source_b", source_b)
    builder.add_node("summarize", summarize)
    builder.add_edge(START, "source_a")
    builder.add_edge(START, "source_b")
    builder.add_edge("source_a", "summarize")
    builder.add_edge("source_b", "summarize")
    builder.add_edge("summarize", END)
    return builder.compile(checkpointer=checkpointer)


def run_demo() -> tuple[dict[str, object], int]:
    saver = InMemorySaver()
    graph = build_research_graph(checkpointer=saver)
    config = {"configurable": {"thread_id": "beginner-demo"}}
    result = graph.invoke(
        {"topic": "reducers", "findings": [], "summary": ""},
        config,
    )
    history = list(graph.get_state_history(config))
    return result, len(history)


if __name__ == "__main__":
    output, checkpoints = run_demo()
    print(output["summary"])
    print(f"checkpoints={checkpoints}")
