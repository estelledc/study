import { dispatchBatch } from '../dispatch-batch.mjs';
import {
  markCandidatesWritten,
  markClaimed,
  markRewritePoolWritten,
  queueKey,
} from './queue-store.mjs';
import { validateCommitHash } from './git.mjs';

function batchIssues(plan) {
  const issues = [...(plan.issues || [])];
  if (plan.batch_size !== plan.expected) {
    issues.push(`batch-size mismatch: got ${plan.batch_size}, expected ${plan.expected}`);
  }
  return issues;
}

export function autoPrepareState(args, queues, options = {}) {
  const plan = dispatchBatch({ ...args, dryRun: false }, queues, options);
  const issues = batchIssues(plan);
  if (issues.length > 0) {
    return {
      ok: false,
      issues,
      plan,
      nextCandidates: queues.candidates || [],
      nextPool: queues.pool || [],
    };
  }
  return {
    ok: true,
    issues: [],
    plan,
    nextCandidates: markClaimed(queues.candidates || [], plan.picked.new, plan.assignments, {
      planHash: plan.plan_hash,
      generation: options.generation || plan.plan_hash,
      claimedAt: options.claimedAt,
      leaseMs: options.leaseMs,
    }),
    nextPool: markClaimed(queues.pool || [], plan.picked.rewrite, plan.assignments, {
      planHash: plan.plan_hash,
      generation: options.generation || plan.plan_hash,
      claimedAt: options.claimedAt,
      leaseMs: options.leaseMs,
    }),
  };
}

export function normalizeWorkerResults(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.results)) return input.results;
  if (input && typeof input === 'object' && input.slug) return [input];
  throw new Error('worker results must be an array, an object with results[], or a single result object');
}

function claimedRows(queues) {
  return [
    ...(queues.candidates || []).filter((row) => row.status === 'claimed'),
    ...(queues.pool || []).filter((row) => row.status === 'claimed'),
  ];
}

function resolveResultArea(result, claimed) {
  if (result.area) return result.area;
  const matches = claimed.filter((row) => row.slug === result.slug);
  if (matches.length === 1) return matches[0].area;
  if (matches.length > 1) throw new Error(`result ${result.slug} is ambiguous; area is required`);
  return null;
}

export function validateWorkerResults(queues, rawResults) {
  const results = normalizeWorkerResults(rawResults);
  const claimed = claimedRows(queues);
  if (claimed.length === 0) throw new Error('no claimed rows to advance');

  const claimedByKey = new Map(claimed.map((row) => [queueKey(row), row]));
  const resultsByKey = new Map();
  for (const result of results) {
    if (result.status === 'failed') {
      throw new Error(`worker result failed for ${result.slug}: ${result.reason || 'unknown'}`);
    }
    if (result.self_check !== 'pass') {
      throw new Error(`worker result ${result.slug || '<empty>'} must have self_check=pass`);
    }
    validateCommitHash(result.commit);
    if (!Number.isInteger(result.lines) || result.lines <= 0 || result.lines > 250) {
      throw new Error(`worker result ${result.slug || '<empty>'} has invalid lines: ${result.lines}`);
    }
    const area = resolveResultArea(result, claimed);
    const key = `${area}::${result.slug}`;
    const claimedRow = claimedByKey.get(key);
    if (!claimedRow) {
      throw new Error(`worker result does not match claimed row: ${key}`);
    }
    for (const field of ['claim_token', 'claim_generation']) {
      if (typeof claimedRow[field] !== 'string' || !claimedRow[field]) {
        throw new Error(`claimed row ${key} is missing ${field}; recover and redispatch it`);
      }
      if (result[field] !== claimedRow[field]) {
        throw new Error(`worker result ${field} mismatch for ${key}`);
      }
    }
    if (resultsByKey.has(key)) throw new Error(`duplicate worker result: ${key}`);
    resultsByKey.set(key, { ...result, area });
  }

  const missing = claimed
    .map(queueKey)
    .filter((key) => !resultsByKey.has(key));
  if (missing.length > 0) throw new Error(`missing worker result(s): ${missing.join(', ')}`);

  return claimed.map((row) => {
    const key = queueKey(row);
    const result = resultsByKey.get(key);
    return {
      slug: row.slug,
      area: row.area,
      commit: result.commit,
      lines: result.lines,
      claim_token: row.claim_token,
      claim_generation: row.claim_generation,
      claimed_by: row.claimed_by,
    };
  });
}

function mergeWritten(written, entries) {
  const byKey = new Map((written || []).map((row) => [queueKey(row), row]));
  for (const entry of entries) {
    byKey.set(queueKey(entry), { area: entry.area, slug: entry.slug });
  }
  return [...byKey.values()];
}

export function applyWorkerResultsToRuntime(queues, rawResults) {
  const mergeArgs = validateWorkerResults(queues, rawResults);
  const writtenEntries = mergeArgs.map(({ area, slug }) => ({ area, slug }));
  return {
    mergeArgs,
    nextCandidates: markCandidatesWritten(queues.candidates || [], writtenEntries).rows,
    nextPool: markRewritePoolWritten(queues.pool || [], writtenEntries).rows,
    nextWritten: mergeWritten(queues.written || [], writtenEntries),
  };
}
