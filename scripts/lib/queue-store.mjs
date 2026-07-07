import { readJsonl, writeJsonl } from './jsonl.mjs';
import {
  CANDIDATES_PATH,
  GRAVEYARD_PATH,
  PRIORITY_QUEUE_PATH,
  REWRITE_POOL_PATH,
} from './paths.mjs';

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
  const [candidates, pool, graveyard, priority] = await Promise.all([
    readCandidates({ missing: 'empty' }),
    readRewritePool({ missing: 'empty' }),
    readGraveyard({ missing: 'empty' }),
    readPriorityQueue({ missing: 'empty' }),
  ]);
  return { candidates, pool, graveyard, priority };
}

export async function loadDispatchQueues() {
  const [candidates, pool] = await Promise.all([
    readCandidates(),
    readRewritePool(),
  ]);
  return { candidates, pool };
}

export function graveyardSlugs(graveyard) {
  return new Set(graveyard.map((item) => item.slug));
}

export function excludeGraveyard(items, graveyard) {
  const blocked = graveyardSlugs(graveyard);
  return items.filter((item) => !blocked.has(item.slug));
}

export function markPriorityPicked(priorityRows, pickedRows) {
  const picked = keySet(pickedRows);
  return priorityRows.map((row) =>
    picked.has(queueKey(row)) ? { ...row, status: 'picked' } : row
  );
}

export function markClaimed(rows, pickedRows, assignments) {
  const picked = keySet(pickedRows);
  return rows.map((row) => {
    if (!picked.has(queueKey(row))) return row;
    const assignment = assignments.find((a) => a.slug === row.slug && a.area === row.area);
    return { ...row, status: 'claimed', claimed_by: assignment?.worktree.name || null };
  });
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
      return { ...candidate, status: 'written', claimed_by: null };
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
      return { ...entry, status: 'written', claimed_by: null };
    }
    return entry;
  });
  return { rows, claimed_to_written: claimedToWritten };
}
