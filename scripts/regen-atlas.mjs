#!/usr/bin/env node
// Regenerate papers-atlas.md and projects-atlas.md from frontmatter 分类 + 子分类.
// Run: node scripts/regen-atlas.mjs (also runs as `prebuild` automatically)

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadTaxonomy, parseFrontmatter, ROOT } from './taxonomy-lib.mjs';
import { slugForUrl } from './slug-for-url.mjs';

const MIN_SUBSECTION = 3;
/** 子类条目不足 MIN_SUBSECTION 时仍单独成节（避免重要主题被埋进「其他子类」） */
const ALWAYS_SHOW_SUBSECTIONS = new Set(['机器人与 VLA']);
const FALLBACK_THEME = '其他';
const FALLBACK_SUB = '综合';

async function loadAll(dir) {
  const dirAbs = join(ROOT, 'src/content/docs', dir);
  const files = (await readdir(dirAbs)).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
  const notes = [];
  for (const f of files) {
    const raw = await readFile(join(dirAbs, f), 'utf8');
    const { fm } = parseFrontmatter(raw);
    const slug = f.replace(/\.md$/, '');
    notes.push({
      slug,
      title: fm.title ?? slug,
      description: fm.description ?? '',
      theme: (fm['分类'] || '').trim() || null,
      subcategory: (fm['子分类'] || '').trim() || FALLBACK_SUB,
    });
  }
  return notes;
}

function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function firstSentence(desc, max = 110) {
  if (!desc) return '';
  const t = String(desc).split(/[。.；;]/)[0].trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[\/]/g, '-')
    .replace(/[^\w一-龥\-]/g, '');
}

function bucketNotes(notes, taxonomy) {
  const themeOrder = [...taxonomy.themes].sort((a, b) => a.order - b.order);
  const themeLabels = themeOrder.map((t) => t.label);
  const buckets = new Map();
  for (const label of themeLabels) buckets.set(label, new Map());
  const unclassified = [];

  for (const n of notes) {
    if (!n.theme) {
      unclassified.push(n);
      continue;
    }
    if (!buckets.has(n.theme)) buckets.set(n.theme, new Map());
    const subMap = buckets.get(n.theme);
    const sub = n.subcategory || FALLBACK_SUB;
    if (!subMap.has(sub)) subMap.set(sub, []);
    subMap.get(sub).push(n);
  }

  return { themeOrder: themeLabels, buckets, unclassified };
}

