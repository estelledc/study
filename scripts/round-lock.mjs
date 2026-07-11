#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { readJson, syncDirectory, writeJson } from './lib/json-store.mjs';
import { ROUND_LOCK_PATH } from './lib/paths.mjs';

export const DEFAULT_ROUND_LOCK_LEASE_MS = 90 * 60 * 1000;
export const DEFAULT_ROUND_LOCK_GUARD_LEASE_MS = 30 * 1000;
const ROUND_LOCK_GUARD_SCHEMA_VERSION = 1;

function toDate(value, label) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return date;
}

function lockExpiry(lock) {
  if (lock.expires_at) return toDate(lock.expires_at, 'lock expires_at');
  const startedAt = toDate(lock.acquired_at || lock.started_at, 'lock acquired_at');
  const leaseMs = lock.lease_ms || DEFAULT_ROUND_LOCK_LEASE_MS;
  return new Date(startedAt.getTime() + leaseMs);
}

function lockAgeMs(lock, now) {
  const startedAt = toDate(lock.acquired_at || lock.started_at, 'lock acquired_at');
  return now.getTime() - startedAt.getTime();
}

export async function readRoundLock(options = {}) {
  try {
    return await readJson(options.lockPath || ROUND_LOCK_PATH);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true;
    return null;
  }
}

async function inspectOperationGuard(guardPath, now, leaseMs) {
  let stat;
  try {
    stat = await fs.stat(guardPath);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  let metadata = null;
  if (stat.isFile()) {
    try {
      metadata = JSON.parse(await fs.readFile(guardPath, 'utf8'));
    } catch {
      // A process may die after exclusive create but before the metadata is
      // durable. The inode timestamp then provides a bounded recovery lease.
    }
  }
  const parsedAcquiredAt = metadata?.acquired_at ? new Date(metadata.acquired_at) : null;
  if (parsedAcquiredAt && !Number.isFinite(parsedAcquiredAt.getTime())) metadata = null;
  const acquiredAt = metadata && parsedAcquiredAt ? parsedAcquiredAt : stat.mtime;
  const recordedLease = Number.isInteger(metadata?.lease_ms) && metadata.lease_ms > 0
    ? Math.min(metadata.lease_ms, leaseMs)
    : leaseMs;
  // Never trust an abandoned guard to extend its own lease indefinitely. A
  // syntactically bad or old-version guard falls back to inode mtime + the
  // local bounded lease and therefore cannot block all future operations.
  const expiresAt = new Date(acquiredAt.getTime() + recordedLease);
  const ownerAlive = processIsAlive(metadata?.pid);
  return {
    metadata,
    acquired_at: acquiredAt,
    expires_at: expiresAt,
    age_ms: now.getTime() - acquiredAt.getTime(),
    stale: ownerAlive === false || expiresAt.getTime() <= now.getTime(),
    owner_alive: ownerAlive,
    legacy_directory: stat.isDirectory(),
  };
}

async function createOperationGuard(guardPath, now, leaseMs) {
  const ownerToken = randomUUID();
  const metadata = {
    schema_version: ROUND_LOCK_GUARD_SCHEMA_VERSION,
    owner_token: ownerToken,
    pid: process.pid,
    acquired_at: now.toISOString(),
    expires_at: new Date(now.getTime() + leaseMs).toISOString(),
    lease_ms: leaseMs,
  };
  let handle;
  try {
    handle = await fs.open(guardPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await syncDirectory(path.dirname(guardPath));
    return metadata;
  } catch (err) {
    await handle?.close().catch(() => {});
    if (err.code !== 'EEXIST') {
      await fs.unlink(guardPath).catch((cleanupErr) => {
        if (cleanupErr.code !== 'ENOENT' && cleanupErr.code !== 'EISDIR') throw cleanupErr;
      });
    }
    throw err;
  }
}

async function acquireOperationGuard(lockPath, options = {}) {
  const guardPath = `${lockPath}.guard`;
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const now = toDate(options.now, 'operation guard time');
  const leaseMs = options.guardLeaseMs ?? DEFAULT_ROUND_LOCK_GUARD_LEASE_MS;
  if (!Number.isInteger(leaseMs) || leaseMs <= 0) throw new Error(`Invalid operation guard lease: ${leaseMs}`);
  let recovered = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const metadata = await createOperationGuard(guardPath, now, leaseMs);
      return { guardPath, metadata, recovered };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const existing = await inspectOperationGuard(guardPath, now, leaseMs);
      if (!existing) continue;
      if (!existing.stale) {
        const busy = new Error('another round-lock operation is in progress');
        busy.code = 'ROUND_LOCK_OPERATION_ACTIVE';
        throw busy;
      }

      const quarantine = `${guardPath}.stale-${randomUUID()}`;
      try {
        await fs.rename(guardPath, quarantine);
      } catch (renameErr) {
        if (renameErr.code === 'ENOENT') continue;
        throw renameErr;
      }
      await fs.rm(quarantine, { recursive: true, force: true });
      await syncDirectory(path.dirname(guardPath));
      recovered = existing;
    }
  }

  throw new Error('could not acquire round-lock operation guard after stale recovery');
}

