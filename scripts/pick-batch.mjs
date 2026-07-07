#!/usr/bin/env node
// rename from dispatch-batch — 只选 slug 不渲染 prompt
// 输出 [{slug, area, kind, worktree_idx}] 数组
//
// 用法：
//   node scripts/pick-batch.mjs --count 8                   # 默认 4R + 4N
//   node scripts/pick-batch.mjs --count 8 --rewrite 0 --new 8  # 全 NEW
//   node scripts/pick-batch.mjs --count 120                 # round 满载

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonl, writeJsonl } from './lib/jsonl.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = path.join(ROOT, 'data/candidates.jsonl');
const REWRITE_POOL = path.join(ROOT, 'data/rewrite-pool.jsonl');
const GRAVEYARD = path.join(ROOT, 'data/graveyard.jsonl');
const PRIORITY = path.join(ROOT, 'data/priority-queue.jsonl');

function parseArgs() {
  const args = { count: 8, rewrite: null, new: null, priorityRatio: 0.7, noPriority: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--count') args.count = parseInt(process.argv[++i], 10);
    else if (a === '--rewrite') args.rewrite = parseInt(process.argv[++i], 10);
    else if (a === '--new') args.new = parseInt(process.argv[++i], 10);
    else if (a === '--priority-ratio') args.priorityRatio = parseFloat(process.argv[++i]);
    else if (a === '--no-priority') args.noPriority = true;
  }
  if (Number.isNaN(args.priorityRatio) || args.priorityRatio < 0 || args.priorityRatio > 1) {
    throw new Error(`--priority-ratio must be in [0, 1], got ${args.priorityRatio}`);
  }
  // 默认 50/50 split
  if (args.rewrite === null && args.new === null) {
    args.rewrite = Math.floor(args.count / 2);
    args.new = args.count - args.rewrite;
  }
  if (args.rewrite === null) args.rewrite = args.count - args.new;
  if (args.new === null) args.new = args.count - args.rewrite;
  return args;
}

function pickPriority(items, n, excludeSlugs) {
  // 按 tier-1 → tier-2 → tier-3 → tier-4 顺序消费 status=new 的 entry
  const tierOrder = ['tier-1', 'tier-2', 'tier-3', 'tier-4'];
  const picked = [];
  for (const tier of tierOrder) {
    const bucket = items.filter(p =>
      p.status === 'new' &&
      p.priority_tier === tier &&
      !excludeSlugs.has(`${p.area}::${p.slug}`)
    );
    for (const p of bucket) {
      if (picked.length >= n) break;
      picked.push(p);
      excludeSlugs.add(`${p.area}::${p.slug}`);
    }
    if (picked.length >= n) break;
  }
  // 兜底：tier 字段缺失但 status=new 的 entry 也吃
  if (picked.length < n) {
    const rest = items.filter(p =>
      p.status === 'new' &&
      !tierOrder.includes(p.priority_tier) &&
      !excludeSlugs.has(`${p.area}::${p.slug}`)
    );
    for (const p of rest) {
      if (picked.length >= n) break;
      picked.push(p);
      excludeSlugs.add(`${p.area}::${p.slug}`);
    }
  }
  return picked;
}

function pickRewrite(pool, n) {
  // 各 area 平均分（papers / projects 各一半）
  const eligible = pool.filter(x => x.status === 'available').sort((a, b) => b.score - a.score);
  const papers = eligible.filter(x => x.area === 'papers');
  const projects = eligible.filter(x => x.area === 'projects');
  const halfP = Math.floor(n / 2);
  const halfPr = n - halfP;
  return [...papers.slice(0, halfP), ...projects.slice(0, halfPr)];
}

function pickNew(candidates, n, excludeSlugs) {
  const eligible = candidates.filter(c =>
    c.status === 'queued' && !excludeSlugs.has(`${c.area}::${c.slug}`)
  );
  // topic 轮询，避免单一主题扎堆
  const byArea = { papers: [], projects: [] };
  for (const c of eligible) byArea[c.area]?.push(c);

  const halfP = Math.floor(n / 2);
  const halfPr = n - halfP;

  // 各 area 内按 topic 轮询
  function pickFromArea(arr, k) {
    const byTopic = new Map();
    for (const c of arr) {
      if (!byTopic.has(c.topic)) byTopic.set(c.topic, []);
      byTopic.get(c.topic).push(c);
    }
    const topics = [...byTopic.keys()];
    const picked = [];
    let i = 0;
    while (picked.length < k && topics.length) {
      const t = topics[i % topics.length];
      const bucket = byTopic.get(t);
      if (bucket.length === 0) { topics.splice(i % topics.length, 1); continue; }
      picked.push(bucket.shift());
      i++;
    }
    return picked;
  }

  return [...pickFromArea(byArea.papers, halfP), ...pickFromArea(byArea.projects, halfPr)];
}

