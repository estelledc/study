import unittest

from langgraph.errors import InvalidUpdateError
from langgraph.graph import END, START, StateGraph
from typing_extensions import TypedDict

from stategraph_lab import build_research_graph, run_demo


class StateGraphLabTests(unittest.TestCase):
    def test_parallel_findings_are_merged_by_reducer(self) -> None:
        graph = build_research_graph()
        result = graph.invoke(
            {"topic": "state", "findings": [], "summary": ""},
        )

        self.assertEqual(result["findings"], ["A:state", "B:state"])
        self.assertEqual(result["summary"], "A:state | B:state")

    def test_checkpointer_records_thread_history(self) -> None:
        result, checkpoints = run_demo()

        self.assertEqual(result["summary"], "A:reducers | B:reducers")
        self.assertGreaterEqual(checkpoints, 3)

    def test_parallel_writes_without_reducer_are_rejected(self) -> None:
        class BadState(TypedDict):
            findings: list[str]

        builder = StateGraph(BadState)
        builder.add_node("a", lambda _: {"findings": ["a"]})
        builder.add_node("b", lambda _: {"findings": ["b"]})
        builder.add_edge(START, "a")
        builder.add_edge(START, "b")
        builder.add_edge("a", END)
        builder.add_edge("b", END)
        graph = builder.compile()

        with self.assertRaises(InvalidUpdateError):
            graph.invoke({"findings": []})

    def test_compiled_graph_has_expected_topology(self) -> None:
        graph = build_research_graph()
        node_ids = set(graph.get_graph().nodes)

        self.assertEqual(
            node_ids,
            {START, "source_a", "source_b", "summarize", END},
        )


if __name__ == "__main__":
    unittest.main()
