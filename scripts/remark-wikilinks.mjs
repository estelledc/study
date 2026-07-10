// 轻量 [[slug]] / [[slug|显示文本]] → markdown 链接转换器
// 在 build 时把 Obsidian 双链语法转成 Starlight 可识别的 [text](/study/<area>/<slug>)
// slug 来源：扫描 src/content/docs/papers/*.md 和 src/content/docs/projects/*.md
// 支持推荐的 [[projects/react|React]] / [[papers/react|ReAct]]，
// 也兼容旧的 [[projects:react|React]] / [[papers:react|ReAct]] 写法。
// 如果 slug 不存在或顶层页面无法消歧 → 渲染成带 broken-link class 的 span
// （提示笔记尚未存在，避免静默跳到错误对象）

import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { visit } from 'unist-util-visit';
import { DOCS_DIR, PAPERS_DIR, PROJECTS_DIR } from './lib/paths.mjs';

const ROOTS = {
  papers: PAPERS_DIR,
  projects: PROJECTS_DIR,
};

const BASE = '/study';

// 启动时扫一次 slug → area 集合，保留重复 slug 信息，避免 papers 静默覆盖 projects。
function buildSlugIndex() {
  const bySlug = new Map();
  const byArea = new Map();

  for (const [area, dir] of Object.entries(ROOTS)) {
    const areaSlugs = new Set();
    byArea.set(area, areaSlugs);
    if (!existsSync(dir)) continue;

    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const slug = f.replace(/\.md$/, '');
      areaSlugs.add(slug);
      if (!bySlug.has(slug)) bySlug.set(slug, new Set());
      bySlug.get(slug).add(area);
    }
  }

  return { bySlug, byArea };
}

const SLUG_INDEX = buildSlugIndex();
// 形如 [[slug]] / [[area/slug]] / [[area:slug]] / [[slug|显示]]。
// slug 允许 a-z 0-9 - _；显式 namespace 只允许一层。
const WIKI_RE = /\[\[([a-z0-9_-]+(?:[\/:][a-z0-9_-]+)?)(?:\|([^\]]+))?\]\]/g;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sourceArea(filePath) {
  if (!filePath) return null;
  const rel = path.relative(DOCS_DIR, filePath).replaceAll(path.sep, '/');
  if (rel.startsWith('papers/')) return 'papers';
  if (rel.startsWith('projects/')) return 'projects';
  return null;
}

function resolveWikilink(target, fileArea) {
  const namespaced = target.match(/^(papers|projects)[\/:]([a-z0-9_-]+)$/);
  if (namespaced) {
    const [, area, slug] = namespaced;
    if (SLUG_INDEX.byArea.get(area)?.has(slug)) {
      return { ok: true, area, slug };
    }
    return { ok: false, slug, reason: `missing namespace target ${area}/${slug}` };
  }

  const areas = SLUG_INDEX.bySlug.get(target);
  if (!areas) {
    return { ok: false, slug: target, reason: 'missing target' };
  }

  if (areas.size === 1) {
    return { ok: true, area: [...areas][0], slug: target };
  }

  if (fileArea && areas.has(fileArea)) {
    return { ok: true, area: fileArea, slug: target };
  }

  return {
    ok: false,
    slug: target,
    reason: `ambiguous target: ${[...areas].join(', ')}; use an explicit projects/${target} or papers/${target} target`,
  };
}

export default function remarkWikilinks() {
  return (tree, file) => {
    const fileArea = sourceArea(file?.path);

    visit(tree, 'text', (node, index, parent) => {
      const value = node.value;
      if (!value || !value.includes('[[')) return;

      const newChildren = [];
      let lastIndex = 0;
      let m;
      WIKI_RE.lastIndex = 0;

      while ((m = WIKI_RE.exec(value)) !== null) {
        const [full, target, alias] = m;
        const display = alias || target.replace(/^(papers|projects)[\/:]/, '');
        const resolved = resolveWikilink(target, fileArea);

        // 前面那段普通文本
        if (m.index > lastIndex) {
          newChildren.push({ type: 'text', value: value.slice(lastIndex, m.index) });
        }

        if (resolved.ok) {
          // 解析得到 → 真链接
          newChildren.push({
            type: 'link',
            url: `${BASE}/${resolved.area}/${resolved.slug}/`,
            title: null,
            children: [{ type: 'text', value: display }],
          });
        } else {
          // 没找到 slug → 留 broken-link 标记，便于以后扫
          newChildren.push({
            type: 'html',
            value: `<span class="wikilink-broken" title="${escapeHtml(resolved.reason)}：${escapeHtml(resolved.slug)}">${escapeHtml(display)}</span>`,
          });
        }
        lastIndex = m.index + full.length;
      }

      if (newChildren.length === 0) return;

      // 末尾普通文本
      if (lastIndex < value.length) {
        newChildren.push({ type: 'text', value: value.slice(lastIndex) });
      }

      // 用新节点替换
      parent.children.splice(index, 1, ...newChildren);
      return index + newChildren.length;
    });
  };
}
