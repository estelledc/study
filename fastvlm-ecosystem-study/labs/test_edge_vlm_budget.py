import unittest

from edge_vlm_budget import (
    DeviceMeasurement,
    LatestFrameBuffer,
    MeasurementError,
    assert_comparable,
    decoder_prune_budget,
    hierarchical_budget,
    patch_grid_tokens,
    patch_vit_budget,
    projector_pool_budget,
)


def measurement(**overrides) -> DeviceMeasurement:
    values = {
        "run_id": "run-1",
        "model_id": "model-a",
        "model_commit": "abc123",
        "device": "phone-a",
        "os_version": "os-1",
        "image_id": "image-1",
        "prompt_id": "prompt-1",
        "cold_start": False,
        "thermal_state": "nominal",
        "max_new_tokens": 32,
        "temperature": 0.0,
        "stage_ms": {
            "image_decode": 3.0,
            "preprocess": 4.0,
            "vision": 20.0,
            "projector": 2.0,
            "prefill": 40.0,
            "first_decode": 5.0,
        },
        "post_first_tokens": 31,
        "decode_ms": 620.0,
        "peak_memory_mb": 1400.0,
    }
    values.update(overrides)
    return DeviceMeasurement(**values)


class EdgeVlmBudgetTests(unittest.TestCase):
    def test_doubling_resolution_quadruples_patch_tokens(self) -> None:
        small = patch_grid_tokens(384, 384, patch_size=16)
        large = patch_grid_tokens(768, 768, patch_size=16)
        self.assertEqual(large, small * 4)

    def test_hierarchical_output_reduces_llm_visual_tokens(self) -> None:
        plain = patch_vit_budget(
            name="plain",
            width=768,
            height=768,
            patch_size=16,
            text_tokens=64,
            decoder_layers=24,
        )
        hierarchical = hierarchical_budget(
            name="hierarchical",
            width=768,
            height=768,
            output_stride=32,
            text_tokens=64,
            decoder_layers=24,
        )
        self.assertLess(
            hierarchical.llm_initial_visual_tokens,
            plain.llm_initial_visual_tokens,
        )
        self.assertLess(
            hierarchical.attention_pair_proxy,
            plain.attention_pair_proxy,
        )

    def test_projector_pooling_does_not_erase_vision_work(self) -> None:
        pooled = projector_pool_budget(
            name="pooled",
            width=768,
            height=768,
            patch_size=16,
            pooled_tokens=144,
            text_tokens=64,
            decoder_layers=24,
        )
        self.assertEqual(pooled.vision_encoder_tokens, 2304)
        self.assertEqual(pooled.llm_initial_visual_tokens, 144)

    def test_decoder_pruning_keeps_early_layer_cost(self) -> None:
        pruned = decoder_prune_budget(
            name="pruned",
            visual_tokens=576,
            retained_tokens=128,
            prune_after_layer=8,
            decoder_layers=24,
            text_tokens=64,
        )
        early_only_floor = pruned.initial_sequence_tokens * 8
        self.assertGreater(pruned.token_layer_proxy, early_only_floor)
        self.assertEqual(pruned.vision_encoder_tokens, 576)

    def test_ttft_is_sum_of_named_stages(self) -> None:
        result = measurement()
        self.assertEqual(result.ttft_ms, 74.0)
        self.assertEqual(result.decode_tokens_per_second, 50.0)

    def test_measurement_missing_metadata_or_stage_fails(self) -> None:
        with self.assertRaisesRegex(MeasurementError, "metadata"):
            measurement(device="").validate()

        stages = dict(measurement().stage_ms)
        stages.pop("vision")
        with self.assertRaisesRegex(MeasurementError, "vision"):
            measurement(stage_ms=stages).validate()

    def test_cold_and_warm_runs_are_not_comparable(self) -> None:
        with self.assertRaisesRegex(MeasurementError, "cold_start"):
            assert_comparable(
                measurement(cold_start=True),
                measurement(cold_start=False),
            )

    def test_output_contract_must_match_for_comparison(self) -> None:
        with self.assertRaisesRegex(
            MeasurementError,
            "max_new_tokens",
        ):
            assert_comparable(
                measurement(max_new_tokens=32),
                measurement(max_new_tokens=64),
            )

    def test_latest_frame_buffer_drops_stale_frames(self) -> None:
        frames = LatestFrameBuffer()
        frames.push("frame-1")
        frames.push("frame-2")
        frames.push("frame-3")
        self.assertEqual(frames.pop(), "frame-3")
        self.assertEqual(frames.dropped, 2)
        self.assertIsNone(frames.pop())


if __name__ == "__main__":
    unittest.main()
