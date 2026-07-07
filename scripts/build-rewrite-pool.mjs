#!/usr/bin/env node
// 扫现有笔记，按 4 条规则打分 → data/rewrite-pool.jsonl
// 规则（每条 +1 分，分高 = 越该 rewrite）：
//   r1: 行数 > 250 或 < 100
//   r2: 含 Definition:/Theorem: 或学术编号 H2（如 "## 2.1"）
//   r3: 早期 frontmatter 风格（有 description+sidebar 但无 来源/分类）
//   r4: 缺 12 段标准 H2 中超过 5 段

import fs from 'node:fs/promises';
import path from 'node:path';
import { PAPERS_DIR, PROJECTS_DIR, REWRITE_POOL_PATH, ROOT } from './lib/paths.mjs';

const OUT_PATH = REWRITE_POOL_PATH;

const STD_H2 = [
  '是什么', '为什么重要', '核心要点', '实践案例',
  '踩过的坑', '适用', '历史小故事', '学到什么',
  '延伸阅读', '关联', '反向链接',
];

const ACADEMIC_H2 = /^##\s+(Definition|Theorem|Lemma|Corollary|Proof|定理|定义|引理)\b|^##\s+\d+\.\d+/m;

function extractFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const fields = {};
  for (const line of m[1].split('\n')) {
    const fm = line.match(/^(\w+|一-鿿+):\s*(.*)$/u);
    if (fm) fields[fm[1]] = fm[2];
  }
  // 中文字段单独抓
  const cnFields = m[1].matchAll(/^([一-鿿]+):\s*(.*)$/gmu);
  for (const f of cnFields) fields[f[1]] = f[2];
  // sidebar/description 简单标记
  fields._has_sidebar = /^sidebar:/m.test(m[1]);
  fields._has_description = /^description:/m.test(m[1]);
  fields._has_source_cn = /^来源:/m.test(m[1]);
  fields._has_category_cn = /^分类:/m.test(m[1]);
  return fields;
}

function countH2Hits(text) {
  let hits = 0;
  for (const h2 of STD_H2) {
    const re = new RegExp(`^##\\s.*${h2}`, 'm');
    if (re.test(text)) hits++;
  }
  return hits;
}

async function scoreNote(filePath, area) {
  const text = await fs.readFile(filePath, 'utf8');
  const lines = text.split('\n').length;
  const slug = path.basename(filePath, '.md');
  const fm = extractFrontmatter(text);
  const reasons = [];
  let score = 0;

  if (lines > 250) {
    score += 2;
    reasons.push(`lines:${lines}>250`);
  } else if (lines < 100) {
    score += 1;
    reasons.push(`lines:${lines}<100`);
  }

  if (ACADEMIC_H2.test(text)) {
    score += 1;
    reasons.push('academic-h2');
  }

  // 早期 frontmatter：有 description/sidebar 但无来源/分类
  if (fm._has_description && fm._has_sidebar && !fm._has_source_cn && !fm._has_category_cn) {
    score += 1;
    reasons.push('legacy-frontmatter');
  }

  const h2Hits = countH2Hits(text);
  if (h2Hits < 6) {
    score += 1;
    reasons.push(`h2-hits:${h2Hits}/11`);
  }

  return {
    slug,
    area,
    path: path.relative(ROOT, filePath),
    lines,
    score,
    reasons,
    h2_hits: h2Hits,
  };
}

async function scanDir(dir, area) {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const results = [];
  for (const f of entries) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const filePath = path.join(dir, f);
    results.push(await scoreNote(filePath, area));
  }
  return results;
}

async function loadExistingStatus() {
  // 保留已 written / failed 状态，避免覆盖
  try {
    const raw = await fs.readFile(OUT_PATH, 'utf8');
    const lines = raw.split('\n').filter(Boolean).map(l => JSON.parse(l));
    const map = new Map();
    for (const x of lines) {
      map.set(`${x.area}::${x.slug}`, x);
    }
    return map;
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();
    throw err;
  }
}

async function main() {
  const incremental = process.argv.includes('--incremental') || process.argv.includes('-i');
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  const papers = await scanDir(PAPERS_DIR, 'papers');
  const projects = await scanDir(PROJECTS_DIR, 'projects');
  const all = [...papers, ...projects];

  // 只保留 score >= 1 的（无 reason 就不算 rewrite 候选）
  const pool = all.filter(x => x.score >= 1);
  pool.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));

  const existing = incremental ? await loadExistingStatus() : new Map();

  const out = pool.map(x => {
    const key = `${x.area}::${x.slug}`;
    const prev = existing.get(key);
    return JSON.stringify({
      slug: x.slug,
      area: x.area,
      path: x.path,
      score: x.score,
      reasons: x.reasons,
      lines: x.lines,
      h2_hits: x.h2_hits,
      // incremental: 保留 written / failed 状态；available / claimed 视新分数刷新
      status: prev && (prev.status === 'written' || prev.status === 'failed') ? prev.status : 'available',
      claimed_by: null,
      attempts: prev?.attempts || 0,
    });
  }).join('\n') + '\n';
  await fs.writeFile(OUT_PATH, out);

  // 统计
  const scoreDist = {};
  const byArea = { papers: 0, projects: 0 };
  for (const x of pool) {
    scoreDist[x.score] = (scoreDist[x.score] || 0) + 1;
    byArea[x.area]++;
  }

  console.log(JSON.stringify({
    total_scanned: all.length,
    rewrite_pool_size: pool.length,
    by_area: byArea,
    score_distribution: scoreDist,
    top10: pool.slice(0, 10).map(x => ({
      slug: x.slug,
      area: x.area,
      score: x.score,
      reasons: x.reasons,
    })),
    output: OUT_PATH,
  }, null, 2));
}

main().catch(err => {
  console.error('build-rewrite-pool failed:', err);
  process.exit(1);
});
