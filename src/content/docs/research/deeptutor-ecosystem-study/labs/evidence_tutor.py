"""Deterministic teaching model that separates system completion from learning."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any, Dict, Iterable, List


class AttemptConflictError(RuntimeError):
    pass


class SequenceError(RuntimeError):
    pass


class SessionStateError(RuntimeError):
    pass


@dataclass(frozen=True)
class Exercise:
    exercise_id: str
    concept: str
    phase: str
    prompt: str
    expected_answer: str
    hint: str


PHASES = {"diagnostic", "practice", "transfer"}


def _normalize_answer(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).casefold()


class EvidenceTutor:
    """File-backed tutor whose mastery projection is derived from attempts."""

    def __init__(
        self,
        state_path: Path,
        *,
        learner_id: str,
        course_id: str,
        exercises: Iterable[Exercise],
    ) -> None:
        self.state_path = state_path
        self.learner_id = learner_id
        self.course_id = course_id
        self.exercises = {
            exercise.exercise_id: exercise for exercise in exercises
        }
        self._validate_exercises()
        self._state = self._load()
        self._scope = json.dumps(
            [learner_id, course_id],
            ensure_ascii=True,
            separators=(",", ":"),
        )
        self._state["scopes"].setdefault(
            self._scope,
            {
                "learner_id": learner_id,
                "course_id": course_id,
                "session_status": "running",
                "attempts": {},
                "events": [],
            },
        )
        self._save()

    def _validate_exercises(self) -> None:
        if not self.learner_id or not self.course_id:
            raise ValueError("learner_id and course_id are required")
        if not self.exercises:
            raise ValueError("at least one exercise is required")

        by_concept: Dict[str, List[Exercise]] = {}
        for exercise in self.exercises.values():
            if exercise.phase not in PHASES:
                raise ValueError(f"unknown phase: {exercise.phase}")
            by_concept.setdefault(exercise.concept, []).append(exercise)

        for concept, exercises in by_concept.items():
            phases = {exercise.phase for exercise in exercises}
            if phases != PHASES:
                raise ValueError(
                    f"{concept} requires diagnostic, practice, and transfer"
                )
            practice_prompts = {
                _normalize_answer(exercise.prompt)
                for exercise in exercises
                if exercise.phase == "practice"
            }
            transfer_prompts = {
                _normalize_answer(exercise.prompt)
                for exercise in exercises
                if exercise.phase == "transfer"
            }
            if practice_prompts & transfer_prompts:
                raise ValueError(
                    f"{concept} transfer must use a different prompt"
                )

    def _load(self) -> Dict[str, Any]:
        if not self.state_path.exists():
            return {"schema_version": 1, "scopes": {}}
        return json.loads(self.state_path.read_text(encoding="utf-8"))

    def _save(self) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        self.state_path.write_text(
            json.dumps(self._state, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    def _record(self) -> Dict[str, Any]:
        return self._state["scopes"][self._scope]

    def submit_attempt(
        self,
        *,
        attempt_id: str,
        exercise_id: str,
        answer: str,
        hints_used: int = 0,
    ) -> Dict[str, Any]:
        if exercise_id not in self.exercises:
            raise KeyError(exercise_id)
        if hints_used < 0:
            raise ValueError("hints_used cannot be negative")

        exercise = self.exercises[exercise_id]
        payload = {
            "attempt_id": attempt_id,
            "exercise_id": exercise.exercise_id,
            "concept": exercise.concept,
            "phase": exercise.phase,
            "answer": answer,
            "hints_used": hints_used,
            "independent": hints_used == 0,
            "correct": _normalize_answer(answer)
            == _normalize_answer(exercise.expected_answer),
        }

        record = self._record()
        existing = record["attempts"].get(attempt_id)
        if existing is not None:
            if existing != payload:
                raise AttemptConflictError(
                    f"attempt_id {attempt_id} has conflicting content"
                )
            return existing
        if record["session_status"] != "running":
            raise SessionStateError("resume the session before new attempts")

        attempts = list(record["attempts"].values())
        concept_attempts = [
            attempt
            for attempt in attempts
            if attempt["concept"] == exercise.concept
        ]
        if exercise.phase != "diagnostic" and not any(
            attempt["phase"] == "diagnostic"
            for attempt in concept_attempts
        ):
            raise SequenceError("diagnostic evidence is required first")
        if exercise.phase == "transfer" and not any(
            attempt["phase"] == "practice" and attempt["correct"]
            for attempt in concept_attempts
        ):
            raise SequenceError(
                "a correct practice attempt is required before transfer"
            )

        record["attempts"][attempt_id] = payload
        record["events"].append(
            {"kind": "attempt.recorded", "attempt_id": attempt_id}
        )
        self._save()
        return payload

    def mastery(self, concept: str) -> Dict[str, Any]:
        attempts = [
            attempt
            for attempt in self._record()["attempts"].values()
            if attempt["concept"] == concept
        ]
        diagnostic = next(
            (
                attempt
                for attempt in attempts
                if attempt["phase"] == "diagnostic"
            ),
            None,
        )
        correct_practice = [
            attempt
            for attempt in attempts
            if attempt["phase"] == "practice" and attempt["correct"]
        ]
        transfer_attempts = [
            attempt
            for attempt in attempts
            if attempt["phase"] == "transfer"
        ]
        independent_transfer = next(
            (
                attempt
                for attempt in transfer_attempts
                if attempt["correct"] and attempt["independent"]
            ),
            None,
        )

        if diagnostic is None:
            level = "unknown"
            evidence: List[str] = []
            learning_gain = False
        elif diagnostic["correct"]:
            if independent_transfer is not None:
                level = "retained"
                evidence = [
                    diagnostic["attempt_id"],
                    independent_transfer["attempt_id"],
                ]
            else:
                level = "prior_knowledge"
                evidence = [diagnostic["attempt_id"]]
            learning_gain = False
        elif independent_transfer is not None and correct_practice:
            level = "demonstrated_gain"
            evidence = [
                diagnostic["attempt_id"],
                correct_practice[-1]["attempt_id"],
                independent_transfer["attempt_id"],
            ]
            learning_gain = True
        elif transfer_attempts:
            level = "needs_review"
            evidence = [
                diagnostic["attempt_id"],
                transfer_attempts[-1]["attempt_id"],
            ]
            learning_gain = False
        elif correct_practice:
            level = "practicing"
            evidence = [
                diagnostic["attempt_id"],
                correct_practice[-1]["attempt_id"],
            ]
            learning_gain = False
        else:
            level = "needs_instruction"
            evidence = [diagnostic["attempt_id"]]
            learning_gain = False

        return {
            "concept": concept,
            "level": level,
            "learning_gain": learning_gain,
            "evidence_attempt_ids": evidence,
        }

    def next_action(self, concept: str) -> str:
        level = self.mastery(concept)["level"]
        return {
            "unknown": "diagnose",
            "needs_instruction": "teach_then_practice",
            "practicing": "transfer",
            "needs_review": "reteach",
            "prior_knowledge": "verify_transfer",
            "retained": "finish",
            "demonstrated_gain": "finish",
        }[level]

    def complete_session(self) -> None:
        record = self._record()
        record["session_status"] = "completed"
        record["events"].append({"kind": "session.completed"})
        self._save()

    def resume_session(self) -> None:
        record = self._record()
        record["session_status"] = "running"
        record["events"].append({"kind": "session.resumed"})
        self._save()

    def outcome(self, concept: str) -> Dict[str, Any]:
        return {
            "session_status": self._record()["session_status"],
            "mastery": self.mastery(concept),
        }


def _demo() -> None:
    exercises = [
        Exercise(
            "diag-order",
            "order-of-operations",
            "diagnostic",
            "What is 2 * 3 + 1?",
            "7",
            "Multiply before adding.",
        ),
        Exercise(
            "practice-order",
            "order-of-operations",
            "practice",
            "What is 4 * 2 + 3?",
            "11",
            "Do 4 * 2 first.",
        ),
        Exercise(
            "transfer-order",
            "order-of-operations",
            "transfer",
            "What is 5 + 2 * 4?",
            "13",
            "Which operation has priority?",
        ),
    ]
    with TemporaryDirectory() as temp:
        tutor = EvidenceTutor(
            Path(temp) / "state.json",
            learner_id="learner-1",
            course_id="math-1",
            exercises=exercises,
        )
        tutor.submit_attempt(
            attempt_id="diag-1",
            exercise_id="diag-order",
            answer="8",
        )
        tutor.submit_attempt(
            attempt_id="practice-1",
            exercise_id="practice-order",
            answer="11",
            hints_used=1,
        )
        tutor.complete_session()
        first = tutor.outcome("order-of-operations")

        tutor.resume_session()
        tutor.submit_attempt(
            attempt_id="transfer-1",
            exercise_id="transfer-order",
            answer="13",
        )
        tutor.complete_session()
        second = tutor.outcome("order-of-operations")

        print(
            "first_run="
            f"{first['session_status']}:{first['mastery']['level']}"
        )
        print(
            "second_run="
            f"{second['session_status']}:{second['mastery']['level']}"
        )
        print(
            "evidence="
            + ",".join(second["mastery"]["evidence_attempt_ids"])
        )


if __name__ == "__main__":
    _demo()
