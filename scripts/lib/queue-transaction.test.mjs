import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  commitQueueTransaction,
  inspectQueueTransaction,
  recoverQueueTransaction,
} from './queue-transaction.mjs';

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-transaction-'));
  const candidates = path.join(directory, 'candidates.jsonl');
  const rewritePool = path.join(directory, 'rewrite-pool.jsonl');
  await fs.writeFile(candidates, 'old-candidates\n', 'utf8');
  await fs.writeFile(rewritePool, 'old-rewrite\n', 'utf8');
  return { directory, candidates, rewritePool };
}

test('commitQueueTransaction atomically advances a complete generation', async () => {
  const files = await fixture();
  const previousMode = (await fs.stat(files.candidates)).mode & 0o777;
  const result = await commitQueueTransaction([
    { path: files.candidates, content: 'new-candidates\n' },
    { path: files.rewritePool, content: 'new-rewrite\n' },
  ], { generation: 'generation-1' });

  assert.deepEqual(result, {
    generation: 'generation-1',
    applied: ['candidates.jsonl', 'rewrite-pool.jsonl'],
  });
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'new-rewrite\n');
  assert.equal((await fs.stat(files.candidates)).mode & 0o777, previousMode);
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

for (const crashAfterIndex of [0, 1]) {
  test(`recoverQueueTransaction finishes a crash after file ${crashAfterIndex + 1}`, async () => {
    const files = await fixture();
    await assert.rejects(
      () => commitQueueTransaction([
        { path: files.candidates, content: 'new-candidates\n' },
        { path: files.rewritePool, content: 'new-rewrite\n' },
      ], {
        generation: `crash-${crashAfterIndex}`,
        hooks: {
          afterApply({ index }) {
            if (index === crashAfterIndex) throw new Error('injected-crash');
          },
        },
      }),
      /injected-crash/,
    );

    assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, true);
    await recoverQueueTransaction({ directory: files.directory });
    assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
    assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'new-rewrite\n');
    assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
  });
}

test('failure before the durable manifest keeps the previous generation', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'new-candidates\n' },
      { path: files.rewritePool, content: 'new-rewrite\n' },
    ], {
      generation: 'before-manifest',
      hooks: {
        beforeManifest() {
          throw new Error('injected-before-manifest');
        },
      },
    }),
    /injected-before-manifest/,
  );

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'old-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'old-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
  assert.deepEqual((await fs.readdir(files.directory)).sort(), ['candidates.jsonl', 'rewrite-pool.jsonl']);
});

test('a crash before atomic manifest publication never exposes truncated JSON', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'new-candidates\n' },
      { path: files.rewritePool, content: 'new-rewrite\n' },
    ], {
      generation: 'manifest-publication-crash',
      hooks: {
        afterManifestStaged() {
          throw new Error('injected-before-manifest-publish');
        },
      },
    }),
    /injected-before-manifest-publish/,
  );

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'old-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'old-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
  assert.deepEqual((await fs.readdir(files.directory)).sort(), ['candidates.jsonl', 'rewrite-pool.jsonl']);
});

test('a crash after atomic manifest publication retains a complete recoverable journal', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'new-candidates\n' },
      { path: files.rewritePool, content: 'new-rewrite\n' },
    ], {
      generation: 'after-manifest-publication',
      hooks: {
        afterManifestPublished() {
          throw new Error('injected-after-manifest-publish');
        },
      },
    }),
    /injected-after-manifest-publish/,
  );

  const pending = await inspectQueueTransaction({ directory: files.directory });
  assert.equal(pending.pending, true);
  assert.equal(pending.manifest.generation, 'after-manifest-publication');
  await recoverQueueTransaction({ directory: files.directory });
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'new-rewrite\n');
});

test('concurrent recoverers serialize behind the transaction guard', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'new-candidates\n' },
      { path: files.rewritePool, content: 'new-rewrite\n' },
    ], {
      generation: 'guarded-recovery',
      hooks: {
        afterManifestPublished() {
          throw new Error('injected-pending-transaction');
        },
      },
    }),
    /injected-pending-transaction/,
  );

  let releaseFirst;
  let firstEntered;
  const mayFinish = new Promise((resolve) => { releaseFirst = resolve; });
  const entered = new Promise((resolve) => { firstEntered = resolve; });
  const first = recoverQueueTransaction({
    directory: files.directory,
    hooks: {
      async beforeApply({ index }) {
        if (index !== 0) return;
        firstEntered();
        await mayFinish;
      },
    },
  });
  await entered;

  await assert.rejects(
    () => recoverQueueTransaction({ directory: files.directory }),
    { code: 'QUEUE_TRANSACTION_ACTIVE' },
  );
  releaseFirst();
  await first;

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'new-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