function assignWorktrees(items) {
  // 各 area 内 idx 0..3 循环分配（4 papers worktree + 4 projects worktree）
  const counters = { papers: 0, projects: 0 };
  return items.map(it => {
    const idx = counters[it.area] % 4;
    counters[it.area]++;
    return { ...it, worktree_idx: idx };
  });
}

async function main() {
  const args = parseArgs();

  const [candidates, pool, graveyard, priority] = await Promise.all([
    readJsonl(CANDIDATES, { missing: 'empty' }),
    readJsonl(REWRITE_POOL, { missing: 'empty' }),
    readJsonl(GRAVEYARD, { missing: 'empty' }),
    readJsonl(PRIORITY, { missing: 'empty' }),
  ]);

  // graveyard 永久排除（按 slug 唯一，跨 area 安全）
  const graveSlugs = new Set(graveyard.map(g => g.slug));
  const filteredPool = pool.filter(p => !graveSlugs.has(p.slug));
  const filteredCandidates = candidates.filter(c => !graveSlugs.has(c.slug));
  const filteredPriority = priority.filter(p => !graveSlugs.has(p.slug));

  const rewriteItems = pickRewrite(filteredPool, args.rewrite).map(x => ({
    slug: x.slug,
    area: x.area,
    kind: x.area === 'papers' ? 'rewrite-paper' : 'rewrite-project',
    topic: x.topic || '',
  }));

  const exclude = new Set(rewriteItems.map(x => `${x.area}::${x.slug}`));

  // hybrid_30_70_gap：先吃 priority-queue.jsonl 的 ratio*new 条，再 fallback 到 candidates.jsonl
  const wantPriority = args.noPriority ? 0 : Math.round(args.new * args.priorityRatio);
  const priorityPicked = wantPriority > 0
    ? pickPriority(filteredPriority, wantPriority, exclude)
    : [];
  const priorityItems = priorityPicked.map(c => ({
    slug: c.slug,
    area: c.area,
    kind: c.area === 'papers' ? 'new-paper' : 'new-project',
    topic: c.topic || '',
    title: c.title,
    url: c.url,
    why: c.meta?.col4 || '',
    year: c.meta?.col3 || '',
    source: 'priority-queue',
    priority_tier: c.priority_tier || '',
  }));

  const remaining = args.new - priorityItems.length;
  const fallbackPicked = remaining > 0
    ? pickNew(filteredCandidates, remaining, exclude)
    : [];
  const fallbackItems = fallbackPicked.map(c => ({
    slug: c.slug,
    area: c.area,
    kind: c.area === 'papers' ? 'new-paper' : 'new-project',
    topic: c.topic || '',
    title: c.title,
    url: c.url,
    why: c.meta?.col4 || '',
    year: c.meta?.col3 || '',
    source: 'candidates',
  }));

  const newItems = [...priorityItems, ...fallbackItems];
  const all = [...rewriteItems, ...newItems];
  const assigned = assignWorktrees(all);

  // 写回 priority-queue.jsonl：把刚选中的标 status=picked
  if (priorityPicked.length > 0) {
    const pickedKeys = new Set(priorityPicked.map(p => `${p.area}::${p.slug}`));
    const updated = priority.map(p =>
      pickedKeys.has(`${p.area}::${p.slug}`) ? { ...p, status: 'picked' } : p
    );
    await writeJsonl(PRIORITY, updated, { finalNewline: 'non-empty' });
  }

  // 数量校验
  const issues = [];
  if (rewriteItems.length < args.rewrite) issues.push(`rewrite short: ${rewriteItems.length}/${args.rewrite}`);
  if (newItems.length < args.new) issues.push(`new short: ${newItems.length}/${args.new}`);
  if (priorityItems.length < wantPriority) issues.push(`priority short: ${priorityItems.length}/${wantPriority}`);
  if (graveSlugs.size > 0) issues.push(`graveyard excluded: ${graveSlugs.size}`);

  console.log(JSON.stringify({
    requested: { count: args.count, rewrite: args.rewrite, new: args.new, priority_ratio: args.priorityRatio, want_priority: wantPriority },
    actual: { count: assigned.length, rewrite: rewriteItems.length, new: newItems.length, priority: priorityItems.length, fallback: fallbackItems.length },
    issues,
    items: assigned,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('pick-batch failed:', err); process.exit(1); });
}
