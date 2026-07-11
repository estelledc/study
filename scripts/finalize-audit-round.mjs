#!/usr/bin/env node
// 写回 audit-pool 状态 + 更新 audit-checkpoint
//
// 用法：
//   node scripts/finalize-audit-round.mjs --round 1 --results /tmp/audit-round-1/results.jsonl

import fs from 'node:fs/promises';
import path from 'node:path';
import { assertBulkOperationAuthorized } from './lib/operations-policy.mjs';
import { AUDIT_CHECKPOINT_PATH, AUDIT_POOL_PATH, AUDIT_REVIEWS_DIR } from './lib/paths.mjs';

function parseArgs() {
  const args = { round: null, results: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--round') args.round = parseInt(process.argv[++i], 10);
    else if (a === '--results') args.results = process.argv[++i];
  }
  if (!Number.isFinite(args.round)) throw new Error('--round required');
  if (!args.results) throw new Error('--results required');
  return args;
}

async function loadPool() {
  const raw = await fs.readFile(AUDIT_POOL_PATH, 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function loadResults(file) {
  const raw = await fs.readFile(file, 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

function countByStatus(pool) {
  const by = {};
  for (const row of pool) by[row.status] = (by[row.status] || 0) + 1;
  return by;
}

async function main() {
  const args = parseArgs();
  assertBulkOperationAuthorized({ operation: 'finalize-audit-round', requestedItems: 1 });
  const pool = await loadPool();
  const results = await loadResults(args.results);
  const now = new Date().toISOString();
  const index = new Map(pool.map((r) => [`${r.area}::${r.slug}`, r]));

  let passed = 0;
  let refined = 0;
  let rewritten = 0;
  let failed = 0;

  for (const res of results) {
    const key = `${res.area}::${res.slug}`;
    const row = index.get(key);
    if (!row) {
      console.error(`warn: slug not in pool: ${key}`);
      continue;
    }

    const status = res.status;
    if (!['passed', 'refined', 'rewritten', 'failed'].includes(status)) {
      // release claim on unexpected status
      row.status = 'pending';
      row.claimed_by = null;
      continue;
    }

    row.status = status;
    row.claimed_by = null;
    row.last_action = res.action || status;
    row.reviewed_at = now;
    if (typeof res.lines === 'number') row.lines = res.lines;
    if (typeof res.average === 'number') row.average = res.average;

    if (status === 'passed') passed++;
    else if (status === 'refined') refined++;
    else if (status === 'rewritten') rewritten++;
    else if (status === 'failed') failed++;

    // persist review artifact if provided inline
    if (res.review) {
      const outDir = path.join(AUDIT_REVIEWS_DIR, res.area);
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(
        path.join(outDir, `${res.slug}.json`),
        JSON.stringify(res.review, null, 2) + '\n',
      );
    }
  }

  await fs.writeFile(AUDIT_POOL_PATH, pool.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const byStatus = countByStatus(pool);
  const audited = (byStatus.passed || 0) + (byStatus.refined || 0) + (byStatus.rewritten || 0);
  const pending = byStatus.pending || 0;
  const total = pool.length;

  const checkpoint = {
    round_n: args.round,
    total,
    audited,
    failed: byStatus.failed || 0,
    pending,
    by_status: byStatus,
    last_round: {
      round: args.round,
      results: results.length,
      passed,
      refined,
      rewritten,
      failed,
      at: now,
    },
    next_action: pending > 0
      ? `start-audit-round-${args.round + 1}`
      : 'audit-complete',
    updated_at: now,
  };

  await fs.writeFile(AUDIT_CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2) + '\n');
  console.log(JSON.stringify(checkpoint, null, 2));
}

main().catch((err) => {
  console.error('finalize-audit-round failed:', err);
  process.exit(1);
});
