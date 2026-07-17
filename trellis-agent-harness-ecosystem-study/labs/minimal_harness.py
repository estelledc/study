"""Deterministic teaching model for a file-backed coding-agent harness."""

from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory


TRANSITIONS = {
    "planning": "in_progress",
    "in_progress": "review",
    "review": "completed",
}

START_ARTIFACTS = (
    "prd.md",
    "implement.md",
    "implement.jsonl",
    "check.jsonl",
)


class GateError(RuntimeError):
    pass


def read_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def create_task(task_dir: Path, task_id: str) -> None:
    task_dir.mkdir(parents=True)
    write_json(
        task_dir / "task.json",
        {"id": task_id, "status": "planning"},
    )


def set_active_task(workspace: Path, session_id: str, task_id: str) -> None:
    sessions = workspace / "sessions"
    sessions.mkdir(parents=True, exist_ok=True)
    write_json(sessions / f"{session_id}.json", {"active_task": task_id})


def get_active_task(workspace: Path, session_id: str) -> str | None:
    pointer = workspace / "sessions" / f"{session_id}.json"
    if not pointer.exists():
        return None
    value = read_json(pointer).get("active_task")
    return value if isinstance(value, str) else None


def missing_start_artifacts(task_dir: Path) -> list[str]:
    return [name for name in START_ARTIFACTS if not (task_dir / name).is_file()]


def verification_passed(task_dir: Path) -> bool:
    path = task_dir / "verification.json"
    if not path.is_file():
        return False
    checks = read_json(path).get("checks")
    return (
        isinstance(checks, dict)
        and bool(checks)
        and all(value is True for value in checks.values())
    )


def transition(task_dir: Path, target: str) -> None:
    task_path = task_dir / "task.json"
    task = read_json(task_path)
    current = task.get("status")
    expected = TRANSITIONS.get(current)
    if expected != target:
        raise GateError(f"illegal transition: {current} -> {target}")

    if target == "in_progress":
        missing = missing_start_artifacts(task_dir)
        if missing:
            raise GateError("missing start artifacts: " + ", ".join(missing))

    if target == "completed" and not verification_passed(task_dir):
        raise GateError("verification evidence is missing or failed")

    task["status"] = target
    write_json(task_path, task)


def demo(root: Path) -> list[str]:
    task_dir = root / "tasks" / "demo"
    workspace = root / "workspace"
    create_task(task_dir, "demo")
    for name in START_ARTIFACTS:
        (task_dir / name).write_text(f"# {name}\n", encoding="utf-8")

    set_active_task(workspace, "session-a", "demo")
    transition(task_dir, "in_progress")
    transition(task_dir, "review")
    write_json(
        task_dir / "verification.json",
        {"checks": {"lint": True, "tests": True}},
    )
    transition(task_dir, "completed")

    return [
        f"active={get_active_task(workspace, 'session-a')}",
        f"status={read_json(task_dir / 'task.json')['status']}",
        "evidence=lint,tests",
    ]


if __name__ == "__main__":
    with TemporaryDirectory() as temp:
        print("\n".join(demo(Path(temp))))
