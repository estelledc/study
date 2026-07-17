"""Deterministic teaching model for a production-style agent platform."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


class AuthorizationError(RuntimeError):
    pass


class IdempotencyConflictError(RuntimeError):
    pass


class PublishError(RuntimeError):
    pass


class QuotaExceededError(RuntimeError):
    pass


@dataclass(frozen=True)
class Event:
    tenant_id: str
    session_id: str
    run_id: str
    event_id: str
    sequence: int
    event_type: str
    payload: dict[str, Any]


def _empty_projection() -> dict[str, Any]:
    return {"text": "", "status": "idle", "event_ids": []}


def reduce_projection(state: dict[str, Any], event: Event) -> dict[str, Any]:
    """Apply one event to both live and replayed client state."""
    if event.event_id in state["event_ids"]:
        return state

    next_state = {
        "text": state["text"],
        "status": state["status"],
        "event_ids": [*state["event_ids"], event.event_id],
    }
    if event.event_type == "message.delta":
        next_state["text"] += str(event.payload.get("text", ""))
    elif event.event_type == "run.status":
        next_state["status"] = str(event.payload["status"])
    return next_state


class StreamHub:
    """In-memory live projection; disconnecting never owns run lifecycle."""

    def __init__(self) -> None:
        self._subscribers: dict[str, tuple[str, str, dict[str, Any]]] = {}
        self.fail_next_publish = False

    def connect(self, client_id: str, tenant_id: str, session_id: str) -> None:
        self._subscribers[client_id] = (
            tenant_id,
            session_id,
            _empty_projection(),
        )

    def disconnect(self, client_id: str) -> None:
        self._subscribers.pop(client_id, None)

    def publish(self, event: Event) -> None:
        if self.fail_next_publish:
            self.fail_next_publish = False
            raise PublishError(f"live publish failed after durable event {event.event_id}")

        for client_id, (tenant_id, session_id, state) in list(
            self._subscribers.items()
        ):
            if tenant_id == event.tenant_id and session_id == event.session_id:
                self._subscribers[client_id] = (
                    tenant_id,
                    session_id,
                    reduce_projection(state, event),
                )

    def snapshot(self, client_id: str) -> dict[str, Any]:
        state = self._subscribers[client_id][2]
        return {
            "text": state["text"],
            "status": state["status"],
            "event_ids": list(state["event_ids"]),
        }


class MinimalPlatform:
    """Small SQLite control plane with tenant-scoped state and durable events."""

    def __init__(self, database: Path, stream_hub: StreamHub) -> None:
        self._db = sqlite3.connect(database, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        self._hub = stream_hub
        self._db.executescript(
            """
            PRAGMA foreign_keys = ON;

            CREATE TABLE sessions (
                tenant_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                PRIMARY KEY (tenant_id, session_id)
            );

            CREATE TABLE runs (
                tenant_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                status TEXT NOT NULL,
                PRIMARY KEY (tenant_id, run_id),
                FOREIGN KEY (tenant_id, session_id)
                    REFERENCES sessions (tenant_id, session_id)
            );

            CREATE TABLE workspaces (
                tenant_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                path TEXT NOT NULL,
                content TEXT NOT NULL,
                PRIMARY KEY (tenant_id, session_id, path),
                FOREIGN KEY (tenant_id, session_id)
                    REFERENCES sessions (tenant_id, session_id)
            );

            CREATE TABLE events (
                tenant_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                PRIMARY KEY (tenant_id, event_id),
                UNIQUE (tenant_id, run_id, sequence),
                FOREIGN KEY (tenant_id, run_id)
                    REFERENCES runs (tenant_id, run_id)
            );

            CREATE TABLE quotas (
                tenant_id TEXT NOT NULL,
                resource TEXT NOT NULL,
                limit_value INTEGER NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tenant_id, resource)
            );

            CREATE TABLE checkpoints (
                tenant_id TEXT NOT NULL,
                run_id TEXT NOT NULL,
                checkpoint_id TEXT NOT NULL,
                state TEXT NOT NULL,
                PRIMARY KEY (tenant_id, run_id, checkpoint_id),
                FOREIGN KEY (tenant_id, run_id)
                    REFERENCES runs (tenant_id, run_id)
            );

            CREATE TABLE side_effect_receipts (
                tenant_id TEXT NOT NULL,
                operation_id TEXT NOT NULL,
                status TEXT NOT NULL,
                result TEXT NOT NULL,
                PRIMARY KEY (tenant_id, operation_id)
            );
            """
        )

    def close(self) -> None:
        self._db.close()

    def create_session(self, tenant_id: str, session_id: str) -> None:
        self._db.execute(
            "INSERT INTO sessions (tenant_id, session_id) VALUES (?, ?)",
            (tenant_id, session_id),
        )

    def start_run(self, tenant_id: str, session_id: str, run_id: str) -> None:
        self._require_session(tenant_id, session_id)
        self._db.execute(
            """
            INSERT INTO runs (tenant_id, run_id, session_id, status)
            VALUES (?, ?, ?, 'running')
            """,
            (tenant_id, run_id, session_id),
        )

    def get_run_status(self, tenant_id: str, run_id: str) -> str:
        row = self._db.execute(
            "SELECT status FROM runs WHERE tenant_id = ? AND run_id = ?",
            (tenant_id, run_id),
        ).fetchone()
        if row is None:
            raise AuthorizationError("run is outside the tenant boundary")
        return str(row["status"])

    def write_workspace(
        self,
        tenant_id: str,
        session_id: str,
        path: str,
        content: str,
    ) -> None:
        self._require_session(tenant_id, session_id)
        self._db.execute(
            """
            INSERT INTO workspaces (tenant_id, session_id, path, content)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (tenant_id, session_id, path)
            DO UPDATE SET content = excluded.content
            """,
            (tenant_id, session_id, path, content),
        )

    def read_workspace(self, tenant_id: str, session_id: str, path: str) -> str:
        self._require_session(tenant_id, session_id)
        row = self._db.execute(
            """
            SELECT content FROM workspaces
            WHERE tenant_id = ? AND session_id = ? AND path = ?
            """,
            (tenant_id, session_id, path),
        ).fetchone()
        if row is None:
            raise FileNotFoundError(path)
        return str(row["content"])

    def configure_quota(self, tenant_id: str, resource: str, limit: int) -> None:
        self._db.execute(
            """
            INSERT INTO quotas (tenant_id, resource, limit_value, used)
            VALUES (?, ?, ?, 0)
            """,
            (tenant_id, resource, limit),
        )

    def consume_quota(self, tenant_id: str, resource: str) -> int:
        self._db.execute("BEGIN IMMEDIATE")
        try:
            row = self._db.execute(
                """
                SELECT limit_value, used FROM quotas
                WHERE tenant_id = ? AND resource = ?
                """,
                (tenant_id, resource),
            ).fetchone()
            if row is None:
                raise QuotaExceededError("quota is not configured; refusing open access")
            if row["used"] >= row["limit_value"]:
                raise QuotaExceededError(f"{resource} quota exhausted")
            used = int(row["used"]) + 1
            self._db.execute(
                """
                UPDATE quotas SET used = ?
                WHERE tenant_id = ? AND resource = ?
                """,
                (used, tenant_id, resource),
            )
            self._db.execute("COMMIT")
            return used
        except Exception:
            self._db.execute("ROLLBACK")
            raise

    def append_event(
        self,
        tenant_id: str,
        session_id: str,
        run_id: str,
        event_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> Event:
        """Commit once, then publish; reconnect repairs a publish failure."""
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        self._db.execute("BEGIN IMMEDIATE")
        try:
            self._require_run(tenant_id, session_id, run_id)
            existing = self._db.execute(
                """
                SELECT * FROM events
                WHERE tenant_id = ? AND event_id = ?
                """,
                (tenant_id, event_id),
            ).fetchone()
            if existing is not None:
                event = self._event_from_row(existing)
                same_operation = (
                    event.session_id == session_id
                    and event.run_id == run_id
                    and event.event_type == event_type
                    and event.payload == payload
                )
                if not same_operation:
                    raise IdempotencyConflictError(
                        f"event id {event_id} was reused for another operation"
                    )
                self._db.execute("COMMIT")
                return event

            row = self._db.execute(
                """
                SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
                FROM events WHERE tenant_id = ? AND run_id = ?
                """,
                (tenant_id, run_id),
            ).fetchone()
            sequence = int(row["next_sequence"])
            self._db.execute(
                """
                INSERT INTO events (
                    tenant_id, session_id, run_id, event_id,
                    sequence, event_type, payload
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tenant_id,
                    session_id,
                    run_id,
                    event_id,
                    sequence,
                    event_type,
                    encoded,
                ),
            )
            self._db.execute("COMMIT")
        except Exception:
            self._db.execute("ROLLBACK")
            raise

        event = Event(
            tenant_id=tenant_id,
            session_id=session_id,
            run_id=run_id,
            event_id=event_id,
            sequence=sequence,
            event_type=event_type,
            payload=payload,
        )
        self._hub.publish(event)
        return event

    def list_events(self, tenant_id: str, session_id: str, run_id: str) -> list[Event]:
        self._require_run(tenant_id, session_id, run_id)
        rows = self._db.execute(
            """
            SELECT * FROM events
            WHERE tenant_id = ? AND session_id = ? AND run_id = ?
            ORDER BY sequence
            """,
            (tenant_id, session_id, run_id),
        ).fetchall()
        return [self._event_from_row(row) for row in rows]

    def replay_projection(
        self,
        tenant_id: str,
        session_id: str,
        run_id: str,
    ) -> dict[str, Any]:
        state = _empty_projection()
        for event in self.list_events(tenant_id, session_id, run_id):
            state = reduce_projection(state, event)
        return state

    def save_checkpoint(
        self,
        tenant_id: str,
        run_id: str,
        checkpoint_id: str,
        state: dict[str, Any],
    ) -> None:
        self.get_run_status(tenant_id, run_id)
        self._db.execute(
            """
            INSERT INTO checkpoints (tenant_id, run_id, checkpoint_id, state)
            VALUES (?, ?, ?, ?)
            """,
            (tenant_id, run_id, checkpoint_id, json.dumps(state, sort_keys=True)),
        )

    def record_side_effect(
        self,
        tenant_id: str,
        operation_id: str,
        status: str,
        result: dict[str, Any],
    ) -> None:
        self._db.execute(
            """
            INSERT INTO side_effect_receipts (
                tenant_id, operation_id, status, result
            ) VALUES (?, ?, ?, ?)
            """,
            (
                tenant_id,
                operation_id,
                status,
                json.dumps(result, sort_keys=True),
            ),
        )

    def has_side_effect_receipt(self, tenant_id: str, operation_id: str) -> bool:
        row = self._db.execute(
            """
            SELECT 1 FROM side_effect_receipts
            WHERE tenant_id = ? AND operation_id = ?
            """,
            (tenant_id, operation_id),
        ).fetchone()
        return row is not None

    def _require_session(self, tenant_id: str, session_id: str) -> None:
        row = self._db.execute(
            """
            SELECT 1 FROM sessions
            WHERE tenant_id = ? AND session_id = ?
            """,
            (tenant_id, session_id),
        ).fetchone()
        if row is None:
            raise AuthorizationError("session is outside the tenant boundary")

    def _require_run(self, tenant_id: str, session_id: str, run_id: str) -> None:
        row = self._db.execute(
            """
            SELECT 1 FROM runs
            WHERE tenant_id = ? AND session_id = ? AND run_id = ?
            """,
            (tenant_id, session_id, run_id),
        ).fetchone()
        if row is None:
            raise AuthorizationError("run is outside the tenant boundary")

    @staticmethod
    def _event_from_row(row: sqlite3.Row) -> Event:
        return Event(
            tenant_id=str(row["tenant_id"]),
            session_id=str(row["session_id"]),
            run_id=str(row["run_id"]),
            event_id=str(row["event_id"]),
            sequence=int(row["sequence"]),
            event_type=str(row["event_type"]),
            payload=json.loads(row["payload"]),
        )


