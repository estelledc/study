"""Small CPU comparison for text coverage, order, and provenance."""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional


RESEARCH_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PDF = (
    RESEARCH_ROOT
    / "repos"
    / "markitdown"
    / "packages"
    / "markitdown"
    / "tests"
    / "test_files"
    / "test.pdf"
)
REQUIRED_PHRASES = (
    "Introduction",
    "Large language models (LLMs)",
    "Customizable and conversable agents",
    "Conversation programming",
)


@dataclass(frozen=True)
class SourceUnit:
    text: str
    page: Optional[int] = None
    bbox_count: int = 0


@dataclass(frozen=True)
class ParserOutput:
    parser: str
    text: str
    units: List[SourceUnit]


@dataclass(frozen=True)
class Metrics:
    parser: str
    phrase_hits: int
    phrase_total: int
    order_ok: bool
    text_chars: int
    units: int
    source_boxes: int


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def phrase_coverage(text: str, phrases: Iterable[str]) -> tuple[int, int]:
    normalized = normalize_text(text)
    phrase_list = list(phrases)
    hits = sum(
        normalize_text(phrase) in normalized
        for phrase in phrase_list
    )
    return hits, len(phrase_list)


def phrases_in_order(text: str, phrases: Iterable[str]) -> bool:
    normalized = normalize_text(text)
    cursor = -1
    for phrase in phrases:
        position = normalized.find(normalize_text(phrase), cursor + 1)
        if position < 0 or position < cursor:
            return False
        cursor = position
    return True


def evaluate(output: ParserOutput, phrases: Iterable[str]) -> Metrics:
    phrase_list = tuple(phrases)
    hits, total = phrase_coverage(output.text, phrase_list)
    return Metrics(
        parser=output.parser,
        phrase_hits=hits,
        phrase_total=total,
        order_ok=phrases_in_order(output.text, phrase_list),
        text_chars=len(output.text),
        units=len(output.units),
        source_boxes=sum(unit.bbox_count for unit in output.units),
    )


def parse_with_markitdown(path: Path) -> ParserOutput:
    from markitdown import MarkItDown

    result = MarkItDown().convert(path)
    return ParserOutput(
        parser="markitdown",
        text=result.markdown,
        units=[SourceUnit(text=result.markdown)],
    )


def parse_with_openparse(path: Path) -> ParserOutput:
    import openparse

    parsed = openparse.DocumentParser().parse(path)
    units = [
        SourceUnit(
            text=node.text,
            page=min(
                (bbox.page for bbox in node.bbox),
                default=None,
            ),
            bbox_count=len(node.bbox),
        )
        for node in parsed.nodes
    ]
    return ParserOutput(
        parser="openparse",
        text="\n".join(unit.text for unit in units),
        units=units,
    )


def run_comparison(path: Path) -> List[Metrics]:
    outputs = [
        parse_with_markitdown(path),
        parse_with_openparse(path),
    ]
    return [evaluate(output, REQUIRED_PHRASES) for output in outputs]


def _format(metrics: Metrics) -> str:
    return (
        f"{metrics.parser}: "
        f"phrases={metrics.phrase_hits}/{metrics.phrase_total} "
        f"order={'pass' if metrics.order_ok else 'fail'} "
        f"chars={metrics.text_chars} "
        f"units={metrics.units} "
        f"source_boxes={metrics.source_boxes}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_PDF)
    args = parser.parse_args()
    if not args.input.is_file():
        raise FileNotFoundError(args.input)

    metrics = run_comparison(args.input)
    for item in metrics:
        print(_format(item))

    return 0 if all(
        item.phrase_hits == item.phrase_total and item.order_ok
        for item in metrics
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
