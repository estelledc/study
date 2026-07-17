import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from minimal_harness import (
    START_ARTIFACTS,
    GateError,
    create_task,
    get_active_task,
    read_json,
    set_active_task,
    transition,
    write_json,
)


class MinimalHarnessTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.task_dir = self.root / "tasks" / "demo"
        create_task(self.task_dir, "demo")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def write_start_artifacts(self) -> None:
        for name in START_ARTIFACTS:
            (self.task_dir / name).write_text(
                f"# {name}\n",
                encoding="utf-8",
            )

    def test_missing_artifact_blocks_implementation(self) -> None:
        with self.assertRaisesRegex(GateError, "missing start artifacts"):
            transition(self.task_dir, "in_progress")
        self.assertEqual(
            read_json(self.task_dir / "task.json")["status"],
            "planning",
        )

    def test_complete_requires_passing_verification(self) -> None:
        self.write_start_artifacts()
        transition(self.task_dir, "in_progress")
        transition(self.task_dir, "review")
        write_json(
            self.task_dir / "verification.json",
            {"checks": {"lint": True, "tests": False}},
        )

        with self.assertRaisesRegex(GateError, "verification evidence"):
            transition(self.task_dir, "completed")

    def test_happy_path_reaches_completed(self) -> None:
        self.write_start_artifacts()
        transition(self.task_dir, "in_progress")
        transition(self.task_dir, "review")
        write_json(
            self.task_dir / "verification.json",
            {"checks": {"lint": True, "tests": True}},
        )
        transition(self.task_dir, "completed")

        self.assertEqual(
            read_json(self.task_dir / "task.json")["status"],
            "completed",
        )

    def test_illegal_transition_is_rejected(self) -> None:
        with self.assertRaisesRegex(
            GateError,
            "illegal transition: planning -> completed",
        ):
            transition(self.task_dir, "completed")

    def test_session_pointers_do_not_overwrite_each_other(self) -> None:
        workspace = self.root / "workspace"
        set_active_task(workspace, "session-a", "demo-a")
        set_active_task(workspace, "session-b", "demo-b")

        self.assertEqual(get_active_task(workspace, "session-a"), "demo-a")
        self.assertEqual(get_active_task(workspace, "session-b"), "demo-b")

        files = sorted((workspace / "sessions").glob("*.json"))
        self.assertEqual([path.name for path in files], ["session-a.json", "session-b.json"])
        for path in files:
            json.loads(path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
