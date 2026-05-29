#!/usr/bin/env node
// Regenerate papers-atlas.md and projects-atlas.md from frontmatter.
// Run: node scripts/regen-atlas.mjs
//
// Strategy: read all notes, extract frontmatter, group by best-available
// signal (season > 分支 > category > "未分类"). Output multi-section atlas
// page that scales to 1000+ notes.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'js-yaml';

const ROOT = new URL('..', import.meta.url).pathname;

const SEASON_LABELS_PAPERS = {
  // legacy A-E lettered seasons (sidebar.order 1-25 era)
  A: '智能体 / LLM Systems',
  B: '分布式系统',
  C: 'Mech Interp / 可解释性',
  D: '编程语言 / 编译器',
  E: '扩展',
  // recent letter seasons used in /goal merge messages
  L: '智能体（5）',
  M: 'Scaling Laws（5）',
  N: 'Mech Interp（5）',
  O: '数据库（5）',
  P: '分布式训练（5）',
  Q: 'GC / 内存（5）',
  R: '分布式系统经典（5）',
  S: '计算机视觉（5）',
  T: '生成模型 / 扩散（5）',
  U: 'NLP 基础（5）',
  V: '强化学习（5）',
  W: '网络协议（5）',
  X: 'OS / 存储 / 系统（5）',
};

const SEASON_LABELS_PROJECTS = {
  S1: '前端基础（5）',
  S2: 'CSS 工程（5）',
  S3: '响应式 / 移动（5）',
  S4: '动画 / 交互（5）',
  S5: '边缘 / 后端（5）',
  S6: '状态管理（5）',
  S7: '编辑器 / 富文本（5）',
  S8: '数据 / DB 客户端（5）',
  S9: '可观测 / 性能（5）',
  S10: 'AI / Agent 基建（5）',
  S11: 'AI / Agent 浏览器（5）',
  S12: 'AI 代理与 SaaS（5）',
  S13: '原子状态库（5）',
  S14: '测试基础设施（5）',
  S15: '富文本编辑器（5）',
  S16: '文档站点（5）',
  S17: 'Auth（5）',
  S18: 'Monorepo / 构建（5）',
  S19: '动画库（5）',
  S20: '数据可视化（5）',
  S21: 'Forms & Schema（5）',
  S22: 'HTTP 客户端（5）',
  S23: '日期时间（5）',
  S24: 'i18n（5）',
  S25: 'Build tools（5）',
  S26: 'ORM（5）',
  S27: 'Web 框架（5）',
};

