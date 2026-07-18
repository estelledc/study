import importlib.util
import unittest

from document_parser_lab import (
    DEFAULT_PDF,
    ParserOutput,
    SourceUnit,
    evaluate,
    normalize_text,
    phrase_coverage,
    phrases_in_order,
    run_comparison,
)


class DocumentParserLabTests(unittest.TestCase):
    def test_normalize_text_collapses_whitespace_and_case(self) -> None:
        self.assertEqual(
            normalize_text("  Hello\n  WORLD  "),
            "hello world",
        )

    def test_phrase_coverage_reports_missing_content(self) -> None:
        hits, total = phrase_coverage(
            "alpha gamma",
            ["alpha", "beta", "gamma"],
        )
        self.assertEqual((hits, total), (2, 3))

    def test_order_requires_all_phrases_in_sequence(self) -> None:
        phrases = ["first", "second", "third"]
        self.assertTrue(
            phrases_in_order("first x second y third", phrases)
        )
        self.assertFalse(
            phrases_in_order("second x first y third", phrases)
        )
        self.assertFalse(
            phrases_in_order("first x third", phrases)
        )

    def test_evaluate_keeps_structure_separate_from_text_metrics(self) -> None:
        output = ParserOutput(
            parser="structured",
            text="first second",
            units=[
                SourceUnit("first", page=0, bbox_count=2),
                SourceUnit("second", page=0, bbox_count=1),
            ],
        )
        metrics = evaluate(output, ["first", "second"])
        self.assertEqual(metrics.phrase_hits, 2)
        self.assertTrue(metrics.order_ok)
        self.assertEqual(metrics.units, 2)
        self.assertEqual(metrics.source_boxes, 3)

    def test_text_only_output_can_pass_content_without_provenance(self) -> None:
        output = ParserOutput(
            parser="text-only",
            text="first second",
            units=[SourceUnit("first second")],
        )
        metrics = evaluate(output, ["first", "second"])
        self.assertEqual(metrics.phrase_hits, 2)
        self.assertTrue(metrics.order_ok)
        self.assertEqual(metrics.source_boxes, 0)

    @unittest.skipUnless(
        importlib.util.find_spec("markitdown")
        and importlib.util.find_spec("openparse"),
        "MarkItDown and OpenParse are not installed",
    )
    def test_same_pdf_comparison_preserves_required_content(self) -> None:
        metrics = run_comparison(DEFAULT_PDF)
        self.assertEqual(
            [item.parser for item in metrics],
            ["markitdown", "openparse"],
        )
        for item in metrics:
            self.assertEqual(
                item.phrase_hits,
                item.phrase_total,
            )
            self.assertTrue(item.order_ok)

    @unittest.skipUnless(
        importlib.util.find_spec("markitdown")
        and importlib.util.find_spec("openparse"),
        "MarkItDown and OpenParse are not installed",
    )
    def test_openparse_exposes_more_source_structure(self) -> None:
        by_parser = {
            item.parser: item
            for item in run_comparison(DEFAULT_PDF)
        }
        self.assertEqual(by_parser["markitdown"].source_boxes, 0)
        self.assertGreater(by_parser["openparse"].units, 1)
        self.assertGreater(by_parser["openparse"].source_boxes, 0)


if __name__ == "__main__":
    unittest.main()
