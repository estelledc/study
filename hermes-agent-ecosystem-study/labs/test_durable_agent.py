import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from durable_agent import (
    AdmissionError,
    DurableAgentStore,
    LeaseError,
    TransitionError,
)


class DurableAgentStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.database = Path(self.temp.name) / "agent.sqlite3"
        self.store = DurableAgentStore(self.database)
        self.store.create_task("task-1", "prepare handoff", "collect evidence")

    def tearDown(self) -> None:
        self.store.close()
        self.temp.cleanup()

    def test_live_lease_blocks_a_second_worker(self) -> None:
        self.store.claim_task("task-1", "worker-a", now=0, lease_seconds=10)

        with self.assertRaisesRegex(LeaseError, "worker-a"):
            self.store.claim_task(
                "task-1",
                "worker-b",
                now=5,
                lease_seconds=10,
            )

    def test_expired_lease_allows_recovery_from_next_step(self) -> None:
        self.store.claim_task("task-1", "worker-a", now=0, lease_seconds=10)
        self.store.checkpoint(
            "task-1",
            "worker-a",
            completed_step="collect evidence",
            next_step="write summary",
            now=1,
        )

        task = self.store.claim_task(
            "task-1",
            "worker-b",
            now=11,
            lease_seconds=10,
        )

        self.assertEqual(task.next_step, "write summary")
        self.assertEqual(task.lease_owner, "worker-b")

    def test_checkpoint_survives_store_restart(self) -> None:
        self.store.claim_task("task-1", "worker-a", now=0, lease_seconds=10)
        self.store.checkpoint(
            "task-1",
            "worker-a",
            completed_step="collect evidence",
            next_step="write summary",
            now=1,
        )
        self.store.close()

        self.store = DurableAgentStore(self.database)

        self.assertEqual(
            self.store.get_task("task-1").next_step,
            "write summary",
        )
        self.assertEqual(
            [event["kind"] for event in self.store.task_events("task-1")],
            ["task.created", "task.claimed", "task.checkpointed"],
        )

    def test_non_owner_cannot_checkpoint_or_complete(self) -> None:
        self.store.claim_task("task-1", "worker-a", now=0, lease_seconds=10)

        with self.assertRaisesRegex(LeaseError, "live task lease"):
            self.store.checkpoint(
                "task-1",
                "worker-b",
                completed_step="guess",
                next_step="overwrite",
                now=1,
            )
        with self.assertRaisesRegex(LeaseError, "live task lease"):
            self.store.complete_task("task-1", "worker-b", now=1)

    def test_memory_requires_source_and_explicit_verification(self) -> None:
        with self.assertRaisesRegex(AdmissionError, "source"):
            self.store.propose_memory(
                "candidate-0",
                "unsupported claim",
                source="",
            )

        self.store.propose_memory(
            "candidate-1",
            "Use a stable operation ID.",
            source="task-1:event-1",
        )
        status = self.store.review_memory(
            "candidate-1",
            verified=False,
            reason="tool output was not independently checked",
        )

        self.assertEqual(status, "rejected")
        self.assertEqual(self.store.memory_count(), 0)

    def test_duplicate_memory_is_rejected(self) -> None:
        for candidate_id in ("candidate-1", "candidate-2"):
            self.store.propose_memory(
                candidate_id,
                "Persist the next concrete step.",
                source=f"task-1:{candidate_id}",
            )

        self.assertEqual(
            self.store.review_memory(
                "candidate-1",
                verified=True,
                reason="trace verified",
            ),
            "accepted",
        )
        self.assertEqual(
            self.store.review_memory(
                "candidate-2",
                verified=True,
                reason="second trace",
            ),
            "rejected",
        )
        self.assertEqual(self.store.memory_count(), 1)

    def test_skill_trial_promotes_only_after_measured_gain(self) -> None:
        self.store.install_skill("handoff", "write a summary")
        self.store.start_skill_trial(
            "trial-1",
            "handoff",
            "write evidence and next step",
            baseline_score=0.6,
        )

        status = self.store.evaluate_skill_trial(
            "trial-1",
            candidate_score=0.8,
            minimum_gain=0.1,
        )

        self.assertEqual(status, "promoted")
        self.assertEqual(
            self.store.skill_body("handoff"),
            "write evidence and next step",
        )

    def test_failed_skill_trial_preserves_snapshot_and_rollback_restores_it(self) -> None:
        self.store.install_skill("handoff", "original")
        self.store.start_skill_trial(
            "trial-bad",
            "handoff",
            "regression",
            baseline_score=0.7,
        )
        self.assertEqual(
            self.store.evaluate_skill_trial(
                "trial-bad",
                candidate_score=0.72,
                minimum_gain=0.1,
            ),
            "reverted",
        )
        self.assertEqual(self.store.skill_body("handoff"), "original")

        self.store.start_skill_trial(
            "trial-good",
            "handoff",
            "improved",
            baseline_score=0.7,
        )
        self.store.evaluate_skill_trial(
            "trial-good",
            candidate_score=0.9,
            minimum_gain=0.1,
        )
        self.store.rollback_skill_trial("trial-good")

        self.assertEqual(self.store.skill_body("handoff"), "original")
        with self.assertRaisesRegex(TransitionError, "promoted"):
            self.store.rollback_skill_trial("trial-bad")


if __name__ == "__main__":
    unittest.main()