test('a guard left by a dead process is quarantined before the next transaction', async () => {
  const files = await fixture();
  await fs.writeFile(
    path.join(files.directory, '.queue-transaction.guard'),
    `${JSON.stringify({
      schema_version: 1,
      owner_token: 'dead-owner',
      pid: 2_147_483_647,
      acquired_at: '2026-07-10T00:00:00.000Z',
    })}\n`,
    'utf8',
  );

  await commitQueueTransaction([
    { path: files.candidates, content: 'new-candidates\n' },
  ], { generation: 'after-dead-owner' });

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'new-candidates\n');
  await assert.rejects(
    () => fs.access(path.join(files.directory, '.queue-transaction.guard')),
    { code: 'ENOENT' },
  );
});

test('a concurrent commit is rejected while the transaction guard is held', async () => {
  const files = await fixture();
  let releaseStale;
  let staleStaged;
  const staleMayPublish = new Promise((resolve) => { releaseStale = resolve; });
  const staleReachedStage = new Promise((resolve) => { staleStaged = resolve; });
  const stale = commitQueueTransaction([
    { path: files.candidates, content: 'stale-candidates\n', expectedContent: 'old-candidates\n' },
    { path: files.rewritePool, content: 'stale-rewrite\n', expectedContent: 'old-rewrite\n' },
  ], {
    generation: 'stale-concurrent',
    hooks: {
      async afterManifestStaged() {
        staleStaged();
        await staleMayPublish;
      },
    },
  });
  await staleReachedStage;

  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'winner-candidates\n', expectedContent: 'old-candidates\n' },
      { path: files.rewritePool, content: 'winner-rewrite\n', expectedContent: 'old-rewrite\n' },
    ], { generation: 'winner' }),
    { code: 'QUEUE_TRANSACTION_ACTIVE' },
  );
  releaseStale();

  await stale;
  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'stale-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'stale-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

test('an external input change still loses CAS without leaving a manifest', async () => {
  const files = await fixture();
  await assert.rejects(
    () => commitQueueTransaction([
      { path: files.candidates, content: 'stale-candidates\n', expectedContent: 'old-candidates\n' },
      { path: files.rewritePool, content: 'stale-rewrite\n', expectedContent: 'old-rewrite\n' },
    ], {
      generation: 'external-cas-winner',
      hooks: {
        async afterManifestStaged() {
          await fs.writeFile(files.candidates, 'winner-candidates\n', 'utf8');
          await fs.writeFile(files.rewritePool, 'winner-rewrite\n', 'utf8');
        },
      },
    }),
    /input changed before apply/,
  );

  assert.equal(await fs.readFile(files.candidates, 'utf8'), 'winner-candidates\n');
  assert.equal(await fs.readFile(files.rewritePool, 'utf8'), 'winner-rewrite\n');
  assert.equal((await inspectQueueTransaction({ directory: files.directory })).pending, false);
});

test('append-only apply preserves a concurrent event written inside the pre-apply window', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-append-race-'));
  const events = path.join(directory, 'pipeline-events.jsonl');
  const candidates = path.join(directory, 'candidates.jsonl');
  const previousEvents = '{"event":"old"}\n';
  const transactionEvent = '{"event":"transaction"}\n';
  const concurrentEvent = '{"event":"concurrent"}\n';
  await fs.writeFile(events, previousEvents, 'utf8');
  await fs.writeFile(candidates, '{"status":"old"}\n', 'utf8');

  await commitQueueTransaction([
    {
      path: events,
      content: `${previousEvents}${transactionEvent}`,
      expectedContent: previousEvents,
      appendOnly: true,
    },
    {
      path: candidates,
      content: '{"status":"new"}\n',
      expectedContent: '{"status":"old"}\n',
    },
  ], {
    generation: 'append-race',
    hooks: {
      async beforeApply({ index }) {
        if (index === 0) await fs.appendFile(events, concurrentEvent, 'utf8');
      },
    },
  });

  assert.equal(
    await fs.readFile(events, 'utf8'),
    `${previousEvents}${concurrentEvent}${transactionEvent}`,
  );
  assert.equal(await fs.readFile(candidates, 'utf8'), '{"status":"new"}\n');
  assert.equal((await inspectQueueTransaction({ directory })).pending, false);
});

