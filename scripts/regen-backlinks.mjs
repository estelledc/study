// 扫描所有 papers/projects 笔记，找出 [[slug]] 引用关系，
// 把 "## 反向链接" 段下面的占位 HTML 注释替换为真实反向链接列表。
//
// 工作方式：
// 1. 收集 path → 该 path 引用了哪些 slug
// 2. 翻转成 slug → 谁引用了我（反向）
// 3. 对每个文件，把 ## 反向链接 段重写成自动列表
// 4. 没有反向链接的文件，留下 "（暂无反向链接）" 占位
//
// 用法：node scripts/regen-backlinks.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAPERS_DIR, PROJECTS_DIR } from './lib/paths.mjs';

const ROOTS = {
  papers: PAPERS_DIR,
  projects: PROJECTS_DIR,
};

const WIKI_RE = /\[\[([a-z0-9_\-]+)(?:\|[^\]]+)?\]\]/g;
// 匹配 "## 反向链接" 起到下一个 H2 或 EOF
const BACKLINK_SECTION_RE = /## 反向链接\s*\n[\s\S]*?(?=\n## |\n?$)/;

function scanFile(path) {
  const content = readFileSync(path, 'utf8');
  const refs = new Set();
  let m;
  while ((m = WIKI_RE.exec(content)) !== null) {
    refs.add(m[1]);
  }
  WIKI_RE.lastIndex = 0;
  return { content, refs };
}

function getTitle(content, slug) {
  const m = content.match(/^title:\s*(.+?)$/m);
  if (!m) return slug;
  return m[1].trim().replace(/^['"](.*)['"]$/, '$1');
}

// 第一遍：扫所有文件，建 slug → {area, title, refs}
const ALL = new Map();

for (const [area, dir] of Object.entries(ROOTS)) {
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const slug = f.replace(/\.md$/, '');
    const path = join(dir, f);
    const { content, refs } = scanFile(path);
    const title = getTitle(content, slug);
    ALL.set(slug, { area, path, content, title, refs });
  }
}

// 第二遍：翻转 refs → 反向 map
const BACKREFS = new Map(); // slug → Set of slugs that reference it

for (const [slug, info] of ALL) {
  for (const target of info.refs) {
    if (!BACKREFS.has(target)) BACKREFS.set(target, new Set());
    BACKREFS.get(target).add(slug);
  }
}

// 第三遍：写回 ## 反向链接 段
let updated = 0;
let skipped = 0;

for (const [slug, info] of ALL) {
  const incoming = BACKREFS.get(slug);
  let newSection;

  if (!incoming || incoming.size === 0) {
    newSection = `## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
`;
  } else {
    // 排序：按 area 分组，每组按 slug 字母序
    const sorted = [...incoming].sort();
    const lines = sorted.map((from) => {
      const fromInfo = ALL.get(from);
      if (!fromInfo) return null;
      return `- [[${from}]] —— ${fromInfo.title}`;
    }).filter(Boolean);

    newSection = `## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

${lines.join('\n')}
`;
  }

  let next = info.content;
  if (BACKLINK_SECTION_RE.test(info.content)) {
    next = info.content.replace(BACKLINK_SECTION_RE, newSection);
  } else {
    // 没有 ## 反向链接 段就跳过（不主动加）
    skipped++;
    continue;
  }

  if (next !== info.content) {
    writeFileSync(info.path, next, 'utf8');
    updated++;
  }
}

console.log(`backlinks: ${updated} 篇更新，${skipped} 篇跳过（无 "## 反向链接" 段）`);
