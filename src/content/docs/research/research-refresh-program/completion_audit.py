"""Deterministic completion audit for the 14-category research refresh."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
PROGRAM_DIR = Path(__file__).resolve().parent
RESEARCH_DIR = PROGRAM_DIR.parent
META_DIR = ROOT / "explorations" / "_meta"
MANIFEST_PATH = PROGRAM_DIR / "manifest.json"
MATRIX_PATH = PROGRAM_DIR / "coverage-matrix.md"
PROGRAM_README_PATH = PROGRAM_DIR / "README.md"
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
FRONTMATTER_PATTERN = re.compile(
    r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)",
    re.DOTALL,
)
ANSWER_MARKERS = (
    "答案",
    "检查点",
    "answer",
)
COMMAND_MARKERS = (
    "```bash",
    "```sh",
    "python3 ",
    "pytest",
    "make ",
    "cargo ",
    "npm ",
    "pnpm ",
    "uv ",
)


@dataclass(frozen=True)
class Card:
    card_id: str
    path: Path
    fields: dict[str, str]

    @property
    def upstream(self) -> str:
        return self.fields["upstream"]

    @property
    def local_path(self) -> Path:
        return ROOT / self.fields["local_path"]


class Audit:
    def __init__(self, *, check_worktrees: bool) -> None:
        self.check_worktrees = check_worktrees
        self.errors: list[str] = []
        self.notes: list[str] = []

    def fail(self, message: str) -> None:
        self.errors.append(message)

    def expect_equal(
        self,
        label: str,
        actual: Any,
        expected: Any,
    ) -> None:
        if actual != expected:
            self.fail(
                f"{label}: expected {expected!r}, got {actual!r}"
            )

    def run(self) -> int:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        expected = manifest["expected"]
        categories = manifest["categories"]

        self._audit_categories(categories, expected)
        cards = self._audit_cards(categories, expected)
        self._audit_relationships(
            categories,
            cards,
            manifest,
            expected,
        )
        self._audit_local_copies(
            cards,
            manifest["compatibility_paths"],
            expected,
        )
        self._audit_program_documents(categories, expected)

        if self.check_worktrees:
            self._audit_worktrees(
                cards,
                manifest["compatibility_paths"],
            )

        if self.errors:
            for message in self.errors:
                print(f"ERROR {message}")
            print(
                "completion-audit: FAIL "
                f"({len(self.errors)} error(s))"
            )
            return 1

        for message in self.notes:
            print(f"OK {message}")
        print(
            "completion-audit: PASS "
            f"({expected['categories']} categories, "
            f"{expected['member_relationships']} relationships, "
            f"{expected['unique_upstreams']} upstreams, "
            f"{expected['local_copies']} local copies)"
        )
        return 0

    def _audit_categories(
        self,
        categories: list[dict[str, Any]],
        expected: dict[str, int],
    ) -> None:
        self.expect_equal(
            "category count",
            len(categories),
            expected["categories"],
        )
        category_ids = [category["id"] for category in categories]
        self.expect_equal(
            "unique category ids",
            len(set(category_ids)),
            len(category_ids),
        )
        actual_dirs = {
            path.name
            for path in RESEARCH_DIR.glob("*-study")
            if path.is_dir()
        }
        manifest_dirs = {
            category["directory"]
            for category in categories
        }
        self.expect_equal(
            "study directories",
            actual_dirs,
            manifest_dirs,
        )

        experiment_paths: set[Path] = set()
        for category in categories:
            directory = RESEARCH_DIR / category["directory"]
            readme = directory / "README.md"
            if not readme.is_file():
                self.fail(f"{category['id']}: missing README.md")
                continue
            readme_text = readme.read_text(encoding="utf-8")
            for label in ("entry", "experiment", "self_test"):
                path = directory / category[label]
                if not path.is_file():
                    self.fail(
                        f"{category['id']}: missing {label} "
                        f"{path.relative_to(ROOT)}"
                    )
            for path_value in category["project_guides"]:
                path = directory / path_value
                if not path.is_file():
                    self.fail(
                        f"{category['id']}: missing project guide "
                        f"{path.relative_to(ROOT)}"
                    )

            entry_name = Path(category["entry"]).name
            experiment_name = Path(category["experiment"]).name
            if category["entry"] != "README.md":
                if entry_name not in readme_text:
                    self.fail(
                        f"{category['id']}: README does not link entry "
                        f"{entry_name}"
                    )
            if experiment_name not in readme_text:
                self.fail(
                    f"{category['id']}: README does not link experiment "
                    f"{experiment_name}"
                )
            if "证据" not in readme_text and "evidence" not in readme_text.casefold():
                self.fail(
                    f"{category['id']}: README lacks evidence boundary"
                )

            experiment = directory / category["experiment"]
            if experiment.is_file():
                experiment_paths.add(experiment)
                experiment_text = experiment.read_text(encoding="utf-8")
                if not any(
                    marker in experiment_text
                    for marker in COMMAND_MARKERS
                ):
                    self.fail(
                        f"{category['id']}: experiment lacks runnable command"
                    )

            self_test = directory / category["self_test"]
            if self_test.is_file():
                self_test_text = self_test.read_text(encoding="utf-8")
                question_count = (
                    self_test_text.count("?")
                    + self_test_text.count("？")
                )
                if question_count < 3:
                    self.fail(
                        f"{category['id']}: fewer than 3 self-test questions"
                    )
                folded = self_test_text.casefold()
                if not any(
                    marker.casefold() in folded
                    for marker in ANSWER_MARKERS
                ):
                    self.fail(
                        f"{category['id']}: self-test lacks answer checkpoints"
                    )

        self.expect_equal(
            "experiment documents",
            len(experiment_paths),
            expected["experiment_documents"],
        )
        category_markdown = sum(
            1
            for category in categories
            for _ in (
                RESEARCH_DIR / category["directory"]
            ).glob("*.md")
        )
        self.expect_equal(
            "category markdown files",
            category_markdown,
            expected["category_markdown_files"],
        )
        lab_tests = list(
            RESEARCH_DIR.glob("*-study/labs/test_*.py")
        )
        self.expect_equal(
            "lab test modules",
            len(lab_tests),
            expected["lab_test_modules"],
        )
        self.notes.append(
            f"{len(categories)}/{len(categories)} category contracts present"
        )

    def _audit_cards(
        self,
        categories: list[dict[str, Any]],
        expected: dict[str, int],
    ) -> dict[str, Card]:
        member_ids = [
            card_id
            for category in categories
            for card_id in category["members"]
        ]
        self.expect_equal(
            "member relationships",
            len(member_ids),
            expected["member_relationships"],
        )
        unique_ids = set(member_ids)
        self.expect_equal(
            "unique project cards",
            len(unique_ids),
            expected["unique_cards"],
        )

        cards: dict[str, Card] = {}
        for card_id in sorted(unique_ids):
            path = META_DIR / f"{card_id}.md"
            if not path.is_file():
                self.fail(f"missing project card {path.relative_to(ROOT)}")
                continue
            fields = parse_frontmatter(path)
            card = Card(card_id=card_id, path=path, fields=fields)
            cards[card_id] = card
            required = (
                "name",
                "id",
                "bucket",
                "local_path",
                "upstream",
                "pinned_commit",
                "last_remote_main",
                "restore_path",
                "last_checked",
            )
            missing = [
                field
                for field in required
                if not fields.get(field)
            ]
            if missing:
                self.fail(
                    f"{card_id}: missing card fields {missing}"
                )
                continue
            if fields["id"] != card_id:
                self.fail(
                    f"{card_id}: frontmatter id is {fields['id']}"
                )
            if fields["bucket"] != "research":
                self.fail(
                    f"{card_id}: bucket is {fields['bucket']}, expected research"
                )
            if not SHA_PATTERN.fullmatch(fields["pinned_commit"]):
                self.fail(f"{card_id}: invalid pinned_commit")
            if (
                fields["last_remote_main"] != "暂无"
                and not SHA_PATTERN.fullmatch(
                    fields["last_remote_main"]
                )
            ):
                self.fail(f"{card_id}: invalid last_remote_main")
            if fields["local_path"] != fields["restore_path"]:
                self.fail(
                    f"{card_id}: local_path and restore_path differ"
                )
            if not card.local_path.is_dir():
                self.fail(
                    f"{card_id}: missing clone {fields['local_path']}"
                )
            elif not (card.local_path / ".git").exists():
                self.fail(
                    f"{card_id}: clone lacks .git at {fields['local_path']}"
                )

        self.notes.append(
            f"{len(cards)}/{expected['unique_cards']} unique project cards resolved"
        )
        return cards

    def _audit_relationships(
        self,
        categories: list[dict[str, Any]],
        cards: dict[str, Card],
        manifest: dict[str, Any],
        expected: dict[str, int],
    ) -> None:
        upstreams: list[str] = []
        for category in categories:
            directory = RESEARCH_DIR / category["directory"]
            corpus = "\n".join(
                path.read_text(encoding="utf-8", errors="replace")
                for path in sorted(directory.glob("*.md"))
            ).casefold()
            for card_id in category["members"]:
                card = cards.get(card_id)
                if card is None or "upstream" not in card.fields:
                    continue
                upstreams.append(card.upstream)
                name = card.fields["name"].casefold()
                upstream = card.upstream.casefold()
                repo_name = upstream.rsplit("/", 1)[-1]
                if not any(
                    candidate and candidate in corpus
                    for candidate in (upstream, name, repo_name)
                ):
                    self.fail(
                        f"{category['id']}: no source mention for {card_id}"
                    )

        unique_upstreams = {
            upstream.casefold()
            for upstream in upstreams
        }
        self.expect_equal(
            "unique canonical upstreams",
            len(unique_upstreams),
            expected["unique_upstreams"],
        )
        counts = Counter(
            upstream.casefold()
            for upstream in upstreams
        )
        actual_duplicates = {
            upstream
            for upstream, count in counts.items()
            if count > 1
        }
        expected_duplicates = {
            upstream.casefold()
            for upstream in manifest[
                "expected_duplicate_upstreams"
            ]
        }
        self.expect_equal(
            "cross-category duplicate upstreams",
            actual_duplicates,
            expected_duplicates,
        )
        if any(count != 2 for count in counts.values() if count > 1):
            self.fail(
                "a duplicate upstream appears in more than two categories"
            )
        self.notes.append(
            f"{len(upstreams)} relationships -> "
            f"{len(unique_upstreams)} canonical upstreams"
        )

    def _audit_local_copies(
        self,
        cards: dict[str, Card],
        compatibility_paths: list[str],
        expected: dict[str, int],
    ) -> None:
        card_paths = {
            card.fields["local_path"]
            for card in cards.values()
            if card.fields.get("local_path")
        }
        self.expect_equal(
            "unique card clone paths",
            len(card_paths),
            expected["unique_cards"],
        )
        compatibility = set(compatibility_paths)
        if card_paths & compatibility:
            self.fail(
                "compatibility paths overlap canonical card paths"
            )
        all_paths = card_paths | compatibility
        self.expect_equal(
            "local source copies",
            len(all_paths),
            expected["local_copies"],
        )
        for relative in sorted(compatibility):
            path = ROOT / relative
            if not path.is_dir() or not (path / ".git").exists():
                self.fail(
                    f"missing compatibility clone {relative}"
                )

        research_paths = {
            path
            for path in card_paths
            if path.startswith("explorations/research/repos/")
        }
        project_paths = {
            path
            for path in all_paths
            if path.startswith("projects/")
        }
        self.expect_equal(
            "manifest research/repos clones",
            len(research_paths),
            expected["research_repo_clones"],
        )
        self.expect_equal(
            "manifest legacy projects clones",
            len(project_paths),
            expected["legacy_project_clones"],
        )
        physical_research_repos = {
            path.name
            for path in (RESEARCH_DIR / "repos").iterdir()
            if path.is_dir() and (path / ".git").exists()
        }
        self.expect_equal(
            "physical research/repos clones",
            len(physical_research_repos),
            expected["research_repo_clones"],
        )
        self.notes.append(
            f"{len(research_paths)} research/repos + "
            f"{len(project_paths)} legacy project copies"
        )

    def _audit_program_documents(
        self,
        categories: list[dict[str, Any]],
        expected: dict[str, int],
    ) -> None:
        matrix = MATRIX_PATH.read_text(encoding="utf-8")
        program_readme = PROGRAM_README_PATH.read_text(
            encoding="utf-8"
        )
        expected_progress = f"{len(categories)}/{len(categories)}"
        if expected_progress not in matrix:
            self.fail(
                f"coverage matrix lacks progress {expected_progress}"
            )
        expected_markdown = str(expected["category_markdown_files"])
        if expected_markdown not in matrix:
            self.fail(
                "coverage matrix lacks category markdown count "
                f"{expected_markdown}"
            )
        if expected_markdown not in program_readme:
            self.fail(
                "program README lacks category markdown count "
                f"{expected_markdown}"
            )
        accepted_rows = re.findall(
            r"^\|\s*\d+\s*\|.*\|\s*已验收\s*\|$",
            matrix,
            flags=re.MULTILINE,
        )
        self.expect_equal(
            "accepted matrix rows",
            len(accepted_rows),
            len(categories),
        )
        all_accepted_rows = re.findall(
            r"^\|[^|\n]+\|(?:\s*已验收\s*\|){8}$",
            matrix,
            flags=re.MULTILINE,
        )
        self.expect_equal(
            "eight-slot acceptance rows",
            len(all_accepted_rows),
            len(categories),
        )
        self.notes.append("coverage matrix is 14/14 accepted")

    def _audit_worktrees(
        self,
        cards: dict[str, Card],
        compatibility_paths: list[str],
    ) -> None:
        paths = {
            card.fields["local_path"]
            for card in cards.values()
            if card.fields.get("local_path")
        }
        paths.update(compatibility_paths)
        dirty: list[str] = []
        for relative in sorted(paths):
            result = subprocess.run(
                [
                    "git",
                    "-C",
                    str(ROOT / relative),
                    "status",
                    "--porcelain",
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=20,
            )
            if result.returncode != 0 or result.stdout.strip():
                dirty.append(relative)
        if dirty:
            self.fail(
                "formal source worktrees are dirty or unreadable: "
                + ", ".join(dirty)
            )
        else:
            self.notes.append(
                f"{len(paths)}/{len(paths)} formal source worktrees clean"
            )


def parse_frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    match = FRONTMATTER_PATTERN.match(text)
    if match is None:
        return {}
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line or line.startswith((" ", "\t", "-")):
            continue
        key, value = line.split(":", 1)
        fields[key.strip()] = value.strip().strip("\"'")
    return fields


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check-worktrees",
        action="store_true",
        help="also run git status on all 204 formal source copies",
    )
    args = parser.parse_args()
    return Audit(
        check_worktrees=args.check_worktrees,
    ).run()


if __name__ == "__main__":
    raise SystemExit(main())
