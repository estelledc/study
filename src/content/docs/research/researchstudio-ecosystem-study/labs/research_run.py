"""Deterministic teaching model for an artifact-first research run."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


class ArtifactError(RuntimeError):
    pass


class GateError(RuntimeError):
    pass


class StageError(RuntimeError):
    pass


STAGES = ("evidence", "idea", "experiment", "report")
REQUIRED_ARTIFACTS = {
    "evidence": ("evidence.json",),
    "idea": ("idea.json",),
    "experiment": ("results.json",),
    "report": ("report.md",),
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


class ResearchRun:
    """File-backed run whose manifest is the recovery and audit authority."""

    def __init__(self, run_dir: Path) -> None:
        self.run_dir = run_dir
        self.manifest_path = run_dir / "run-manifest.json"

    @classmethod
    def create(
        cls,
        run_dir: Path,
        *,
        run_id: str,
        question: str,
        input_path: Path,
        workflow_version: str,
    ) -> ResearchRun:
        if run_dir.exists():
            raise StageError("run directory already exists")
        if not input_path.is_file():
            raise FileNotFoundError(input_path)

        run_dir.mkdir(parents=True)
        run = cls(run_dir)
        input_copy = run_dir / "inputs" / input_path.name
        input_copy.parent.mkdir()
        input_copy.write_bytes(input_path.read_bytes())

        _write_json(
            run.manifest_path,
            {
                "schema_version": 1,
                "run_id": run_id,
                "question": question,
                "status": "running",
                "workflow_version": workflow_version,
                "inputs": [
                    {
                        "path": str(input_copy.relative_to(run_dir)),
                        "sha256": _sha256(input_copy),
                    }
                ],
                "stages": {
                    stage: {
                        "status": "pending",
                        "attempts": 0,
                        "failure": None,
                    }
                    for stage in STAGES
                },
                "artifacts": {},
                "events": [
                    {
                        "sequence": 1,
                        "kind": "run.created",
                        "payload": {"question": question},
                    }
                ],
            },
        )
        return run

    @classmethod
    def open(cls, run_dir: Path) -> ResearchRun:
        run = cls(run_dir)
        if not run.manifest_path.is_file():
            raise FileNotFoundError(run.manifest_path)
        run.verify_inputs()
        return run

    def manifest(self) -> dict[str, Any]:
        return _read_json(self.manifest_path)

    def start_stage(self, stage: str) -> None:
        manifest = self.manifest()
        self._require_stage(stage)
        index = STAGES.index(stage)
        incomplete = [
            prior
            for prior in STAGES[:index]
            if manifest["stages"][prior]["status"] != "passed"
        ]
        if incomplete:
            raise StageError(
                "prior stages are not passed: " + ", ".join(incomplete)
            )
        current = manifest["stages"][stage]["status"]
        if current not in {"pending", "failed"}:
            raise StageError(f"cannot start {stage} from {current}")

        record = manifest["stages"][stage]
        record["status"] = "running"
        record["attempts"] += 1
        record["failure"] = None
        self._event(manifest, "stage.started", {"stage": stage})
        _write_json(self.manifest_path, manifest)

    def record_artifact(
        self,
        stage: str,
        name: str,
        content: str,
        *,
        producer: str,
        source_artifacts: list[str],
    ) -> Path:
        manifest = self.manifest()
        self._require_stage(stage)
        if manifest["stages"][stage]["status"] != "running":
            raise StageError("artifact producer does not own a running stage")
        unknown_sources = [
            source
            for source in source_artifacts
            if source not in manifest["artifacts"]
            or manifest["artifacts"][source]["gate"] != "passed"
        ]
        if unknown_sources:
            raise ArtifactError(
                "source artifacts are missing or unapproved: "
                + ", ".join(unknown_sources)
            )

        artifact_path = self.run_dir / "artifacts" / stage / name
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(content, encoding="utf-8")
        artifact_id = f"{stage}/{name}"
        manifest["artifacts"][artifact_id] = {
            "stage": stage,
            "path": str(artifact_path.relative_to(self.run_dir)),
            "sha256": _sha256(artifact_path),
            "producer": producer,
            "source_artifacts": source_artifacts,
            "gate": "pending",
            "gate_checks": {},
        }
        self._event(
            manifest,
            "artifact.recorded",
            {"artifact_id": artifact_id},
        )
        _write_json(self.manifest_path, manifest)
        return artifact_path

    def gate_artifact(
        self,
        artifact_id: str,
        checks: dict[str, bool],
    ) -> None:
        manifest = self.manifest()
        artifact = manifest["artifacts"].get(artifact_id)
        if artifact is None:
            raise ArtifactError(f"unknown artifact: {artifact_id}")
        if not checks:
            raise GateError("artifact gate requires named checks")
        self._verify_artifact_record(artifact_id, artifact)

        passed = all(value is True for value in checks.values())
        artifact["gate_checks"] = checks
        artifact["gate"] = "passed" if passed else "failed"
        self._event(
            manifest,
            "artifact.gated",
            {"artifact_id": artifact_id, "passed": passed},
        )
        _write_json(self.manifest_path, manifest)
        if not passed:
            raise GateError(f"artifact gate failed: {artifact_id}")

    def finish_stage(self, stage: str) -> None:
        manifest = self.manifest()
        self._require_stage(stage)
        if manifest["stages"][stage]["status"] != "running":
            raise StageError(f"stage is not running: {stage}")

        missing = []
        failed = []
        for name in REQUIRED_ARTIFACTS[stage]:
            artifact_id = f"{stage}/{name}"
            artifact = manifest["artifacts"].get(artifact_id)
            if artifact is None:
                missing.append(artifact_id)
                continue
            self._verify_artifact_record(artifact_id, artifact)
            if artifact["gate"] != "passed":
                failed.append(artifact_id)
        if missing:
            raise StageError("required artifacts missing: " + ", ".join(missing))
        if failed:
            raise GateError("artifacts have not passed: " + ", ".join(failed))

        manifest["stages"][stage]["status"] = "passed"
        self._event(manifest, "stage.passed", {"stage": stage})
        _write_json(self.manifest_path, manifest)

    def fail_stage(
        self,
        stage: str,
        *,
        category: str,
        reason: str,
        retryable: bool,
    ) -> None:
        manifest = self.manifest()
        self._require_stage(stage)
        if manifest["stages"][stage]["status"] != "running":
            raise StageError(f"stage is not running: {stage}")
        manifest["stages"][stage]["status"] = "failed"
        manifest["stages"][stage]["failure"] = {
            "category": category,
            "reason": reason,
            "retryable": retryable,
        }
        self._event(
            manifest,
            "stage.failed",
            {"stage": stage, "category": category, "retryable": retryable},
        )
        _write_json(self.manifest_path, manifest)

    def next_action(self) -> dict[str, str]:
        manifest = self.manifest()
        for stage in STAGES:
            record = manifest["stages"][stage]
            if record["status"] == "failed":
                failure = record["failure"]
                if not failure["retryable"]:
                    return {"action": "stop", "stage": stage}
                return {"action": "retry", "stage": stage}
            if record["status"] == "pending":
                return {"action": "start", "stage": stage}
            if record["status"] == "running":
                return {"action": "continue", "stage": stage}
        return {"action": "complete", "stage": ""}

    def complete(self) -> None:
        manifest = self.manifest()
        incomplete = [
            stage
            for stage in STAGES
            if manifest["stages"][stage]["status"] != "passed"
        ]
        if incomplete:
            raise StageError(
                "run stages are not passed: " + ", ".join(incomplete)
            )
        self.verify_all_artifacts()
        manifest["status"] = "completed"
        self._event(manifest, "run.completed", {})
        _write_json(self.manifest_path, manifest)

    def verify_inputs(self) -> None:
        manifest = self.manifest()
        for record in manifest["inputs"]:
            path = self.run_dir / record["path"]
            if not path.is_file() or _sha256(path) != record["sha256"]:
                raise ArtifactError(f"input integrity failed: {record['path']}")

    def verify_all_artifacts(self) -> None:
        manifest = self.manifest()
        for artifact_id, record in manifest["artifacts"].items():
            self._verify_artifact_record(artifact_id, record)
            if record["gate"] != "passed":
                raise GateError(f"artifact is not approved: {artifact_id}")

    def _verify_artifact_record(
        self,
        artifact_id: str,
        record: dict[str, Any],
    ) -> None:
        path = self.run_dir / record["path"]
        if not path.is_file():
            raise ArtifactError(f"artifact is missing: {artifact_id}")
        if _sha256(path) != record["sha256"]:
            raise ArtifactError(f"artifact hash mismatch: {artifact_id}")
        if not record["producer"]:
            raise ArtifactError(f"artifact has no producer: {artifact_id}")

    @staticmethod
    def _require_stage(stage: str) -> None:
        if stage not in STAGES:
            raise KeyError(stage)

    @staticmethod
    def _event(
        manifest: dict[str, Any],
        kind: str,
        payload: dict[str, Any],
    ) -> None:
        manifest["events"].append(
            {
                "sequence": len(manifest["events"]) + 1,
                "kind": kind,
                "payload": payload,
            }
        )


def demo(root: Path) -> list[str]:
    source = root / "question.md"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_text("How should artifacts be verified?\n", encoding="utf-8")
    run = ResearchRun.create(
        root / "run",
        run_id="demo",
        question="How should artifacts be verified?",
        input_path=source,
        workflow_version="lab-v1",
    )
    run.start_stage("evidence")
    run.record_artifact(
        "evidence",
        "evidence.json",
        '{"sources": ["source-1"]}\n',
        producer="evidence-adapter-v1",
        source_artifacts=[],
    )
    run.gate_artifact(
        "evidence/evidence.json",
        {"source_present": True, "schema_valid": True},
    )
    run.finish_stage("evidence")
    run.start_stage("idea")
    run.fail_stage(
        "idea",
        category="environment",
        reason="provider unavailable",
        retryable=True,
    )

    recovered = ResearchRun.open(root / "run")
    return [
        f"next={recovered.next_action()['action']}:idea",
        f"evidence_gate={recovered.manifest()['artifacts']['evidence/evidence.json']['gate']}",
        f"events={len(recovered.manifest()['events'])}",
    ]


if __name__ == "__main__":
    with TemporaryDirectory() as temp:
        print("\n".join(demo(Path(temp))))
