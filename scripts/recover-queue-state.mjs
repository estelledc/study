#!/usr/bin/env node
// Recover mechanically safe queue state after historical claimed debt.

import fs from 'node:fs/promises';
import {
  CANDIDATES_PATH,
  DATA_DIR,
  PIPELINE_EVENTS_PATH,
  REWRITE_POOL_PATH,
  WRITTEN_PATH,
} from './lib/paths.mjs';
import { listAreaNotes } from './lib/content-store.mjs';
import { readJsonl } from './lib/jsonl.mjs';
import { clearClaimMetadata, commitQueueState, queueKey } from './lib/queue-store.mjs';
import { inspectQueueTransaction, recoverQueueTransaction } from './lib/queue-transaction.mjs';
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

function leaseExpired(row, now) {
  if (!row.lease_expires_at) return false;
  const expiresAt = new Date(row.lease_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export function recoverExpiredClaims(rows, context, options = {}) {
  const now = new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error(`Invalid recovery time: ${options.now}`);
  const availableStatus = options.availableStatus || 'queued';
  const file = options.file || 'candidates';
  const changes = [];
  const recovered = rows.map((row) => {
    if (row.status !== 'claimed') return row;
    const key = queueKey(row);
    const isWritten = options.existingContentProvesCompletion !== false &&
      (context.writtenSet.has(key) || context.noteSet.has(key));
    if (isWritten) {
      changes.push(change(row, 'claimed', 'written', 'note-or-written-index-exists', file));
      return { ...clearClaimMetadata(row), status: 'written' };
    }

    const expired = leaseExpired(row, now);
    const legacyOrphan = !row.lease_expires_at && row.claimed_by == null;
    if (!expired && !legacyOrphan) return row;
    const reason = expired ? 'expired-claim-lease' : 'orphan-claimed-without-note';
    changes.push({
      ...change(row, 'claimed', availableStatus, reason, file),
      claim_generation: row.claim_generation ?? null,
      lease_expires_at: row.lease_expires_at ?? null,
    });
    return { ...clearClaimMetadata(row), status: availableStatus };
  });
  return { rows: recovered, changes };
}

export function recoverCandidates(candidates, context, options = {}) {
  const changes = [];
  const normalized = candidates.map((row) => {
    if (row.status === 'failed' || row.status === 'blacklisted') return row;
    const key = queueKey(row);
    const isWritten = context.writtenSet.has(key) || context.noteSet.has(key);

    if (row.status === 'queued' && isWritten) {
      changes.push(change(row, row.status, 'written', 'note-or-written-index-exists', 'candidates'));
      return { ...clearClaimMetadata(row), status: 'written' };
    }

    return row;
  });
  const claims = recoverExpiredClaims(normalized, context, {
    ...options,
    file: 'candidates',
    availableStatus: 'queued',
  });
  return { rows: claims.rows, changes: [...changes, ...claims.changes] };
}

export function recoverRewritePool(pool, context, options = {}) {
  return recoverExpiredClaims(pool, context, {
    ...options,
    file: 'rewrite-pool',
    availableStatus: 'available',
    // Rewrite entries point at notes which existed before the claim. Their mere
    // presence (and the global written index) cannot prove that this lease's
    // rewrite commit was accepted. Only the merge path may mark them written.
    existingContentProvesCompletion: false,
  });
}

export function buildRecoveryPlan(inputs, options = {}) {
  const context = makeContext(inputs);
  const candidates = recoverCandidates(inputs.candidates, context, options);
  const rewritePool = recoverRewritePool(inputs.rewritePool, context, options);
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

export function buildRecoveryEventUpdate(eventsText, plan, options = {}) {
  const now = new Date(options.now || Date.now());
  if (!Number.isFinite(now.getTime())) throw new Error(`Invalid recovery event time: ${options.now}`);
  const events = plan.changes
    .filter((item) => item.reason === 'expired-claim-lease')
    .map((item) => ({
      ts: now.toISOString(),
      event: 'claim-lease-recovered',
      area: item.area,
      slug: item.slug,
      assignment: `${item.area}::${item.slug}`,
      queue: item.file,
      claim_generation: item.claim_generation,
      lease_expires_at: item.lease_expires_at,
      recovery_reason: item.reason,
    }));
  const original = eventsText || '';
  const prefix = original && !original.endsWith('\n') ? `${original}\n` : original;
  const appended = events.length > 0 ? `${events.map(JSON.stringify).join('\n')}\n` : '';
  return { events, text: prefix + appended };
}

async function readWrittenOptional() {
  try {
    return parseWrittenText(await fs.readFile(WRITTEN_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function readEventsOptional() {
  try {
    return { text: await fs.readFile(PIPELINE_EVENTS_PATH, 'utf8'), missing: false };
  } catch (err) {
    if (err.code === 'ENOENT') return { text: '', missing: true };
    throw err;
  }
}

async function loadInputs() {
  const [candidates, rewritePool, written, papers, projects, events] = await Promise.all([
    readJsonl(CANDIDATES_PATH, { missing: 'empty' }),
    readJsonl(REWRITE_POOL_PATH, { missing: 'empty' }),
    readWrittenOptional(),
    listAreaNotes('papers'),
    listAreaNotes('projects'),
    readEventsOptional(),
  ]);
  return {
    candidates,
    rewritePool,
    written,
    notes: [...papers, ...projects],
    eventsText: events.text,
    eventsMissing: events.missing,
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
    lease_recoveries: changesByReason['expired-claim-lease'] || 0,
    changes: plan.changes,
  };
}

async function main() {
  const args = parseArgs();
  let transactionRecovery;
  if (args.write) {
    transactionRecovery = await recoverQueueTransaction({ directory: DATA_DIR });
  } else {
    const pending = await inspectQueueTransaction({ directory: DATA_DIR });
    if (pending.pending) {
      throw new Error(`pending queue transaction ${pending.manifest.generation}; --dry-run will not mutate it, rerun with --write to recover`);
    }
    transactionRecovery = { recovered: false, generation: null, applied: [] };
  }
  const inputs = await loadInputs();
  const recoveryAt = new Date();
  const plan = buildRecoveryPlan(inputs, { now: recoveryAt });
  const eventUpdate = buildRecoveryEventUpdate(inputs.eventsText, plan, { now: recoveryAt });

  let result = summarizeResult(plan, { dryRun: !args.write });
  if (args.write) {
    if (plan.changes.length > 0) {
      await commitQueueState({
        candidates: plan.candidates,
        rewritePool: plan.rewritePool,
        ...(eventUpdate.events.length > 0 ? { eventsText: eventUpdate.text } : {}),
      }, {
        directory: DATA_DIR,
        generation: `recovery-${Date.now()}`,
        paths: {
          candidates: CANDIDATES_PATH,
          rewritePool: REWRITE_POOL_PATH,
          events: PIPELINE_EVENTS_PATH,
        },
        expectedState: {
          candidates: inputs.candidates,
          rewritePool: inputs.rewritePool,
          ...(eventUpdate.events.length > 0
            ? { eventsText: inputs.eventsMissing ? null : inputs.eventsText }
            : {}),
        },
      });
    }
    result = summarizeResult(plan, { dryRun: false, appliedChanges: plan.changes.length });
    if (result.planned_changes !== result.applied_changes) {
      throw new Error(`Recovery mismatch: planned ${result.planned_changes}, applied ${result.applied_changes}`);
    }
  }

  result.transaction_recovery = transactionRecovery;

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderHuman(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`recover-queue-state failed: ${err.message}`);
    process.exit(1);
  });
}
