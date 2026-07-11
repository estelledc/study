import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  acquireRoundLock,
  checkRoundLock,
  releaseRoundLock,
  renewLease,
} from './round-lock.mjs';

async function lockFixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-round-lock-'));
  return { directory, lockPath: path.join(directory, 'round-lock.json') };
}

test('concurrent acquire has exactly one owner and release requires its token', async () => {
  const { lockPath } = await lockFixture();
  const now = '2026-07-10T00:00:00.000Z';
  const results = await Promise.all([
    acquireRoundLock({ round: 1, workflowRunId: 'run-a', ownerToken: 'owner-a' }, { lockPath, now }),
    acquireRoundLock({ round: 1, workflowRunId: 'run-b', ownerToken: 'owner-b' }, { lockPath, now }),
  ]);
  assert.equal(results.filter((result) => result.acquired).length, 1);
  const owner = results.find((result) => result.acquired).lock.owner_token;
  const nonOwner = owner === 'owner-a' ? 'owner-b' : 'owner-a';

  assert.deepEqual(await releaseRoundLock(nonOwner, { lockPath }), {
    released: false,
    reason: 'owner-mismatch',
  });
  assert.equal((await checkRoundLock({ lockPath, now })).locked, true);
  assert.deepEqual(await releaseRoundLock(owner, { lockPath }), { released: true });
  assert.deepEqual(await checkRoundLock({ lockPath, now }), { locked: false });
});

test('renewLease extends only an active owner lease', async () => {
  const { lockPath } = await lockFixture();
  await acquireRoundLock({
    round: 2,
    workflowRunId: 'run',
    ownerToken: 'owner',
    leaseMs: 60_000,
  }, { lockPath, now: '2026-07-10T00:00:00.000Z' });

  assert.deepEqual(await renewLease('other', {
    lockPath,
    now: '2026-07-10T00:00:30.000Z',
  }), { renewed: false, reason: 'owner-mismatch' });
  const renewed = await renewLease('owner', {
    lockPath,
    now: '2026-07-10T00:00:30.000Z',
    leaseMs: 120_000,
  });
  assert.equal(renewed.renewed, true);
  assert.equal(renewed.lock.expires_at, '2026-07-10T00:02:30.000Z');
});

test('expired locks can be replaced but malformed locks fail closed', async () => {
  const { lockPath } = await lockFixture();
  await acquireRoundLock({ ownerToken: 'old', leaseMs: 1_000 }, {
    lockPath,
    now: '2026-07-10T00:00:00.000Z',
  });
  const replacement = await acquireRoundLock({ ownerToken: 'new' }, {
    lockPath,
    now: '2026-07-10T00:00:02.000Z',
  });
  assert.equal(replacement.acquired, true);
  assert.equal(replacement.stale_lock_replaced.owner_token, 'old');

  await fs.writeFile(lockPath, '{bad', 'utf8');
  await assert.rejects(
    () => acquireRoundLock({ ownerToken: 'unsafe' }, { lockPath }),
    /round-lock\.json/,
  );
  assert.equal(await fs.readFile(lockPath, 'utf8'), '{bad');
});

test('a stale operation guard left by a hard crash is reclaimed safely', async () => {
  const { lockPath } = await lockFixture();
  const guardPath = `${lockPath}.guard`;
  await fs.mkdir(guardPath);
  await fs.utimes(guardPath, new Date('2026-07-09T00:00:00.000Z'), new Date('2026-07-09T00:00:00.000Z'));

  const acquired = await acquireRoundLock({ ownerToken: 'after-crash' }, {
    lockPath,
    now: '2026-07-10T00:00:00.000Z',
  });
  assert.equal(acquired.acquired, true);
  assert.equal(acquired.recovered_stale_guard, true);
  assert.equal(await fs.stat(guardPath).then(() => true, (err) => err.code !== 'ENOENT'), false);
});
