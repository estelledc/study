import { createHash } from 'node:crypto';

import { readJsonl, serializeJsonl, writeJsonl } from './jsonl.mjs';
import {
  CANDIDATES_PATH,
  GRAVEYARD_PATH,
  PIPELINE_EVENTS_PATH,
  PRIORITY_QUEUE_PATH,
  REWRITE_POOL_PATH,
  WRITTEN_PATH,
} from './paths.mjs';
import { commitQueueTransaction } from './queue-transaction.mjs';

export const DEFAULT_CLAIM_LEASE_MS = 90 * 60 * 1000;

export function queueKey(item) {
  return `${item.area}::${item.slug}`;
}

function keySet(items) {
  return new Set(items.map(queueKey));
}

async function readOptionalJsonl(filePath) {
  try {
    return { rows: await readJsonl(filePath), missing: false };
  } catch (err) {
    if (err.code === 'ENOENT') return { rows: [], missing: true };
    throw err;
  }
}

export async function readCandidates(options = {}) {
  return readJsonl(CANDIDATES_PATH, options);
}

export async function writeCandidates(rows) {
  await writeJsonl(CANDIDATES_PATH, rows);
}

export async function readCandidatesOptional() {
  return readOptionalJsonl(CANDIDATES_PATH);
}

export async function readRewritePool(options = {}) {
  return readJsonl(REWRITE_POOL_PATH, options);
}

export async function writeRewritePool(rows) {
  await writeJsonl(REWRITE_POOL_PATH, rows);
}

export async function readRewritePoolOptional() {
  return readOptionalJsonl(REWRITE_POOL_PATH);
}

export async function readPriorityQueue(options = { missing: 'empty' }) {
  return readJsonl(PRIORITY_QUEUE_PATH, options);
}

export async function writePriorityQueue(rows) {
  await writeJsonl(PRIORITY_QUEUE_PATH, rows, { finalNewline: 'non-empty' });
}

export async function readGraveyard(options = { missing: 'empty' }) {
  return readJsonl(GRAVEYARD_PATH, options);
}

export async function loadPickQueues() {
  const [candidates, pool, graveyard, priorityInput] = await Promise.all([
    readCandidates({ missing: 'empty' }),
    readRewritePool({ missing: 'empty' }),
    readGraveyard({ missing: 'empty' }),
    readOptionalJsonl(PRIORITY_QUEUE_PATH),
  ]);
  return {
    candidates,
    pool,
    graveyard,
    priority: priorityInput.rows,
    priorityMissing: priorityInput.missing,
  };
}

export async function loadDispatchQueues() {
  const [candidates, pool] = await Promise.all([
    readCandidates(),
    readRewritePool(),
  ]);
  return { candidates, pool };
}

export function graveyardIdentities(graveyard) {
  const keys = new Set();
  const legacySlugs = new Set();
  for (const item of graveyard) {
    if (item.area) keys.add(queueKey(item));
    else if (item.slug) legacySlugs.add(item.slug);
  }
  return { keys, legacySlugs };
}

export function excludeGraveyard(items, graveyard) {
  const blocked = graveyardIdentities(graveyard);
  return items.filter((item) =>
    !blocked.keys.has(queueKey(item)) && !blocked.legacySlugs.has(item.slug)
  );
}

export function markPriorityPicked(priorityRows, pickedRows) {
  const picked = keySet(pickedRows);
  return priorityRows.map((row) =>
    picked.has(queueKey(row)) ? { ...row, status: 'picked' } : row
  );
}

export function claimToken(planHash, item) {
  return createHash('sha256').update(`${planHash}:${queueKey(item)}`).digest('hex');
}

export function markClaimed(rows, pickedRows, assignments, options = {}) {
  const picked = keySet(pickedRows);
  return rows.map((row) => {
    if (!picked.has(queueKey(row))) return row;
    const assignment = assignments.find((a) => a.slug === row.slug && a.area === row.area);
    const claimed = { ...row, status: 'claimed', claimed_by: assignment?.worktree.name || null };
    if (!options.planHash) return claimed;

    const claimedAt = new Date(options.claimedAt || Date.now());
    if (!Number.isFinite(claimedAt.getTime())) throw new Error(`Invalid claimed_at: ${options.claimedAt}`);
    const leaseMs = options.leaseMs ?? DEFAULT_CLAIM_LEASE_MS;
    if (!Number.isInteger(leaseMs) || leaseMs <= 0) throw new Error(`Invalid claim lease: ${leaseMs}`);
    return {
      ...claimed,
      claimed_at: claimedAt.toISOString(),
      lease_expires_at: new Date(claimedAt.getTime() + leaseMs).toISOString(),
      claim_token: claimToken(options.planHash, row),
      claim_generation: options.generation || options.planHash,
    };
  });
}

