import unittest

from minimal_agent_loop import FakeModel, run_agent


class MinimalAgentLoopTests(unittest.TestCase):
    def test_tool_result_continues_to_final_answer(self) -> None:
        result = run_agent(
            "What is 2 + 3?",
            model=FakeModel(),
            tools={"add": lambda left, right: left + right},
        )

        self.assertEqual(result.answer, "The answer is 5.")
        self.assertEqual(
            result.events,
            (
                "input_admitted",
                "model_turn:1",
                "tool_settled:call-1",
                "model_turn:2",
                "run_completed",
            ),
        )

    def test_duplicate_call_id_reuses_settled_result(self) -> None:
        executions = 0

        def counting_add(left: int, right: int) -> int:
            nonlocal executions
            executions += 1
            return left + right

        result = run_agent(
            "What is 2 + 3?",
            model=FakeModel(duplicate_call=True),
            tools={"add": counting_add},
        )

        self.assertEqual(executions, 1)
        self.assertIn("tool_reused:call-1", result.events)

    def test_unknown_tool_fails_closed(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "unknown tool: add"):
            run_agent(
                "What is 2 + 3?",
                model=FakeModel(),
                tools={},
            )

    def test_turn_budget_stops_non_terminating_model(self) -> None:
        class NeverFinishes(FakeModel):
            def next(self, transcript):  # type: ignore[no-untyped-def]
                return super().next([])

        with self.assertRaisesRegex(RuntimeError, "exceeded max_turns"):
            run_agent(
                "What is 2 + 3?",
                model=NeverFinishes(),
                tools={"add": lambda left, right: left + right},
                max_turns=2,
            )


if __name__ == "__main__":
    unittest.main()
