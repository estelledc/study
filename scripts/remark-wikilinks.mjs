// 轻量 [[slug]] / [[slug|显示文本]] → markdown 链接转换器
// 在 build 时把 Obsidian 双链语法转成 Starlight 可识别的 [text](/study/<area>/<slug>)
// slug 来源：扫描 src/content/docs/papers/*.md 和 src/content/docs/projects/*.md
// 如果 slug 不存在 → 渲染成带 broken-link class 的 span（提示笔记尚未存在）

import { readdirSync, existsSync } from 'node:fs';
import { visit } from 'unist-util-visit';
import { PAPERS_DIR, PROJECTS_DIR } from './lib/paths.mjs';

const ROOTS = {
  papers: PAPERS_DIR,
  projects: PROJECTS_DIR,
};

// 启动时扫一次 slug → area 映射
function buildSlugMap() {
  const map = new Map();
  for (const [area, dir] of Object.entries(ROOTS)) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const slug = f.replace(/\.md$/, '');
      if (!map.has(slug)) map.set(slug, area);
    }
  }
  return map;
}

const SLUG_MAP = buildSlugMap();
// 形如 [[slug]] 或 [[slug|显示]]，slug 允许 a-z 0-9 - _
const WIKI_RE = /\[\[([a-z0-9_\-]+)(?:\|([^\]]+))?\]\]/g;

export default function remarkWikilinks() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      const value = node.value;
      if (!value || !value.includes('[[')) return;

      const newChildren = [];
      let lastIndex = 0;
      let m;
      WIKI_RE.lastIndex = 0;

      while ((m = WIKI_RE.exec(value)) !== null) {
        const [full, slug, alias] = m;
        const display = alias || slug;
        const area = SLUG_MAP.get(slug);

        // 前面那段普通文本
        if (m.index > lastIndex) {
          newChildren.push({ type: 'text', value: value.slice(lastIndex, m.index) });
        }

        if (area) {
          // 解析得到 → 真链接
          newChildren.push({
            type: 'link',
            url: `/study/${area}/${slug}/`,
            title: null,
            children: [{ type: 'text', value: display }],
          });
        } else {
          // 没找到 slug → 留 broken-link 标记，便于以后扫
          newChildren.push({
            type: 'html',
            value: `<span class="wikilink-broken" title="尚未撰写：${slug}">${display}</span>`,
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
