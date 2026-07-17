from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from completion_audit import Audit, parse_frontmatter


class FrontmatterTests(unittest.TestCase):
    def test_parse_frontmatter_reads_scalar_fields(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "card.md"
            path.write_text(
                "---\n"
                "id: demo\n"
                "upstream: owner/repo\n"
                "quoted: \"value\"\n"
                "---\n"
                "# Demo\n",
                encoding="utf-8",
            )
            self.assertEqual(
                parse_frontmatter(path),
                {
                    "id": "demo",
                    "upstream": "owner/repo",
                    "quoted": "value",
                },
            )

    def test_parse_frontmatter_rejects_plain_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plain.md"
            path.write_text("# No frontmatter\n", encoding="utf-8")
            self.assertEqual(parse_frontmatter(path), {})


class CurrentManifestTests(unittest.TestCase):
    def test_current_manifest_passes_structural_audit(self) -> None:
        audit = Audit(check_worktrees=False)
        self.assertEqual(audit.run(), 0)
        self.assertEqual(audit.errors, [])


if __name__ == "__main__":
    unittest.main()
