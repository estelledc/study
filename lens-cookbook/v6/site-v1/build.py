#!/usr/bin/env python3
"""Lens Cookbook v6 → static HTML site (v1, recursive dogfood).

输入：v6/*.md, v6/paradigm/*.md
输出：site-v1/*.html, site-v1/paradigm/*.html

差别于 site-v0：
- index.html 是手写的 landing（不通过 build.py 重生成），含 hero + lens-grid
- 其他页用统一 template，含搜索框 placeholder + 完整 nav (含 lens-devtool)
- 决策表 ring 列用 .ring-adopt/.ring-trial/... 上色（构建期 regex）
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent
SRC = ROOT.parent  # v6/
OUT = ROOT  # site-v1/

NAV_ITEMS = [
    ("index.html", "首页 / 决策导览"),
    ("__sep__", "Lens (按 layer)"),
    ("lens-frontend.html", "lens-frontend"),
    ("lens-backend.html", "lens-backend"),
    ("lens-aieng.html", "lens-aieng"),
    ("lens-data.html", "lens-data"),
    ("lens-devops.html", "lens-devops"),
    ("lens-devtool.html", "lens-devtool"),
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
    return re.sub(r'href="([^"]+?)\.md(#[^"]*)?"', r'href="\1.html\2"', html)


def colorize_ring_cells(html: str) -> str:
    """Wrap ring keywords in candidate tables: adopt/trial/assess/hold → span."""
    def repl(m):
        cell = m.group(0)
        for ring in ("adopt", "trial", "assess", "hold"):
            cell = re.sub(
                rf'>(\s*){ring}(\s*)<',
                rf'>\1<span class="ring-{ring}">{ring}</span>\2<',
                cell,
                count=1,
            )
        return cell
    return re.sub(r'<td>[^<]*(?:adopt|trial|assess|hold)[^<]*</td>', repl, html)


def render_nav(current_rel: str, depth: int) -> str:
    prefix = "../" * depth
    out = [f'<nav class="sidebar"><h2><a href="{prefix}index.html">Lens Cookbook<span class="ver">v6</span></a></h2>']
    out.append('<div class="search-box">')
    out.append('<input type="search" id="q" placeholder="搜 lens / 候选 / ADR ..." autocomplete="off" disabled>')
    out.append('<span class="search-hint">索引构建中（v1.1 启用）</span>')
    out.append('</div>')
    out.append('<ul>')
    for href, label in NAV_ITEMS:
        if href == "__sep__":
            out.append(f'</ul><h3>{label}</h3><ul>')
            continue
        full = prefix + href
        cls = ' class="active"' if href == current_rel else ""
        out.append(f'<li{cls}><a href="{full}">{label}</a></li>')
    out.append("</ul></nav>")
    return "\n".join(out)


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
    html_body = colorize_ring_cells(html_body)

    title = meta.get("title")
    if not title:
        m = re.search(r"^#\s+(.+)$", body, flags=re.M)
        title = m.group(1).strip() if m else src_path.stem

    depth = rel_out.count("/")
    nav = render_nav(rel_out, depth)
    crumb = render_breadcrumb(rel_out, title, depth)
    css_href = ("../" * depth) + "style.css"

    return f"""<!DOCTYPE html>
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
<footer><div class="meta"><div>Lens Cookbook v6 · static site v1 · 源真相在 <code>v6/*.md</code></div><div>recursive dogfood</div></div></footer>
</main>
</div>
</body>
</html>
"""


def main() -> None:
    plan = []
    # top level — index.md SKIPPED：site-v1 用手写 landing
    for name in [
        "glossary.md",
        "lens-aieng.md",
        "lens-backend.md",
        "lens-data.md",
        "lens-devops.md",
        "lens-devtool.md",
        "lens-frontend.md",
        "lens-media-storage.md",
        "lens-vllm.md",
    ]:
        plan.append((SRC / name, name.replace(".md", ".html")))
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

    print(f"\n{len(written)} pages built (index.html 手写未重生成)")


if __name__ == "__main__":
    main()
