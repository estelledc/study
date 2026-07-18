import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from research_run import ArtifactError, GateError, ResearchRun, StageError


class ResearchRunTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.root = Path(self.temp.name)
        source = self.root / "question.md"
        source.write_text("Can artifacts carry evidence?\n", encoding="utf-8")
        self.run = ResearchRun.create(
            self.root / "run",
            run_id="run-1",
            question="Can artifacts carry evidence?",
            input_path=source,
            workflow_version="lab-v1",
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def pass_evidence(self) -> None:
        self.run.start_stage("evidence")
        self.run.record_artifact(
            "evidence",
            "evidence.json",
            '{"sources": ["paper-1"]}\n',
            producer="evidence-adapter-v1",
            source_artifacts=[],
        )
        self.run.gate_artifact(
            "evidence/evidence.json",
            {"source_present": True, "schema_valid": True},
        )
        self.run.finish_stage("evidence")

    def test_stage_cannot_skip_unpassed_prerequisites(self) -> None:
        with self.assertRaisesRegex(StageError, "evidence"):
            self.run.start_stage("idea")

    def test_required_artifact_must_pass_named_checks(self) -> None:
        self.run.start_stage("evidence")
        self.run.record_artifact(
            "evidence",
            "evidence.json",
            "{}\n",
            producer="evidence-adapter-v1",
            source_artifacts=[],
        )

        with self.assertRaisesRegex(GateError, "failed"):
            self.run.gate_artifact(
                "evidence/evidence.json",
                {"source_present": False, "schema_valid": True},
            )
        with self.assertRaisesRegex(GateError, "not passed"):
            self.run.finish_stage("evidence")

    def test_artifact_hash_detects_post_gate_tampering(self) -> None:
        self.pass_evidence()
        artifact = self.root / "run" / "artifacts/evidence/evidence.json"
        artifact.write_text('{"sources": ["forged"]}\n', encoding="utf-8")

        with self.assertRaisesRegex(ArtifactError, "hash mismatch"):
            self.run.verify_all_artifacts()

    def test_artifact_cannot_cite_unapproved_source(self) -> None:
        self.pass_evidence()
        self.run.start_stage("idea")

        with self.assertRaisesRegex(ArtifactError, "unapproved"):
            self.run.record_artifact(
                "idea",
                "idea.json",
                '{"claim": "unsupported"}\n',
                producer="idea-model-v1",
                source_artifacts=["experiment/results.json"],
            )

    def test_failed_stage_resumes_from_same_stage(self) -> None:
        self.pass_evidence()
        self.run.start_stage("idea")
        self.run.fail_stage(
            "idea",
            category="environment",
            reason="provider timeout",
            retryable=True,
        )

        reopened = ResearchRun.open(self.root / "run")
        self.assertEqual(
            reopened.next_action(),
            {"action": "retry", "stage": "idea"},
        )
        reopened.start_stage("idea")
        self.assertEqual(
            reopened.manifest()["stages"]["idea"]["attempts"],
            2,
        )

    def test_non_retryable_failure_stops_run(self) -> None:
        self.pass_evidence()
        self.run.start_stage("idea")
        self.run.fail_stage(
            "idea",
            category="scientific",
            reason="hypothesis contradicted",
            retryable=False,
        )

        self.assertEqual(
            self.run.next_action(),
            {"action": "stop", "stage": "idea"},
        )

    def test_run_cannot_complete_from_file_presence_alone(self) -> None:
        artifacts = self.root / "run" / "artifacts"
        for stage, name in (
            ("evidence", "evidence.json"),
            ("idea", "idea.json"),
            ("experiment", "results.json"),
            ("report", "report.md"),
        ):
            path = artifacts / stage / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("looks complete\n", encoding="utf-8")

        with self.assertRaisesRegex(StageError, "not passed"):
            self.run.complete()

    def test_happy_path_completes_with_provenance_chain(self) -> None:
        self.pass_evidence()
        previous = "evidence/evidence.json"
        for stage, name in (
            ("idea", "idea.json"),
            ("experiment", "results.json"),
            ("report", "report.md"),
        ):
            self.run.start_stage(stage)
            self.run.record_artifact(
                stage,
                name,
                f"{stage} output\n",
                producer=f"{stage}-producer-v1",
                source_artifacts=[previous],
            )
            artifact_id = f"{stage}/{name}"
            self.run.gate_artifact(
                artifact_id,
                {"schema_valid": True, "claims_supported": True},
            )
            self.run.finish_stage(stage)
            previous = artifact_id

        self.run.complete()
        manifest = self.run.manifest()

        self.assertEqual(manifest["status"], "completed")
        self.assertEqual(
            manifest["artifacts"]["report/report.md"]["source_artifacts"],
            ["experiment/results.json"],
        )
        json.dumps(manifest)


if __name__ == "__main__":
    unittest.main()
