import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from minimal_platform import (
    AuthorizationError,
    IdempotencyConflictError,
    MinimalPlatform,
    PublishError,
    QuotaExceededError,
    StreamHub,
)


class MinimalPlatformTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.hub = StreamHub()
        self.platform = MinimalPlatform(
            Path(self.temp.name) / "platform.sqlite3",
            self.hub,
        )
        self.platform.create_session("tenant-a", "session-1")
        self.platform.start_run("tenant-a", "session-1", "run-1")

    def tearDown(self) -> None:
        self.platform.close()
        self.temp.cleanup()

    def test_tenant_cannot_read_another_tenants_workspace(self) -> None:
        self.platform.write_workspace(
            "tenant-a",
            "session-1",
            "secret.txt",
            "tenant-a data",
        )

        with self.assertRaisesRegex(AuthorizationError, "tenant boundary"):
            self.platform.read_workspace(
                "tenant-b",
                "session-1",
                "secret.txt",
            )

    def test_event_id_is_idempotent_but_conflicting_reuse_is_rejected(self) -> None:
        first = self.platform.append_event(
            "tenant-a",
            "session-1",
            "run-1",
            "event-1",
            "message.delta",
            {"text": "hello"},
        )
        repeated = self.platform.append_event(
            "tenant-a",
            "session-1",
            "run-1",
            "event-1",
            "message.delta",
            {"text": "hello"},
        )

        self.assertEqual(first, repeated)
        self.assertEqual(
            len(
                self.platform.list_events(
                    "tenant-a",
                    "session-1",
                    "run-1",
                )
            ),
            1,
        )

        with self.assertRaisesRegex(IdempotencyConflictError, "reused"):
            self.platform.append_event(
                "tenant-a",
                "session-1",
                "run-1",
                "event-1",
                "message.delta",
                {"text": "different operation"},
            )

    def test_live_and_replay_use_the_same_reducer_and_sequence(self) -> None:
        self.hub.connect("browser", "tenant-a", "session-1")
        first = self.platform.append_event(
            "tenant-a",
            "session-1",
            "run-1",
            "event-1",
            "message.delta",
            {"text": "hello"},
        )
        second = self.platform.append_event(
            "tenant-a",
            "session-1",
            "run-1",
            "event-2",
            "message.delta",
            {"text": " world"},
        )

        self.assertEqual((first.sequence, second.sequence), (1, 2))
        self.assertEqual(
            self.hub.snapshot("browser"),
            self.platform.replay_projection(
                "tenant-a",
                "session-1",
                "run-1",
            ),
        )

    def test_quota_fails_closed_when_missing_or_exhausted(self) -> None:
        with self.assertRaisesRegex(QuotaExceededError, "not configured"):
            self.platform.consume_quota("tenant-a", "mcp.github")

        self.platform.configure_quota("tenant-a", "mcp.github", limit=1)
        self.assertEqual(
            self.platform.consume_quota("tenant-a", "mcp.github"),
            1,
        )
        with self.assertRaisesRegex(QuotaExceededError, "exhausted"):
            self.platform.consume_quota("tenant-a", "mcp.github")

    def test_client_disconnect_does_not_cancel_run(self) -> None:
        self.hub.connect("browser", "tenant-a", "session-1")
        self.hub.disconnect("browser")

        self.assertEqual(
            self.platform.get_run_status("tenant-a", "run-1"),
            "running",
        )

    def test_publish_failure_keeps_durable_event_for_replay(self) -> None:
        self.hub.fail_next_publish = True

        with self.assertRaisesRegex(PublishError, "after durable event"):
            self.platform.append_event(
                "tenant-a",
                "session-1",
                "run-1",
                "event-1",
                "message.delta",
                {"text": "recover me"},
            )

        self.assertEqual(
            self.platform.replay_projection(
                "tenant-a",
                "session-1",
                "run-1",
            )["text"],
            "recover me",
        )

    def test_checkpoint_does_not_claim_an_external_side_effect(self) -> None:
        self.platform.save_checkpoint(
            "tenant-a",
            "run-1",
            "checkpoint-1",
            {"next": "send-email"},
        )

        self.assertFalse(
            self.platform.has_side_effect_receipt(
                "tenant-a",
                "email-operation-1",
            )
        )

        self.platform.record_side_effect(
            "tenant-a",
            "email-operation-1",
            "succeeded",
            {"provider_receipt": "mail-42"},
        )
        self.assertTrue(
            self.platform.has_side_effect_receipt(
                "tenant-a",
                "email-operation-1",
            )
        )


if __name__ == "__main__":
    unittest.main()
