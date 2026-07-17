"""Teaching model for visual-token budgets and device measurement contracts."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Iterable, Optional


class MeasurementError(ValueError):
    pass


@dataclass(frozen=True)
class TokenBudget:
    name: str
    vision_encoder_tokens: int
    llm_initial_visual_tokens: int
    llm_late_visual_tokens: int
    prune_after_layer: int
    decoder_layers: int
    text_tokens: int

    @property
    def initial_sequence_tokens(self) -> int:
        return self.text_tokens + self.llm_initial_visual_tokens

    @property
    def late_sequence_tokens(self) -> int:
        return self.text_tokens + self.llm_late_visual_tokens

    @property
    def token_layer_proxy(self) -> int:
        early = self.initial_sequence_tokens * self.prune_after_layer
        late_layers = self.decoder_layers - self.prune_after_layer
        late = self.late_sequence_tokens * late_layers
        return early + late

    @property
    def attention_pair_proxy(self) -> int:
        early = (
            self.initial_sequence_tokens**2
            * self.prune_after_layer
        )
        late_layers = self.decoder_layers - self.prune_after_layer
        late = self.late_sequence_tokens**2 * late_layers
        return early + late


def patch_grid_tokens(
    width: int,
    height: int,
    *,
    patch_size: int,
) -> int:
    if min(width, height, patch_size) <= 0:
        raise ValueError("image dimensions and patch_size must be positive")
    return math.ceil(width / patch_size) * math.ceil(
        height / patch_size
    )


def patch_vit_budget(
    *,
    name: str,
    width: int,
    height: int,
    patch_size: int,
    text_tokens: int,
    decoder_layers: int,
) -> TokenBudget:
    visual = patch_grid_tokens(
        width,
        height,
        patch_size=patch_size,
    )
    return TokenBudget(
        name=name,
        vision_encoder_tokens=visual,
        llm_initial_visual_tokens=visual,
        llm_late_visual_tokens=visual,
        prune_after_layer=decoder_layers,
        decoder_layers=decoder_layers,
        text_tokens=text_tokens,
    )


def hierarchical_budget(
    *,
    name: str,
    width: int,
    height: int,
    output_stride: int,
    text_tokens: int,
    decoder_layers: int,
) -> TokenBudget:
    visual = patch_grid_tokens(
        width,
        height,
        patch_size=output_stride,
    )
    return TokenBudget(
        name=name,
        vision_encoder_tokens=visual,
        llm_initial_visual_tokens=visual,
        llm_late_visual_tokens=visual,
        prune_after_layer=decoder_layers,
        decoder_layers=decoder_layers,
        text_tokens=text_tokens,
    )


def projector_pool_budget(
    *,
    name: str,
    width: int,
    height: int,
    patch_size: int,
    pooled_tokens: int,
    text_tokens: int,
    decoder_layers: int,
) -> TokenBudget:
    raw_visual = patch_grid_tokens(
        width,
        height,
        patch_size=patch_size,
    )
    if pooled_tokens <= 0 or pooled_tokens > raw_visual:
        raise ValueError("pooled_tokens must be within the raw token count")
    return TokenBudget(
        name=name,
        vision_encoder_tokens=raw_visual,
        llm_initial_visual_tokens=pooled_tokens,
        llm_late_visual_tokens=pooled_tokens,
        prune_after_layer=decoder_layers,
        decoder_layers=decoder_layers,
        text_tokens=text_tokens,
    )


def decoder_prune_budget(
    *,
    name: str,
    visual_tokens: int,
    retained_tokens: int,
    prune_after_layer: int,
    decoder_layers: int,
    text_tokens: int,
) -> TokenBudget:
    if not 0 <= prune_after_layer <= decoder_layers:
        raise ValueError("prune_after_layer must be within decoder layers")
    if not 0 < retained_tokens <= visual_tokens:
        raise ValueError("retained_tokens must be within visual tokens")
    return TokenBudget(
        name=name,
        vision_encoder_tokens=visual_tokens,
        llm_initial_visual_tokens=visual_tokens,
        llm_late_visual_tokens=retained_tokens,
        prune_after_layer=prune_after_layer,
        decoder_layers=decoder_layers,
        text_tokens=text_tokens,
    )


REQUIRED_TTFT_STAGES = (
    "image_decode",
    "preprocess",
    "vision",
    "projector",
    "prefill",
    "first_decode",
)


@dataclass(frozen=True)
class DeviceMeasurement:
    run_id: str
    model_id: str
    model_commit: str
    device: str
    os_version: str
    image_id: str
    prompt_id: str
    cold_start: bool
    thermal_state: str
    max_new_tokens: int
    temperature: float
    stage_ms: Dict[str, float]
    post_first_tokens: int
    decode_ms: float
    peak_memory_mb: float

    def validate(self) -> None:
        required_text = {
            "run_id": self.run_id,
            "model_id": self.model_id,
            "model_commit": self.model_commit,
            "device": self.device,
            "os_version": self.os_version,
            "image_id": self.image_id,
            "prompt_id": self.prompt_id,
            "thermal_state": self.thermal_state,
        }
        missing = [
            name for name, value in required_text.items() if not value
        ]
        if missing:
            raise MeasurementError(
                "missing metadata: " + ", ".join(missing)
            )
        missing_stages = [
            stage
            for stage in REQUIRED_TTFT_STAGES
            if stage not in self.stage_ms
        ]
        if missing_stages:
            raise MeasurementError(
                "missing TTFT stages: " + ", ".join(missing_stages)
            )
        if any(value < 0 for value in self.stage_ms.values()):
            raise MeasurementError("stage latency cannot be negative")
        if (
            self.max_new_tokens <= 0
            or self.post_first_tokens < 0
            or self.decode_ms < 0
            or self.peak_memory_mb <= 0
        ):
            raise MeasurementError("measurement values are invalid")
        if self.post_first_tokens > 0 and self.decode_ms == 0:
            raise MeasurementError(
                "decode_ms must be positive when tokens were decoded"
            )

    @property
    def ttft_ms(self) -> float:
        self.validate()
        return sum(self.stage_ms[stage] for stage in REQUIRED_TTFT_STAGES)

    @property
    def decode_tokens_per_second(self) -> Optional[float]:
        self.validate()
        if self.post_first_tokens == 0:
            return None
        return self.post_first_tokens / (self.decode_ms / 1000.0)


def assert_comparable(
    left: DeviceMeasurement,
    right: DeviceMeasurement,
) -> None:
    left.validate()
    right.validate()
    fields = (
        "device",
        "os_version",
        "image_id",
        "prompt_id",
        "cold_start",
        "thermal_state",
        "max_new_tokens",
        "temperature",
    )
    mismatches = [
        field
        for field in fields
        if getattr(left, field) != getattr(right, field)
    ]
    if mismatches:
        raise MeasurementError(
            "measurements are not comparable: "
            + ", ".join(mismatches)
        )


class LatestFrameBuffer:
    """One-slot buffer for continuous camera backpressure."""

    def __init__(self) -> None:
        self._frame: Optional[str] = None
        self.dropped = 0

    def push(self, frame_id: str) -> None:
        if self._frame is not None:
            self.dropped += 1
        self._frame = frame_id

    def pop(self) -> Optional[str]:
        frame = self._frame
        self._frame = None
        return frame


def _format_budget(budget: TokenBudget) -> str:
    return (
        f"{budget.name}: "
        f"vision_tokens={budget.vision_encoder_tokens} "
        f"llm_initial={budget.llm_initial_visual_tokens} "
        f"llm_late={budget.llm_late_visual_tokens} "
        f"pair_proxy={budget.attention_pair_proxy}"
    )


def _demo() -> None:
    budgets: Iterable[TokenBudget] = (
        patch_vit_budget(
            name="patch_vit",
            width=768,
            height=768,
            patch_size=16,
            text_tokens=64,
            decoder_layers=24,
        ),
        hierarchical_budget(
            name="hierarchical",
            width=768,
            height=768,
            output_stride=32,
            text_tokens=64,
            decoder_layers=24,
        ),
        projector_pool_budget(
            name="projector_pool",
            width=768,
            height=768,
            patch_size=16,
            pooled_tokens=144,
            text_tokens=64,
            decoder_layers=24,
        ),
        decoder_prune_budget(
            name="decoder_prune",
            visual_tokens=576,
            retained_tokens=128,
            prune_after_layer=8,
            decoder_layers=24,
            text_tokens=64,
        ),
    )
    for budget in budgets:
        print(_format_budget(budget))

    measurement = DeviceMeasurement(
        run_id="run-1",
        model_id="demo-vlm",
        model_commit="deadbeef",
        device="example-device",
        os_version="example-os",
        image_id="image-1",
        prompt_id="caption-en-v1",
        cold_start=False,
        thermal_state="nominal",
        max_new_tokens=32,
        temperature=0.0,
        stage_ms={
            "image_decode": 3.0,
            "preprocess": 4.0,
            "vision": 20.0,
            "projector": 2.0,
            "prefill": 40.0,
            "first_decode": 5.0,
        },
        post_first_tokens=31,
        decode_ms=620.0,
        peak_memory_mb=1400.0,
    )
    print(
        f"measurement: ttft_ms={measurement.ttft_ms:.1f} "
        f"decode_tps={measurement.decode_tokens_per_second:.1f}"
    )

    frames = LatestFrameBuffer()
    frames.push("frame-1")
    frames.push("frame-2")
    frames.push("frame-3")
    print(f"camera: next={frames.pop()} dropped={frames.dropped}")


if __name__ == "__main__":
    _demo()
