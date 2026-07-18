from __future__ import annotations

import shutil
import tempfile
import unittest
from pathlib import Path

from video_evidence_lab import (
    FrameEvidence,
    TranscriptClaim,
    build_sample_video,
    evaluate_rubric,
    extract_frame,
    focus_for_question,
    focused_review,
    global_scan,
    probe_video,
    verify_evidence,
)


@unittest.skipUnless(
    shutil.which("ffmpeg") and shutil.which("ffprobe"),
    "ffmpeg and ffprobe are required",
)
class VideoEvidenceLabTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._temp_dir = tempfile.TemporaryDirectory()
        cls.root = Path(cls._temp_dir.name)
        cls.video = probe_video(
            build_sample_video(cls.root / "sample.mp4")
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls._temp_dir.cleanup()

    def test_real_video_probe_has_expected_media_contract(self) -> None:
        self.assertAlmostEqual(
            self.video.duration_seconds,
            12.0,
            delta=0.2,
        )
        self.assertEqual(
            (self.video.width, self.video.height),
            (160, 120),
        )
        self.assertTrue(self.video.has_audio)
        self.assertEqual(len(self.video.sha256), 64)

    def test_real_decode_recovers_three_known_visual_steps(self) -> None:
        evidence = global_scan(
            self.video,
            self.root / "global-three",
        )
        self.assertEqual(
            [item.color for item in evidence],
            ["red", "yellow", "green"],
        )
        self.assertEqual(
            [item.step for item in evidence],
            ["prepare", "add_sample", "close_lid"],
        )
        self.assertTrue(
            all(verify_evidence(item, self.video) for item in evidence)
        )

    def test_question_driven_focus_reuses_global_evidence(self) -> None:
        evidence = global_scan(
            self.video,
            self.root / "global-focus",
        )
        decision = focus_for_question(
            "When was the sample added to the tray?",
            evidence,
            self.video.duration_seconds,
        )
        self.assertEqual(decision.status, "selected")
        self.assertEqual(decision.step, "add_sample")
        self.assertEqual(decision.timestamp, 5.0)
        self.assertEqual((decision.start, decision.end), (4.0, 6.0))

        review = focused_review(
            self.video,
            decision,
            self.root / "focused",
        )
        self.assertEqual(review.step, "add_sample")
        self.assertEqual(review.reason, "focused")

    def test_unmatched_question_does_not_invent_a_window(self) -> None:
        evidence = global_scan(
            self.video,
            self.root / "global-no-match",
        )
        decision = focus_for_question(
            "Who signed the document?",
            evidence,
            self.video.duration_seconds,
        )
        self.assertEqual(decision.status, "no_match")
        self.assertIsNone(decision.timestamp)

    def test_complete_ordered_evidence_passes_rubric(self) -> None:
        evidence = global_scan(
            self.video,
            self.root / "global-pass",
        )
        result = evaluate_rubric(evidence)
        self.assertEqual(result.status, "passed")
        self.assertEqual(
            result.observed_steps,
            ("prepare", "add_sample", "close_lid"),
        )
        self.assertEqual(result.missing_steps, ())
        self.assertTrue(result.order_ok)

    def test_missing_step_stays_incomplete(self) -> None:
        evidence = global_scan(
            self.video,
            self.root / "global-missing",
            timestamps=(1.0, 9.0),
        )
        result = evaluate_rubric(evidence)
        self.assertEqual(result.status, "incomplete")
        self.assertEqual(result.missing_steps, ("add_sample",))

    def test_out_of_order_evidence_requires_review(self) -> None:
        evidence = (
            self._fake("prepare", 1.0),
            self._fake("add_sample", 9.0),
            self._fake("close_lid", 5.0),
        )
        result = evaluate_rubric(evidence)
        self.assertEqual(result.status, "needs_review")
        self.assertFalse(result.order_ok)

    def test_cross_modal_contradiction_cannot_auto_pass(self) -> None:
        evidence = global_scan(
            self.video,
            self.root / "global-conflict",
        )
        result = evaluate_rubric(
            evidence,
            transcript_claims=[
                TranscriptClaim(
                    step="close_lid",
                    timestamp=5.0,
                    confidence=0.9,
                )
            ],
        )
        self.assertEqual(result.status, "needs_review")
        self.assertEqual(len(result.contradictions), 1)
        self.assertIn("visual=add_sample", result.contradictions[0])

    def test_evidence_hash_detects_frame_tampering(self) -> None:
        evidence = extract_frame(
            self.video,
            1.0,
            self.root / "tamper",
            reason="test",
        )
        self.assertTrue(verify_evidence(evidence, self.video))
        Path(evidence.frame_path).write_bytes(b"tampered")
        self.assertFalse(verify_evidence(evidence, self.video))

    def _fake(self, step: str, timestamp: float) -> FrameEvidence:
        return FrameEvidence(
            step=step,
            color="synthetic",
            timestamp=timestamp,
            reason="unit",
            video_sha256=self.video.sha256,
            frame_path=self.video.path,
            frame_sha256=self.video.sha256,
        )


if __name__ == "__main__":
    unittest.main()