function renderAtlas(notes, kind, taxonomy) {
  const isPapers = kind === 'papers';
  const pathSeg = isPapers ? 'papers' : 'projects';
  const titleZh = isPapers ? '论文' : '项目';
  const unit = isPapers ? '篇' : '个';

  const { themeOrder, buckets, unclassified } = bucketNotes(notes, taxonomy);
  const total = notes.length;
  const classified = total - unclassified.length;

  const lines = [];
  lines.push('---');
  lines.push(`title: ${titleZh}全景索引`);
  lines.push(`description: ${total} ${unit}${titleZh} · 按一级主题与子分类 · 自动从 frontmatter 生成`);
  lines.push('sidebar:');
  lines.push('  order: 5');
  lines.push(`  label: ${titleZh}全景索引`);
  lines.push('---');
  lines.push('');
  lines.push('> 本页由 `scripts/regen-atlas.mjs` 自动生成（每次 build 前重跑）。');
  lines.push('> 分类 SSOT：`data/taxonomy.json` + 各笔记 frontmatter `分类` / `子分类`。批量更新：`node scripts/classify-notes.mjs --apply`');
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push(`- **总数**：${total} ${unit}`);
  lines.push(`- **已分类**：${classified}`);
  if (unclassified.length) {
    lines.push(`- **未分类**：${unclassified.length}（缺少 frontmatter \`分类\`）`);
  }
  lines.push('');

  lines.push('### 按一级主题分布');
  lines.push('');
  lines.push('| 主题 | 数量 |');
  lines.push('|---|---:|');
  for (const theme of themeOrder) {
    const subMap = buckets.get(theme);
    if (!subMap) continue;
    let count = 0;
    for (const items of subMap.values()) count += items.length;
    if (!count) continue;
    lines.push(`| [${theme}](#${slugify(theme)}) | ${count} |`);
  }
  if (unclassified.length) {
    lines.push(`| [其他 / 待分类](#其他--待分类) | ${unclassified.length} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const theme of themeOrder) {
    const subMap = buckets.get(theme);
    if (!subMap) continue;
    let themeCount = 0;
    for (const items of subMap.values()) themeCount += items.length;
    if (!themeCount) continue;

    lines.push(`## ${theme}`);
    lines.push('');
    lines.push(`共 ${themeCount} ${unit}。`);
    lines.push('');

    const subs = [...subMap.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh'));
    const small = [];
    const large = [];
    for (const [sub, items] of subs) {
      if (items.length < MIN_SUBSECTION && sub !== FALLBACK_SUB && !ALWAYS_SHOW_SUBSECTIONS.has(sub)) {
        small.push(...items);
      }
      else large.push([sub, items]);
    }
    if (small.length) {
      large.push([`其他子类`, small]);
    }

    for (const [sub, items] of large) {
      items.sort((a, b) => a.slug.localeCompare(b.slug));
      if (large.length > 1 || sub !== FALLBACK_SUB) {
        lines.push(`### ${sub}`);
        lines.push('');
      }
      lines.push(`| ${titleZh} | 描述 |`);
      lines.push('|---|---|');
      for (const it of items) {
        const desc = firstSentence(it.description);
        lines.push(`| [${escapeMd(it.title)}](/study/${pathSeg}/${slugForUrl(it.slug)}/) | ${escapeMd(desc)} |`);
      }
      lines.push('');
    }
  }

  if (unclassified.length) {
    unclassified.sort((a, b) => a.slug.localeCompare(b.slug));
    lines.push('## 其他 / 待分类');
    lines.push('');
    lines.push(`共 ${unclassified.length} ${unit}。请运行 \`node scripts/classify-notes.mjs --apply\`。`);
    lines.push('');
    lines.push(`| Slug | ${titleZh} |`);
    lines.push('|---|---|');
    for (const it of unclassified) {
      lines.push(`| \`${it.slug}\` | [${escapeMd(it.title)}](/study/${pathSeg}/${slugForUrl(it.slug)}/) |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`## 全部 ${total} ${unit}（字母序）`);
  lines.push('');
  lines.push(`| Slug | ${titleZh} | 一级 | 子分类 |`);
  lines.push('|---|---|---|---|');
  const sorted = [...notes].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const it of sorted) {
    const theme = it.theme ?? FALLBACK_THEME;
    lines.push(`| \`${it.slug}\` | [${escapeMd(it.title)}](/study/${pathSeg}/${slugForUrl(it.slug)}/) | ${theme} | ${it.subcategory} |`);
  }
  lines.push('');

  return { content: lines.join('\n'), unclassified: unclassified.length };
}

async function main() {
  const taxonomy = await loadTaxonomy();
  const papers = await loadAll('papers');
  const projects = await loadAll('projects');

  const papersResult = renderAtlas(papers, 'papers', taxonomy);
  const projectsResult = renderAtlas(projects, 'projects', taxonomy);

  await writeFile(join(ROOT, 'src/content/docs/papers-atlas.md'), papersResult.content, 'utf8');
  await writeFile(join(ROOT, 'src/content/docs/projects-atlas.md'), projectsResult.content, 'utf8');

  console.log(
    `papers-atlas.md   ${papers.length} 篇  (${papers.length - papersResult.unclassified} 已分类 / ${papersResult.unclassified} 待分类)`,
  );
  console.log(
    `projects-atlas.md ${projects.length} 个  (${projects.length - projectsResult.unclassified} 已分类 / ${projectsResult.unclassified} 待分类)`,
  );

  const unclassifiedTotal = papersResult.unclassified + projectsResult.unclassified;
  if (unclassifiedTotal > 0) {
    console.error(`[error] ${unclassifiedTotal} notes missing 分类 — fix before build`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