test('append-only segments above the single-write bound fail before publishing a manifest', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-append-bound-'));
  const events = path.join(directory, 'pipeline-events.jsonl');
  const previousEvents = '{"event":"old"}\n';
  const oversizedEvent = `${JSON.stringify({ event: 'oversized', payload: 'a'.repeat(512 * 1024) })}\n`;
  await fs.writeFile(events, previousEvents, 'utf8');

  await assert.rejects(
    () => commitQueueTransaction([{
      path: events,
      content: `${previousEvents}${oversizedEvent}`,
      expectedContent: previousEvents,
      appendOnly: true,
    }], { generation: 'oversized-append' }),
    /single-write limit/,
  );

  assert.equal(await fs.readFile(events, 'utf8'), previousEvents);
  assert.equal((await inspectQueueTransaction({ directory })).pending, false);
});

test('manifest validation rejects staged and target aliases without deleting the target', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-manifest-alias-'));
  const target = path.join(directory, 'candidates.jsonl');
  const content = Buffer.from('new-candidates\n');
  await fs.writeFile(target, content);
  const manifest = {
    schema_version: 1,
    generation: 'malicious-alias',
    transaction_id: '00000000-0000-4000-8000-000000000000',
    state: 'prepared',
    created_at: new Date().toISOString(),
    files: [{
      target: 'candidates.jsonl',
      staged: 'candidates.jsonl',
      previous_sha256: null,
      next_sha256: createHash('sha256').update(content).digest('hex'),
      bytes: content.length,
      next_bytes: content.length,
      append_only: false,
    }],
  };
  await fs.writeFile(
    path.join(directory, '.queue-transaction.json'),
    `${JSON.stringify(manifest)}\n`,
    'utf8',
  );

  await assert.rejects(
    () => recoverQueueTransaction({ directory }),
    /invalid queue transaction staged file/,
  );
  assert.equal(await fs.readFile(target, 'utf8'), 'new-candidates\n');
});

for (const fixture of [
  {
    name: 'an incomplete concurrent JSONL suffix',
    mutate: (events) => fs.appendFile(events, '{"event":"partial"', 'utf8'),
  },
  {
    name: 'a changed append-only prefix followed by valid JSONL',
    mutate: (events) => fs.writeFile(
      events,
      '{"event":"tampered-prefix"}\n{"event":"concurrent"}\n',
      'utf8',
    ),
  },
]) {
  test(`append-only recovery fails closed for ${fixture.name}`, async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-queue-append-only-'));
    const events = path.join(directory, 'pipeline-events.jsonl');
    const candidates = path.join(directory, 'candidates.jsonl');
    const previousEvents = '{"event":"old"}\n';
    const nextEvents = `${previousEvents}{"event":"recovery"}\n`;
    await fs.writeFile(events, previousEvents, 'utf8');
    await fs.writeFile(candidates, '{"status":"old"}\n', 'utf8');

    await assert.rejects(
      () => commitQueueTransaction([
        {
          path: events,
          content: nextEvents,
          expectedContent: previousEvents,
          appendOnly: true,
        },
        {
          path: candidates,
          content: '{"status":"new"}\n',
          expectedContent: '{"status":"old"}\n',
        },
      ], {
        generation: 'append-only-invalid',
        hooks: {
          async afterApply({ index }) {
            if (index === 0) {
              await fixture.mutate(events);
              throw new Error('injected-append-only-crash');
            }
          },
        },
      }),
      /injected-append-only-crash/,
    );

    await assert.rejects(
      () => recoverQueueTransaction({ directory }),
      /pipeline-events\.jsonl diverged/,
    );
    assert.equal((await inspectQueueTransaction({ directory })).pending, true);
    assert.equal(await fs.readFile(candidates, 'utf8'), '{"status":"old"}\n');
  });
}
