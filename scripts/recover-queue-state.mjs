#!/usr/bin/env node
// Recover mechanically safe queue state after historical claimed debt.

import fs from 'node:fs/promises';
import {
  CANDIDATES_PATH,
  REWRITE_POOL_PATH,
  WRITTEN_PATH,
} from './lib/paths.mjs';
import { listAreaNotes } from './lib/content-store.mjs';
import { readJsonl, writeJsonl } from './lib/jsonl.mjs';
import { queueKey } from './lib/queue-store.mjs';
import { parseWrittenText } from './audit-runtime-state.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { json: false, write: false, dryRun: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else throw new Error(`Unknown arg: ${arg}`);
  }
  if (args.write && args.dryRun) throw new Error('--write and --dry-run are mutually exclusive');
  return args;
}

function countByStatus(rows) {
  const counts = {};
  for (const row of rows) {
    const key = row.status || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function makeContext({ notes, written }) {
  return {
    noteSet: new Set(notes.map(queueKey)),
    writtenSet: new Set(written.map(queueKey)),
  };
}

function change(row, from, to, reason, file) {
  return {
    file,
    area: row.area,
    slug: row.slug,
    from,
    to,
    reason,
  };
}

export function recoverCandidates(candidates, context) {
  const changes = [];
  const rows = candidates.map((row) => {
    if (row.status === 'failed' || row.status === 'blacklisted') return row;
    const key = queueKey(row);
    const isWritten = context.writtenSet.has(key) || context.noteSet.has(key);

    if ((row.status === 'queued' || row.status === 'claimed') && isWritten) {
      if (row.status !== 'written' || row.claimed_by !== null) {
        changes.push(change(row, row.status, 'written', 'note-or-written-index-exists', 'candidates'));
      }
      return { ...row, status: 'written', claimed_by: null };
    }

    if (row.status === 'claimed' && row.claimed_by == null && !isWritten) {
      changes.push(change(row, 'claimed', 'queued', 'orphan-claimed-without-note', 'candidates'));
      return { ...row, status: 'queued', claimed_by: null };
    }

    return row;
  });
  return { rows, changes };
}

export function recoverRewritePool(pool, context) {
  const changes = [];
  const rows = pool.map((row) => {
    if (row.status !== 'claimed') return row;
    const key = queueKey(row);
    if (context.writtenSet.has(key) || context.noteSet.has(key)) {
      changes.push(change(row, 'claimed', 'written', 'note-or-written-index-exists', 'rewrite-pool'));
      return { ...row, status: 'written', claimed_by: null };
    }
    return row;
  });
  return { rows, changes };
}

export function buildRecoveryPlan(inputs) {
  const context = makeContext(inputs);
  const candidates = recoverCandidates(inputs.candidates, context);
  const rewritePool = recoverRewritePool(inputs.rewritePool, context);
  return {
    before: {
      candidates: countByStatus(inputs.candidates),
      rewrite_pool: countByStatus(inputs.rewritePool),
    },
    after: {
      candidates: countByStatus(candidates.rows),
      rewrite_pool: countByStatus(rewritePool.rows),
    },
    changes: [...candidates.changes, ...rewritePool.changes],
    candidates: candidates.rows,
    rewritePool: rewritePool.rows,
  };
}

async function readWrittenOptional() {
  try {
    return parseWrittenText(await fs.readFile(WRITTEN_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function loadInputs() {
  const [candidates, rewritePool, written, papers, projects] = await Promise.all([
    readJsonl(CANDIDATES_PATH, { missing: 'empty' }),
    readJsonl(REWRITE_POOL_PATH, { missing: 'empty' }),
    readWrittenOptional(),
    listAreaNotes('papers'),
    listAreaNotes('projects'),
  ]);
  return {
    candidates,
    rewritePool,
    written,
    notes: [...papers, ...projects],
  };
}

function renderHuman(result) {
  return `Queue Recovery ${result.dry_run ? 'Dry Run' : 'Write'}

Planned changes: ${result.planned_changes}
Applied changes: ${result.applied_changes}

Candidates:
- before: ${JSON.stringify(result.before.candidates)}
- after: ${JSON.stringify(result.after.candidates)}

Rewrite pool:
- before: ${JSON.stringify(result.before.rewrite_pool)}
- after: ${JSON.stringify(result.after.rewrite_pool)}

Changes by reason:
${Object.entries(result.changes_by_reason).map(([reason, count]) => `- ${reason}: ${count}`).join('\n') || '- none'}
`;
}

function summarizeResult(plan, { dryRun, appliedChanges = 0 }) {
  const changesByReason = {};
  for (const item of plan.changes) {
    changesByReason[item.reason] = (changesByReason[item.reason] || 0) + 1;
  }
  return {
    dry_run: dryRun,
    planned_changes: plan.changes.length,
    applied_changes: appliedChanges,
    before: plan.before,
    after: plan.after,
    changes_by_reason: changesByReason,
    changes: plan.changes,
  };
}

async function main() {
  const args = parseArgs();
  const inputs = await loadInputs();
  const plan = buildRecoveryPlan(inputs);

  let result = summarizeResult(plan, { dryRun: !args.write });
  if (args.write) {
    await writeJsonl(CANDIDATES_PATH, plan.candidates);
    await writeJsonl(REWRITE_POOL_PATH, plan.rewritePool);
    result = summarizeResult(plan, { dryRun: false, appliedChanges: plan.changes.length });
    if (result.planned_changes !== result.applied_changes) {
      throw new Error(`Recovery mismatch: planned ${result.planned_changes}, applied ${result.applied_changes}`);
    }
  }

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderHuman(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`recover-queue-state failed: ${err.message}`);
    process.exit(1);
  });
}