export function clearClaimMetadata(row) {
  const next = { ...row, claimed_by: null };
  const hasLeaseMetadata = ['claimed_at', 'lease_expires_at', 'claim_token', 'claim_generation']
    .some((field) => Object.hasOwn(row, field));
  if (!hasLeaseMetadata) return next;
  return {
    ...next,
    last_claimed_at: row.claimed_at ?? row.last_claimed_at ?? null,
    last_lease_expires_at: row.lease_expires_at ?? row.last_lease_expires_at ?? null,
    last_claim_token: row.claim_token ?? row.last_claim_token ?? null,
    last_claim_generation: row.claim_generation ?? row.last_claim_generation ?? null,
    claimed_at: null,
    lease_expires_at: null,
    claim_token: null,
    claim_generation: null,
  };
}

export function markCandidatesWritten(candidates, written) {
  const writtenSet = keySet(written);
  let updated = 0;
  let alreadyWritten = 0;
  const rows = candidates.map((candidate) => {
    if (!writtenSet.has(queueKey(candidate))) return candidate;
    if (candidate.status === 'written') {
      alreadyWritten++;
      return candidate;
    }
    if (candidate.status === 'queued' || candidate.status === 'claimed') {
      updated++;
      return { ...clearClaimMetadata(candidate), status: 'written' };
    }
    return candidate;
  });
  return { rows, updated, already_written: alreadyWritten };
}

export function markRewritePoolWritten(pool, written) {
  const writtenSet = keySet(written);
  let claimedToWritten = 0;
  const rows = pool.map((entry) => {
    if (entry.status === 'claimed' && writtenSet.has(queueKey(entry))) {
      claimedToWritten++;
      return { ...clearClaimMetadata(entry), status: 'written' };
    }
    return entry;
  });
  return { rows, claimed_to_written: claimedToWritten };
}

export async function commitQueueState(state, options = {}) {
  const paths = {
    candidates: CANDIDATES_PATH,
    rewritePool: REWRITE_POOL_PATH,
    priority: PRIORITY_QUEUE_PATH,
    written: WRITTEN_PATH,
    events: PIPELINE_EVENTS_PATH,
    ...options.paths,
  };
  const updates = [];
  // The append-only audit log is the only target that may be written by
  // independent event producers. Apply it first so a concurrent append either
  // wins the pre-apply CAS before any queue mutation, or happens after the new
  // event inode is installed and is naturally preserved.
  if (state.eventsText != null) {
    updates.push({
      path: paths.events,
      content: state.eventsText,
      ...(Object.hasOwn(options.expectedState || {}, 'eventsText')
        ? { expectedContent: options.expectedState.eventsText }
        : {}),
    });
  }
  if (state.candidates) {
    updates.push({
      path: paths.candidates,
      content: serializeJsonl(state.candidates),
      ...(options.expectedState?.candidates
        ? { expectedContent: serializeJsonl(options.expectedState.candidates) }
        : {}),
    });
  }
  if (state.rewritePool) {
    updates.push({
      path: paths.rewritePool,
      content: serializeJsonl(state.rewritePool),
      ...(options.expectedState?.rewritePool
        ? { expectedContent: serializeJsonl(options.expectedState.rewritePool) }
        : {}),
    });
  }
  if (state.priority) {
    updates.push({
      path: paths.priority,
      content: serializeJsonl(state.priority, { finalNewline: 'non-empty' }),
      ...(options.expectedState?.priority
        ? { expectedContent: serializeJsonl(options.expectedState.priority, { finalNewline: 'non-empty' }) }
        : {}),
    });
  }
  if (state.writtenText != null) {
    updates.push({ path: paths.written, content: state.writtenText });
  }
  return commitQueueTransaction(updates, {
    directory: options.directory,
    generation: options.generation,
    hooks: options.hooks,
  });
}