async function releaseOperationGuard(guard) {
  let metadata;
  try {
    metadata = JSON.parse(await fs.readFile(guard.guardPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error('round-lock operation guard disappeared before release');
    throw new Error(`round-lock operation guard is unreadable at release: ${err.message}`);
  }
  if (metadata.owner_token !== guard.metadata.owner_token) {
    throw new Error('round-lock operation guard owner mismatch at release');
  }
  await fs.unlink(guard.guardPath);
  await syncDirectory(path.dirname(guard.guardPath));
}

async function withOperationGuard(lockPath, operation, options = {}) {
  const guard = await acquireOperationGuard(lockPath, options);
  let result;
  let operationError;
  try {
    result = await operation(guard);
  } catch (err) {
    operationError = err;
  }

  let releaseError;
  try {
    await releaseOperationGuard(guard);
  } catch (err) {
    releaseError = err;
  }
  if (operationError) {
    if (releaseError) operationError.message += `; operation guard release also failed: ${releaseError.message}`;
    throw operationError;
  }
  if (releaseError) throw releaseError;
  return result;
}

async function writeExclusiveLock(lockPath, lock) {
  let handle;
  try {
    handle = await fs.open(lockPath, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await syncDirectory(path.dirname(lockPath));
  } catch (err) {
    await handle?.close().catch(() => {});
    throw err;
  }
}

export async function acquireRoundLock(request = {}, options = {}) {
  const lockPath = options.lockPath || ROUND_LOCK_PATH;
  const now = toDate(options.now, 'lock time');
  const leaseMs = request.leaseMs ?? DEFAULT_ROUND_LOCK_LEASE_MS;
  if (!Number.isInteger(leaseMs) || leaseMs <= 0) throw new Error(`Invalid lock lease: ${leaseMs}`);
  const ownerToken = request.ownerToken || randomUUID();

  try {
    return await withOperationGuard(lockPath, async (guard) => {
      const current = await readRoundLock({ lockPath });
      if (current && lockExpiry(current).getTime() > now.getTime()) {
        return {
          acquired: false,
          reason: 'lock-active',
          existing: current,
          age_ms: lockAgeMs(current, now),
        };
      }

      if (current) {
        await fs.unlink(lockPath);
        await syncDirectory(path.dirname(lockPath));
      }
      const acquiredAt = now.toISOString();
      const lock = {
        schema_version: 2,
        active_round: request.round ?? null,
        workflow_run_id: request.workflowRunId || 'unknown',
        owner_token: ownerToken,
        acquired_at: acquiredAt,
        started_at: acquiredAt,
        heartbeat_at: acquiredAt,
        expires_at: new Date(now.getTime() + leaseMs).toISOString(),
        lease_ms: leaseMs,
      };
      await writeExclusiveLock(lockPath, lock);
      return {
        acquired: true,
        lock,
        recovered_stale_guard: Boolean(guard.recovered),
        stale_lock_replaced: current || null,
        replaced_age_ms: current ? lockAgeMs(current, now) : null,
      };
    }, { now, guardLeaseMs: options.guardLeaseMs });
  } catch (err) {
    if (err.code === 'ROUND_LOCK_OPERATION_ACTIVE') {
      return { acquired: false, reason: 'lock-operation-active' };
    }
    throw err;
  }
}

export async function renewLease(ownerToken, options = {}) {
  if (!ownerToken) throw new Error('owner token is required to renew a round lock');
  const lockPath = options.lockPath || ROUND_LOCK_PATH;
  const now = toDate(options.now, 'lock time');
  return withOperationGuard(lockPath, async () => {
    const current = await readRoundLock({ lockPath });
    if (!current) return { renewed: false, reason: 'not-locked' };
    if (current.owner_token !== ownerToken) return { renewed: false, reason: 'owner-mismatch' };
    if (lockExpiry(current).getTime() <= now.getTime()) return { renewed: false, reason: 'lease-expired' };
    const leaseMs = options.leaseMs ?? current.lease_ms ?? DEFAULT_ROUND_LOCK_LEASE_MS;
    if (!Number.isInteger(leaseMs) || leaseMs <= 0) throw new Error(`Invalid lock lease: ${leaseMs}`);
    const lock = {
      ...current,
      heartbeat_at: now.toISOString(),
      expires_at: new Date(now.getTime() + leaseMs).toISOString(),
      lease_ms: leaseMs,
    };
    await writeJson(lockPath, lock, { finalNewline: true });
    return { renewed: true, lock };
  }, { now, guardLeaseMs: options.guardLeaseMs });
}

export async function releaseRoundLock(ownerToken, options = {}) {
  if (!ownerToken) throw new Error('owner token is required to release a round lock');
  const lockPath = options.lockPath || ROUND_LOCK_PATH;
  return withOperationGuard(lockPath, async () => {
    const current = await readRoundLock({ lockPath });
    if (!current) return { released: false, reason: 'not-locked' };
    if (current.owner_token !== ownerToken) return { released: false, reason: 'owner-mismatch' };
    await fs.unlink(lockPath);
    await syncDirectory(path.dirname(lockPath));
    return { released: true };
  }, { now: options.now, guardLeaseMs: options.guardLeaseMs });
}

export async function checkRoundLock(options = {}) {
  const now = toDate(options.now, 'lock time');
  const lock = await readRoundLock(options);
  if (!lock) return { locked: false };
  const expiresAt = lockExpiry(lock);
  const expired = expiresAt.getTime() <= now.getTime();
  return {
    locked: true,
    lock,
    expires_at: expiresAt.toISOString(),
    expired,
    stale: expired,
    age_ms: lockAgeMs(lock, now),
    lease_remaining_ms: expiresAt.getTime() - now.getTime(),
  };
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const command = argv[0];
  const args = {
    command,
    round: null,
    workflowRunId: null,
    ownerToken: null,
    leaseMs: undefined,
  };
  if (command === '--acquire') {
    args.round = Number.parseInt(argv[1], 10);
    args.workflowRunId = argv[2] || 'unknown';
  } else if (command === '--release' || command === '--renew') {
    args.ownerToken = argv[1] || null;
  }
  for (let i = command === '--acquire' ? 3 : 2; i < argv.length; i++) {
    if (argv[i] === '--owner-token') args.ownerToken = argv[++i];
    else if (argv[i] === '--lease-ms') args.leaseMs = Number.parseInt(argv[++i], 10);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

async function main() {
  const args = parseCliArgs();
  let result;
  if (args.command === '--acquire') {
    result = await acquireRoundLock({
      round: Number.isInteger(args.round) ? args.round : null,
      workflowRunId: args.workflowRunId,
      ownerToken: args.ownerToken,
      leaseMs: args.leaseMs,
    });
    console.log(JSON.stringify(result));
    if (!result.acquired) process.exitCode = 1;
    return;
  }
  if (args.command === '--renew') {
    result = await renewLease(args.ownerToken, { leaseMs: args.leaseMs });
    console.log(JSON.stringify(result));
    if (!result.renewed) process.exitCode = 1;
    return;
  }
  if (args.command === '--release') {
    result = await releaseRoundLock(args.ownerToken);
    console.log(JSON.stringify(result));
    if (!result.released) process.exitCode = 1;
    return;
  }
  if (args.command === '--check') {
    console.log(JSON.stringify(await checkRoundLock()));
    return;
  }
  throw new Error('usage: round-lock.mjs --acquire <round_n> <workflow_run_id> [--owner-token TOKEN] [--lease-ms N] | --renew TOKEN | --release TOKEN | --check');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('round-lock failed:', err.message);
    process.exit(1);
  });
}
