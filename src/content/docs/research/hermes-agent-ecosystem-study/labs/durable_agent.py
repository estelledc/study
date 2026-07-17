"""Deterministic teaching model for a durable, learning personal agent."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


class AdmissionError(RuntimeError):
    pass


class LeaseError(RuntimeError):
    pass


class TransitionError(RuntimeError):
    pass


@dataclass(frozen=True)
class Task:
    task_id: str
    goal: str
    status: str
    next_step: str
    lease_owner: str | None
    lease_expires_at: int | None


class DurableAgentStore:
    """SQLite state store whose records survive worker process restarts."""

    def __init__(self, database: Path) -> None:
        self._db = sqlite3.connect(database, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._db.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                goal TEXT NOT NULL,
                status TEXT NOT NULL,
                next_step TEXT NOT NULL,
                lease_owner TEXT,
                lease_expires_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS task_events (
                task_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                kind TEXT NOT NULL,
                payload TEXT NOT NULL,
                PRIMARY KEY (task_id, sequence),
                FOREIGN KEY (task_id) REFERENCES tasks (task_id)
            );

            CREATE TABLE IF NOT EXISTS memory_candidates (
                candidate_id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                source TEXT NOT NULL,
                status TEXT NOT NULL,
                reason TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS memories (
                memory_id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                source TEXT NOT NULL,
                candidate_id TEXT NOT NULL UNIQUE,
                FOREIGN KEY (candidate_id)
                    REFERENCES memory_candidates (candidate_id)
            );

            CREATE TABLE IF NOT EXISTS skill_trials (
                trial_id TEXT PRIMARY KEY,
                skill_name TEXT NOT NULL,
                snapshot TEXT NOT NULL,
                candidate TEXT NOT NULL,
                baseline_score REAL NOT NULL,
                candidate_score REAL,
                status TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS skills (
                skill_name TEXT PRIMARY KEY,
                body TEXT NOT NULL,
                version INTEGER NOT NULL
            );
            """
        )

    def close(self) -> None:
        self._db.close()

    def create_task(self, task_id: str, goal: str, first_step: str) -> None:
        self._db.execute(
            """
            INSERT INTO tasks (
                task_id, goal, status, next_step,
                lease_owner, lease_expires_at
            ) VALUES (?, ?, 'pending', ?, NULL, NULL)
            """,
            (task_id, goal, first_step),
        )
        self._append_event(task_id, "task.created", {"next_step": first_step})

    def claim_task(
        self,
        task_id: str,
        worker_id: str,
        *,
        now: int,
        lease_seconds: int,
    ) -> Task:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            task = self._task_row(task_id)
            current_owner = task["lease_owner"]
            expires_at = task["lease_expires_at"]
            lease_is_live = (
                current_owner is not None
                and expires_at is not None
                and int(expires_at) > now
            )
            if lease_is_live and current_owner != worker_id:
                raise LeaseError(f"task is leased by {current_owner}")
            if task["status"] == "completed":
                raise TransitionError("completed task cannot be claimed")

            self._db.execute(
                """
                UPDATE tasks
                SET status = 'running',
                    lease_owner = ?,
                    lease_expires_at = ?
                WHERE task_id = ?
                """,
                (worker_id, now + lease_seconds, task_id),
            )
            self._append_event_in_transaction(
                task_id,
                "task.claimed",
                {"worker_id": worker_id, "recovered": current_owner is not None},
            )
            self._db.execute("COMMIT")
        except Exception:
            self._db.execute("ROLLBACK")
            raise
        return self.get_task(task_id)

    def checkpoint(
        self,
        task_id: str,
        worker_id: str,
        *,
        completed_step: str,
        next_step: str,
        now: int,
    ) -> None:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            self._require_live_owner(task_id, worker_id, now)
            if not next_step.strip():
                raise TransitionError("checkpoint requires a concrete next step")
            self._db.execute(
                """
                UPDATE tasks SET next_step = ?
                WHERE task_id = ?
                """,
                (next_step, task_id),
            )
            self._append_event_in_transaction(
                task_id,
                "task.checkpointed",
                {
                    "completed_step": completed_step,
                    "next_step": next_step,
                },
            )
            self._db.execute("COMMIT")
        except Exception:
            self._db.execute("ROLLBACK")
            raise

    def complete_task(self, task_id: str, worker_id: str, *, now: int) -> None:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            self._require_live_owner(task_id, worker_id, now)
            self._db.execute(
                """
                UPDATE tasks
                SET status = 'completed',
                    next_step = '',
                    lease_owner = NULL,
                    lease_expires_at = NULL
                WHERE task_id = ?
                """,
                (task_id,),
            )
            self._append_event_in_transaction(
                task_id,
                "task.completed",
                {"worker_id": worker_id},
            )
            self._db.execute("COMMIT")
        except Exception:
            self._db.execute("ROLLBACK")
            raise

    def get_task(self, task_id: str) -> Task:
        row = self._task_row(task_id)
        return Task(
            task_id=str(row["task_id"]),
            goal=str(row["goal"]),
            status=str(row["status"]),
            next_step=str(row["next_step"]),
            lease_owner=row["lease_owner"],
            lease_expires_at=row["lease_expires_at"],
        )

    def task_events(self, task_id: str) -> list[dict[str, Any]]:
        rows = self._db.execute(
            """
            SELECT sequence, kind, payload
            FROM task_events
            WHERE task_id = ?
            ORDER BY sequence
            """,
            (task_id,),
        ).fetchall()
        return [
            {
                "sequence": int(row["sequence"]),
                "kind": str(row["kind"]),
                "payload": json.loads(row["payload"]),
            }
            for row in rows
        ]

    def propose_memory(
        self,
        candidate_id: str,
        content: str,
        *,
        source: str,
    ) -> None:
        if not source.strip():
            raise AdmissionError("memory candidate requires a source")
        self._db.execute(
            """
            INSERT INTO memory_candidates (
                candidate_id, content, source, status, reason
            ) VALUES (?, ?, ?, 'pending', '')
            """,
            (candidate_id, content, source),
        )

    def review_memory(
        self,
        candidate_id: str,
        *,
        verified: bool,
        reason: str,
    ) -> str:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            row = self._db.execute(
                """
                SELECT * FROM memory_candidates
                WHERE candidate_id = ?
                """,
                (candidate_id,),
            ).fetchone()
            if row is None:
                raise AdmissionError("unknown memory candidate")
            if row["status"] != "pending":
                raise AdmissionError("memory candidate was already reviewed")

            duplicate = self._db.execute(
                "SELECT 1 FROM memories WHERE content = ?",
                (row["content"],),
            ).fetchone()
            accepted = verified and duplicate is None
            status = "accepted" if accepted else "rejected"
            final_reason = (
                reason
                if duplicate is None
                else "duplicate long-term memory"
            )
            self._db.execute(
                """
                UPDATE memory_candidates
                SET status = ?, reason = ?
                WHERE candidate_id = ?
                """,
                (status, final_reason, candidate_id),
            )
            if accepted:
                self._db.execute(
                    """
                    INSERT INTO memories (
                        memory_id, content, source, candidate_id
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (
                        f"memory:{candidate_id}",
                        row["content"],
                        row["source"],
                        candidate_id,
                    ),
                )
            self._db.execute("COMMIT")
            return status
        except Exception:
            self._db.execute("ROLLBACK")
            raise

    def memory_count(self) -> int:
        row = self._db.execute("SELECT COUNT(*) AS count FROM memories").fetchone()
        return int(row["count"])

    def install_skill(self, skill_name: str, body: str) -> None:
        self._db.execute(
            """
            INSERT INTO skills (skill_name, body, version)
            VALUES (?, ?, 1)
            """,
            (skill_name, body),
        )

    def start_skill_trial(
        self,
        trial_id: str,
        skill_name: str,
        candidate: str,
        *,
        baseline_score: float,
    ) -> None:
        skill = self._db.execute(
            "SELECT body FROM skills WHERE skill_name = ?",
            (skill_name,),
        ).fetchone()
        if skill is None:
            raise AdmissionError("skill trial requires an installed skill")
        self._db.execute(
            """
            INSERT INTO skill_trials (
                trial_id, skill_name, snapshot, candidate,
                baseline_score, candidate_score, status
            ) VALUES (?, ?, ?, ?, ?, NULL, 'pending')
            """,
            (
                trial_id,
                skill_name,
                skill["body"],
                candidate,
                baseline_score,
            ),
        )

    def evaluate_skill_trial(
        self,
        trial_id: str,
        *,
        candidate_score: float,
        minimum_gain: float,
    ) -> str:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            trial = self._trial_row(trial_id)
            if trial["status"] != "pending":
                raise AdmissionError("skill trial was already evaluated")
            promoted = (
                candidate_score
                >= float(trial["baseline_score"]) + minimum_gain
            )
            status = "promoted" if promoted else "reverted"
            if promoted:
                self._db.execute(
                    """
                    UPDATE skills
                    SET body = ?, version = version + 1
                    WHERE skill_name = ?
                    """,
                    (trial["candidate"], trial["skill_name"]),
                )
            self._db.execute(
                """
                UPDATE skill_trials
                SET candidate_score = ?, status = ?
                WHERE trial_id = ?
                """,
                (candidate_score, status, trial_id),
            )
            self._db.execute("COMMIT")
            return status
        except Exception:
            self._db.execute("ROLLBACK")
            raise

    def rollback_skill_trial(self, trial_id: str) -> None:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            trial = self._trial_row(trial_id)
            if trial["status"] != "promoted":
                raise TransitionError("only a promoted trial can be rolled back")
            self._db.execute(
                """
                UPDATE skills
                SET body = ?, version = version + 1
                WHERE skill_name = ?
                """,
                (trial["snapshot"], trial["skill_name"]),
            )
            self._db.execute(
                """
                UPDATE skill_trials SET status = 'rolled_back'
                WHERE trial_id = ?
                """,
                (trial_id,),
            )
            self._db.execute("COMMIT")
        except Exception:
            self._db.execute("ROLLBACK")
            raise

    def skill_body(self, skill_name: str) -> str:
        row = self._db.execute(
            "SELECT body FROM skills WHERE skill_name = ?",
            (skill_name,),
        ).fetchone()
        if row is None:
            raise KeyError(skill_name)
        return str(row["body"])

    def _task_row(self, task_id: str) -> sqlite3.Row:
        row = self._db.execute(
            "SELECT * FROM tasks WHERE task_id = ?",
            (task_id,),
        ).fetchone()
        if row is None:
            raise KeyError(task_id)
        return row

    def _trial_row(self, trial_id: str) -> sqlite3.Row:
        row = self._db.execute(
            "SELECT * FROM skill_trials WHERE trial_id = ?",
            (trial_id,),
        ).fetchone()
        if row is None:
            raise KeyError(trial_id)
        return row

    def _require_live_owner(
        self,
        task_id: str,
        worker_id: str,
        now: int,
    ) -> None:
        task = self._task_row(task_id)
        if (
            task["lease_owner"] != worker_id
            or task["lease_expires_at"] is None
            or int(task["lease_expires_at"]) <= now
        ):
            raise LeaseError("worker does not hold a live task lease")

    def _append_event(
        self,
        task_id: str,
        kind: str,
        payload: dict[str, Any],
    ) -> None:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            self._append_event_in_transaction(task_id, kind, payload)
            self._db.execute("COMMIT")
        except Exception:
            self._db.execute("ROLLBACK")
            raise

    def _append_event_in_transaction(
        self,
        task_id: str,
        kind: str,
        payload: dict[str, Any],
    ) -> None:
        row = self._db.execute(
            """
            SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
            FROM task_events WHERE task_id = ?
            """,
            (task_id,),
        ).fetchone()
        self._db.execute(
            """
            INSERT INTO task_events (task_id, sequence, kind, payload)
            VALUES (?, ?, ?, ?)
            """,
            (
                task_id,
                int(row["next_sequence"]),
                kind,
                json.dumps(payload, sort_keys=True),
            ),
        )


def demo(database: Path) -> list[str]:
    store = DurableAgentStore(database)
    try:
        store.create_task("task-1", "prepare handoff", "collect evidence")
        store.claim_task("task-1", "worker-a", now=0, lease_seconds=10)
        store.checkpoint(
            "task-1",
            "worker-a",
            completed_step="collect evidence",
            next_step="write summary",
            now=1,
        )
    finally:
        store.close()

    recovered = DurableAgentStore(database)
    try:
        task = recovered.claim_task(
            "task-1",
            "worker-b",
            now=11,
            lease_seconds=10,
        )
        recovered.propose_memory(
            "candidate-1",
            "Always persist the next concrete step.",
            source="task-1:event-2",
        )
        memory_status = recovered.review_memory(
            "candidate-1",
            verified=True,
            reason="supported by the recovery trace",
        )
        recovered.install_skill("handoff", "write a summary")
        recovered.start_skill_trial(
            "trial-1",
            "handoff",
            "write evidence, remaining work, and next step",
            baseline_score=0.6,
        )
        trial_status = recovered.evaluate_skill_trial(
            "trial-1",
            candidate_score=0.85,
            minimum_gain=0.1,
        )
        return [
            f"recovered_next={task.next_step}",
            f"memory={memory_status}",
            f"trial={trial_status}",
            f"events={len(recovered.task_events('task-1'))}",
        ]
    finally:
        recovered.close()


if __name__ == "__main__":
    with TemporaryDirectory() as temp:
        print("\n".join(demo(Path(temp) / "durable-agent.sqlite3")))