def demo(database: Path) -> list[str]:
    hub = StreamHub()
    platform = MinimalPlatform(database, hub)
    try:
        platform.create_session("tenant-a", "session-1")
        platform.start_run("tenant-a", "session-1", "run-1")
        platform.configure_quota("tenant-a", "mcp.github", limit=1)
        hub.connect("browser-1", "tenant-a", "session-1")

        platform.consume_quota("tenant-a", "mcp.github")
        platform.append_event(
            "tenant-a",
            "session-1",
            "run-1",
            "event-1",
            "message.delta",
            {"text": "hello"},
        )
        live = hub.snapshot("browser-1")
        hub.disconnect("browser-1")

        hub.fail_next_publish = True
        try:
            platform.append_event(
                "tenant-a",
                "session-1",
                "run-1",
                "event-2",
                "message.delta",
                {"text": " world"},
            )
        except PublishError:
            pass

        try:
            platform.consume_quota("tenant-a", "mcp.github")
        except QuotaExceededError:
            quota_result = "blocked"

        replay = platform.replay_projection("tenant-a", "session-1", "run-1")
        return [
            f"live={live['text']}",
            f"replay={replay['text']}",
            f"run_after_disconnect={platform.get_run_status('tenant-a', 'run-1')}",
            f"quota={quota_result}",
        ]
    finally:
        platform.close()


if __name__ == "__main__":
    with TemporaryDirectory() as temp:
        print("\n".join(demo(Path(temp) / "platform.sqlite3")))