function parseFrontmatter(raw) {
  // Match leading --- ... --- block
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const block = m[1];
  try {
    return yaml.load(block);
  } catch (e) {
    // Fallback: line-by-line k: v extraction; tolerate unquoted commas / quotes.
    const out = {};
    for (const line of block.split('\n')) {
      const km = line.match(/^([A-Za-z_一-龥][A-Za-z0-9_一-龥]*)\s*:\s*(.*)$/);
      if (!km) continue;
      const [, k, v] = km;
      // Strip surrounding quotes if present
      const stripped = v.replace(/^["']|["']$/g, '');
      out[k] = stripped;
    }
    return out;
  }
}

async function loadAll(dir) {
  const dirAbs = join(ROOT, 'src/content/docs', dir);
  const files = (await readdir(dirAbs)).filter((f) => f.endsWith('.md'));
  const notes = [];
  for (const f of files) {
    const raw = await readFile(join(dirAbs, f), 'utf8');
    const fm = parseFrontmatter(raw) ?? {};
    const slug = f.replace(/\.md$/, '');
    notes.push({
      slug,
      title: fm.title ?? slug,
      description: fm.description ?? '',
      season: fm.season != null ? String(fm.season) : null,
      branch: fm.分支 ?? null,
      status: fm.状态 ?? null,
      category: fm.category ?? null,
      tier: fm.tier ?? null,
      year: fm.论文年份 ?? null,
      sidebarOrder: fm.sidebar?.order ?? null,
      sidebarLabel: fm.sidebar?.label ?? null,
      // raw byte size as quality proxy
      size: raw.length,
    });
  }
  return notes;
}

function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function firstSentence(desc, max = 120) {
  if (!desc) return '';
  const t = String(desc).split(/[。.；;]/)[0].trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function groupBySeason(notes, kind) {
  const labels = kind === 'papers' ? SEASON_LABELS_PAPERS : SEASON_LABELS_PROJECTS;
  const groups = new Map();
  const unclassified = [];
  for (const n of notes) {
    let key = null;
    if (kind === 'papers') {
      // Papers use single-letter Seasons; season field would override
      if (n.season && labels[n.season]) key = n.season;
      else if (n.branch) key = '__branch:' + n.branch;
    } else {
      // Projects use S1-S27 numeric seasons via season field
      if (n.season != null) {
        const k = 'S' + n.season;
        if (labels[k]) key = k;
      } else if (n.category) key = '__cat:' + n.category;
    }
    if (key) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    } else {
      unclassified.push(n);
    }
  }
  return { groups, unclassified };
}

function renderAtlasPapers(notes) {
  const total = notes.length;
  const { groups, unclassified } = groupBySeason(notes, 'papers');

  const lines = [];
  lines.push('---');
  lines.push('title: 论文全景索引');
  lines.push(`description: ${total} 篇论文 · 按主题分类 · 自动从 frontmatter 生成`);
  lines.push('sidebar:');
  lines.push('  order: 5');
  lines.push('  label: 论文全景索引');
  lines.push('---');
  lines.push('');
  lines.push('> 本页由 `scripts/regen-atlas.mjs` 自动生成。');
  lines.push('> 修改方法：编辑论文的 frontmatter（`season:` / `分支:` / `状态:`），重跑脚本。');
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push(`- **总数**：${total} 篇`);
  lines.push(`- **已分类（Season）**：${total - unclassified.length}`);
  lines.push(`- **未分类**：${unclassified.length}（落入字母序总表）`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Render Season groups in label-defined order
  lines.push('## 按主题');
  lines.push('');
  const seasonOrder = Object.keys(SEASON_LABELS_PAPERS);
  const branchKeys = [...groups.keys()].filter((k) => k.startsWith('__branch:')).sort();

  for (const key of seasonOrder) {
    const items = groups.get(key);
    if (!items || !items.length) continue;
    items.sort((a, b) => (a.sidebarOrder ?? 999) - (b.sidebarOrder ?? 999));
    lines.push(`### Season ${key} · ${SEASON_LABELS_PAPERS[key]}`);
    lines.push('');
    lines.push('| 标题 | 描述 |');
    lines.push('|---|---|');
    for (const it of items) {
      lines.push(`| [${escapeMd(it.title)}](/study/papers/${it.slug}/) | ${escapeMd(firstSentence(it.description))} |`);
    }
    lines.push('');
  }

  if (branchKeys.length) {
    lines.push('### 按 v1.1 分支（旧字段）');
    lines.push('');
    for (const k of branchKeys) {
      const items = groups.get(k);
      const branchLabel = k.replace('__branch:', '');
      lines.push(`#### ${branchLabel}`);
      lines.push('');
      lines.push('| 标题 | 状态 |');
      lines.push('|---|---|');
      items.sort((a, b) => a.slug.localeCompare(b.slug));
      for (const it of items) {
        lines.push(`| [${escapeMd(it.title)}](/study/papers/${it.slug}/) | ${escapeMd(it.status ?? '')} |`);
      }
      lines.push('');
    }
  }

  // Full alphabetical
  lines.push('---');
  lines.push('');
  lines.push(`## 全部 ${total} 篇（字母序）`);
  lines.push('');
  lines.push('| Slug | 标题 |');
  lines.push('|---|---|');
  const sorted = [...notes].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const it of sorted) {
    lines.push(`| \`${it.slug}\` | [${escapeMd(it.title)}](/study/papers/${it.slug}/) |`);
  }
  lines.push('');

  return lines.join('\n');
}

function renderAtlasProjects(notes) {
  const total = notes.length;
  const { groups, unclassified } = groupBySeason(notes, 'projects');

  const lines = [];
  lines.push('---');
  lines.push('title: 项目全景索引');
  lines.push(`description: ${total} 个项目 · 按 Season 主题分类 · 自动从 frontmatter 生成`);
  lines.push('sidebar:');
  lines.push('  order: 5');
  lines.push('  label: 项目全景索引');
  lines.push('---');
  lines.push('');
  lines.push('> 本页由 `scripts/regen-atlas.mjs` 自动生成。');
  lines.push('> 修改方法：编辑项目笔记 frontmatter（`season:` / `category:` / `tier:`），重跑脚本。');
  lines.push('');
  lines.push('## 总览');
  lines.push('');
  lines.push(`- **总数**：${total} 个`);
  lines.push(`- **已分类（Season）**：${total - unclassified.length}`);
  lines.push(`- **未分类**：${unclassified.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('## 按 Season');
  lines.push('');
  const seasonOrder = Object.keys(SEASON_LABELS_PROJECTS);
  const catKeys = [...groups.keys()].filter((k) => k.startsWith('__cat:')).sort();

  for (const key of seasonOrder) {
    const items = groups.get(key);
    if (!items || !items.length) continue;
    items.sort((a, b) => (a.sidebarOrder ?? 999) - (b.sidebarOrder ?? 999));
    lines.push(`### ${key} · ${SEASON_LABELS_PROJECTS[key]}`);
    lines.push('');
    lines.push('| 项目 | 描述 |');
    lines.push('|---|---|');
    for (const it of items) {
      lines.push(`| [${escapeMd(it.title)}](/study/projects/${it.slug}/) | ${escapeMd(firstSentence(it.description))} |`);
    }
    lines.push('');
  }

  if (catKeys.length) {
    lines.push('### 按 category（仅有 category 字段者）');
    lines.push('');
    for (const k of catKeys) {
      const items = groups.get(k);
      const cat = k.replace('__cat:', '');
      lines.push(`#### ${cat}`);
      lines.push('');
      lines.push('| 项目 | 描述 |');
      lines.push('|---|---|');
      items.sort((a, b) => a.slug.localeCompare(b.slug));
      for (const it of items) {
        lines.push(`| [${escapeMd(it.title)}](/study/projects/${it.slug}/) | ${escapeMd(firstSentence(it.description))} |`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(`## 全部 ${total} 个（字母序）`);
  lines.push('');
  lines.push('| Slug | 标题 |');
  lines.push('|---|---|');
  const sorted = [...notes].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const it of sorted) {
    lines.push(`| \`${it.slug}\` | [${escapeMd(it.title)}](/study/projects/${it.slug}/) |`);
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const papers = await loadAll('papers');
  const projects = await loadAll('projects');

  const papersAtlas = renderAtlasPapers(papers);
  const projectsAtlas = renderAtlasProjects(projects);

  const papersOut = join(ROOT, 'src/content/docs/papers-atlas.md');
  const projectsOut = join(ROOT, 'src/content/docs/projects-atlas.md');
  await writeFile(papersOut, papersAtlas, 'utf8');
  await writeFile(projectsOut, projectsAtlas, 'utf8');

  console.log(`papers-atlas.md   ${papers.length} 篇  →  ${papersOut}`);
  console.log(`projects-atlas.md ${projects.length} 个  →  ${projectsOut}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
