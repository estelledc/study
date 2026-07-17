import tempfile
import unittest
from pathlib import Path

from evidence_tutor import (
    AttemptConflictError,
    EvidenceTutor,
    Exercise,
    SequenceError,
    SessionStateError,
)


EXERCISES = [
    Exercise(
        "diag",
        "order",
        "diagnostic",
        "2 * 3 + 1",
        "7",
        "Multiply first.",
    ),
    Exercise(
        "practice",
        "order",
        "practice",
        "4 * 2 + 3",
        "11",
        "Do 4 * 2 first.",
    ),
    Exercise(
        "transfer",
        "order",
        "transfer",
        "5 + 2 * 4",
        "13",
        "Which operation has priority?",
    ),
]


class EvidenceTutorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.state_path = Path(self.temp.name) / "state.json"
        self.tutor = EvidenceTutor(
            self.state_path,
            learner_id="learner-1",
            course_id="math",
            exercises=EXERCISES,
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def submit_diagnostic(self, answer: str = "8") -> None:
        self.tutor.submit_attempt(
            attempt_id="diag-1",
            exercise_id="diag",
            answer=answer,
        )

    def submit_practice(self, hints_used: int = 1) -> None:
        self.tutor.submit_attempt(
            attempt_id="practice-1",
            exercise_id="practice",
            answer="11",
            hints_used=hints_used,
        )

    def test_practice_requires_diagnostic_evidence(self) -> None:
        with self.assertRaisesRegex(SequenceError, "diagnostic"):
            self.submit_practice()

    def test_deterministic_grading_normalizes_spacing_and_case(self) -> None:
        tutor = EvidenceTutor(
            self.state_path,
            learner_id="learner-2",
            course_id="words",
            exercises=[
                Exercise("d", "term", "diagnostic", "Name it", "State Machine", "Think state."),
                Exercise("p", "term", "practice", "Name the pattern", "State Machine", "Think transitions."),
                Exercise("t", "term", "transfer", "Name this runtime pattern", "State Machine", "Think states."),
            ],
        )
        result = tutor.submit_attempt(
            attempt_id="d-1",
            exercise_id="d",
            answer="  state   MACHINE ",
        )
        self.assertTrue(result["correct"])

    def test_completed_session_does_not_imply_learning_gain(self) -> None:
        self.submit_diagnostic()
        self.submit_practice()
        self.tutor.complete_session()

        outcome = self.tutor.outcome("order")
        self.assertEqual(outcome["session_status"], "completed")
        self.assertEqual(outcome["mastery"]["level"], "practicing")
        self.assertFalse(outcome["mastery"]["learning_gain"])
        with self.assertRaisesRegex(SessionStateError, "resume"):
            self.tutor.submit_attempt(
                attempt_id="transfer-1",
                exercise_id="transfer",
                answer="13",
            )

    def test_hinted_transfer_does_not_demonstrate_gain(self) -> None:
        self.submit_diagnostic()
        self.submit_practice()
        self.tutor.submit_attempt(
            attempt_id="transfer-1",
            exercise_id="transfer",
            answer="13",
            hints_used=1,
        )

        mastery = self.tutor.mastery("order")
        self.assertEqual(mastery["level"], "needs_review")
        self.assertFalse(mastery["learning_gain"])

    def test_independent_transfer_proves_gain_with_provenance(self) -> None:
        self.submit_diagnostic()
        self.submit_practice()
        self.tutor.submit_attempt(
            attempt_id="transfer-1",
            exercise_id="transfer",
            answer="13",
        )

        mastery = self.tutor.mastery("order")
        self.assertEqual(mastery["level"], "demonstrated_gain")
        self.assertTrue(mastery["learning_gain"])
        self.assertEqual(
            mastery["evidence_attempt_ids"],
            ["diag-1", "practice-1", "transfer-1"],
        )

    def test_repeated_practice_does_not_count_as_transfer(self) -> None:
        self.submit_diagnostic()
        self.submit_practice(hints_used=0)
        self.tutor.submit_attempt(
            attempt_id="practice-2",
            exercise_id="practice",
            answer="11",
        )

        self.assertEqual(self.tutor.mastery("order")["level"], "practicing")
        self.assertEqual(self.tutor.next_action("order"), "transfer")

    def test_attempt_id_is_idempotent_but_conflict_fails(self) -> None:
        self.submit_diagnostic()
        same = self.tutor.submit_attempt(
            attempt_id="diag-1",
            exercise_id="diag",
            answer="8",
        )
        self.assertFalse(same["correct"])

        with self.assertRaisesRegex(AttemptConflictError, "conflicting"):
            self.tutor.submit_attempt(
                attempt_id="diag-1",
                exercise_id="diag",
                answer="7",
            )

    def test_state_persists_and_scope_is_isolated(self) -> None:
        self.submit_diagnostic()
        reopened = EvidenceTutor(
            self.state_path,
            learner_id="learner-1",
            course_id="math",
            exercises=EXERCISES,
        )
        other = EvidenceTutor(
            self.state_path,
            learner_id="learner-2",
            course_id="math",
            exercises=EXERCISES,
        )

        self.assertEqual(
            reopened.mastery("order")["level"],
            "needs_instruction",
        )
        self.assertEqual(other.mastery("order")["level"], "unknown")

    def test_transfer_prompt_must_differ_from_practice(self) -> None:
        duplicate = [
            Exercise("d", "x", "diagnostic", "d", "1", "h"),
            Exercise("p", "x", "practice", "same", "1", "h"),
            Exercise("t", "x", "transfer", " same ", "1", "h"),
        ]
        with self.assertRaisesRegex(ValueError, "different prompt"):
            EvidenceTutor(
                self.state_path,
                learner_id="learner-3",
                course_id="math",
                exercises=duplicate,
            )


if __name__ == "__main__":
    unittest.main()
