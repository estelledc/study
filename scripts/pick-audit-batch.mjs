#!/usr/bin/env node
// 从 data/audit-pool.jsonl 取 pending，默认 12，papers/projects 尽量均分
// 优先 priority=rewrite
//
// 用法：
//   node scripts/pick-audit-batch.mjs --count 12
//   node scripts/pick-audit-batch.mjs --count 12 --claim round-1

import fs from 'node:fs/promises';
import { AUDIT_POOL_PATH } from './lib/paths.mjs';

function parseArgs() {
  const args = { count: 12, claim: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--count') args.count = parseInt(process.argv[++i], 10);
    else if (a === '--claim') args.claim = process.argv[++i];
  }
  if (!Number.isFinite(args.count) || args.count < 1) {
    throw new Error(`invalid --count: ${args.count}`);
  }
  return args;
}

async function loadPool() {
  const raw = await fs.readFile(AUDIT_POOL_PATH, 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function savePool(rows) {
  await fs.writeFile(AUDIT_POOL_PATH, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

function pickBalanced(pending, count) {
  const rewrite = pending.filter((x) => x.priority === 'rewrite');
  const audit = pending.filter((x) => x.priority !== 'rewrite');

  const picked = [];
  for (const x of rewrite) {
    if (picked.length >= count) break;
    picked.push(x);
  }

  const remain = count - picked.length;
  if (remain <= 0) return picked;

  const papers = audit.filter((x) => x.area === 'papers');
  const projects = audit.filter((x) => x.area === 'projects');
  let i = 0;
  let j = 0;
  while (picked.length < count && (i < papers.length || j < projects.length)) {
    if (i < papers.length) picked.push(papers[i++]);
    if (picked.length >= count) break;
    if (j < projects.length) picked.push(projects[j++]);
  }
  return picked;
}

async function main() {
  const args = parseArgs();
  const pool = await loadPool();
  const pending = pool.filter((x) => x.status === 'pending');
  const picked = pickBalanced(pending, args.count);

  if (args.claim) {
    const keys = new Set(picked.map((x) => `${x.area}::${x.slug}`));
    for (const row of pool) {
      if (keys.has(`${row.area}::${row.slug}`)) {
        row.status = 'claimed';
        row.claimed_by = args.claim;
        row.attempts = (row.attempts || 0) + 1;
      }
    }
    await savePool(pool);
  }

  const items = picked.map((x, idx) => ({
    slug: x.slug,
    area: x.area,
    path: x.path,
    title: x.title,
    lines: x.lines,
    priority: x.priority,
    legacy_score: x.legacy_score,
    reasons: x.reasons,
    batch_idx: idx,
  }));

  console.log(JSON.stringify({
    count: items.length,
    claimed_by: args.claim,
    pending_remaining: pending.length - items.length,
    items,
  }, null, 2));
}

main().catch((err) => {
  console.error('pick-audit-batch failed:', err);
  process.exit(1);
});
