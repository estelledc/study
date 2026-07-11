#!/usr/bin/env node
// 扫 papers/projects 全量笔记 → data/audit-pool.jsonl
// status: pending | claimed | passed | refined | rewritten | failed
// priority: legacy 结构偏离优先 rewrite（priority=rewrite）

import fs from 'node:fs/promises';
import path from 'node:path';
import { listAreaNotes } from './lib/content-store.mjs';
import { extractFrontmatterBlock, hasFrontmatterKey, parseFrontmatterKeyValues } from './lib/frontmatter.mjs';
import { assertBulkOperationAuthorized } from './lib/operations-policy.mjs';
import { AUDIT_POOL_PATH, ROOT } from './lib/paths.mjs';

const STD_H2 = [
  '是什么', '为什么重要', '核心要点', '实践案例',
  '踩过的坑', '适用', '历史小故事', '学到什么',
  '延伸阅读', '关联', '反向链接',
];

const ACADEMIC_H2 = /^##\s+(Definition|Theorem|Lemma|Corollary|Proof|定理|定义|引理)\b|^##\s+\d+\.\d+/m;
const TERMINAL = new Set(['passed', 'refined', 'rewritten', 'failed']);

function countH2Hits(text) {
  let hits = 0;
  for (const h2 of STD_H2) {
    if (new RegExp(`^##\\s.*${h2}`, 'm').test(text)) hits++;
  }
  return hits;
}

function legacyScore(text) {
  const lines = text.split('\n').length;
  const fm = extractFrontmatterBlock(text);
  const fields = fm ? parseFrontmatterKeyValues(fm.block) : {};
  const hasSidebar = hasFrontmatterKey(text, 'sidebar');
  const hasDescription = hasFrontmatterKey(text, 'description');
  const hasSource = hasFrontmatterKey(text, '来源');
  const hasCategory = hasFrontmatterKey(text, '分类');
  const h2Hits = countH2Hits(text);
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
  if (hasDescription && hasSidebar && !hasSource && !hasCategory) {
    score += 1;
    reasons.push('legacy-frontmatter');
  }
  if (h2Hits < 6) {
    score += 1;
    reasons.push(`h2-hits:${h2Hits}/11`);
  }

  return {
    lines,
    h2_hits: h2Hits,
    legacy_score: score,
    reasons,
    title: fields.title || null,
    priority: score >= 3 || h2Hits < 6 || lines > 250 ? 'rewrite' : 'audit',
  };
}

async function loadExisting() {
  try {
    const raw = await fs.readFile(AUDIT_POOL_PATH, 'utf8');
    const map = new Map();
    for (const line of raw.split('\n').filter(Boolean)) {
      const row = JSON.parse(line);
      map.set(`${row.area}::${row.slug}`, row);
    }
    return map;
  } catch (err) {
    if (err.code === 'ENOENT') return new Map();
    throw err;
  }
}

async function main() {
  assertBulkOperationAuthorized({ operation: 'build-audit-pool', requestedItems: 1 });
  const force = process.argv.includes('--force');
  const existing = force ? new Map() : await loadExisting();
  const papers = await listAreaNotes('papers');
  const projects = await listAreaNotes('projects');
  const all = [...papers, ...projects];

  const rows = [];
  for (const note of all) {
    const text = await fs.readFile(note.path, 'utf8');
    const meta = legacyScore(text);
    const key = `${note.area}::${note.slug}`;
    const prev = existing.get(key);
    const status = prev && TERMINAL.has(prev.status) && !force
      ? prev.status
      : (prev?.status === 'claimed' ? 'pending' : 'pending');

    rows.push({
      slug: note.slug,
      area: note.area,
      path: path.relative(ROOT, note.path),
      title: meta.title,
      lines: meta.lines,
      h2_hits: meta.h2_hits,
      legacy_score: meta.legacy_score,
      reasons: meta.reasons,
      priority: meta.priority,
      status: TERMINAL.has(status) ? status : 'pending',
      claimed_by: null,
      attempts: prev?.attempts || 0,
      last_action: prev?.last_action || null,
      reviewed_at: prev?.reviewed_at || null,
    });
  }

  // rewrite priority first, then higher legacy_score, then slug
  rows.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'rewrite' ? -1 : 1;
    if (b.legacy_score !== a.legacy_score) return b.legacy_score - a.legacy_score;
    if (a.area !== b.area) return a.area.localeCompare(b.area);
    return a.slug.localeCompare(b.slug);
  });

  await fs.mkdir(path.dirname(AUDIT_POOL_PATH), { recursive: true });
  await fs.writeFile(AUDIT_POOL_PATH, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const byStatus = {};
  const byPriority = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
  }

  console.log(JSON.stringify({
    total: rows.length,
    by_status: byStatus,
    by_priority: byPriority,
    rewrite_first: rows.filter((r) => r.priority === 'rewrite').map((r) => `${r.area}/${r.slug}`),
    output: AUDIT_POOL_PATH,
  }, null, 2));
}

main().catch((err) => {
  console.error('build-audit-pool failed:', err);
  process.exit(1);
});
