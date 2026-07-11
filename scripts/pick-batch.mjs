#!/usr/bin/env node
// rename from dispatch-batch — 只选 slug 不渲染 prompt
// 输出 [{slug, area, kind, worktree_idx}] 数组
//
// 用法：
//   node scripts/pick-batch.mjs --count 8                   # 默认 4R + 4N
//   node scripts/pick-batch.mjs --count 8 --rewrite 0 --new 8  # 全 NEW
//   node scripts/pick-batch.mjs --count 120                 # round 满载

import { createHash } from 'node:crypto';

import {
  claimToken,
  commitQueueState,
  excludeGraveyard,
  graveyardIdentities,
  loadPickQueues,
  markClaimed,
  markPriorityPicked,
} from './lib/queue-store.mjs';
import {
  CANDIDATES_PATH,
  DATA_DIR,
  PRIORITY_QUEUE_PATH,
  REWRITE_POOL_PATH,
} from './lib/paths.mjs';
import { assertBulkOperationAuthorized } from './lib/operations-policy.mjs';

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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function pickInputHash(queues) {
  return sha256(JSON.stringify({
    candidates: queues.candidates || [],
    pool: queues.pool || [],
    graveyard: queues.graveyard || [],
    priority: queues.priority || [],
    priority_missing: Boolean(queues.priorityMissing),
  }));
}

function computePickPlanHash(output) {
  return sha256(JSON.stringify({
    requested: output.requested,
    queue_input_hash: output.queue_input_hash,
    items: output.items.map((item) => ({
      area: item.area,
      slug: item.slug,
      kind: item.kind,
      worktree_idx: item.worktree_idx,
      source: item.source || null,
    })),
  }));
}

function assignmentFor(item) {
  const name = item.worktree_idx === 0 ? item.area : `${item.area}-${item.worktree_idx + 1}`;
  return { area: item.area, slug: item.slug, worktree: { name } };
}

export function pickBatch(args, queues = {}) {
  const {
    candidates = [],
    pool = [],
    graveyard = [],
    priority = [],
  } = queues;

  // 新数据按 area::slug 排除；无 area 的旧记录继续按裸 slug 双读。
  const graveyardIds = graveyardIdentities(graveyard);
  const filteredPool = excludeGraveyard(pool, graveyard);
  const filteredCandidates = excludeGraveyard(candidates, graveyard);
  const filteredPriority = excludeGraveyard(priority, graveyard);

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

  // 数量校验
  const issues = [];
  const warnings = [];
  if (args.count !== args.rewrite + args.new) {
    issues.push(`requested split mismatch: count=${args.count}, rewrite+new=${args.rewrite + args.new}`);
  }
  if (rewriteItems.length < args.rewrite) issues.push(`rewrite short: ${rewriteItems.length}/${args.rewrite}`);
  if (newItems.length < args.new) issues.push(`new short: ${newItems.length}/${args.new}`);
  if (priorityItems.length < wantPriority) issues.push(`priority short: ${priorityItems.length}/${wantPriority}`);
  const candidateKeys = new Set(candidates
    .filter((row) => row.status === 'queued')
    .map((row) => `${row.area}::${row.slug}`));
  const missingPriorityCandidates = priorityItems
    .map((item) => `${item.area}::${item.slug}`)
    .filter((key) => !candidateKeys.has(key));
  if (missingPriorityCandidates.length > 0) {
    issues.push(`priority candidate missing: ${missingPriorityCandidates.join(', ')}`);
  }
  const graveyardCount = graveyardIds.keys.size + graveyardIds.legacySlugs.size;
  if (graveyardCount > 0) warnings.push(`graveyard excluded: ${graveyardCount}`);

  const output = {
    requested: { count: args.count, rewrite: args.rewrite, new: args.new, priority_ratio: args.priorityRatio, want_priority: wantPriority },
    actual: { count: assigned.length, rewrite: rewriteItems.length, new: newItems.length, priority: priorityItems.length, fallback: fallbackItems.length },
    issues,
    warnings,
    items: assigned,
    queue_input_hash: pickInputHash(queues),
  };
  output.plan_hash = computePickPlanHash(output);
  output.items = output.items.map((item) => ({
    ...item,
    claim_token: claimToken(output.plan_hash, item),
    claim_generation: output.plan_hash,
  }));

  return {
    output,
    priorityPicked,
    nextPriority: issues.length === 0 && priorityPicked.length > 0
      ? markPriorityPicked(priority, priorityPicked)
      : priority,
  };
}

export async function applyPickPlan(plan, queues, options = {}) {
  const { output } = plan;
  if (!output || !Array.isArray(output.items)) throw new Error('pick plan is malformed');
  const issues = [...(output.issues || [])];
  if (output.actual.count !== output.requested.count ||
      output.actual.rewrite !== output.requested.rewrite ||
      output.actual.new !== output.requested.new) {
    issues.push('pick counts do not match the request');
  }
  if (issues.length > 0) throw new Error(`pick plan is not applicable: ${issues.join('; ')}`);
  if (pickInputHash(queues) !== output.queue_input_hash) {
    throw new Error('pick queue input changed after planning');
  }
  if (computePickPlanHash(output) !== output.plan_hash) {
    throw new Error('pick plan hash mismatch');
  }
  if (output.items.length === 0) {
    return { generation: output.plan_hash, applied: [], no_op: true };
  }

  const assignments = output.items.map(assignmentFor);
  const claimOptions = {
    planHash: output.plan_hash,
    generation: output.plan_hash,
    claimedAt: options.claimedAt,
    leaseMs: options.leaseMs,
  };
  const rewritePicked = output.items.filter((item) => item.kind.startsWith('rewrite-'));
  const newPicked = output.items.filter((item) => item.kind.startsWith('new-'));
  const nextPool = markClaimed(queues.pool || [], rewritePicked, assignments, claimOptions);
  const nextCandidates = markClaimed(queues.candidates || [], newPicked, assignments, claimOptions);
  const nextPriority = plan.priorityPicked.length > 0
    ? markPriorityPicked(queues.priority || [], plan.priorityPicked)
    : (queues.priority || []);
  const includePriority = !queues.priorityMissing || plan.priorityPicked.length > 0;

  return commitQueueState({
    candidates: nextCandidates,
    rewritePool: nextPool,
    ...(includePriority ? { priority: nextPriority } : {}),
  }, {
    directory: options.directory || DATA_DIR,
    generation: output.plan_hash,
    paths: options.paths || {
      candidates: CANDIDATES_PATH,
      rewritePool: REWRITE_POOL_PATH,
      priority: PRIORITY_QUEUE_PATH,
    },
    expectedState: {
      candidates: queues.candidates || [],
      rewritePool: queues.pool || [],
      ...(includePriority ? { priority: queues.priority || [] } : {}),
    },
    hooks: options.hooks,
  });
}

async function main() {
  const args = parseArgs();
  assertBulkOperationAuthorized({
    operation: 'pick-batch',
    requestedItems: args.rewrite + args.new,
  });
  const queues = await loadPickQueues();
  const plan = pickBatch(args, queues);
  const { output } = plan;
  await applyPickPlan(plan, queues);

  console.log(JSON.stringify(output, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error('pick-batch failed:', err); process.exit(1); });
}
