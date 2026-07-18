"""Deterministic video evidence lab with real FFmpeg decode and provenance."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import BinaryIO, Iterable


REQUIRED_STEPS = ("prepare", "add_sample", "close_lid")
STEP_ALIASES = {
    "prepare": {"prepare", "workspace", "ready"},
    "add_sample": {"add", "sample", "tray", "insert"},
    "close_lid": {"close", "closed", "lid", "finish"},
}
COLOR_TO_STEP = {
    "red": "prepare",
    "yellow": "add_sample",
    "green": "close_lid",
}


@dataclass(frozen=True)
class VideoMetadata:
    path: str
    sha256: str
    duration_seconds: float
    width: int
    height: int
    has_audio: bool


@dataclass(frozen=True)
class FrameEvidence:
    step: str
    color: str
    timestamp: float
    reason: str
    video_sha256: str
    frame_path: str
    frame_sha256: str


@dataclass(frozen=True)
class FocusDecision:
    status: str
    step: str | None
    timestamp: float | None
    start: float | None
    end: float | None


@dataclass(frozen=True)
class TranscriptClaim:
    step: str
    timestamp: float
    confidence: float


@dataclass(frozen=True)
class RubricResult:
    status: str
    observed_steps: tuple[str, ...]
    missing_steps: tuple[str, ...]
    order_ok: bool
    contradictions: tuple[str, ...]


def _require_binary(name: str) -> str:
    binary = shutil.which(name)
    if binary is None:
        raise RuntimeError(f"{name} is required")
    return binary


def _run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_sample_video(path: Path) -> Path:
    """Create a 12-second clip with three known visual steps and one audio track."""
    path.parent.mkdir(parents=True, exist_ok=True)
    ffmpeg = _require_binary("ffmpeg")
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=160x120:d=4:r=10",
        "-f",
        "lavfi",
        "-i",
        "color=c=yellow:s=160x120:d=4:r=10",
        "-f",
        "lavfi",
        "-i",
        "color=c=green:s=160x120:d=4:r=10",
        "-f",
        "lavfi",
        "-i",
        "sine=f=440:d=12",
        "-filter_complex",
        "[0:v][1:v][2:v]concat=n=3:v=1[v]",
        "-map",
        "[v]",
        "-map",
        "3:a",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        str(path),
    ]
    _run(command)
    return path


def probe_video(path: Path) -> VideoMetadata:
    ffprobe = _require_binary("ffprobe")
    result = _run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ]
    )
    payload = json.loads(result.stdout)
    video_stream = next(
        stream for stream in payload["streams"] if stream["codec_type"] == "video"
    )
    has_audio = any(
        stream["codec_type"] == "audio" for stream in payload["streams"]
    )
    return VideoMetadata(
        path=str(path),
        sha256=sha256_file(path),
        duration_seconds=float(payload["format"]["duration"]),
        width=int(video_stream["width"]),
        height=int(video_stream["height"]),
        has_audio=has_audio,
    )


def _next_ppm_token(stream: BinaryIO) -> bytes:
    token = bytearray()
    while True:
        byte = stream.read(1)
        if not byte:
            raise ValueError("unexpected end of PPM header")
        if byte == b"#":
            stream.readline()
            continue
        if not byte.isspace():
            token.extend(byte)
            break
    while True:
        byte = stream.read(1)
        if not byte or byte.isspace():
            return bytes(token)
        token.extend(byte)


def _average_rgb(path: Path) -> tuple[float, float, float]:
    with path.open("rb") as stream:
        if _next_ppm_token(stream) != b"P6":
            raise ValueError("expected binary PPM")
        width = int(_next_ppm_token(stream))
        height = int(_next_ppm_token(stream))
        max_value = int(_next_ppm_token(stream))
        if max_value != 255:
            raise ValueError("expected 8-bit PPM")
        pixels = stream.read(width * height * 3)
    if len(pixels) != width * height * 3:
        raise ValueError("truncated PPM payload")
    count = width * height
    return tuple(
        sum(pixels[index::3]) / count
        for index in range(3)
    )


def classify_color(path: Path) -> str:
    red, green, blue = _average_rgb(path)
    if red > blue * 1.5 and green > blue * 1.5 and abs(red - green) < 80:
        return "yellow"
    if red > green * 1.5 and red > blue * 1.5:
        return "red"
    if green > red * 1.5 and green > blue * 1.5:
        return "green"
    return "unknown"


def extract_frame(
    video: VideoMetadata,
    timestamp: float,
    output_dir: Path,
    *,
    reason: str,
) -> FrameEvidence:
    if timestamp < 0 or timestamp > video.duration_seconds:
        raise ValueError("timestamp outside video")
    output_dir.mkdir(parents=True, exist_ok=True)
    frame_path = output_dir / f"{reason}-{round(timestamp * 1000):05d}.ppm"
    ffmpeg = _require_binary("ffmpeg")
    _run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{timestamp:.3f}",
            "-i",
            video.path,
            "-frames:v",
            "1",
            "-vf",
            "scale=8:8:flags=neighbor",
            "-c:v",
            "ppm",
            str(frame_path),
        ]
    )
    color = classify_color(frame_path)
    return FrameEvidence(
        step=COLOR_TO_STEP.get(color, "unknown"),
        color=color,
        timestamp=timestamp,
        reason=reason,
        video_sha256=video.sha256,
        frame_path=str(frame_path),
        frame_sha256=sha256_file(frame_path),
    )


def global_scan(
    video: VideoMetadata,
    output_dir: Path,
    timestamps: Iterable[float] = (1.0, 5.0, 9.0),
) -> tuple[FrameEvidence, ...]:
    return tuple(
        extract_frame(video, timestamp, output_dir, reason="global")
        for timestamp in timestamps
    )


def focus_for_question(
    question: str,
    evidence: Iterable[FrameEvidence],
    duration_seconds: float,
    *,
    window_seconds: float = 2.0,
) -> FocusDecision:
    terms = set(re.findall(r"[a-z_]+", question.casefold()))
    ranked: list[tuple[int, FrameEvidence]] = []
    for item in evidence:
        score = len(terms & STEP_ALIASES.get(item.step, set()))
        ranked.append((score, item))
    score, best = max(ranked, key=lambda pair: pair[0], default=(0, None))
    if score == 0 or best is None:
        return FocusDecision("no_match", None, None, None, None)
    half = window_seconds / 2
    return FocusDecision(
        status="selected",
        step=best.step,
        timestamp=best.timestamp,
        start=max(0.0, best.timestamp - half),
        end=min(duration_seconds, best.timestamp + half),
    )


def focused_review(
    video: VideoMetadata,
    decision: FocusDecision,
    output_dir: Path,
) -> FrameEvidence:
    if decision.status != "selected" or decision.timestamp is None:
        raise ValueError("focused review requires a selected timestamp")
    return extract_frame(
        video,
        decision.timestamp,
        output_dir,
        reason="focused",
    )


def verify_evidence(item: FrameEvidence, video: VideoMetadata) -> bool:
    frame_path = Path(item.frame_path)
    return (
        item.video_sha256 == video.sha256
        and sha256_file(Path(video.path)) == video.sha256
        and frame_path.is_file()
        and sha256_file(frame_path) == item.frame_sha256
    )


def evaluate_rubric(
    evidence: Iterable[FrameEvidence],
    *,
    required_steps: tuple[str, ...] = REQUIRED_STEPS,
    transcript_claims: Iterable[TranscriptClaim] = (),
    conflict_window_seconds: float = 0.75,
) -> RubricResult:
    ordered = sorted(evidence, key=lambda item: item.timestamp)
    first_timestamp: dict[str, float] = {}
    for item in ordered:
        if item.step in required_steps:
            first_timestamp.setdefault(item.step, item.timestamp)
    observed_steps = tuple(
        step for step in required_steps if step in first_timestamp
    )
    missing_steps = tuple(
        step for step in required_steps if step not in first_timestamp
    )
    timestamps = [
        first_timestamp[step]
        for step in required_steps
        if step in first_timestamp
    ]
    order_ok = timestamps == sorted(timestamps)

    contradictions: list[str] = []
    for claim in transcript_claims:
        if claim.confidence < 0.5:
            continue
        nearest = min(
            ordered,
            key=lambda item: abs(item.timestamp - claim.timestamp),
            default=None,
        )
        if (
            nearest is not None
            and abs(nearest.timestamp - claim.timestamp) <= conflict_window_seconds
            and nearest.step != claim.step
        ):
            contradictions.append(
                f"transcript={claim.step}@{claim.timestamp:.1f} "
                f"visual={nearest.step}@{nearest.timestamp:.1f}"
            )

    if contradictions or not order_ok:
        status = "needs_review"
    elif missing_steps:
        status = "incomplete"
    else:
        status = "passed"
    return RubricResult(
        status=status,
        observed_steps=observed_steps,
        missing_steps=missing_steps,
        order_ok=order_ok,
        contradictions=tuple(contradictions),
    )


def run_lab(output_dir: Path) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    video_path = build_sample_video(output_dir / "sample-procedure.mp4")
    video = probe_video(video_path)
    evidence = global_scan(video, output_dir / "global-frames")
    decision = focus_for_question(
        "When was the sample added to the tray?",
        evidence,
        video.duration_seconds,
    )
    review = focused_review(video, decision, output_dir / "focused-frames")
    passed = evaluate_rubric((*evidence, review))
    conflict = evaluate_rubric(
        evidence,
        transcript_claims=[
            TranscriptClaim(
                step="close_lid",
                timestamp=5.0,
                confidence=0.9,
            )
        ],
    )
    report = {
        "video": asdict(video),
        "global_evidence": [asdict(item) for item in evidence],
        "focus": asdict(decision),
        "focused_review": asdict(review),
        "rubric": asdict(passed),
        "contradiction_gate": asdict(conflict),
    }
    (output_dir / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/tmp/video-evidence-lab"),
    )
    args = parser.parse_args()
    report = run_lab(args.output)
    video = report["video"]
    evidence = report["global_evidence"]
    focus = report["focus"]
    rubric = report["rubric"]
    conflict = report["contradiction_gate"]
    print(
        "video: "
        f"duration={video['duration_seconds']:.1f}s "
        f"size={video['width']}x{video['height']} "
        f"audio={video['has_audio']}"
    )
    print(
        "global: "
        + ", ".join(
            f"{item['step']}@{item['timestamp']:.1f}s"
            for item in evidence
        )
    )
    print(
        "focus: "
        f"{focus['step']} "
        f"{focus['start']:.1f}-{focus['end']:.1f}s"
    )
    print(
        f"rubric={rubric['status']} "
        f"contradiction={conflict['status']}"
    )
    print(f"artifacts={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
