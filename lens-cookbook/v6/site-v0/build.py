#!/usr/bin/env python3
"""Lens Cookbook v6 → static HTML site (v0).

输入：v6/*.md, v6/paradigm/*.md
输出：site-v0/*.html, site-v0/paradigm/*.html, site-v0/style.css

特性：
- 左侧 nav（所有 lens + paradigm + glossary + index）
- 顶部 breadcrumb
- 决策表（GFM table）原样渲染
- 链接 .md → .html 自动改写
- frontmatter 提取 title 用作 <title>
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent  # v6/
OUT = ROOT  # site-v0/

NAV_ITEMS = [
    ("index.html", "首页 / Cookbook"),
    ("__sep__", "Lens"),
    ("lens-frontend.html", "lens-frontend"),
    ("lens-backend.html", "lens-backend"),
    ("lens-aieng.html", "lens-aieng"),
    ("lens-data.html", "lens-data"),
    ("lens-devops.html", "lens-devops"),
    ("lens-media-storage.html", "lens-media-storage"),
    ("lens-vllm.html", "lens-vllm"),
    ("__sep__", "Paradigm"),
    ("paradigm/lens-schema-v6.html", "lens-schema-v6"),
    ("paradigm/lint-rules-v6.html", "lint-rules-v6"),
    ("paradigm/CHANGELOG-v4-to-v6.html", "CHANGELOG v4→v6"),
    ("__sep__", "Reference"),
    ("glossary.html", "glossary"),
]


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    raw = text[4:end]
    body = text[end + 5 :]
    meta = {}
    for line in raw.splitlines():
        if ":" in line:
            k, _, v = line.partition(":")
            meta[k.strip()] = v.strip()
    return meta, body


def rewrite_md_links(html: str) -> str:
    # [foo](bar.md) → [foo](bar.html); [foo](bar.md#anchor) → [foo](bar.html#anchor)
    return re.sub(r'href="([^"]+?)\.md(#[^"]*)?"', r'href="\1.html\2"', html)


def render_nav(current_rel: str, depth: int) -> str:
    prefix = "../" * depth
    lines = ['<nav class="sidebar"><h2><a href="' + prefix + 'index.html">Lens Cookbook v6</a></h2><ul>']
    for href, label in NAV_ITEMS:
        if href == "__sep__":
            lines.append(f'</ul><h3>{label}</h3><ul>')
            continue
        full = prefix + href
        cls = ' class="active"' if href == current_rel else ""
        lines.append(f'<li{cls}><a href="{full}">{label}</a></li>')
    lines.append("</ul></nav>")
    return "\n".join(lines)


def render_breadcrumb(current_rel: str, title: str, depth: int) -> str:
    prefix = "../" * depth
    parts = [f'<a href="{prefix}index.html">首页</a>']
    if current_rel.startswith("paradigm/"):
        parts.append('<span>paradigm</span>')
    if current_rel != "index.html":
        parts.append(f'<span>{title}</span>')
    return '<div class="breadcrumb">' + ' <span class="sep">/</span> '.join(parts) + '</div>'


def build_page(src_path: Path, rel_out: str) -> str:
    text = src_path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text)

    md = markdown.Markdown(
        extensions=["tables", "fenced_code", "toc", "attr_list", "sane_lists"],
        extension_configs={"toc": {"permalink": False}},
    )
    html_body = md.convert(body)
    html_body = rewrite_md_links(html_body)

    # title: frontmatter title > first H1 > stem
    title = meta.get("title")
    if not title:
        m = re.search(r"^#\s+(.+)$", body, flags=re.M)
        title = m.group(1).strip() if m else src_path.stem

    depth = rel_out.count("/")
    nav = render_nav(rel_out, depth)
    crumb = render_breadcrumb(rel_out, title, depth)
    css_href = ("../" * depth) + "style.css"

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Lens Cookbook v6</title>
<link rel="stylesheet" href="{css_href}">
</head>
<body>
<div class="layout">
{nav}
<main>
{crumb}
<article>
{html_body}
</article>
<footer><small>Lens Cookbook v6 · static site v0 · 源真相在 v6/*.md</small></footer>
</main>
</div>
</body>
</html>
"""
    return html


def main() -> None:
    plan = []
    # top level
    for name in [
        "index.md",
        "glossary.md",
        "lens-aieng.md",
        "lens-backend.md",
        "lens-data.md",
        "lens-devops.md",
        "lens-frontend.md",
        "lens-media-storage.md",
        "lens-vllm.md",
    ]:
        plan.append((SRC / name, name.replace(".md", ".html")))
    # paradigm
    for name in ["lens-schema-v6.md", "lint-rules-v6.md", "CHANGELOG-v4-to-v6.md"]:
        plan.append((SRC / "paradigm" / name, "paradigm/" + name.replace(".md", ".html")))

    written = []
    for src, rel in plan:
        if not src.exists():
            print(f"missing: {src}", file=sys.stderr)
            continue
        html = build_page(src, rel)
        out_path = OUT / rel
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html, encoding="utf-8")
        written.append(out_path)
        print(f"wrote {rel} ({len(html)} bytes)")

    print(f"\n{len(written)} pages built")


if __name__ == "__main__":
    main()
